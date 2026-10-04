package sitegenerator

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"text/template"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

// Default paths for 1Panel reverse proxy configuration
const (
	DefaultProxyVhostDir     = "/opt/panel/proxy/vhosts"
	DefaultOpenRestyContainer = "1panel-openresty"
	DefaultCertBasePath      = "/opt/panel/ssl"
)

// SSLMode describes the certificate management state.
type SSLMode string

const (
	SSLModeLetsEncrypt SSLMode = "letsencrypt"
	SSLModeCustom      SSLMode = "custom"
	SSLModeSelfSigned  SSLMode = "self_signed"
)

// ProxyVhostConfig provides complete parametrization for the Nginx/OpenResty vhost block.
type ProxyVhostConfig struct {
	Domain             string            `json:"domain"`
	Aliases            []string          `json:"aliases"`
	ContainerName      string            `json:"container_name"`
	UpstreamPort       int               `json:"upstream_port"`
	NetworkName        string            `json:"network_name"`
	EnableSSL          bool              `json:"enable_ssl"`
	SSLMode            SSLMode           `json:"ssl_mode"`
	CertPath           string            `json:"cert_path"`
	KeyPath            string            `json:"key_path"`
	EnableHTTP2        bool              `json:"enable_http2"`
	EnableWebSocket    bool              `json:"enable_websocket"`
	ClientMaxBodySizeMB int              `json:"client_max_body_size_mb"`
	HSTS               bool              `json:"hsts"`
	ProxyConnectTimeout int              `json:"proxy_connect_timeout"`
	ProxyReadTimeout   int               `json:"proxy_read_timeout"`
	ProxySendTimeout   int               `json:"proxy_send_timeout"`
	CustomHeaders      map[string]string `json:"custom_headers"`
	GzipEnabled        bool              `json:"gzip_enabled"`
}

// ReloadResult captures the outcome of testing and reloading OpenResty/Nginx.
type ReloadResult struct {
	Success      bool          `json:"success"`
	Output       string        `json:"output"`
	ConfigPath   string        `json:"config_path"`
	ReloadedAt   time.Time     `json:"reloaded_at"`
	Duration     time.Duration `json:"duration"`
	TestedOK     bool          `json:"tested_ok"`
}

// OpenRestyVhostTemplate is the production-grade template for OpenResty / Nginx.
const OpenRestyVhostTemplate = `# ==============================================================================
# 1Panel Dynamic Reverse Proxy Ingress - OpenResty / Nginx
# Managed by Go Site Orchestrator Agent
# Domain: {{.Domain}}
# Upstream: {{.ContainerName}}:{{.UpstreamPort}} (Docker Network: {{.NetworkName}})
# Generated at: {{nowUTC}}
# ==============================================================================

# Connection upgrade mapping for WebSocket support
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# Dedicated upstream pool on internal bridge network
upstream upstream_{{.ContainerName}} {
    zone upstream_{{.ContainerName}} 64k;
    server {{.ContainerName}}:{{.UpstreamPort}} max_fails=3 fail_timeout=10s;
    keepalive 32;
}

# ------------------------------------------------------------------------------
# HTTP (Port 80) - ACME Challenge & SSL Enforce
# ------------------------------------------------------------------------------
server {
    listen 80;
    listen [::]:80;
    server_name {{.Domain}}{{range .Aliases}} {{.}}{{end}};

    # Let's Encrypt / ACME HTTP-01 challenge routing (Host-agnostic pass-through)
    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/letsencrypt;
        allow all;
    }

    {{if .EnableSSL}}
    # Force HTTP to HTTPS redirection with query string preservation
    location / {
        return 301 https://$host$request_uri;
    }
    {{else}}
    # Direct HTTP Reverse Proxy when SSL is disabled
    location / {
        proxy_pass http://upstream_{{.ContainerName}};
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        {{if .EnableWebSocket}}
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        {{end}}

        proxy_connect_timeout {{.ProxyConnectTimeout}}s;
        proxy_read_timeout {{.ProxyReadTimeout}}s;
        proxy_send_timeout {{.ProxySendTimeout}}s;
    }
    {{end}}
}

{{if .EnableSSL}}
# ------------------------------------------------------------------------------
# HTTPS (Port 443) - Modern TLS Ingress
# ------------------------------------------------------------------------------
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {{.Domain}}{{range .Aliases}} {{.}}{{end}};

    # SSL Certificate & Private Key paths
    ssl_certificate {{.CertPath}};
    ssl_certificate_key {{.KeyPath}};

    # Modern TLS Security Parameters (Mozilla Intermediate Standard)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # SSL Session Optimization
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL_{{.ContainerName}}:10m;
    ssl_session_tickets off;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    # Host Security & Defensive Headers
    {{if .HSTS}}
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    {{end}}
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    {{range $k, $v := .CustomHeaders}}
    add_header {{$k}} "{{$v}}" always;
    {{end}}

    client_max_body_size {{.ClientMaxBodySizeMB}}M;

    # Performance buffer tuning
    proxy_buffers 16 16k;
    proxy_buffer_size 32k;
    proxy_busy_buffers_size 64k;

    {{if .GzipEnabled}}
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml font/woff2;
    {{end}}

    # Logging with microsecond resolution
    access_log /var/log/nginx/{{.Domain}}.access.log combined;
    error_log /var/log/nginx/{{.Domain}}.error.log warn;

    # ACME Challenge pass-through on HTTPS as well
    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/letsencrypt;
        allow all;
    }

    # Main Reverse Proxy Ingress to Container
    location / {
        proxy_pass http://upstream_{{.ContainerName}};
        proxy_http_version 1.1;

        # Standard ingress header proxying
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;

        {{if .EnableWebSocket}}
        # WebSocket Upgrade Protocol
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        {{end}}

        proxy_connect_timeout {{.ProxyConnectTimeout}}s;
        proxy_read_timeout {{.ProxyReadTimeout}}s;
        proxy_send_timeout {{.ProxySendTimeout}}s;
    }
}
{{end}}
`

// ProxyManager coordinates configuration rendering, syntax validation, and atomic reloads.
type ProxyManager struct {
	vhostDir       string
	proxyContainer string
	dockerCli      *client.Client
}

// NewProxyManager creates a proxy manager instance.
func NewProxyManager(vhostDir string, proxyContainer string, dockerCli *client.Client) *ProxyManager {
	if vhostDir == "" {
		vhostDir = DefaultProxyVhostDir
	}
	if proxyContainer == "" {
		proxyContainer = DefaultOpenRestyContainer
	}
	return &ProxyManager{
		vhostDir:       vhostDir,
		proxyContainer: proxyContainer,
		dockerCli:      dockerCli,
	}
}

// BuildVhostConfig translates a SiteConfig into a ProxyVhostConfig with defaults.
func BuildVhostConfig(cfg *SiteConfig) *ProxyVhostConfig {
	certPath := fmt.Sprintf("%s/%s/fullchain.pem", DefaultCertBasePath, cfg.Domain)
	keyPath := fmt.Sprintf("%s/%s/privkey.pem", DefaultCertBasePath, cfg.Domain)

	maxBody := cfg.Proxy.MaxBodySizeMB
	if maxBody <= 0 {
		maxBody = 100
	}

	return &ProxyVhostConfig{
		Domain:              cfg.Domain,
		Aliases:             nil,
		ContainerName:       cfg.GetContainerName(),
		UpstreamPort:        cfg.Port,
		NetworkName:         cfg.NetworkName,
		EnableSSL:           cfg.Proxy.EnableSSL,
		SSLMode:             SSLModeLetsEncrypt,
		CertPath:            certPath,
		KeyPath:             keyPath,
		EnableHTTP2:         true,
		EnableWebSocket:     cfg.Proxy.EnableWebSocket,
		ClientMaxBodySizeMB: maxBody,
		HSTS:                cfg.Proxy.HSTS,
		ProxyConnectTimeout: 60,
		ProxyReadTimeout:    60,
		ProxySendTimeout:    60,
		GzipEnabled:         true,
		CustomHeaders:       make(map[string]string),
	}
}

// RenderVhost generates the complete nginx/openresty configuration text.
func RenderVhost(pvc *ProxyVhostConfig) (string, error) {
	tmpl, err := template.New("openresty_vhost").Funcs(template.FuncMap{
		"nowUTC": func() string {
			return time.Now().UTC().Format(time.RFC3339)
		},
	}).Parse(OpenRestyVhostTemplate)
	if err != nil {
		return "", fmt.Errorf("failed to parse vhost template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, pvc); err != nil {
		return "", fmt.Errorf("failed to render vhost template: %w", err)
	}

	return buf.String(), nil
}

// ApplyAndReload writes the configuration file atomically, tests syntax, and issues a reload trigger.
func (pm *ProxyManager) ApplyAndReload(ctx context.Context, pvc *ProxyVhostConfig) (*ReloadResult, error) {
	startTime := time.Now()
	res := &ReloadResult{
		ReloadedAt: startTime,
	}

	// 1. Render configuration
	vhostContent, err := RenderVhost(pvc)
	if err != nil {
		return nil, fmt.Errorf("template render error: %w", err)
	}

	targetPath := filepath.Join(pm.vhostDir, fmt.Sprintf("%s.conf", pvc.Domain))
	backupPath := targetPath + ".bak"
	res.ConfigPath = targetPath

	// Ensure vhost directory exists
	if err := os.MkdirAll(pm.vhostDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create vhost directory %s: %w", pm.vhostDir, err)
	}

	// 2. Backup existing configuration if present
	hasBackup := false
	if _, err := os.Stat(targetPath); err == nil {
		data, err := os.ReadFile(targetPath)
		if err == nil {
			_ = os.WriteFile(backupPath, data, 0644)
			hasBackup = true
		}
	}

	// 3. Atomically write new configuration
	if err := atomicWriteFile(targetPath, []byte(vhostContent), 0644); err != nil {
		return nil, fmt.Errorf("failed to write vhost config to %s: %w", targetPath, err)
	}

	// Rollback helper
	rollback := func(reason string) {
		if hasBackup {
			_ = os.Rename(backupPath, targetPath)
		} else {
			_ = os.Remove(targetPath)
		}
		_ = os.Remove(backupPath)
	}

	// 4. Test Configuration Syntax via Docker Exec or Host Nginx
	testOut, err := pm.execInProxyOrHost(ctx, []string{"openresty", "-t"})
	if err != nil {
		// Fallback test command for standard nginx binary
		testOutNginx, errNginx := pm.execInProxyOrHost(ctx, []string{"nginx", "-t"})
		if errNginx != nil {
			rollback("Syntax validation failure")
			res.TestedOK = false
			res.Output = fmt.Sprintf("Configuration test failed:\n%s\n%s", testOut, testOutNginx)
			return res, fmt.Errorf("nginx/openresty syntax test failed (changes rolled back): %s", testOutNginx)
		}
		testOut = testOutNginx
	}
	res.TestedOK = true

	// 5. Trigger Reload: openresty -s reload or nginx -s reload
	reloadOut, err := pm.execInProxyOrHost(ctx, []string{"openresty", "-s", "reload"})
	if err != nil {
		reloadOutNginx, errNginx := pm.execInProxyOrHost(ctx, []string{"nginx", "-s", "reload"})
		if errNginx != nil {
			rollback("Reload trigger failure")
			res.Output = fmt.Sprintf("Reload failed:\n%s\n%s", reloadOut, reloadOutNginx)
			return res, fmt.Errorf("failed to reload proxy: %s", reloadOutNginx)
		}
		reloadOut = reloadOutNginx
	}

	// Clean up backup on success
	if hasBackup {
		_ = os.Remove(backupPath)
	}

	res.Success = true
	res.Output = fmt.Sprintf("Test Output:\n%s\n\nReload Output:\n%s", strings.TrimSpace(testOut), strings.TrimSpace(reloadOut))
	res.Duration = time.Since(startTime)
	return res, nil
}

// execInProxyOrHost attempts execution inside the proxy container first, falling back to host system.
func (pm *ProxyManager) execInProxyOrHost(ctx context.Context, cmd []string) (string, error) {
	// Attempt Docker Exec if client is available
	if pm.dockerCli != nil && pm.proxyContainer != nilSafeString() {
		out, err := pm.execInContainer(ctx, pm.proxyContainer, cmd)
		if err == nil {
			return out, nil
		}
	}

	// Fallback to host command
	hostCmd := exec.CommandContext(ctx, cmd[0], cmd[1:]...)
	outBytes, err := hostCmd.CombinedOutput()
	return string(outBytes), err
}

func nilSafeString() string {
	return ""
}

// execInContainer executes a command inside a running Docker container and buffers stdout/stderr.
func (pm *ProxyManager) execInContainer(ctx context.Context, containerID string, cmd []string) (string, error) {
	execConfig := container.ExecOptions{
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          cmd,
	}

	execCreateResp, err := pm.dockerCli.ContainerExecCreate(ctx, containerID, execConfig)
	if err != nil {
		return "", fmt.Errorf("exec create failed: %w", err)
	}

	attachResp, err := pm.dockerCli.ContainerExecAttach(ctx, execCreateResp.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("exec attach failed: %w", err)
	}
	defer attachResp.Close()

	var stdout, stderr bytes.Buffer
	_, err = stdcopy.StdCopy(&stdout, &stderr, attachResp.Reader)
	if err != nil {
		return "", fmt.Errorf("failed to demux exec output: %w", err)
	}

	inspectResp, err := pm.dockerCli.ContainerExecInspect(ctx, execCreateResp.ID)
	if err != nil {
		return "", fmt.Errorf("exec inspect failed: %w", err)
	}

	combined := stdout.String() + "\n" + stderr.String()
	if inspectResp.ExitCode != 0 {
		return combined, fmt.Errorf("command %v exited with code %d: %s", cmd, inspectResp.ExitCode, combined)
	}

	return combined, nil
}

// RemoveVhost removes a site's proxy configuration and triggers a reload.
func (pm *ProxyManager) RemoveVhost(ctx context.Context, domain string) (*ReloadResult, error) {
	targetPath := filepath.Join(pm.vhostDir, fmt.Sprintf("%s.conf", domain))
	if err := os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to remove vhost %s: %w", targetPath, err)
	}

	// Trigger reload
	out, err := pm.execInProxyOrHost(ctx, []string{"nginx", "-s", "reload"})
	return &ReloadResult{
		Success:    err == nil,
		Output:     out,
		ConfigPath: targetPath,
		ReloadedAt: time.Now(),
	}, err
}
