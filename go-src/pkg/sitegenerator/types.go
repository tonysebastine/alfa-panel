package sitegenerator

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// SiteType represents the runtime engine for the site.
type SiteType string

const (
	SiteTypeTomcat SiteType = "tomcat"
	SiteTypePython SiteType = "python"
)

// PythonRunner represents the application server runner.
type PythonRunner string

const (
	PythonRunnerGunicorn PythonRunner = "gunicorn"
	PythonRunnerUvicorn  PythonRunner = "uvicorn"
)

// ResourceLimits defines container cgroup limits.
type ResourceLimits struct {
	CPULimit          string `json:"cpu_limit" yaml:"cpus"`                         // e.g. "1.5"
	MemoryLimit       string `json:"memory_limit" yaml:"memory"`                   // e.g. "2048M"
	MemoryReservation string `json:"memory_reservation" yaml:"memory_reservation"` // e.g. "512M"
	CPUShares         int64  `json:"cpu_shares" yaml:"cpu_shares"`                 // e.g. 1024
	PidsLimit         int64  `json:"pids_limit" yaml:"pids_limit"`                 // e.g. 200
}

// SecurityProfile defines Linux container isolation flags and capability sets.
type SecurityProfile struct {
	NoNewPrivileges bool     `json:"no_new_privileges" yaml:"no_new_privileges"` // Prevents SUID escalation
	DropCaps        []string `json:"drop_caps" yaml:"cap_drop"`                   // Typically ["ALL"]
	AddCaps         []string `json:"add_caps" yaml:"cap_add"`                     // Minimal: NET_BIND_SERVICE, CHOWN, SETUID, SETGID
	ReadOnlyRootfs  bool     `json:"read_only_rootfs" yaml:"read_only"`           // Optional read-only root filesystem
	UID             int      `json:"uid" yaml:"uid"`                               // Non-root UID (e.g. 1001)
	GID             int      `json:"gid" yaml:"gid"`                               // Non-root GID (e.g. 1001)
}

// TomcatConfig holds Java and Tomcat-specific execution parameters.
type TomcatConfig struct {
	TomcatVersion    string   `json:"tomcat_version" yaml:"tomcat_version"`       // e.g. "10.1"
	JavaVersion      string   `json:"java_version" yaml:"java_version"`           // e.g. "21"
	Image            string   `json:"image" yaml:"image"`                         // e.g. "tomcat:10.1-jdk21-temurin-jammy"
	MinHeap          string   `json:"min_heap" yaml:"min_heap"`                   // e.g. "512m" (-Xms)
	MaxHeap          string   `json:"max_heap" yaml:"max_heap"`                   // e.g. "1536m" (-Xmx)
	GCAlgorithm      string   `json:"gc_algorithm" yaml:"gc_algorithm"`           // e.g. "-XX:+UseG1GC"
	CustomJVMOptions []string `json:"custom_jvm_options" yaml:"custom_jvm_options"` // Safe sanitized JVM arguments
	ContextPath      string   `json:"context_path" yaml:"context_path"`           // e.g. "ROOT"
}

// PythonConfig holds Python execution parameters.
type PythonConfig struct {
	PythonVersion    string       `json:"python_version" yaml:"python_version"`       // e.g. "3.12"
	Image            string       `json:"image" yaml:"image"`                         // e.g. "python:3.12-slim-bookworm"
	Runner           PythonRunner `json:"runner" yaml:"runner"`                       // gunicorn or uvicorn
	AppModule        string       `json:"app_module" yaml:"app_module"`               // e.g. "main:app"
	Workers          int          `json:"workers" yaml:"workers"`                     // e.g. 4
	Threads          int          `json:"threads" yaml:"threads"`                     // e.g. 2
	AutoInstallReqs  bool         `json:"auto_install_reqs" yaml:"auto_install_reqs"` // Install requirements.txt on boot
	VirtualenvPath   string       `json:"virtualenv_path" yaml:"virtualenv_path"`     // e.g. "/opt/venv"
}

// ProxyConfig holds reverse proxy routing configuration.
type ProxyConfig struct {
	EnableSSL       bool   `json:"enable_ssl"`
	EnableWebSocket bool   `json:"enable_websocket"`
	MaxBodySizeMB   int    `json:"max_body_size_mb"`
	UpstreamPort    int    `json:"upstream_port"`
	HSTS            bool   `json:"hsts"`
}

// SiteConfig represents the complete declarative configuration for a hosted site.
type SiteConfig struct {
	Domain          string            `json:"domain"`
	Type            SiteType          `json:"type"`
	BaseDir         string            `json:"base_dir"`          // default: /opt/panel/apps/sites
	NetworkName     string            `json:"network_name"`      // default: panel-network
	Port            int               `json:"port"`              // Internal container port
	Resources       ResourceLimits    `json:"resources"`
	Security        SecurityProfile   `json:"security"`
	Tomcat          *TomcatConfig     `json:"tomcat,omitempty"`
	Python          *PythonConfig     `json:"python,omitempty"`
	EnvVars         map[string]string `json:"env_vars"`
	Proxy           ProxyConfig       `json:"proxy"`
	CreatedAt       time.Time         `json:"created_at"`
}

// GenerationResult summarizes files and directories created.
type GenerationResult struct {
	SitePath         string            `json:"site_path"`
	EnvPath          string            `json:"env_path"`
	ComposePath      string            `json:"compose_path"`
	ProxyConfigPath  string            `json:"proxy_config_path"`
	SubDirectories   []string          `json:"sub_directories"`
	EnvContent       string            `json:"env_content"`
	ComposeContent   string            `json:"compose_content"`
	ProxyContent     string            `json:"proxy_content"`
	ContainerName    string            `json:"container_name"`
	VerificationCmds []string          `json:"verification_cmds"`
}

// DefaultTomcatConfig provides hardened defaults for Tomcat with Temurin JRE 21.
func DefaultTomcatConfig() *TomcatConfig {
	return &TomcatConfig{
		TomcatVersion:    "10.1",
		JavaVersion:      "21",
		Image:            "tomcat:10.1-jdk21-temurin-jammy",
		MinHeap:          "512m",
		MaxHeap:          "1536m",
		GCAlgorithm:      "-XX:+UseG1GC",
		CustomJVMOptions: []string{
			"-Djava.security.egd=file:/dev/./urandom",
			"-Dfile.encoding=UTF-8",
			"-XX:+ExitOnOutOfMemoryError",
		},
		ContextPath:      "ROOT",
	}
}

// DefaultPythonConfig provides hardened defaults for Python 3.12 with Gunicorn.
func DefaultPythonConfig() *PythonConfig {
	return &PythonConfig{
		PythonVersion:   "3.12",
		Image:           "python:3.12-slim-bookworm",
		Runner:          PythonRunnerGunicorn,
		AppModule:       "main:app",
		Workers:         4,
		Threads:         2,
		AutoInstallReqs: false,
		VirtualenvPath:  "/opt/venv",
	}
}

// DefaultSecurityProfile returns 1Panel-compliant rootless isolation defaults.
func DefaultSecurityProfile() SecurityProfile {
	return SecurityProfile{
		NoNewPrivileges: true,
		DropCaps:        []string{"ALL"},
		AddCaps:         []string{},
		ReadOnlyRootfs:  true,
		UID:             1001,
		GID:             1001,
	}
}

// DefaultResourceLimits returns conservative, safe cgroup limits.
func DefaultResourceLimits() ResourceLimits {
	return ResourceLimits{
		CPULimit:          "1.5",
		MemoryLimit:       "2048M",
		MemoryReservation: "512M",
		CPUShares:         1024,
		PidsLimit:         200,
	}
}

// NewSiteConfig creates a new SiteConfig initialized with production defaults.
func NewSiteConfig(domain string, siteType SiteType) *SiteConfig {
	slug := SanitizeDomainToSlug(domain)
	port := 8080
	if siteType == SiteTypePython {
		port = 8000
	}

	cfg := &SiteConfig{
		Domain:      domain,
		Type:        siteType,
		BaseDir:     "/opt/panel/apps/sites",
		NetworkName: "panel-network",
		Port:        port,
		Resources:   DefaultResourceLimits(),
		Security:    DefaultSecurityProfile(),
		EnvVars: map[string]string{
			"APP_ENV":  "production",
			"SITE_DIR": filepath.Join("/opt/panel/apps/sites", domain),
		},
		Proxy: ProxyConfig{
			EnableSSL:       true,
			EnableWebSocket: true,
			MaxBodySizeMB:   100,
			UpstreamPort:    port,
			HSTS:            true,
		},
		CreatedAt: time.Now(),
	}

	if siteType == SiteTypeTomcat {
		cfg.Tomcat = DefaultTomcatConfig()
	} else {
		cfg.Python = DefaultPythonConfig()
	}

	return cfg
}

// GetSiteDir returns the absolute filesystem path for this site.
func (c *SiteConfig) GetSiteDir() string {
	base := c.BaseDir
	if base == "" {
		base = "/opt/panel/apps/sites"
	}
	return filepath.Join(base, c.Domain)
}

// GetContainerName returns a deterministic Docker container name.
func (c *SiteConfig) GetContainerName() string {
	slug := SanitizeDomainToSlug(c.Domain)
	return fmt.Sprintf("site_%s_%s", c.Type, slug)
}

// SanitizeDomainToSlug turns a domain into a safe container/identifier slug.
func SanitizeDomainToSlug(domain string) string {
	cleaned := strings.ToLower(strings.TrimSpace(domain))
	cleaned = strings.ReplaceAll(cleaned, ".", "_")
	cleaned = strings.ReplaceAll(cleaned, "-", "_")
	return cleaned
}
