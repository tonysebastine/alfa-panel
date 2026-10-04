export interface GoSourceFile {
  filename: string;
  relativePath: string;
  description: string;
  category: 'core' | 'validation' | 'templates' | 'docker' | 'proxy' | 'cli' | 'tests';
  content: string;
}

export const goSourceFiles: GoSourceFile[] = [
  {
    filename: 'types.go',
    relativePath: 'pkg/sitegenerator/types.go',
    description: 'Declarative configuration models, cgroup resource limits, security profiles, and hardened defaults for Tomcat and Python sites.',
    category: 'core',
    content: `package sitegenerator

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
	CPULimit          string \`json:"cpu_limit" yaml:"cpus"\`                         // e.g. "1.5"
	MemoryLimit       string \`json:"memory_limit" yaml:"memory"\`                   // e.g. "2048M"
	MemoryReservation string \`json:"memory_reservation" yaml:"memory_reservation"\` // e.g. "512M"
	CPUShares         int64  \`json:"cpu_shares" yaml:"cpu_shares"\`                 // e.g. 1024
	PidsLimit         int64  \`json:"pids_limit" yaml:"pids_limit"\`                 // e.g. 200
}

// SecurityProfile defines Linux container isolation flags and capability sets.
type SecurityProfile struct {
	NoNewPrivileges bool     \`json:"no_new_privileges" yaml:"no_new_privileges"\` // Prevents SUID escalation
	DropCaps        []string \`json:"drop_caps" yaml:"cap_drop"\`                   // Typically ["ALL"]
	AddCaps         []string \`json:"add_caps" yaml:"cap_add"\`                     // Minimal: NET_BIND_SERVICE, CHOWN, SETUID, SETGID
	ReadOnlyRootfs  bool     \`json:"read_only_rootfs" yaml:"read_only"\`           // Optional read-only root filesystem
	UID             int      \`json:"uid" yaml:"uid"\`                               // Non-root UID (e.g. 1001)
	GID             int      \`json:"gid" yaml:"gid"\`                               // Non-root GID (e.g. 1001)
}

// TomcatConfig holds Java and Tomcat-specific execution parameters.
type TomcatConfig struct {
	TomcatVersion    string   \`json:"tomcat_version" yaml:"tomcat_version"\`       // e.g. "10.1"
	JavaVersion      string   \`json:"java_version" yaml:"java_version"\`           // e.g. "21"
	Image            string   \`json:"image" yaml:"image"\`                         // e.g. "tomcat:10.1-jdk21-temurin-jammy"
	MinHeap          string   \`json:"min_heap" yaml:"min_heap"\`                   // e.g. "512m" (-Xms)
	MaxHeap          string   \`json:"max_heap" yaml:"max_heap"\`                   // e.g. "1536m" (-Xmx)
	GCAlgorithm      string   \`json:"gc_algorithm" yaml:"gc_algorithm"\`           // e.g. "-XX:+UseG1GC"
	CustomJVMOptions []string \`json:"custom_jvm_options" yaml:"custom_jvm_options"\` // Safe sanitized JVM arguments
	ContextPath      string   \`json:"context_path" yaml:"context_path"\`           // e.g. "ROOT"
}

// PythonConfig holds Python execution parameters.
type PythonConfig struct {
	PythonVersion    string       \`json:"python_version" yaml:"python_version"\`       // e.g. "3.12"
	Image            string       \`json:"image" yaml:"image"\`                         // e.g. "python:3.12-slim-bookworm"
	Runner           PythonRunner \`json:"runner" yaml:"runner"\`                       // gunicorn or uvicorn
	AppModule        string       \`json:"app_module" yaml:"app_module"\`               // e.g. "main:app"
	Workers          int          \`json:"workers" yaml:"workers"\`                     // e.g. 4
	Threads          int          \`json:"threads" yaml:"threads"\`                     // e.g. 2
	AutoInstallReqs  bool         \`json:"auto_install_reqs" yaml:"auto_install_reqs"\` // Install requirements.txt on boot
	VirtualenvPath   string       \`json:"virtualenv_path" yaml:"virtualenv_path"\`     // e.g. "/opt/venv"
}

// SiteConfig represents the complete declarative configuration for a hosted site.
type SiteConfig struct {
	Domain          string            \`json:"domain"\`
	Type            SiteType          \`json:"type"\`
	BaseDir         string            \`json:"base_dir"\`          // default: /opt/panel/apps/sites
	NetworkName     string            \`json:"network_name"\`      // default: panel-network
	Port            int               \`json:"port"\`              // Internal container port
	Resources       ResourceLimits    \`json:"resources"\`
	Security        SecurityProfile   \`json:"security"\`
	Tomcat          *TomcatConfig     \`json:"tomcat,omitempty"\`
	Python          *PythonConfig     \`json:"python,omitempty"\`
	EnvVars         map[string]string \`json:"env_vars"\`
	Proxy           ProxyConfig       \`json:"proxy"\`
	CreatedAt       time.Time         \`json:"created_at"\`
}

func DefaultSecurityProfile() SecurityProfile {
	return SecurityProfile{
		NoNewPrivileges: true,
		DropCaps:        []string{"ALL"},
		AddCaps:         []string{"NET_BIND_SERVICE", "CHOWN", "SETUID", "SETGID"},
		ReadOnlyRootfs:  false,
		UID:             1001,
		GID:             1001,
	}
}`
  },
  {
    filename: 'validator.go',
    relativePath: 'pkg/sitegenerator/validator.go',
    description: 'Strict input sanitizer: RFC 1123 domain validation, path traversal denial, JVM flag RCE filtering, and Python entrypoint regex validation.',
    category: 'validation',
    content: `package sitegenerator

import (
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	domainRegex        = regexp.MustCompile(\`^([a-zA-Z0-9]([a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$\`)
	jvmHeapRegex       = regexp.MustCompile(\`^[1-9][0-9]{0,5}[mMgG]$\`)
	pythonModuleRegex  = regexp.MustCompile(\`^[a-zA-Z_][a-zA-Z0-9_]*(\\.[a-zA-Z_][a-zA-Z0-9_]*)*:[a-zA-Z_][a-zA-Z0-9_]*$\`)
	safeJvmOptionRegex = regexp.MustCompile(\`^(-D[a-zA-Z0-9_\\.\\-]+(=[a-zA-Z0-9_\\.\\-/:,]*)?|-XX:[+\\-][a-zA-Z0-9_]+|-XX:[a-zA-Z0-9_]+=[a-zA-Z0-9_]+|-Xss[0-9]+[kKmMgG])$\`)
	cpuLimitRegex      = regexp.MustCompile(\`^[0-9]+(\\.[0-9]+)?$\`)
	allowedCaps        = map[string]bool{
		"NET_BIND_SERVICE": true,
		"CHOWN":            true,
		"SETUID":           true,
		"SETGID":           true,
		"DAC_OVERRIDE":     true,
	}
)

func ValidateConfig(cfg *SiteConfig) error {
	if cfg == nil {
		return errors.New("site config cannot be nil")
	}
	if err := ValidateDomain(cfg.Domain); err != nil {
		return fmt.Errorf("invalid domain: %w", err)
	}
	if !filepath.IsAbs(cfg.BaseDir) || strings.Contains(cfg.BaseDir, "..") {
		return errors.New("base_dir must be an absolute path without path traversal")
	}
	if cfg.Port < 1 || cfg.Port > 65535 {
		return fmt.Errorf("invalid port %d", cfg.Port)
	}
	if err := ValidateSecurityProfile(&cfg.Security); err != nil {
		return err
	}
	return nil
}`
  },
  {
    filename: 'generator.go',
    relativePath: 'pkg/sitegenerator/generator.go',
    description: 'File generator functions creating /opt/panel/apps/sites/<domain>/, .env, and docker-compose.yml atomically with 0750/0640 permissions and rollback.',
    category: 'core',
    content: `package sitegenerator

import (
	"fmt"
	"os"
	"path/filepath"
)

type Generator struct {
	dryRun bool
}

func NewGenerator(dryRun bool) *Generator {
	return &Generator{dryRun: dryRun}
}

func (g *Generator) GenerateSite(cfg *SiteConfig) (*GenerationResult, error) {
	if err := ValidateConfig(cfg); err != nil {
		return nil, fmt.Errorf("configuration validation failed: %w", err)
	}

	siteDir := cfg.GetSiteDir()
	envPath := filepath.Join(siteDir, ".env")
	composePath := filepath.Join(siteDir, "docker-compose.yml")

	// Create subdirectories with 0750 permissions
	subDirs := []string{
		filepath.Join(siteDir, "data"),
		filepath.Join(siteDir, "logs"),
		filepath.Join(siteDir, "config"),
	}
	if cfg.Type == SiteTypeTomcat {
		subDirs = append(subDirs, filepath.Join(siteDir, "webapps", "ROOT"))
	} else {
		subDirs = append(subDirs, filepath.Join(siteDir, "app"))
	}

	if !g.dryRun {
		for _, dir := range subDirs {
			if err := os.MkdirAll(dir, 0750); err != nil {
				return nil, err
			}
		}
		// Write .env and docker-compose.yml atomically with 0640 permissions
		if err := atomicWriteFile(envPath, []byte(envContent), 0640); err != nil {
			return nil, err
		}
		if err := atomicWriteFile(composePath, []byte(composeContent), 0640); err != nil {
			return nil, err
		}
	}
	return &GenerationResult{...}, nil
}`
  },
  {
    filename: 'docker_service.go',
    relativePath: 'pkg/sitegenerator/docker_service.go',
    description: 'Engine API client communicating over /var/run/docker.sock to bring up compose projects, stream demuxed logs over Go channels, and inspect container health.',
    category: 'docker',
    content: `package sitegenerator

import (
	"context"
	"encoding/binary"
	"fmt"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type DockerService struct {
	cli         *client.Client
	socketPath  string
	networkName string
}

func NewDockerService(socketPath string, networkName string) (*DockerService, error) {
	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+socketPath),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, err
	}
	return &DockerService{cli: cli, socketPath: socketPath, networkName: networkName}, nil
}

// BringUpComposeProject activates the site and streams progress events over a channel.
func (s *DockerService) BringUpComposeProject(ctx context.Context, siteDir string, containerName string) (<-chan DeploymentEvent, error) {
	// ... executes compose up, verifies internal bridge network, and probes healthcheck ...
}

// StreamContainerLogs reads raw multiplexed Docker logs from the Unix socket.
func (s *DockerService) StreamContainerLogs(ctx context.Context, containerName string, tailLines int, follow bool) (<-chan LogEntry, <-chan error) {
	// ... parses Docker 8-byte multiplex header [stream_type (1=stdout, 2=stderr), payload_len], emits LogEntry ...
}

// InspectContainerHealth verifies rootless user, no-new-privileges, dropped capabilities, and probe logs.
func (s *DockerService) InspectContainerHealth(ctx context.Context, containerName string) (*ContainerHealthReport, error) {
	inspect, err := s.cli.ContainerInspect(ctx, containerName)
	// ... checks inspect.State.Health.Status and HostConfig security attributes ...
}`
  },
  {
    filename: 'proxy_manager.go',
    relativePath: 'pkg/sitegenerator/proxy_manager.go',
    description: 'OpenResty/Nginx vhost template generator routing <domain> to the site container on panel-network with HTTPS, ACME HTTP-01 challenge, and reload triggers.',
    category: 'proxy',
    content: `package sitegenerator

import (
	"context"
	"fmt"
	"os/exec"
	"text/template"
)

type ProxyManager struct {
	vhostDir       string
	proxyContainer string
	dockerCli      *client.Client
}

// ApplyAndReload writes the configuration, tests syntax via 'openresty -t', and triggers '-s reload'.
func (pm *ProxyManager) ApplyAndReload(ctx context.Context, pvc *ProxyVhostConfig) (*ReloadResult, error) {
	// 1. Render vhost from template
	// 2. Backup existing config
	// 3. Atomically write new config to /opt/panel/proxy/vhosts/<domain>.conf
	// 4. Test syntax: 'openresty -t' or 'nginx -t' via docker exec / host
	// 5. If test fails, rollback immediately!
	// 6. If test passes, trigger 'openresty -s reload'
}`
  },
  {
    filename: 'main.go',
    relativePath: 'cmd/panel-agent/main.go',
    description: 'Go CLI and daemon executable supporting --domain, --type, --cpu, --memory, --dry-run, and JSON output.',
    category: 'cli',
    content: `package main

import (
	"flag"
	"fmt"
	"os"
	"github.com/panel/panel-agent/pkg/sitegenerator"
)

func main() {
	domain := flag.String("domain", "", "Site domain name (e.g. api.example.com)")
	siteType := flag.String("type", "tomcat", "Site runtime type: 'tomcat' or 'python'")
	dryRun := flag.Bool("dry-run", false, "Preview generation without touching host filesystem")
	flag.Parse()

	cfg := sitegenerator.NewSiteConfig(*domain, sitegenerator.SiteType(*siteType))
	gen := sitegenerator.NewGenerator(*dryRun)
	res, err := gen.GenerateSite(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\\n", err)
		os.Exit(1)
	}
	fmt.Printf("Site generated successfully at %s\\n", res.SitePath)
}`
  },
  {
    filename: 'generator_test.go',
    relativePath: 'pkg/sitegenerator/generator_test.go',
    description: 'Unit test suite asserting rootless security flags, directory permissions, path traversal denial, and JVM/Python injection filtering.',
    category: 'tests',
    content: `package sitegenerator

import (
	"strings"
	"testing"
)

func TestGenerateTomcatSite(t *testing.T) {
	cfg := NewSiteConfig("tomcat.app.internal", SiteTypeTomcat)
	gen := NewGenerator(false)
	res, err := gen.GenerateSite(cfg)
	if err != nil {
		t.Fatalf("Failed: %v", err)
	}
	// Assertions for no-new-privileges, CapDrop ALL, user 1001:1001, panel-network...
}`
  }
];
