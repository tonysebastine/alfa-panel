package sitegenerator

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func RuntimeIdentity(domain string)(int,int,error){
	clean,err:=SanitizeDomain(domain);if err!=nil{return 0,0,err}
	f,err:=os.Open(filepath.Join(BaseSitesDir,clean,".env"));if err!=nil{return 0,0,err};defer f.Close()
	uid,gid:=1001,1001
	sc:=bufio.NewScanner(f);for sc.Scan(){line:=strings.TrimSpace(sc.Text());k,v,ok:=strings.Cut(line,"=");if !ok{continue};switch k{case "UID":if n,e:=strconv.Atoi(strings.TrimSpace(v));e==nil{uid=n};case "GID":if n,e:=strconv.Atoi(strings.TrimSpace(v));e==nil{gid=n}}}
	if err:=sc.Err();err!=nil{return 0,0,err};if uid<1000||gid<1000{return 0,0,fmt.Errorf("invalid runtime identity")};return uid,gid,nil
}
