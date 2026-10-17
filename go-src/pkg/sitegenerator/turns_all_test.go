package sitegenerator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTurn3WriteVhostConfig(t *testing.T) {
	tempVhostDir := t.TempDir()
	tempSSLDir := t.TempDir()

	originalVhost := OpenRestyVhostDir
	originalSSL := OpenRestySSLDir
	OpenRestyVhostDir = tempVhostDir
	OpenRestySSLDir = tempSSLDir
	defer func() {
		OpenRestyVhostDir = originalVhost
		OpenRestySSLDir = originalSSL
	}()

	domain := "secure.panel.internal"
	err := WriteVhostConfig(domain, "site_python_secure_app", 8000, true)
	if err != nil {
		t.Fatalf("WriteVhostConfig failed: %v", err)
	}

	vhostFile := filepath.Join(tempVhostDir, domain+".conf")
	data, err := os.ReadFile(vhostFile)
	if err != nil {
		t.Fatalf("Failed to read vhost file: %v", err)
	}
	vhostStr := string(data)

	checks := []string{
		"upstream upstream_secure.panel.internal",
		"server site_python_secure_app:8000",
		"listen 443 ssl http2;",
		"Strict-Transport-Security",
		"map $http_upgrade $connection_upgrade",
		"proxy_set_header Upgrade $http_upgrade;",
		"location ^~ /.well-known/acme-challenge/",
		"return 301 https://$host$request_uri;",
	}

	for _, check := range checks {
		if !strings.Contains(vhostStr, check) {
			t.Errorf("vhost configuration missing expected directive: %s", check)
		}
	}
}
