package sitegenerator

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/pkg/stdcopy"
)

// Default filesystem paths for OpenResty reverse proxy
var (
	OpenRestyVhostDir   = "/opt/panel/apps/openresty/conf.d/vhosts"
	OpenRestySSLDir     = "/opt/panel/apps/openresty/ssl"
	ProxyContainerName  = "1panel-openresty"
)

// VhostTemplateData defines parameters passed to the Nginx vhost template.
type VhostTemplateData struct {
	Domain          string
	TargetContainer string
	Port            int
	SSLEnabled      bool
	CertPath        string
	KeyPath         string
}

// NginxVhostTemplate defines the complete OpenResty/Nginx vhost specification.
const NginxVhostTemplate = `# ==============================================================================
# 1Panel Dynamic Reverse Proxy Ingress - OpenResty / Nginx
# Domain: {{.Domain}}
# Target Container: {{.TargetContainer}}:{{.Port}} on panel-network
# ==============================================================================

# WebSocket Connection upgrade map
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# Dedicated upstream block targeting container on panel-network
upstream upstream_{{.Domain}} {
    zone upstream_{{.Domain}} 64k;
    server {{.TargetContainer}}:{{.Port}} max_fails=3 fail_timeout=10s;
    keepalive 32;
}

# ------------------------------------------------------------------------------
# HTTP (Port 80)
# ------------------------------------------------------------------------------
server {
    listen 80;
    listen [::]:80;
    server_name {{.Domain}};

    # ACME HTTP-01 challenge pass-through
    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/letsencrypt;
        allow all;
    }

    {{if .SSLEnabled}}
    # Enforce HTTPS redirect
    location / {
        return 301 https://$host$request_uri;
    }
    {{else}}
    # Plain HTTP proxy pass
    location / {
        proxy_pass http://upstream_{{.Domain}};
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
    {{end}}
}

{{if .SSLEnabled}}
# ------------------------------------------------------------------------------
# HTTPS (Port 443) - Modern TLS Ingress
# ------------------------------------------------------------------------------
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {{.Domain}};

    # SSL Certificates
    ssl_certificate {{.CertPath}};
    ssl_certificate_key {{.KeyPath}};

    # Modern TLS Security Parameters
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL_{{.Domain}}:10m;
    ssl_session_tickets off;

    # Defensive Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 100M;

    access_log /var/log/nginx/{{.Domain}}.access.log combined;
    error_log /var/log/nginx/{{.Domain}}.error.log warn;

    # ACME Challenge pass-through on HTTPS
    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/letsencrypt;
        allow all;
    }

    # Proxy Pass directly to site container on panel-network
    location / {
        proxy_pass http://upstream_{{.Domain}};
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;

        # WebSocket proxy headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
{{end}}
`

// WriteVhostConfig generates the Nginx .conf block using text/template and writes to OpenResty vhosts directory.
func WriteVhostConfig(domain string, targetContainer string, port int, sslEnabled bool) error {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return fmt.Errorf("invalid domain: %w", err)
	}

	if targetContainer == "" {
		targetContainer = fmt.Sprintf("site_%s", strings.ReplaceAll(cleanDomain, ".", "_"))
	}
	if port <= 0 || port > 65535 {
		return fmt.Errorf("invalid port %d", port)
	}

	// Prepare directories
	if err := os.MkdirAll(OpenRestyVhostDir, 0755); err != nil {
		return fmt.Errorf("failed to create vhost dir %s: %w", OpenRestyVhostDir, err)
	}

	sslDir := filepath.Join(OpenRestySSLDir, cleanDomain)
	if sslEnabled {
		if err := os.MkdirAll(sslDir, 0755); err != nil {
			return fmt.Errorf("failed to create ssl dir %s: %w", sslDir, err)
		}
	}

	certPath := filepath.Join(sslDir, "fullchain.pem")
	keyPath := filepath.Join(sslDir, "privkey.pem")

	data := VhostTemplateData{
		Domain:          cleanDomain,
		TargetContainer: targetContainer,
		Port:            port,
		SSLEnabled:      sslEnabled,
		CertPath:        certPath,
		KeyPath:         keyPath,
	}

	// Render template
	tmpl, err := template.New("nginx_vhost").Parse(NginxVhostTemplate)
	if err != nil {
		return fmt.Errorf("failed parsing vhost template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return fmt.Errorf("failed rendering vhost template: %w", err)
	}

	vhostPath := filepath.Join(OpenRestyVhostDir, fmt.Sprintf("%s.conf", cleanDomain))
	if err := atomicWrite(vhostPath, buf.Bytes(), 0644); err != nil {
		return fmt.Errorf("failed writing vhost config to %s: %w", vhostPath, err)
	}

	return nil
}

// ReloadProxy executes nginx -s reload inside the proxy container via Docker Exec API.
func ReloadProxy(ctx context.Context) error {
	if DefaultDockerOrchestrator == nil || DefaultDockerOrchestrator.cli == nil {
		return errors.New("docker client is not connected to /var/run/docker.sock")
	}

	cli := DefaultDockerOrchestrator.cli

	// Step 1: Test configuration syntax: nginx -t
	testExecCfg := container.ExecOptions{
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          []string{"nginx", "-t"},
	}
	testResp, err := cli.ContainerExecCreate(ctx, ProxyContainerName, testExecCfg)
	if err != nil {
		return fmt.Errorf("failed creating test exec in %s: %w", ProxyContainerName, err)
	}

	testAttach, err := cli.ContainerExecAttach(ctx, testResp.ID, container.ExecStartOptions{})
	if err != nil {
		return fmt.Errorf("failed attaching test exec: %w", err)
	}
	defer testAttach.Close()

	var testOut bytes.Buffer
	_, _ = stdcopy.StdCopy(&testOut, &testOut, testAttach.Reader)

	testInspect, err := cli.ContainerExecInspect(ctx, testResp.ID)
	if err != nil {
		return fmt.Errorf("failed inspecting test exec: %w", err)
	}
	if testInspect.ExitCode != 0 {
		return fmt.Errorf("nginx syntax test failed (refusing reload):\n%s", testOut.String())
	}

	// Step 2: Trigger graceful reload: nginx -s reload
	reloadExecCfg := container.ExecOptions{
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          []string{"nginx", "-s", "reload"},
	}
	reloadResp, err := cli.ContainerExecCreate(ctx, ProxyContainerName, reloadExecCfg)
	if err != nil {
		return fmt.Errorf("failed creating reload exec: %w", err)
	}

	reloadAttach, err := cli.ContainerExecAttach(ctx, reloadResp.ID, container.ExecStartOptions{})
	if err != nil {
		return fmt.Errorf("failed attaching reload exec: %w", err)
	}
	defer reloadAttach.Close()

	var reloadOut bytes.Buffer
	_, _ = stdcopy.StdCopy(&reloadOut, &reloadOut, reloadAttach.Reader)

	reloadInspect, err := cli.ContainerExecInspect(ctx, reloadResp.ID)
	if err != nil {
		return fmt.Errorf("failed inspecting reload exec: %w", err)
	}
	if reloadInspect.ExitCode != 0 {
		return fmt.Errorf("nginx reload failed: %s", reloadOut.String())
	}

	return nil
}

// RemoveVhost deletes the configuration and reloads proxy.
func RemoveVhost(domain string) error {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return err
	}

	vhostPath := filepath.Join(OpenRestyVhostDir, fmt.Sprintf("%s.conf", cleanDomain))
	if err := os.Remove(vhostPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed removing vhost %s: %w", vhostPath, err)
	}

	// Optional SSL cert purge
	sslDir := filepath.Join(OpenRestySSLDir, cleanDomain)
	_ = os.RemoveAll(sslDir)

	// Trigger reload if Docker is online
	if DefaultDockerOrchestrator != nil {
		_ = ReloadProxy(context.Background())
	}

	return nil
}
