package backup

import (
	"archive/tar"
	"compress/gzip"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"bufio"
	"strconv"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Manager struct {
	SitesDir  string
	BackupDir string
}

type Artifact struct {
	ID        string    `json:"id"`
	Domain    string    `json:"domain"`
	Path      string    `json:"path"`
	CreatedAt time.Time `json:"created_at"`
	SizeBytes int64     `json:"size_bytes"`
}

func NewManager(sitesDir, backupDir string) *Manager { return &Manager{SitesDir:sitesDir,BackupDir:backupDir} }

func validDomainPath(base, domain string) (string,error) {
	if domain=="" || strings.Contains(domain,"..") || strings.ContainsAny(domain,"/\\") { return "",errors.New("invalid domain") }
	root,err:=filepath.Abs(base);if err!=nil{return "",err}
	target,err:=filepath.Abs(filepath.Join(root,domain));if err!=nil{return "",err}
	if target!=root && !strings.HasPrefix(target,root+string(os.PathSeparator)){return "",errors.New("path escapes site root")}
	return target,nil
}

func (m *Manager) Create(domain string) (*Artifact,error) {
	src,err:=validDomainPath(m.SitesDir,domain);if err!=nil{return nil,err}
	if _,err:=os.Stat(src);err!=nil{return nil,fmt.Errorf("site not found: %w",err)}
	dir:=filepath.Join(m.BackupDir,domain);if err:=os.MkdirAll(dir,0700);err!=nil{return nil,err}
	now:=time.Now().UTC(); id:=now.Format("20060102T150405Z")+"-"+randomID()
	final:=filepath.Join(dir,id+".tar.gz");tmp:=final+".tmp"
	f,err:=os.OpenFile(tmp,os.O_CREATE|os.O_WRONLY|os.O_EXCL,0600);if err!=nil{return nil,err}
	ok:=false;defer func(){_ = f.Close();if !ok{_ = os.Remove(tmp)}}()
	gz:=gzip.NewWriter(f);tw:=tar.NewWriter(gz)
	err=filepath.Walk(src,func(path string,info os.FileInfo,walkErr error) error{
		if walkErr!=nil{return walkErr}
		rel,err:=filepath.Rel(src,path);if err!=nil{return err}
		if rel=="."{return nil}
		if info.Mode()&os.ModeSymlink!=0{return fmt.Errorf("refusing to backup symlink: %s",rel)}
		if info.IsDir(){return tw.WriteHeader(&tar.Header{Name:rel,Mode:int64(info.Mode().Perm()),Typeflag:tar.TypeDir,ModTime:info.ModTime()})}
		if !info.Mode().IsRegular(){return fmt.Errorf("unsupported file type: %s",rel)}
		h:=&tar.Header{Name:rel,Mode:int64(info.Mode().Perm()),Size:info.Size(),ModTime:info.ModTime(),Typeflag:tar.TypeReg}
		if err:=tw.WriteHeader(h);err!=nil{return err}
		in,err:=os.Open(path);if err!=nil{return err};defer in.Close()
		_,err=io.Copy(tw,in);return err
	})
	if err==nil{err=tw.Close()};if err==nil{err=gz.Close()};if err==nil{err=f.Sync()};if err!=nil{return nil,fmt.Errorf("backup failed: %w",err)}
	if err:=f.Close();err!=nil{return nil,err};if err:=os.Rename(tmp,final);err!=nil{return nil,err}
	ok=true;st,err:=os.Stat(final);if err!=nil{return nil,err}
	return &Artifact{ID:id,Domain:domain,Path:final,CreatedAt:now,SizeBytes:st.Size()},nil
}

func randomID() string { b:=make([]byte,6);if _,err:=rand.Read(b);err!=nil{return "random"};return hex.EncodeToString(b) }

func runtimeIdentity(siteDir string)(int,int,error){
	uid,gid:=1001,1001;f,err:=os.Open(filepath.Join(siteDir,".env"));if err!=nil{return uid,gid,nil};defer f.Close();sc:=bufio.NewScanner(f);for sc.Scan(){k,v,ok:=strings.Cut(strings.TrimSpace(sc.Text()),"=");if !ok{continue};if k=="UID"{if n,e:=strconv.Atoi(strings.TrimSpace(v));e==nil{uid=n}};if k=="GID"{if n,e:=strconv.Atoi(strings.TrimSpace(v));e==nil{gid=n}}};if err:=sc.Err();err!=nil{return 0,0,err};if uid<1000||gid<1000{return 0,0,errors.New("invalid runtime identity")};return uid,gid,nil
}

func (m *Manager) Restore(domain, artifact string) error {
	dst,err:=validDomainPath(m.SitesDir,domain);if err!=nil{return err}
	base,err:=filepath.Abs(m.BackupDir);if err!=nil{return err}
	src,err:=filepath.Abs(artifact);if err!=nil{return err}
	if src!=base && !strings.HasPrefix(src,base+string(os.PathSeparator)){return errors.New("backup path escapes backup root")}
	if _,err:=os.Stat(src);err!=nil{return err}
	in,err:=os.Open(src);if err!=nil{return err};defer in.Close()
	gz,err:=gzip.NewReader(in);if err!=nil{return fmt.Errorf("invalid backup archive: %w",err)};defer gz.Close()
	tr:=tar.NewReader(gz)
	for {
		h,err:=tr.Next();if err==io.EOF{break};if err!=nil{return err}
		name:=filepath.Clean(h.Name)
		if name=="." || name==".." || strings.HasPrefix(name,"../") || filepath.IsAbs(name){return errors.New("archive contains unsafe path")}
		target:=filepath.Join(dst,name)
		if target!=dst && !strings.HasPrefix(target,dst+string(os.PathSeparator)){return errors.New("archive escapes site root")}
		if h.Typeflag==tar.TypeDir {if err:=os.MkdirAll(target,0750);err!=nil{return err};continue}
		if h.Typeflag!=tar.TypeReg{return errors.New("backup contains unsupported entry type")}
		if err:=os.MkdirAll(filepath.Dir(target),0750);err!=nil{return err}
		out,err:=os.OpenFile(target,os.O_CREATE|os.O_TRUNC|os.O_WRONLY,os.FileMode(h.Mode)&0777);if err!=nil{return err}
		if _,err=io.Copy(out,tr);cerr:=out.Close();err==nil{err=cerr};if err!=nil{return err}
	}
	uid,gid,_:=runtimeIdentity(dst)
	_ = filepath.Walk(dst,func(path string,info os.FileInfo,walkErr error) error{if walkErr!=nil||info==nil{return walkErr};if filepath.Clean(path)==filepath.Join(dst,".env"){return nil};_ = os.Chown(path,uid,gid);return nil})
	return nil
}

func (m *Manager) Prune(domain string,keep int)(int,error){
 if keep<1{return 0,errors.New("keep must be at least 1")}
 clean,err:=validDomainPath(m.BackupDir,domain);if err!=nil{return 0,err}
 entries,err:=os.ReadDir(clean);if os.IsNotExist(err){return 0,nil};if err!=nil{return 0,err}
 type item struct{name string;mod time.Time};items:=make([]item,0,len(entries))
 for _,e:=range entries{if e.IsDir(){continue};info,err:=e.Info();if err!=nil{continue};items=append(items,item{e.Name(),info.ModTime()})}
 sort.Slice(items,func(i,j int)bool{return items[i].mod.After(items[j].mod)})
 removed:=0;for i:=keep;i<len(items);i++{if err:=os.Remove(filepath.Join(clean,items[i].name));err!=nil{return removed,err};removed++}
 return removed,nil
}
