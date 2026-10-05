package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/panel/panel-agent/pkg/agentproto"
	"github.com/panel/panel-agent/pkg/backup"
	"github.com/panel/panel-agent/pkg/sitegenerator"
)

const defaultSocket="/run/alfa-panel/agent.sock"

func main(){
	os.Setenv("PANEL_AGENT_MODE","true")
	socket:=os.Getenv("PANEL_AGENT_SOCKET");if socket==""{socket=defaultSocket}
	if err:=os.MkdirAll(filepath.Dir(socket),0750);err!=nil{log.Fatal(err)}
	_ = os.Remove(socket)
	ln,err:=net.Listen("unix",socket);if err!=nil{log.Fatal(err)}
	if err:=os.Chmod(socket,0660);err!=nil{log.Fatal(err)}
	mux:=http.NewServeMux()
	mux.HandleFunc("/v1/operate",operate)
	mux.HandleFunc("/v1/logs",logs)
	srv:=&http.Server{Handler:mux,ReadHeaderTimeout:5*time.Second,ReadTimeout:30*time.Second,WriteTimeout:5*time.Minute,MaxHeaderBytes:1<<20}
	log.Printf("ALFA-PANEL privileged agent listening on %s",socket)
	if err:=srv.Serve(ln);err!=nil&&!errors.Is(err,http.ErrServerClosed){log.Fatal(err)}
}

func operate(w http.ResponseWriter,r *http.Request){
	if r.Method!=http.MethodPost{http.Error(w,"method not allowed",405);return}
	var req agentproto.Request
	if err:=json.NewDecoder(http.MaxBytesReader(w,r.Body,16<<10)).Decode(&req);err!=nil{write(w,agentproto.Response{Error:"invalid request"});return}
	var data any
	var err error
	switch strings.TrimSpace(req.Operation){
	case "start":err=sitegenerator.StartSite(r.Context(),req.Domain)
	case "stop":err=sitegenerator.StopSite(r.Context(),req.Domain)
	case "restart":err=sitegenerator.RestartSite(r.Context(),req.Domain)
	case "delete":err=sitegenerator.DeleteSite(r.Context(),req.Domain,req.Purge)
	case "status":var s sitegenerator.SiteStatus;s,err=sitegenerator.GetSiteStatus(r.Context(),req.Domain);data=s
	case "install_deps":data,err=sitegenerator.InstallPythonDependencies(r.Context(),req.Domain)
	case "backup_create":
		a:=backup.NewManager(sitegenerator.BaseSitesDir,"/opt/panel/backups");data,err=a.Create(req.Domain)
	case "backup_restore":
		var p struct{Artifact string `json:"artifact"`}
		if err=json.Unmarshal(req.Payload,&p);err==nil {
			a:=backup.NewManager(sitegenerator.BaseSitesDir,"/opt/panel/backups")
			var pre *backup.Artifact
			pre,err=a.Create(req.Domain)
			if err==nil { _=sitegenerator.StopSite(r.Context(),req.Domain);err=a.Restore(req.Domain,p.Artifact);if err==nil{err=sitegenerator.StartSite(r.Context(),req.Domain)} }
			if err==nil{data=map[string]any{"artifact":p.Artifact,"pre_restore_backup":pre.Path}}
		}
	case "file_tree":
		data,err=fileTree(req.Domain)
	case "file_content":
		var p struct{Path string `json:"path"`};if err=json.Unmarshal(req.Payload,&p);err==nil{var body string;body,err=fileContent(req.Domain,p.Path);data=map[string]any{"path":p.Path,"content":body}}
	case "file_write":
		var p struct{Path string `json:"path"`;Content string `json:"content"`};if err=json.Unmarshal(req.Payload,&p);err==nil{err=writeFileContent(req.Domain,p.Path,p.Content);data=map[string]any{"path":p.Path,"status":"saved"}}
	case "create_site":
		var cfg sitegenerator.SiteConfig
		if err=json.Unmarshal(req.Payload,&cfg);err==nil {
			res,e:=sitegenerator.NewGenerator(false).GenerateSite(&cfg);err=e;data=res
		}
	default:err=errors.New("operation not allowed")
	}
	if err!=nil{write(w,agentproto.Response{OK:false,Error:err.Error()});return}
	write(w,agentproto.Response{OK:true,Data:data})
}

func logs(w http.ResponseWriter,r *http.Request){
	if r.Method!=http.MethodGet{http.Error(w,"method not allowed",405);return}
	domain:=strings.TrimSpace(r.URL.Query().Get("domain"))
	if _,err:=sitegenerator.SanitizeDomain(domain);err!=nil{http.Error(w,"invalid domain",400);return}
	reader,err:=sitegenerator.StreamLogs(r.Context(),domain);if err!=nil{http.Error(w,err.Error(),500);return};defer reader.Close()
	w.Header().Set("Content-Type","text/plain; charset=utf-8");w.Header().Set("X-Content-Type-Options","nosniff")
	_,_=io.Copy(w,reader)
}

func fileTree(domain string) (map[string]any,error) {
	root,err:=sitegenerator.ResolveSitePath(domain,"/");if err!=nil{return nil,err}
	var walk func(string,int)([]any,error)
	walk=func(dir string,depth int)([]any,error){if depth>5{return nil,nil};entries,err:=os.ReadDir(dir);if err!=nil{return nil,err};out:=make([]any,0,len(entries));for _,e:=range entries{info,err:=e.Info();if err!=nil{continue};rel,_:=filepath.Rel(root,filepath.Join(dir,e.Name()));node:=map[string]any{"name":e.Name(),"path":"/"+filepath.ToSlash(rel),"is_dir":e.IsDir(),"size":info.Size(),"mode":info.Mode().String(),"mod_time":info.ModTime()};if e.IsDir(){children,_:=walk(filepath.Join(dir,e.Name()),depth+1);node["children"]=children};out=append(out,node)};return out,nil}
	children,err:=walk(root,1);if err!=nil{return nil,err};return map[string]any{"name":domain,"path":"/","is_dir":true,"children":children},nil
}

func fileContent(domain,path string)(string,error){p,err:=sitegenerator.ResolveSitePath(domain,path);if err!=nil{return "",err};fi,err:=os.Stat(p);if err!=nil{return "",err};if fi.IsDir(){return "",errors.New("path is a directory")};if fi.Size()>5*1024*1024{return "",errors.New("file exceeds 5MB limit")};b,err:=os.ReadFile(p);return string(b),err}

func writeFileContent(domain,path,content string)error{if len(content)>5*1024*1024{return errors.New("file exceeds 5MB limit")};p,err:=sitegenerator.ResolveSitePath(domain,path);if err!=nil{return err};if err:=os.MkdirAll(filepath.Dir(p),0750);err!=nil{return err};tmp,err:=os.CreateTemp(filepath.Dir(p),".edit-*");if err!=nil{return err};name:=tmp.Name();defer os.Remove(name);if _,err:=tmp.WriteString(content);err!=nil{_ = tmp.Close();return err};if err:=tmp.Sync();err!=nil{_ = tmp.Close();return err};if err:=tmp.Close();err!=nil{return err};if err:=os.Chmod(name,0640);err!=nil{return err};return os.Rename(name,p)}

func write(w http.ResponseWriter,v agentproto.Response){w.Header().Set("Content-Type","application/json");if !v.OK{w.WriteHeader(http.StatusBadRequest)};_ = json.NewEncoder(w).Encode(v)}
