package sitegenerator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTurn1TomcatSiteGeneration(t *testing.T) {
	tempDir := t.TempDir()
	originalBase := BaseSitesDir
	BaseSitesDir = tempDir
	defer func() { BaseSitesDir = originalBase }()

	domain := "java-api.corp.internal"
	tomcatCfg := TomcatConfig{
		TomcatVersion: "10.1-jdk21-temurin",
		JvmXms:        "512m",
		JvmXmx:        "2048m",
		JavaOpts:      "-XX:+UseG1GC -Dfile.encoding=UTF-8",
	}
	siteCfg := SiteConfig{
		Domain:   domain,
		AppType:  "tomcat",
		RamLimit: "2560M",
		CpuLimit: "2.0",
		Port:     8080,
	}

	err := GenerateTomcatSite(domain, tomcatCfg, siteCfg)
	if err != nil {
		t.Fatalf("GenerateTomcatSite failed: %v", err)
	}

	siteDir := filepath.Join(tempDir, domain)
	expectedDirs := []string{
		filepath.Join(siteDir, "data", "webapps"),
		filepath.Join(siteDir, "data", "conf"),
		filepath.Join(siteDir, "logs"),
	}

	for _, d := range expectedDirs {
		info, err := os.Stat(d)
		if err != nil || !info.IsDir() {
			t.Errorf("Expected directory %s does not exist", d)
		}
	}

	// Verify .env
	envBytes, err := os.ReadFile(filepath.Join(siteDir, ".env"))
	if err != nil {
		t.Fatalf("Failed to read .env: %v", err)
	}
	envStr := string(envBytes)
	if !strings.Contains(envStr, "JVM_XMS=512m") || !strings.Contains(envStr, "JVM_XMX=2048m") {
		t.Errorf("Missing JVM settings in .env")
	}

	// Verify docker-compose.yml rootless security flags
	composeBytes, err := os.ReadFile(filepath.Join(siteDir, "docker-compose.yml"))
	if err != nil {
		t.Fatalf("Failed to read docker-compose.yml: %v", err)
	}
	composeStr := string(composeBytes)

	requiredDirectives := []string{
		"no-new-privileges:true",
		"- ALL",
		"- NET_BIND_SERVICE",
		"- CHOWN",
		"- SETUID",
		"- SETGID",
		"panel-network",
		"user: \"${UID}:${GID}\"",
		"./data/webapps:/usr/local/tomcat/webapps:rw",
	}

	for _, req := range requiredDirectives {
		if !strings.Contains(composeStr, req) {
			t.Errorf("docker-compose.yml missing expected directive: %s", req)
		}
	}

	// Confirm NO host ports mapped
	if strings.Contains(composeStr, "ports:") {
		t.Errorf("docker-compose.yml must not expose host ports directly")
	}
}

func TestTurn1PythonSiteGeneration(t *testing.T) {
	tempDir := t.TempDir()
	originalBase := BaseSitesDir
	BaseSitesDir = tempDir
	defer func() { BaseSitesDir = originalBase }()

	domain := "fastapi.corp.internal"
	pyCfg := PythonConfig{
		PythonVersion: "3.12-slim",
		AppEntry:      "app.main:app",
		ServerType:    "uvicorn",
		Workers:       4,
	}
	siteCfg := SiteConfig{
		Domain:   domain,
		AppType:  "python",
		RamLimit: "1024M",
		CpuLimit: "1.0",
		Port:     8000,
	}

	err := GeneratePythonSite(domain, pyCfg, siteCfg)
	if err != nil {
		t.Fatalf("GeneratePythonSite failed: %v", err)
	}

	siteDir := filepath.Join(tempDir, domain)
	expectedDirs := []string{
		filepath.Join(siteDir, "app"),
		filepath.Join(siteDir, "logs"),
	}

	for _, d := range expectedDirs {
		info, err := os.Stat(d)
		if err != nil || !info.IsDir() {
			t.Errorf("Expected directory %s does not exist", d)
		}
	}

	// Starter files
	if _, err := os.Stat(filepath.Join(siteDir, "app", "main.py")); err != nil {
		t.Errorf("Expected app/main.py starter to exist")
	}

	composeBytes, _ := os.ReadFile(filepath.Join(siteDir, "docker-compose.yml"))
	composeStr := string(composeBytes)
	if !strings.Contains(composeStr, "uvicorn") || !strings.Contains(composeStr, "app.main:app") {
		t.Errorf("Compose does not specify uvicorn and app entry")
	}
	if !strings.Contains(composeStr, "no-new-privileges:true") {
		t.Errorf("Compose missing no-new-privileges:true")
	}
}

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

	// Check TLS & upstream
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
