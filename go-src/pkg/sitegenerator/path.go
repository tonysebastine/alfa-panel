package sitegenerator

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func ResolveSitePath(domain, userPath string) (string,error) {
	cleanDomain,err:=SanitizeDomain(domain);if err!=nil{return "",err}
	raw:=strings.TrimSpace(userPath);if raw==""||strings.ContainsRune(raw,0){return "",fmt.Errorf("invalid path")}
	raw=strings.ReplaceAll(raw,"\\","/")
	raw=strings.TrimPrefix(raw,"/")
	for _,part:=range strings.Split(raw,"/"){if part==".."{return "",fmt.Errorf("forbidden path traversal")}}
	root:=filepath.Clean(filepath.Join(BaseSitesDir,cleanDomain))
	target:=filepath.Clean(filepath.Join(root,filepath.FromSlash(raw)))
	if target!=root&&!strings.HasPrefix(target,root+string(os.PathSeparator)){return "",fmt.Errorf("forbidden path traversal")}
	return target,nil
}
