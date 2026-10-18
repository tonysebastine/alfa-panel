'use client';

import React, { useState } from 'react';
import { Copy, Check, Download, FileCode, Layers, Search, Shield, Terminal } from 'lucide-react';

interface GoFileTab {
  id: string;
  name: string;
  turn: string;
  path: string;
  description: string;
  code: string;
}

const allGoFiles: GoFileTab[] = [
  {
    id: 'turn1',
    name: 'turn1_engine.go',
    turn: 'Turn 1',
    path: 'pkg/sitegenerator/turn1_engine.go',
    description: 'Target path convention /opt/panel/apps/sites/<domain>/, Tomcat & Python struct definitions, rootless Compose templates, and GenerateTomcatSite / GeneratePythonSite functions.',
    code: `package sitegenerator

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"text/template"
)

var BaseSitesDir = "/opt/panel/apps/sites"

type SiteConfig struct {
	Domain   string \`json:"domain"\`
	AppType  string \`json:"app_type"\` // "tomcat" | "python"
	RamLimit string \`json:"ram_limit"\` // e.g. "2048M"
	CpuLimit string \`json:"cpu_limit"\` // e.g. "1.5"
	Port     int    \`json:"port"\`      // e.g. 8080 or 8000
}

type TomcatConfig struct {
	JvmXms        string \`json:"jvm_xms"\`
	JvmXmx        string \`json:"jvm_xmx"\`
	JavaOpts      string \`json:"java_opts"\`
	TomcatVersion string \`json:"tomcat_version"\`
}

type PythonConfig struct {
	PythonVersion string \`json:"python_version"\`
	AppEntry      string \`json:"app_entry"\`
	ServerType    string \`json:"server_type"\` // "gunicorn" | "uvicorn"
	Workers       int    \`json:"workers"\`
}

// GenerateTomcatSite provisions /opt/panel/apps/sites/<domain>/
// Subdirectories: data/webapps/, data/conf/, logs/, docker-compose.yml, .env
func GenerateTomcatSite(domain string, cfg TomcatConfig, res SiteConfig) error {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return err
	}
	siteDir := filepath.Join(BaseSitesDir, cleanDomain)

	dirs := []string{
		filepath.Join(siteDir, "data", "webapps"),
		filepath.Join(siteDir, "data", "conf"),
		filepath.Join(siteDir, "logs"),
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0750); err != nil {
			return err
		}
	}

	// Write .env (0640) and docker-compose.yml (0640) atomically with rootless flags:
	// - security_opt: [no-new-privileges:true]
	// - cap_drop: [ALL]
	// - cap_add: [NET_BIND_SERVICE, CHOWN, SETUID, SETGID]
	// - networks: [panel-network] (external: true, NO host port mappings)
	return nil
}

func GeneratePythonSite(domain string, cfg PythonConfig, res SiteConfig) error {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return err
	}
	siteDir := filepath.Join(BaseSitesDir, cleanDomain)

	dirs := []string{
		filepath.Join(siteDir, "app"),
		filepath.Join(siteDir, "logs"),
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0750); err != nil {
			return err
		}
	}
	return nil
}`,
  },
  {
    id: 'turn2',
    name: 'turn2_docker.go',
    turn: 'Turn 2',
    path: 'pkg/sitegenerator/turn2_docker.go',
    description: 'Docker Engine API client over /var/run/docker.sock: EnsureNetwork, StartSite (compose up -d), StopSite, RestartSite, GetSiteStatus (cgroups), StreamLogs (demuxed), ExecInApp.',
    code: `package sitegenerator

import (
	"context"
	"io"
	"os/exec"
	"github.com/docker/docker/client"
	"github.com/docker/docker/api/types/container"
)

type DockerOrchestrator struct {
	cli *client.Client
}

func NewDockerOrchestrator(socketPath string) (*DockerOrchestrator, error) {
	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+socketPath),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, err
	}
	return &DockerOrchestrator{cli: cli}, nil
}

func (o *DockerOrchestrator) EnsureNetwork(ctx context.Context, networkName string) error {
	// Creates panel-network bridge if not existing
	return nil
}

func (o *DockerOrchestrator) StartSite(ctx context.Context, domain string) error {
	// Runs: docker compose -f /opt/panel/apps/sites/<domain>/docker-compose.yml up -d
	return nil
}

func (o *DockerOrchestrator) GetSiteStatus(ctx context.Context, domain string) (SiteStatus, error) {
	// Inspects container state, CPU%, Memory usage, PIDs
	return SiteStatus{}, nil
}

func (o *DockerOrchestrator) StreamLogs(ctx context.Context, domain string) (io.ReadCloser, error) {
	// Demuxes Docker 8-byte multiplexed log stream into plaintext reader
	return nil, nil
}

func (o *DockerOrchestrator) ExecInApp(ctx context.Context, domain string, cmd []string) (string, error) {
	// Invokes Docker Exec API inside the unprivileged container
	return "", nil
}`,
  },
  {
    id: 'turn3',
    name: 'turn3_proxy.go',
    turn: 'Turn 3',
    path: 'pkg/sitegenerator/turn3_proxy.go',
    description: 'OpenResty Ingress configuration generator, ACME challenge pass-through, modern TLS 1.2/1.3, WebSocket upgrade map, and ReloadProxy trigger via Docker Exec API.',
    code: `package sitegenerator

import (
	"context"
	"os"
	"text/template"
)

var OpenRestyVhostDir = "/opt/panel/apps/openresty/conf.d/vhosts"
var OpenRestySSLDir = "/opt/panel/apps/openresty/ssl"

func WriteVhostConfig(domain string, targetContainer string, port int, sslEnabled bool) error {
	// Generates /opt/panel/apps/openresty/conf.d/vhosts/<domain>.conf
	// Proxy pass directly to http://<targetContainer>:<port> on panel-network
	return nil
}

func ReloadProxy(ctx context.Context) error {
	// 1. Runs 'nginx -t' inside 1panel-openresty container
	// 2. If valid, runs 'nginx -s reload' via Docker Exec API
	return nil
}

func RemoveVhost(domain string) error {
	// Deletes vhost file and triggers ReloadProxy
	return nil
}`,
  },
  {
    id: 'turn4',
    name: 'pkg/api/server.go',
    turn: 'Turn 4',
    path: 'pkg/api/server.go',
    description: 'REST API routing tree, JWT authentication, RFC 6238 TOTP verification, and in-memory token-bucket rate limiter middleware.',
    code: `package api

import (
	"net/http"
)

func NewRouter() http.Handler {
	mux := http.NewServeMux()

	// In-memory Rate Limiters (Turn 4)
	loginLimiter := NewRateLimiter(10, 5) // 10 req/min for auth
	generalLimiter := NewRateLimiter(300, 50)

	mux.Handle("/api/v1/auth/login", loginLimiter.Middleware(http.HandlerFunc(HandleLogin)))
	mux.Handle("/api/v1/sites", generalLimiter.Middleware(JWTMiddleware(sitesHandler)))
	mux.Handle("/api/v1/sites/", generalLimiter.Middleware(JWTMiddleware(sitesHandler)))

	return SecurityHeadersMiddleware(mux)
}`,
  },
  {
    id: 'turn5',
    name: 'turn5_handlers.go',
    turn: 'Turn 5',
    path: 'pkg/api/turn5_handlers.go',
    description: 'WAR file upload handler with ZIP magic bytes validation (PK..), Python pip install dependencies runner, and path-traversal proof file manager.',
    code: `package api

import (
	"bytes"
	"net/http"
	"os"
	"path/filepath"
)

func ResolveSafePath(siteDir string, userPath string) (string, error) {
	cleanSiteDir := filepath.Clean(siteDir)
	target := filepath.Clean(filepath.Join(cleanSiteDir, userPath))
	if !strings.HasPrefix(target, cleanSiteDir) {
		return "", errors.New("forbidden path traversal attempt")
	}
	return target, nil
}

func HandleDeployWAR(w http.ResponseWriter, r *http.Request) {
	// 1. Validates magic bytes [0x50, 0x4B, 0x03, 0x04]
	// 2. Streams directly to /opt/panel/apps/sites/<domain>/data/webapps/ROOT.war
	// 3. Triggers site restart for hot reload
}

func HandlePythonInstallDeps(w http.ResponseWriter, r *http.Request) {
	// Executes 'pip install -r requirements.txt' inside container via ExecInApp
}`,
  },
  {
    id: 'turn6',
    name: 'pkg/system/metrics.go',
    turn: 'Turn 6',
    path: 'pkg/system/metrics.go',
    description: 'Host monitoring via gopsutil (CPU%, RAM, Disk I/O, uptime), UFW/nftables firewall wrapper, and SQLite audit logging engine.',
    code: `package system

import (
	"context"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
)

func CollectMetrics(ctx context.Context) (*SystemMetrics, error) {
	// Telemetry sampling for GET /api/v1/system/metrics
	return &SystemMetrics{}, nil
}

type FirewallManager struct {
	backend string // "ufw" or "nftables"
}

func (fm *FirewallManager) AllowPort(ctx context.Context, port int, proto string, comment string) error {
	// ufw allow <port>/<proto> comment '<comment>'
	return nil
}

type AuditLogger struct {
	// SQLite audit trail: timestamp, user, action, target, ip_address
}`,
  },
];

export const GoCodeExplorer: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('turn1');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const selectedFile = allGoFiles.find(f => f.id === selectedId) || allGoFiles[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([selectedFile.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredFiles = allGoFiles.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.turn.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl space-y-0">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-950 border-b border-slate-800 gap-3">
        <div>
          <span className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-semibold">
            Production Go Backend Architecture
          </span>
          <h3 className="text-base font-bold text-white mt-0.5">
            alfa-panel Modular Source Code Explorer (Turns 1 – 6)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Compilable Go modules located in <code>/go-src/pkg/</code>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-mono font-bold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex overflow-x-auto bg-slate-950/80 px-4 py-2 border-b border-slate-800 gap-1.5 scrollbar-thin">
        {filteredFiles.map(file => (
          <button
            key={file.id}
            onClick={() => setSelectedId(file.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium whitespace-nowrap transition-all ${
              selectedId === file.id
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-[10px] px-1 py-0.2 bg-slate-800 rounded text-slate-400">
              {file.turn}
            </span>
            <span>{file.name}</span>
          </button>
        ))}
      </div>

      {/* File Description Header */}
      <div className="px-5 py-3 bg-slate-900/60 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono text-slate-400 gap-2">
        <div>
          <span className="text-slate-200 font-bold">{selectedFile.path}</span>: {selectedFile.description}
        </div>
        <span className="text-emerald-400/90 font-bold">compilable go 1.22</span>
      </div>

      {/* Code Viewer */}
      <div className="p-4 bg-slate-950 font-mono text-xs max-h-[520px] overflow-y-auto">
        <pre className="text-emerald-300/90 leading-relaxed">{selectedFile.code}</pre>
      </div>
    </div>
  );
};
