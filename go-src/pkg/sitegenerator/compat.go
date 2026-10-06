package sitegenerator

import (
	"os"
	"strings"
)

// BaseSitesDir is the canonical host root for managed sites.
var BaseSitesDir = func() string { if v:=strings.TrimSpace(os.Getenv("PANEL_SITES_DIR"));v!=""{return v};return "/opt/panel/apps/sites" }()

// SanitizeDomain is the canonical compatibility wrapper used by lifecycle services.
func SanitizeDomain(domain string) (string, error) {
	if err := ValidateDomain(domain); err != nil {
		return "", err
	}
	return strings.ToLower(strings.TrimSpace(domain)), nil
}

// atomicWrite preserves the historical helper name used by proxy services.
func atomicWrite(dest string, content []byte, mode os.FileMode) error { return atomicWriteFile(dest, content, mode) }
