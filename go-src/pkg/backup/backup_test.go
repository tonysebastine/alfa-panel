package backup

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBackupRestoreRejectsUnsafePaths(t *testing.T) {
	root:=t.TempDir();sites:=filepath.Join(root,"sites");backups:=filepath.Join(root,"backups")
	if err:=os.MkdirAll(filepath.Join(sites,"app.example.com"),0750);err!=nil{t.Fatal(err)}
	if err:=os.WriteFile(filepath.Join(sites,"app.example.com","hello.txt"),[]byte("hello"),0600);err!=nil{t.Fatal(err)}
	m:=NewManager(sites,backups)
	a,err:=m.Create("app.example.com");if err!=nil{t.Fatal(err)}
	if err:=m.Restore("../escape",a.Path);err==nil{t.Fatal("expected unsafe domain rejection")}
	if err:=m.Restore("app.example.com","/etc/passwd");err==nil{t.Fatal("expected backup path rejection")}
	if err:=os.Remove(filepath.Join(sites,"app.example.com","hello.txt"));err!=nil{t.Fatal(err)}
	if err:=m.Restore("app.example.com",a.Path);err!=nil{t.Fatal(err)}
	data,err:=os.ReadFile(filepath.Join(sites,"app.example.com","hello.txt"));if err!=nil||string(data)!="hello"{t.Fatalf("restore failed: %v %q",err,data)}
}
