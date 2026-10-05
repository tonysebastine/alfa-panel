package sitegenerator

import (
	"strings"
	"text/template"
)

// Helper functions for templates
var templateFuncMap = template.FuncMap{
	"join": strings.Join,
	"upper": strings.ToUpper,
	"lower": strings.ToLower,
}

// EnvTemplateTomcat generates the .env file for Tomcat sites.
const EnvTemplateTomcat = `# ==============================================================================
# 1Panel Site Environment Configuration - Tomcat (Java)
# Domain: {{.Domain}}
# Generated at: {{.CreatedAt.UTC.Format "2006-01-02T15:04:05Z07:00"}}
# ==============================================================================

# Site Identifiers
SITE_DOMAIN={{.Domain}}
SITE_SLUG={{.GetContainerName}}
SITE_DIR={{.GetSiteDir}}

# Container Runtime & Isolation
CONTAINER_NAME={{.GetContainerName}}
NETWORK_NAME={{.NetworkName}}
APP_PORT={{.Port}}
UID={{.Security.UID}}
GID={{.Security.GID}}

# Resource Allocation Limits
CPU_LIMIT={{.Resources.CPULimit}}
MEMORY_LIMIT={{.Resources.MemoryLimit}}
MEMORY_RESERVATION={{.Resources.MemoryReservation}}
PIDS_LIMIT={{.Resources.PidsLimit}}

# Java & Tomcat Specification
TOMCAT_IMAGE={{.Tomcat.Image}}
JVM_MIN_HEAP={{.Tomcat.MinHeap}}
JVM_MAX_HEAP={{.Tomcat.MaxHeap}}
JVM_GC_ALGO={{.Tomcat.GCAlgorithm}}
CATALINA_OPTS=-Xms{{.Tomcat.MinHeap}} -Xmx{{.Tomcat.MaxHeap}} {{.Tomcat.GCAlgorithm}} {{range .Tomcat.CustomJVMOptions}}{{.}} {{end}}

# Custom Site Variables
{{range $k, $v := .EnvVars}}{{$k}}={{$v}}
{{end}}
`

// EnvTemplatePython generates the .env file for Python sites.
const EnvTemplatePython = `# ==============================================================================
# 1Panel Site Environment Configuration - Python (ASGI/WSGI)
# Domain: {{.Domain}}
# Generated at: {{.CreatedAt.UTC.Format "2006-01-02T15:04:05Z07:00"}}
# ==============================================================================

# Site Identifiers
SITE_DOMAIN={{.Domain}}
SITE_SLUG={{.GetContainerName}}
SITE_DIR={{.GetSiteDir}}

# Container Runtime & Isolation
CONTAINER_NAME={{.GetContainerName}}
NETWORK_NAME={{.NetworkName}}
APP_PORT={{.Port}}
UID={{.Security.UID}}
GID={{.Security.GID}}

# Resource Allocation Limits
CPU_LIMIT={{.Resources.CPULimit}}
MEMORY_LIMIT={{.Resources.MemoryLimit}}
MEMORY_RESERVATION={{.Resources.MemoryReservation}}
PIDS_LIMIT={{.Resources.PidsLimit}}

# Python Specification
PYTHON_IMAGE={{.Python.Image}}
PYTHON_RUNNER={{.Python.Runner}}
APP_MODULE={{.Python.AppModule}}
WORKERS={{.Python.Workers}}
THREADS={{.Python.Threads}}
VIRTUAL_ENV={{.Python.VirtualenvPath}}

# Python Environment Flags
PYTHONUNBUFFERED=1
PYTHONDONTWRITEBYTECODE=1

# Custom Site Variables
{{range $k, $v := .EnvVars}}{{$k}}={{$v}}
{{end}}
`

// ComposeTemplateTomcat generates the rootless, isolated docker-compose.yml for Tomcat.
const ComposeTemplateTomcat = `# ==============================================================================
# 1Panel Declarative Workload Manifest - Apache Tomcat (Java)
# Target Architecture: Rootless isolation, internal bridge network ingress
# ==============================================================================

services:
  app:
    image: ${TOMCAT_IMAGE}
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    user: "${UID}:${GID}"
    
    # Ingress Isolation: No host port binding. Only internal network exposure.
    expose:
      - "${APP_PORT}"
    
    # Kernel Hardening & Capability Reduction
    security_opt:
      - no-new-privileges:true
    cap_drop:
      {{range .Security.DropCaps}}- {{.}}
      {{end}}
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,nodev,size=128m
    cap_add: []
    
    environment:
      - CATALINA_OPTS=${CATALINA_OPTS}
      - JAVA_OPTS=-Djava.awt.headless=true
      - TZ=UTC
    
    volumes:
      - ./webapps:/usr/local/tomcat/webapps:rw
      - ./logs:/usr/local/tomcat/logs:rw
      - ./data:/opt/panel/data:rw
      - ./config/catalina.properties:/usr/local/tomcat/conf/catalina.properties:ro
    
    # Strict cgroups resource governance
    deploy:
      resources:
        limits:
          cpus: '${CPU_LIMIT}'
          memory: '${MEMORY_LIMIT}'
        reservations:
          memory: '${MEMORY_RESERVATION}'
    pids_limit: ${PIDS_LIMIT}
    
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://127.0.0.1:8080/ || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s
    
    networks:
      - site-network

networks:
  site-network:
    name: ${NETWORK_NAME}
    external: true
`

// ComposeTemplatePython generates the rootless, isolated docker-compose.yml for Python.
const ComposeTemplatePython = `# ==============================================================================
# 1Panel Declarative Workload Manifest - Python (WSGI/ASGI)
# Target Architecture: Rootless isolation, internal bridge network ingress
# ==============================================================================

services:
  app:
    image: ${PYTHON_IMAGE}
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    user: "${UID}:${GID}"
    working_dir: /app
    
    # Ingress Isolation: No host port binding. Only internal network exposure.
    expose:
      - "${APP_PORT}"
    
    # Kernel Hardening & Capability Reduction
    security_opt:
      - no-new-privileges:true
    cap_drop:
      {{range .Security.DropCaps}}- {{.}}
      {{end}}
    cap_add:
      {{range .Security.AddCaps}}- {{.}}
      {{end}}
    
    environment:
      - PYTHONUNBUFFERED=${PYTHONUNBUFFERED}
      - PYTHONDONTWRITEBYTECODE=${PYTHONDONTWRITEBYTECODE}
      - PORT=${APP_PORT}
      - WORKERS=${WORKERS}
      - THREADS=${THREADS}
      - APP_MODULE=${APP_MODULE}
      - PYTHONPATH=/app/.panel-deps
      - TZ=UTC
    
    volumes:
      - ./app:/app:rw
      - ./logs:/app/logs:rw
      - ./data:/app/data:rw
    
    {{if eq .Python.Runner "gunicorn"}}
    command: >
      sh -c "
        exec gunicorn ${APP_MODULE} \
          --bind 0.0.0.0:${APP_PORT} \
          --workers ${WORKERS} \
          --threads ${THREADS} \
          --worker-class gthread \
          --access-logfile - \
          --error-logfile -
      "
    {{else}}
    command: >
      sh -c "
        exec uvicorn ${APP_MODULE} \
          --host 0.0.0.0 \
          --port ${APP_PORT} \
          --workers ${WORKERS} \
          --proxy-headers \
          --forwarded-allow-ips=172.16.0.0/12
      "
    {{end}}

    # Strict cgroups resource governance
    deploy:
      resources:
        limits:
          cpus: '${CPU_LIMIT}'
          memory: '${MEMORY_LIMIT}'
          pids: ${PIDS_LIMIT}
        reservations:
          memory: '${MEMORY_RESERVATION}'
    
    healthcheck:
      test: ["CMD-SHELL", "python3 -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:${APP_PORT}/healthz')\" || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    
    networks:
      - site-network

networks:
  site-network:
    name: ${NETWORK_NAME}
    external: true
`

// ProxyTemplate generates Nginx/OpenResty reverse proxy vhost routing configuration.
const ProxyTemplate = `# ==============================================================================
# 1Panel Dynamic Reverse Proxy Ingress - OpenResty / Nginx
# Domain: {{.Domain}}
# Target Backend: {{.GetContainerName}}:{{.Port}} on bridge network {{.NetworkName}}
# ==============================================================================

upstream upstream_{{.GetContainerName}} {
    zone upstream_{{.GetContainerName}} 64k;
    server {{.GetContainerName}}:{{.Port}} max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name {{.Domain}};

    # Let's Encrypt / ACME HTTP-01 challenge routing
    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/letsencrypt;
    }

    # Force HTTPS Redirect
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {{.Domain}};

    # SSL Certificates managed by 1Panel ACME Daemon
    ssl_certificate /etc/letsencrypt/live/{{.Domain}}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{.Domain}}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    {{if .Proxy.HSTS}}
    # HTTP Strict Transport Security
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    {{end}}
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size {{.Proxy.MaxBodySizeMB}}M;

    access_log /var/log/nginx/{{.Domain}}.access.log;
    error_log /var/log/nginx/{{.Domain}}.error.log warn;

    location / {
        proxy_pass http://upstream_{{.GetContainerName}};
        proxy_http_version 1.1;

        # Header propagation
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        {{if .Proxy.EnableWebSocket}}
        # WebSocket upgrade support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        {{end}}

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
`

// DefaultTomcatIndexJSP provides an initial status landing page.
const DefaultTomcatIndexJSP = `<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
<head>
    <title>Apache Tomcat - 1Panel Container</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
        .card { max-width: 600px; margin: 40px auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155; }
        .badge { display: inline-block; background: #22c55e; color: #000; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 12px; }
        code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }
    </style>
</head>
<body>
    <div class="card">
        <span class="badge">RUNNING SECURELY</span>
        <h2>Apache Tomcat Containerized Workload</h2>
        <p>This Java application is running under rootless isolation on <code>1Panel</code>.</p>
        <ul>
            <li>JVM Version: <code><%= System.getProperty("java.version") %></code></li>
            <li>Tomcat Server: <code><%= application.getServerInfo() %></code></li>
            <li>Catalina Base: <code><%= System.getProperty("catalina.base") %></code></li>
        </ul>
        <p>Deploy your WAR file into <code>./webapps/ROOT.war</code> to replace this default view.</p>
    </div>
</body>
</html>
`

// DefaultPythonApp provides a starter FastAPI / ASGI / WSGI application with health check.
const DefaultPythonApp = `"""
1Panel Containerized Python Workload
Default ASGI/WSGI entrypoint with built-in health check probe.
"""
from datetime import datetime

async def app(scope, receive, send):
    """ASGI application handler compatible with Uvicorn and Gunicorn."""
    if scope['type'] == 'http':
        path = scope.get('path', '/')
        if path == '/healthz':
            response_body = b'{"status": "healthy", "service": "python-1panel"}'
            status_code = 200
        else:
            response_body = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Python App - 1Panel Container</title>
                <style>
                    body {{ font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }}
                    .card {{ max-width: 600px; margin: 40px auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155; }}
                    .badge {{ background: #22c55e; color: #000; padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 12px; }}
                    code {{ background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }}
                </style>
            </head>
            <body>
                <div class="card">
                    <span class="badge">RUNNING SECURELY</span>
                    <h2>Python Application Workload</h2>
                    <p>Status: Healthy & Active</p>
                    <p>Rootless non-privileged execution on <code>panel-network</code>.</p>
                    <p>Time: <code>{datetime.utcnow().isoformat()}Z</code></p>
                </div>
            </body>
            </html>
            """.encode('utf-8')
            status_code = 200

        await send({
            'type': 'http.response.start',
            'status': status_code,
            'headers': [
                [b'content-type', b'text/html; charset=utf-8' if path != '/healthz' else b'application/json'],
                [b'content-length', str(len(response_body)).encode('utf-8')],
            ],
        })
        await send({
            'type': 'http.response.body',
            'body': response_body,
        })
`

// DefaultPythonRequirements provides default packages.
const DefaultPythonRequirements = `gunicorn>=21.2.0
uvicorn[standard]>=0.28.0
`

// ParseTemplate parses and executes a template string against data.
func renderTemplate(tmplContent string, data interface{}) (string, error) {
	tmpl, err := template.New("tmpl").Funcs(templateFuncMap).Parse(tmplContent)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	if err := tmpl.Execute(&sb, data); err != nil {
		return "", err
	}
	return sb.String(), nil
}
