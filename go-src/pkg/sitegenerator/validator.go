package sitegenerator

import (
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	// domainRegex validates RFC 1123 compliant domain names.
	domainRegex = regexp.MustCompile(`^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$`)

	// jvmHeapRegex validates memory strings like "512m", "2g", "1024M".
	jvmHeapRegex = regexp.MustCompile(`^[1-9][0-9]{0,5}[mMgG]$`)

	// pythonModuleRegex validates "package.submodule:app" or "main:app".
	pythonModuleRegex = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*:[a-zA-Z_][a-zA-Z0-9_]*$`)

	// safeJvmOptionRegex allows standard -Dkey=val, -XX:+Flag, -XX:Param=Val.
	safeJvmOptionRegex = regexp.MustCompile(`^(-D[a-zA-Z0-9_\.\-]+(=[a-zA-Z0-9_\.\-/:,]*)?|-XX:[+\-][a-zA-Z0-9_]+|-XX:[a-zA-Z0-9_]+=[a-zA-Z0-9_]+|-Xss[0-9]+[kKmMgG])$`)

	// cpuLimitRegex validates CPU strings like "1", "0.5", "2.0".
	cpuLimitRegex = regexp.MustCompile(`^[0-9]+(\.[0-9]+)?$`)

	// allowedCaps is the strict whitelist of capabilities that can be added.
	allowedCaps = map[string]bool{
		"NET_BIND_SERVICE": true,
		"CHOWN":            true,
		"SETUID":           true,
		"SETGID":           true,
	}
)

// ValidateConfig validates the entire SiteConfig against security and operational rules.
func ValidateConfig(cfg *SiteConfig) error {
	if cfg == nil {
		return errors.New("site config cannot be nil")
	}

	// 1. Domain Validation
	if err := ValidateDomain(cfg.Domain); err != nil {
		return fmt.Errorf("invalid domain: %w", err)
	}

	// 2. Base directory safety
	if cfg.BaseDir == "" {
		cfg.BaseDir = "/opt/panel/apps/sites"
	}
	if !filepath.IsAbs(cfg.BaseDir) {
		return fmt.Errorf("base_dir must be an absolute path: %s", cfg.BaseDir)
	}
	if strings.Contains(cfg.BaseDir, "..") {
		return errors.New("base_dir contains forbidden path traversal sequence '..'")
	}

	// 3. Port bounds
	if cfg.Port < 1024 || cfg.Port > 65535 {
		return fmt.Errorf("internal port must be between 1024 and 65535, got %d", cfg.Port)
	}

	// 4. Security Profile
	if err := ValidateSecurityProfile(&cfg.Security); err != nil {
		return fmt.Errorf("security configuration error: %w", err)
	}

	// 5. Resource Limits
	if err := ValidateResourceLimits(&cfg.Resources); err != nil {
		return fmt.Errorf("resource limits error: %w", err)
	}

	// 6. Runtime Specifics
	switch cfg.Type {
	case SiteTypeTomcat:
		if cfg.Tomcat == nil {
			return errors.New("tomcat configuration cannot be nil when site type is 'tomcat'")
		}
		if err := ValidateTomcatConfig(cfg.Tomcat); err != nil {
			return fmt.Errorf("tomcat config error: %w", err)
		}
	case SiteTypePython:
		if cfg.Python == nil {
			return errors.New("python configuration cannot be nil when site type is 'python'")
		}
		if err := ValidatePythonConfig(cfg.Python); err != nil {
			return fmt.Errorf("python config error: %w", err)
		}
	default:
		return fmt.Errorf("unsupported site type: %s (must be 'tomcat' or 'python')", cfg.Type)
	}

	// 7. Environment variable validation
	for k := range cfg.EnvVars {
		if strings.ContainsAny(k, " \t\n\r=:") {
			return fmt.Errorf("invalid environment variable key '%s'", k)
		}
	}

	return nil
}

// ValidateDomain ensures a domain is RFC 1123 compliant and free of injection.
func ValidateDomain(domain string) error {
	domain = strings.TrimSpace(domain)
	if domain == "" {
		return errors.New("domain cannot be empty")
	}
	if len(domain) > 253 {
		return fmt.Errorf("domain exceeds maximum length of 253 characters (%d)", len(domain))
	}
	if strings.Contains(domain, "/") || strings.Contains(domain, "\\") || strings.Contains(domain, "..") {
		return errors.New("domain contains illegal path characters")
	}
	if !domainRegex.MatchString(domain) {
		return fmt.Errorf("domain '%s' does not match RFC 1123 FQDN syntax", domain)
	}
	return nil
}

// ValidateSecurityProfile enforces rootless isolation and drops dangerous capabilities.
func ValidateSecurityProfile(sec *SecurityProfile) error {
	if sec.UID < 1000 {
		return fmt.Errorf("rootless policy requires UID >= 1000 to prevent root escalation, got %d", sec.UID)
	}
	if sec.GID < 1000 {
		return fmt.Errorf("rootless policy requires GID >= 1000 to prevent root escalation, got %d", sec.GID)
	}

	hasDropAll := false
	for _, cap := range sec.DropCaps {
		if strings.ToUpper(cap) == "ALL" {
			hasDropAll = true
			break
		}
	}
	if !hasDropAll {
		return errors.New("security profile must include 'ALL' in drop_caps")
	}

	for _, cap := range sec.AddCaps {
		capUpper := strings.ToUpper(cap)
		if !allowedCaps[capUpper] {
			return fmt.Errorf("forbidden capability in add_caps: '%s' (not in whitelist)", cap)
		}
	}

	return nil
}

// ValidateResourceLimits ensures CPU and RAM limits are sane.
func ValidateResourceLimits(res *ResourceLimits) error {
	if res.CPULimit != "" {
		if !cpuLimitRegex.MatchString(res.CPULimit) {
			return fmt.Errorf("invalid cpu_limit format '%s' (e.g. '1.5')", res.CPULimit)
		}
		val, _ := strconv.ParseFloat(res.CPULimit, 64)
		if val <= 0 || val > 128 {
			return fmt.Errorf("cpu_limit must be between 0.1 and 128 cores, got %f", val)
		}
	}

	if res.MemoryLimit != "" {
		if !jvmHeapRegex.MatchString(res.MemoryLimit) {
			return fmt.Errorf("invalid memory_limit format '%s' (e.g. '2048M', '4G')", res.MemoryLimit)
		}
	}

	if res.PidsLimit < 50 || res.PidsLimit > 5000 {
		return fmt.Errorf("pids_limit must be between 50 and 5000, got %d", res.PidsLimit)
	}

	return nil
}

// ValidateTomcatConfig enforces safe JVM heap and options without command injection.
func ValidateTomcatConfig(t *TomcatConfig) error {
	if t.Image == "" {
		return errors.New("tomcat base image cannot be empty")
	}
	if strings.ContainsAny(t.Image, ";|&`$") {
		return errors.New("tomcat image contains illegal characters")
	}

	if !jvmHeapRegex.MatchString(t.MinHeap) {
		return fmt.Errorf("invalid min_heap (-Xms): '%s' (expected e.g. 512m, 1g)", t.MinHeap)
	}
	if !jvmHeapRegex.MatchString(t.MaxHeap) {
		return fmt.Errorf("invalid max_heap (-Xmx): '%s' (expected e.g. 1536m, 2g)", t.MaxHeap)
	}

	for _, opt := range t.CustomJVMOptions {
		optTrim := strings.TrimSpace(opt)
		if optTrim == "" {
			continue
		}
		// Deny dangerous injection vectors
		if strings.ContainsAny(optTrim, ";&|`$<>(){}*!\"'\n\r") {
			return fmt.Errorf("custom JVM option contains unsafe shell metacharacters: '%s'", optTrim)
		}
		if strings.HasPrefix(optTrim, "-agentlib") || strings.HasPrefix(optTrim, "-javaagent") {
			return fmt.Errorf("prohibited JVM option: '%s' (arbitrary agent loading is disabled)", optTrim)
		}
		if !safeJvmOptionRegex.MatchString(optTrim) {
			return fmt.Errorf("custom JVM option does not conform to safe flag syntax: '%s'", optTrim)
		}
	}

	return nil
}

// ValidatePythonConfig validates WSGI/ASGI runner and entrypoint against RCE.
func ValidatePythonConfig(p *PythonConfig) error {
	if p.Image == "" {
		return errors.New("python base image cannot be empty")
	}
	if strings.ContainsAny(p.Image, ";|&`$") {
		return errors.New("python image contains illegal characters")
	}

	if p.Runner != PythonRunnerGunicorn && p.Runner != PythonRunnerUvicorn {
		return fmt.Errorf("unsupported python runner '%s' (must be 'gunicorn' or 'uvicorn')", p.Runner)
	}

	if !pythonModuleRegex.MatchString(p.AppModule) {
		return fmt.Errorf("invalid python app_module entrypoint '%s' (expected format: 'main:app' or 'app.wsgi:application')", p.AppModule)
	}

	if p.Workers < 1 || p.Workers > 64 {
		return fmt.Errorf("python workers must be between 1 and 64, got %d", p.Workers)
	}
	if p.Threads < 1 || p.Threads > 32 {
		return fmt.Errorf("python threads must be between 1 and 32, got %d", p.Threads)
	}

	return nil
}
