// TypeScript mirror of Go sitegenerator package for instantaneous browser-side preview and verification

export type SiteType = 'tomcat' | 'python';
export type PythonRunner = 'gunicorn' | 'uvicorn';

export interface SiteConfigState {
  domain: string;
  type: SiteType;
  baseDir: string;
  networkName: string;
  port: number;
  cpuLimit: string;
  memoryLimit: string;
  memoryReservation: string;
  pidsLimit: number;
  uid: number;
  gid: number;
  noNewPrivileges: boolean;
  dropCaps: string[];
  addCaps: string[];
  readOnlyRootfs: boolean;
  
  // Tomcat
  tomcatVersion: string;
  javaVersion: string;
  tomcatImage: string;
  minHeap: string;
  maxHeap: string;
  gcAlgo: string;
  customJvmOptions: string[];
  
  // Python
  pythonVersion: string;
  pythonImage: string;
  pythonRunner: PythonRunner;
  appModule: string;
  workers: number;
  threads: number;
  autoInstallReqs: boolean;
  virtualenvPath: string;

  // Ingress & SSL
  enableSSL: boolean;
  enableWebSocket: boolean;
  hsts: boolean;
  maxBodySizeMB: number;

  // Custom Env
  envVars: Array<{ key: string; value: string }>;
}

export const defaultSiteConfig: SiteConfigState = {
  domain: 'app.production.example.com',
  type: 'tomcat',
  baseDir: '/opt/panel/apps/sites',
  networkName: 'panel-site-<domain-hash>',
  port: 8080,
  cpuLimit: '1.5',
  memoryLimit: '2048M',
  memoryReservation: '512M',
  pidsLimit: 200,
  uid: 1001,
  gid: 1001,
  noNewPrivileges: true,
  dropCaps: ['ALL'],
  addCaps: [],
  readOnlyRootfs: true,

  tomcatVersion: '10.1',
  javaVersion: '21',
  tomcatImage: 'tomcat:10.1-jdk21-temurin-jammy',
  minHeap: '512m',
  maxHeap: '1536m',
  gcAlgo: '-XX:+UseG1GC',
  customJvmOptions: [
    '-Djava.security.egd=file:/dev/./urandom',
    '-Dfile.encoding=UTF-8',
    '-XX:+ExitOnOutOfMemoryError',
  ],

  pythonVersion: '3.12',
  pythonImage: 'python:3.12-slim-bookworm',
  pythonRunner: 'gunicorn',
  appModule: 'main:app',
  workers: 4,
  threads: 2,
  autoInstallReqs: false,
  virtualenvPath: '/opt/venv',

  enableSSL: true,
  enableWebSocket: true,
  hsts: true,
  maxBodySizeMB: 100,

  envVars: [
    { key: 'APP_ENV', value: 'production' },
    { key: 'LOG_LEVEL', value: 'info' },
  ],
};

export function sanitizeSlug(domain: string): string {
  return domain.toLowerCase().trim().replace(/[\.\-]/g, '_');
}

export function getContainerName(cfg: SiteConfigState): string {
  return `site_${cfg.type}_${sanitizeSlug(cfg.domain)}`;
}

export function getSiteDir(cfg: SiteConfigState): string {
  return `${cfg.baseDir}/${cfg.domain}`;
}

export function generateEnvContent(cfg: SiteConfigState): string {
  const containerName = getContainerName(cfg);
  const siteDir = getSiteDir(cfg);

  if (cfg.type === 'tomcat') {
    const customOpts = cfg.customJvmOptions.join(' ');
    const catalinaOpts = `-Xms${cfg.minHeap} -Xmx${cfg.maxHeap} ${cfg.gcAlgo} ${customOpts}`.trim();
    
    return `# ==============================================================================
# 1Panel Site Environment Configuration - Tomcat (Java)
# Domain: ${cfg.domain}
# Target Architecture: Rootless isolation, internal bridge network
# ==============================================================================

# Site Identifiers
SITE_DOMAIN=${cfg.domain}
SITE_SLUG=${containerName}
SITE_DIR=${siteDir}

# Container Runtime & Isolation
CONTAINER_NAME=${containerName}
NETWORK_NAME=${cfg.networkName}
APP_PORT=${cfg.port}
UID=${cfg.uid}
GID=${cfg.gid}

# Resource Allocation Limits
CPU_LIMIT=${cfg.cpuLimit}
MEMORY_LIMIT=${cfg.memoryLimit}
MEMORY_RESERVATION=${cfg.memoryReservation}
PIDS_LIMIT=${cfg.pidsLimit}

# Java & Tomcat Specification
TOMCAT_IMAGE=${cfg.tomcatImage}
JVM_MIN_HEAP=${cfg.minHeap}
JVM_MAX_HEAP=${cfg.maxHeap}
JVM_GC_ALGO=${cfg.gcAlgo}
CATALINA_OPTS=${catalinaOpts}

# Custom Site Variables
${cfg.envVars.map(e => `${e.key}=${e.value}`).join('\n')}
`;
  } else {
    return `# ==============================================================================
# 1Panel Site Environment Configuration - Python (ASGI/WSGI)
# Domain: ${cfg.domain}
# Target Architecture: Rootless isolation, internal bridge network
# ==============================================================================

# Site Identifiers
SITE_DOMAIN=${cfg.domain}
SITE_SLUG=${containerName}
SITE_DIR=${siteDir}

# Container Runtime & Isolation
CONTAINER_NAME=${containerName}
NETWORK_NAME=${cfg.networkName}
APP_PORT=${cfg.port}
UID=${cfg.uid}
GID=${cfg.gid}

# Resource Allocation Limits
CPU_LIMIT=${cfg.cpuLimit}
MEMORY_LIMIT=${cfg.memoryLimit}
MEMORY_RESERVATION=${cfg.memoryReservation}
PIDS_LIMIT=${cfg.pidsLimit}

# Python Specification
PYTHON_IMAGE=${cfg.pythonImage}
PYTHON_RUNNER=${cfg.pythonRunner}
APP_MODULE=${cfg.appModule}
WORKERS=${cfg.workers}
THREADS=${cfg.threads}
VIRTUAL_ENV=${cfg.virtualenvPath}

# Python Environment Flags
PYTHONUNBUFFERED=1
PYTHONDONTWRITEBYTECODE=1

# Custom Site Variables
${cfg.envVars.map(e => `${e.key}=${e.value}`).join('\n')}
`;
  }
}

export function generateComposeContent(cfg: SiteConfigState): string {
  const capDrops = cfg.dropCaps.map(c => `      - ${c}`).join('\n');
  const capAdds = cfg.addCaps.map(c => `      - ${c}`).join('\n');

  if (cfg.type === 'tomcat') {
    return `# ==============================================================================
# 1Panel Declarative Workload Manifest - Apache Tomcat (Java)
# Target Architecture: Rootless isolation, internal bridge network ingress
# ==============================================================================

services:
  app:
    image: \${TOMCAT_IMAGE}
    container_name: \${CONTAINER_NAME}
    restart: unless-stopped
    user: "\${UID}:\${GID}"
    
    # Ingress Isolation: No host port binding. Only internal network exposure.
    expose:
      - "\${APP_PORT}"
    
    # Kernel Hardening & Capability Reduction
    security_opt:
      - no-new-privileges:true
    cap_drop:
${capDrops}
    cap_add: []
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,nodev,size=128m
      - /usr/local/tomcat/temp:rw,nosuid,nodev,size=128m
      - /usr/local/tomcat/work:rw,nosuid,nodev,size=256m
    
    environment:
      - CATALINA_OPTS=\${CATALINA_OPTS}
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
          cpus: '\${CPU_LIMIT}'
          memory: '\${MEMORY_LIMIT}'
          pids: \${PIDS_LIMIT}
        reservations:
          memory: '\${MEMORY_RESERVATION}'
    
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
    name: \${NETWORK_NAME}
    external: true
`;
  } else {
    const runnerCmd = cfg.pythonRunner === 'gunicorn' 
      ? `command: >
      sh -c "
        exec gunicorn \${APP_MODULE} \\
          --bind 0.0.0.0:\${APP_PORT} \\
          --workers \${WORKERS} \\
          --threads \${THREADS} \\
          --worker-class gthread \\
          --access-logfile - \\
          --error-logfile -
      "`
      : `command: >
      sh -c "
        exec uvicorn \${APP_MODULE} \\
          --host 0.0.0.0 \\
          --port \${APP_PORT} \\
          --workers \${WORKERS} \\
          --proxy-headers \\
          --forwarded-allow-ips=172.16.0.0/12
      "`;

    return `# ==============================================================================
# 1Panel Declarative Workload Manifest - Python (WSGI/ASGI)
# Target Architecture: Rootless isolation, internal bridge network ingress
# ==============================================================================

services:
  app:
    image: \${PYTHON_IMAGE}
    container_name: \${CONTAINER_NAME}
    restart: unless-stopped
    user: "\${UID}:\${GID}"
    working_dir: /app
    
    # Ingress Isolation: No host port binding. Only internal network exposure.
    expose:
      - "\${APP_PORT}"
    
    # Kernel Hardening & Capability Reduction
    security_opt:
      - no-new-privileges:true
    cap_drop:
${capDrops}
    cap_add:
${capAdds}
    
    environment:
      - PYTHONUNBUFFERED=\${PYTHONUNBUFFERED}
      - PYTHONDONTWRITEBYTECODE=\${PYTHONDONTWRITEBYTECODE}
      - PORT=\${APP_PORT}
      - WORKERS=\${WORKERS}
      - THREADS=\${THREADS}
      - APP_MODULE=\${APP_MODULE}
      - PYTHONPATH=/app/.panel-deps
      - TZ=UTC
    
    volumes:
      - ./app:/app:rw
      - ./logs:/app/logs:rw
      - ./data:/app/data:rw
    
    ${runnerCmd}

    # Strict cgroups resource governance
    deploy:
      resources:
        limits:
          cpus: '\${CPU_LIMIT}'
          memory: '\${MEMORY_LIMIT}'
          pids: \${PIDS_LIMIT}
        reservations:
          memory: '\${MEMORY_RESERVATION}'
    
    healthcheck:
      test: ["CMD-SHELL", "python3 -c \\"import urllib.request; urllib.request.urlopen('http://127.0.0.1:\${APP_PORT}/healthz')\\" || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    
    networks:
      - \${NETWORK_NAME}

networks:
  panel-network:
    name: \${NETWORK_NAME}
    external: true
`;
  }
}

export function generateProxyConfig(cfg: SiteConfigState): string {
  const containerName = getContainerName(cfg);

  return `# ==============================================================================
# 1Panel Dynamic Reverse Proxy Ingress - OpenResty / Nginx
# Domain: ${cfg.domain}
# Target Backend: ${containerName}:${cfg.port} on bridge network ${cfg.networkName}
# ==============================================================================

# Connection upgrade mapping for WebSocket support
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream upstream_${containerName} {
    zone upstream_${containerName} 64k;
    server ${containerName}:${cfg.port} max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${cfg.domain};

    # Let's Encrypt / ACME HTTP-01 challenge routing
    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/letsencrypt;
        allow all;
    }

    ${cfg.enableSSL ? `# Force HTTP to HTTPS redirection
    location / {
        return 301 https://$host$request_uri;
    }` : `# Plain HTTP proxy
    location / {
        proxy_pass http://upstream_${containerName};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }`}
}

${cfg.enableSSL ? `server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${cfg.domain};

    ssl_certificate /opt/panel/ssl/${cfg.domain}/fullchain.pem;
    ssl_certificate_key /opt/panel/ssl/${cfg.domain}/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL_${containerName}:10m;
    ssl_session_timeout 1d;

    ${cfg.hsts ? 'add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;' : ''}
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size ${cfg.maxBodySizeMB}M;

    access_log /var/log/nginx/${cfg.domain}.access.log combined;
    error_log /var/log/nginx/${cfg.domain}.error.log warn;

    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/letsencrypt;
        allow all;
    }

    location / {
        proxy_pass http://upstream_${containerName};
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port 443;

        ${cfg.enableWebSocket ? `proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;` : ''}

        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}` : ''}
`;
}
