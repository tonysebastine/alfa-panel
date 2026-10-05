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

func write(w http.ResponseWriter,v agentproto.Response){w.Header().Set("Content-Type","application/json");if !v.OK{w.WriteHeader(http.StatusBadRequest)};_ = json.NewEncoder(w).Encode(v)}
