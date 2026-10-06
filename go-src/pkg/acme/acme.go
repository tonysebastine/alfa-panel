package acme

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/panel/panel-agent/pkg/sitegenerator"
)

type Manager struct {
	Webroot string
	SSLRoot string
}

func NewManager() *Manager {
	webroot:=strings.TrimSpace(os.Getenv("PANEL_ACME_WEBROOT"));if webroot==""{webroot="/opt/panel/acme"}
	sslroot:=strings.TrimSpace(os.Getenv("PANEL_ACME_SSLROOT"));if sslroot==""{sslroot="/opt/panel/apps/openresty/ssl"}
	return &Manager{Webroot:webroot,SSLRoot:sslroot}
}

func (m *Manager) paths(domain string)(string,string,string,error){
	clean,err:=sitegenerator.SanitizeDomain(domain);if err!=nil{return "","","",err}
	dir:=filepath.Join(m.Webroot,".well-known","acme-challenge");if err:=os.MkdirAll(dir,0755);err!=nil{return "","","",err}
	ssl:=filepath.Join(m.SSLRoot,clean);if err:=os.MkdirAll(ssl,0750);err!=nil{return "","","",err}
	return clean,filepath.Join(ssl,"fullchain.pem"),filepath.Join(ssl,"privkey.pem"),nil
}

func (m *Manager) EnsureHTTP01(ctx context.Context,domain string) error {
	clean,_,_,err:=m.paths(domain);if err!=nil{return err}
	if _,err:=exec.LookPath("certbot");err!=nil{return errors.New("certbot is required for ACME; install certbot before enabling SSL")}
	cmd:=exec.CommandContext(ctx,"certbot","certonly","--webroot","-w",m.Webroot,"-d",clean,"--non-interactive","--agree-tos","--keep-until-expiring","--register-unsafely-without-email")
	out,err:=cmd.CombinedOutput();if err!=nil{return fmt.Errorf("certbot issuance failed: %s: %w",strings.TrimSpace(string(out)),err)}
	return nil
}

func (m *Manager) Renew(ctx context.Context) error {
	if _,err:=exec.LookPath("certbot");err!=nil{return errors.New("certbot is required for ACME renewal")}
	cmd:=exec.CommandContext(ctx,"certbot","renew","--non-interactive","--webroot-path",m.Webroot)
	out,err:=cmd.CombinedOutput();if err!=nil{return fmt.Errorf("certbot renewal failed: %s: %w",strings.TrimSpace(string(out)),err)}
	return nil
}
