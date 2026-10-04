package sitegenerator

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

// BaseSitesDir defines the root hosting directory path.
// Can be overridden for testing or custom host mounts.
var BaseSitesDir = "/opt/panel/apps/sites"

// SiteConfig defines common hosting resource and network properties.
type SiteConfig struct {
	Domain   string `json:"domain"`
	AppType  string `json:"app_type"` // "tomcat" | "python"
	RamLimit string `json:"ram_limit"` // e.g. "2048M"
	CpuLimit string `json:"cpu_limit"` // e.g. "1.5"
	Port     int    `json:"port"`      // e.g. 8080 or 8000
}

// TomcatConfig defines Java/Tomcat runtime specifications.
type TomcatConfig struct {
	JvmXms        string `json:"jvm_xms"`        // e.g. "512m"
	JvmXmx        string `json:"jvm_xmx"`        // e.g. "1536m"
	JavaOpts      string `json:"java_opts"`      // e.g. "-XX:+UseG1GC -Dfile.encoding=UTF-8"
	TomcatVersion string `json:"tomcat_version"` // e.g. "10.1-jdk21-temurin"
}

// PythonConfig defines Python execution and WSGI/ASGI server specifications.
type PythonConfig struct {
	PythonVersion string `json:"python_version"` // e.g. "3.12-slim"
	AppEntry      string `json:"app_entry"`      // e.g. "main:app"
	ServerType    string `json:"server_type"`    // "gunicorn" | "uvicorn"
	Workers       int    `json:"workers"`        // e.g. 4
}

// Template data contexts
type tomcatTemplateData struct {
	Domain        string
	ContainerName string
	Port          int
	RamLimit      string
	CpuLimit      string
	TomcatImage   string
	JvmXms        string
	JvmXmx        string
	JavaOpts      string
	CatalinaOpts  string
}

type pythonTemplateData struct {
	Domain        string
	ContainerName string
	Port          int
	RamLimit      string
	CpuLimit      string
	PythonImage   string
	AppEntry      string
	ServerType    string
	Workers       int
}

// Regular expressions for strict input validation
var (
	// domainRegex RFC 1123 compliant domain name
	domainPattern = regexp.MustCompile(`^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$`)

	// heapPattern validates e.g. "256m", "1024M", "2g", "4G"
	heapPattern = regexp.MustCompile(`^[1-9][0-9]{0,5}[mMgG]$`)

	// cpuPattern validates e.g. "0.5", "1", "2.0"
	cpuPattern = regexp.MustCompile(`^[0-9]+(\.[0-9]+)?$`)

	// ramPattern validates e.g. "512M", "2G"
	ramPattern = regexp.MustCompile(`^[1-9][0-9]{0,5}[mMgG]$`)

	// pythonEntryPattern validates module:app format, e.g. "main:app" or "app.server:app"
	pythonEntryPattern = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*:[a-zA-Z_][a-zA-Z0-9_]*$`)
)

// SanitizeDomain validates domain against directory traversal, shell escapes, and RFC 1123 syntax.
func SanitizeDomain(domain string) (string, error) {
	domain = strings.TrimSpace(domain)
	if domain == "" {
		return "", errors.New("domain name cannot be empty")
	}
	if len(domain) > 253 {
		return "", fmt.Errorf("domain exceeds max length of 253 chars (%d)", len(domain))
	}
	// Path traversal and dangerous character check
	if strings.ContainsAny(domain, "/\\`$;&|<>*?!\"' \t\r\n\x00") || strings.Contains(domain, "..") {
		return "", fmt.Errorf("domain '%s' contains illegal path traversal or control characters", domain)
	}
	if !domainPattern.MatchString(domain) {
		return "", fmt.Errorf("domain '%s' does not conform to RFC 1123 FQDN syntax", domain)
	}
	return strings.ToLower(domain), nil
}

// SanitizeJavaOpts inspects custom JVM arguments and rejects shell metacharacters and arbitrary agent injection.
func SanitizeJavaOpts(opts string) (string, error) {
	trimmed := strings.TrimSpace(opts)
	if trimmed == "" {
		return "", nil
	}
	// Reject dangerous shell metacharacters
	if strings.ContainsAny(trimmed, ";&|`$<>(){}*!\"'\n\r\x00") {
		return "", fmt.Errorf("java_opts contains forbidden shell metacharacters: '%s'", opts)
	}
	// Reject arbitrary agent loading that could execute untrusted native/jar code
	if strings.Contains(trimmed, "-javaagent") || strings.Contains(trimmed, "-agentlib") || strings.Contains(trimmed, "-agentpath") {
		return "", errors.New("java_opts contains prohibited agent loading options (-javaagent, -agentlib)")
	}
	return trimmed, nil
}

// SanitizeSiteConfig validates common resource limits and ports.
func SanitizeSiteConfig(res *SiteConfig) error {
	if res.Port < 1 || res.Port > 65535 {
		return fmt.Errorf("invalid port %d (must be between 1 and 65535)", res.Port)
	}
	if res.CpuLimit != "" {
		if !cpuPattern.MatchString(res.CpuLimit) {
			return fmt.Errorf("invalid cpu_limit format '%s' (e.g. '1.5')", res.CpuLimit)
		}
		cpuVal, _ := strconv.ParseFloat(res.CpuLimit, 64)
		if cpuVal <= 0 || cpuVal > 128 {
			return fmt.Errorf("cpu_limit must be between 0.1 and 128, got %f", cpuVal)
		}
	}
	if res.RamLimit != "" {
		if !ramPattern.MatchString(res.RamLimit) {
			return fmt.Errorf("invalid ram_limit format '%s' (e.g. '2048M', '4G')", res.RamLimit)
		}
	}
	return nil
}

// GenerateTomcatSite provisions /opt/panel/apps/sites/<domain>/ for Apache Tomcat:
// Directory layout: data/webapps/, data/conf/, logs/, docker-compose.yml, .env
func GenerateTomcatSite(domain string, cfg TomcatConfig, res SiteConfig) error {
	// 1. Sanitize domain
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return fmt.Errorf("domain validation error: %w", err)
	}
	res.Domain = cleanDomain
	res.AppType = "tomcat"

	// Set defaults if empty
	if res.Port == 0 {
		res.Port = 8080
	}
	if res.CpuLimit == "" {
		res.CpuLimit = "1.5"
	}
	if res.RamLimit == "" {
		res.RamLimit = "2048M"
	}
	if cfg.TomcatVersion == "" {
		cfg.TomcatVersion = "10.1-jdk21-temurin"
	}
	if cfg.JvmXms == "" {
		cfg.JvmXms = "512m"
	}
	if cfg.JvmXmx == "" {
		cfg.JvmXmx = "1536m"
	}

	// 2. Validate parameters
	if err := SanitizeSiteConfig(&res); err != nil {
		return err
	}
	if !heapPattern.MatchString(cfg.JvmXms) {
		return fmt.Errorf("invalid jvm_xms format: '%s' (e.g. '512m')", cfg.JvmXms)
	}
	if !heapPattern.MatchString(cfg.JvmXmx) {
		return fmt.Errorf("invalid jvm_xmx format: '%s' (e.g. '1536m')", cfg.JvmXmx)
	}
	cleanJavaOpts, err := SanitizeJavaOpts(cfg.JavaOpts)
	if err != nil {
		return err
	}
	cfg.JavaOpts = cleanJavaOpts

	// 3. Compute target paths: /opt/panel/apps/sites/<domain>/
	siteDir := filepath.Join(BaseSitesDir, cleanDomain)
	dirsToCreate := []string{
		filepath.Join(siteDir, "data", "webapps"),
		filepath.Join(siteDir, "data", "conf"),
		filepath.Join(siteDir, "logs"),
	}

	for _, dir := range dirsToCreate {
		if err := os.MkdirAll(dir, 0750); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	// 4. Resolve container name and image
	slug := strings.ReplaceAll(cleanDomain, ".", "_")
	slug = strings.ReplaceAll(slug, "-", "_")
	containerName := fmt.Sprintf("site_tomcat_%s", slug)
	imageName := cfg.TomcatVersion
	if !strings.Contains(imageName, "/") && !strings.HasPrefix(imageName, "tomcat:") {
		imageName = "tomcat:" + imageName
	}

	catalinaOpts := fmt.Sprintf("-Xms%s -Xmx%s %s", cfg.JvmXms, cfg.JvmXmx, cfg.JavaOpts)
	catalinaOpts = strings.TrimSpace(catalinaOpts)

	data := tomcatTemplateData{
		Domain:        cleanDomain,
		ContainerName: containerName,
		Port:          res.Port,
		RamLimit:      res.RamLimit,
		CpuLimit:      res.CpuLimit,
		TomcatImage:   imageName,
		JvmXms:        cfg.JvmXms,
		JvmXmx:        cfg.JvmXmx,
		JavaOpts:      cfg.JavaOpts,
		CatalinaOpts:  catalinaOpts,
	}

	// 5. Render and write .env atomically
	envContent, err := renderStringTemplate(tomcatEnvTmpl, data)
	if err != nil {
		return fmt.Errorf("failed to render tomcat .env: %w", err)
	}
	envPath := filepath.Join(siteDir, ".env")
	if err := atomicWrite(envPath, []byte(envContent), 0640); err != nil {
		return fmt.Errorf("failed to write %s: %w", envPath, err)
	}

	// 6. Render and write docker-compose.yml atomically
	composeContent, err := renderStringTemplate(tomcatComposeTmpl, data)
	if err != nil {
		return fmt.Errorf("failed to render tomcat compose manifest: %w", err)
	}
	composePath := filepath.Join(siteDir, "docker-compose.yml")
	if err := atomicWrite(composePath, []byte(composeContent), 0640); err != nil {
		return fmt.Errorf("failed to write %s: %w", composePath, err)
	}

	// 7. Seed default conf/server.xml placeholder if not exists
	serverXml := filepath.Join(siteDir, "data", "conf", "server.xml")
	if _, err := os.Stat(serverXml); os.IsNotExist(err) {
		_ = os.WriteFile(serverXml, []byte("<!-- 1Panel Custom Tomcat Configuration Mount -->\n"), 0644)
	}

	return nil
}

// GeneratePythonSite provisions /opt/panel/apps/sites/<domain>/ for Python ASGI/WSGI:
// Directory layout: app/, logs/, docker-compose.yml, .env
func GeneratePythonSite(domain string, cfg PythonConfig, res SiteConfig) error {
	// 1. Sanitize domain
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return fmt.Errorf("domain validation error: %w", err)
	}
	res.Domain = cleanDomain
	res.AppType = "python"

	// Set defaults if empty
	if res.Port == 0 {
		res.Port = 8000
	}
	if res.CpuLimit == "" {
		res.CpuLimit = "1.5"
	}
	if res.RamLimit == "" {
		res.RamLimit = "2048M"
	}
	if cfg.PythonVersion == "" {
		cfg.PythonVersion = "3.12-slim"
	}
	if cfg.AppEntry == "" {
		cfg.AppEntry = "main:app"
	}
	if cfg.ServerType == "" {
		cfg.ServerType = "gunicorn"
	}
	if cfg.Workers <= 0 {
		cfg.Workers = 4
	}

	// 2. Validate parameters
	if err := SanitizeSiteConfig(&res); err != nil {
		return err
	}
	if cfg.ServerType != "gunicorn" && cfg.ServerType != "uvicorn" {
		return fmt.Errorf("invalid server_type '%s' (must be 'gunicorn' or 'uvicorn')", cfg.ServerType)
	}
	if !pythonEntryPattern.MatchString(cfg.AppEntry) {
		return fmt.Errorf("invalid app_entry '%s' (expected 'main:app' or 'app.wsgi:application')", cfg.AppEntry)
	}
	if cfg.Workers > 64 {
		return fmt.Errorf("workers count too high: %d (max 64)", cfg.Workers)
	}

	// 3. Compute target paths: /opt/panel/apps/sites/<domain>/
	siteDir := filepath.Join(BaseSitesDir, cleanDomain)
	dirsToCreate := []string{
		filepath.Join(siteDir, "app"),
		filepath.Join(siteDir, "logs"),
	}

	for _, dir := range dirsToCreate {
		if err := os.MkdirAll(dir, 0750); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	// 4. Resolve container name and image
	slug := strings.ReplaceAll(cleanDomain, ".", "_")
	slug = strings.ReplaceAll(slug, "-", "_")
	containerName := fmt.Sprintf("site_python_%s", slug)
	imageName := cfg.PythonVersion
	if !strings.Contains(imageName, "/") && !strings.HasPrefix(imageName, "python:") {
		imageName = "python:" + imageName
	}

	data := pythonTemplateData{
		Domain:        cleanDomain,
		ContainerName: containerName,
		Port:          res.Port,
		RamLimit:      res.RamLimit,
		CpuLimit:      res.CpuLimit,
		PythonImage:   imageName,
		AppEntry:      cfg.AppEntry,
		ServerType:    cfg.ServerType,
		Workers:       cfg.Workers,
	}

	// 5. Render and write .env atomically
	envContent, err := renderStringTemplate(pythonEnvTmpl, data)
	if err != nil {
		return fmt.Errorf("failed to render python .env: %w", err)
	}
	envPath := filepath.Join(siteDir, ".env")
	if err := atomicWrite(envPath, []byte(envContent), 0640); err != nil {
		return fmt.Errorf("failed to write %s: %w", envPath, err)
	}

	// 6. Render and write docker-compose.yml atomically
	composeContent, err := renderStringTemplate(pythonComposeTmpl, data)
	if err != nil {
		return fmt.Errorf("failed to render python compose manifest: %w", err)
	}
	composePath := filepath.Join(siteDir, "docker-compose.yml")
	if err := atomicWrite(composePath, []byte(composeContent), 0640); err != nil {
		return fmt.Errorf("failed to write %s: %w", composePath, err)
	}

	// 7. Seed starter app/main.py and requirements.txt if not present
	mainPy := filepath.Join(siteDir, "app", "main.py")
	if _, err := os.Stat(mainPy); os.IsNotExist(err) {
		starter := `# 1Panel Python ASGI/WSGI Starter
async def app(scope, receive, send):
    assert scope['type'] == 'http'
    body = b'{"status":"healthy","service":"1panel-python"}'
    await send({'type': 'http.response.start', 'status': 200, 'headers': [[b'content-type', b'application/json']]})
    await send({'type': 'http.response.body', 'body': body})
`
		_ = os.WriteFile(mainPy, []byte(starter), 0644)
	}
	reqFile := filepath.Join(siteDir, "app", "requirements.txt")
	if _, err := os.Stat(reqFile); os.IsNotExist(err) {
		_ = os.WriteFile(reqFile, []byte("gunicorn>=21.2.0\nuvicorn[standard]>=0.28.0\n"), 0644)
	}

	return nil
}

// -----------------------------------------------------------------------------
// Compose and .env Go Templates (text/template)
// -----------------------------------------------------------------------------

const tomcatEnvTmpl = `# 1Panel Site Environment - Apache Tomcat
SITE_DOMAIN={{.Domain}}
CONTAINER_NAME={{.ContainerName}}
APP_PORT={{.Port}}
CPU_LIMIT={{.CpuLimit}}
RAM_LIMIT={{.RamLimit}}
TOMCAT_IMAGE={{.TomcatImage}}
JVM_XMS={{.JvmXms}}
JVM_XMX={{.JvmXmx}}
CATALINA_OPTS={{.CatalinaOpts}}
UID=1001
GID=1001
`

const tomcatComposeTmpl = `# 1Panel Containerized Manifest - Apache Tomcat
services:
  app:
    image: ${TOMCAT_IMAGE}
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    user: "${UID}:${GID}"
    
    # Internal network ingress: No raw host ports exposed directly
    expose:
      - "${APP_PORT}"
    
    # Rootless kernel security isolation
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
      - CHOWN
      - SETUID
      - SETGID
    
    environment:
      - CATALINA_OPTS=${CATALINA_OPTS}
      - JAVA_OPTS=-Djava.awt.headless=true
      - TZ=UTC
    
    volumes:
      - ./data/webapps:/usr/local/tomcat/webapps:rw
      - ./data/conf:/usr/local/tomcat/conf/custom:ro
      - ./logs:/usr/local/tomcat/logs:rw
    
    deploy:
      resources:
        limits:
          cpus: '${CPU_LIMIT}'
          memory: '${RAM_LIMIT}'
    
    networks:
      - panel-network

networks:
  panel-network:
    external: true
`

const pythonEnvTmpl = `# 1Panel Site Environment - Python (ASGI/WSGI)
SITE_DOMAIN={{.Domain}}
CONTAINER_NAME={{.ContainerName}}
APP_PORT={{.Port}}
CPU_LIMIT={{.CpuLimit}}
RAM_LIMIT={{.RamLimit}}
PYTHON_IMAGE={{.PythonImage}}
APP_ENTRY={{.AppEntry}}
SERVER_TYPE={{.ServerType}}
WORKERS={{.Workers}}
UID=1001
GID=1001
PYTHONUNBUFFERED=1
`

const pythonComposeTmpl = `# 1Panel Containerized Manifest - Python
services:
  app:
    image: ${PYTHON_IMAGE}
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    user: "${UID}:${GID}"
    working_dir: /app
    
    # Internal network ingress: No raw host ports exposed directly
    expose:
      - "${APP_PORT}"
    
    # Rootless kernel security isolation
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
      - CHOWN
      - SETUID
      - SETGID
    
    environment:
      - PORT=${APP_PORT}
      - WORKERS=${WORKERS}
      - APP_ENTRY=${APP_ENTRY}
      - PYTHONUNBUFFERED=${PYTHONUNBUFFERED}
      - TZ=UTC
    
    volumes:
      - ./app:/app:rw
      - ./logs:/app/logs:rw
    
    {{if eq .ServerType "gunicorn"}}
    command: >
      sh -c "
        if [ -f requirements.txt ]; then
          pip install --no-cache-dir --user -r requirements.txt;
        fi &&
        exec gunicorn ${APP_ENTRY} \
          --bind 0.0.0.0:${APP_PORT} \
          --workers ${WORKERS} \
          --worker-class gthread \
          --access-logfile - \
          --error-logfile -
      "
    {{else}}
    command: >
      sh -c "
        if [ -f requirements.txt ]; then
          pip install --no-cache-dir --user -r requirements.txt;
        fi &&
        exec uvicorn ${APP_ENTRY} \
          --host 0.0.0.0 \
          --port ${APP_PORT} \
          --workers ${WORKERS} \
          --proxy-headers
      "
    {{end}}

    deploy:
      resources:
        limits:
          cpus: '${CPU_LIMIT}'
          memory: '${RAM_LIMIT}'
    
    networks:
      - panel-network

networks:
  panel-network:
    external: true
`

// Helper to execute template
func renderStringTemplate(tmplStr string, data any) (string, error) {
	t, err := template.New("manifest").Parse(tmplStr)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	if err := t.Execute(&sb, data); err != nil {
		return "", err
	}
	return sb.String(), nil
}

// Atomic file writer
func atomicWrite(dest string, content []byte, mode os.FileMode) error {
	dir := filepath.Dir(dest)
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer func() {
		_ = os.Remove(tmpPath)
	}()

	if _, err := tmp.Write(content); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpPath, mode); err != nil {
		return err
	}
	return os.Rename(tmpPath, dest)
}
