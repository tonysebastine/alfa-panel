package sitegenerator

import "strings"

// BaseSitesDir is the canonical host root for managed sites.
var BaseSitesDir = "/opt/panel/apps/sites"

// SanitizeDomain is the canonical compatibility wrapper used by lifecycle services.
func SanitizeDomain(domain string) (string, error) {
	if err := ValidateDomain(domain); err != nil {
		return "", err
	}
	return strings.ToLower(strings.TrimSpace(domain)), nil
}
