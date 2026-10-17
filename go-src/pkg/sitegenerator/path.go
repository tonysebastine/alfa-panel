package sitegenerator

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// IsProtectedSiteControlPath identifies root-level files that control the
// container/runtime and must not be exposed through the customer file manager.
func IsProtectedSiteControlPath(userPath string) bool {
	raw := strings.TrimSpace(strings.ReplaceAll(userPath, "\\", "/"))
	raw = strings.TrimPrefix(raw, "/")
	clean := filepath.Clean(filepath.FromSlash(raw))
	if clean == "." || clean == ".." || filepath.IsAbs(clean) || filepath.Dir(clean) != "." {
		return false
	}
	name := strings.ToLower(clean)
	if name == ".env" || strings.HasPrefix(name, ".env.") {
		return true
	}
	return name == "docker-compose.yml" || name == "docker-compose.yaml" || name == "compose.yml" || name == "compose.yaml" || strings.HasPrefix(name, "docker-compose.") || strings.HasPrefix(name, "compose.")
}

// ResolveSitePath validates a site-relative path and rejects symlink components.
// File operations should still use no-follow, directory-relative syscalls where
// possible to close the remaining check/use race.
func ResolveSitePath(domain, userPath string) (string, error) {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return "", err
	}
	raw := strings.TrimSpace(userPath)
	if raw == "" || strings.ContainsRune(raw, 0) {
		return "", fmt.Errorf("invalid path")
	}
	raw = strings.ReplaceAll(raw, "\\", "/")
	raw = strings.TrimPrefix(raw, "/")
	for _, part := range strings.Split(raw, "/") {
		if part == ".." {
			return "", fmt.Errorf("forbidden path traversal")
		}
	}

	root := filepath.Clean(filepath.Join(BaseSitesDir, cleanDomain))
	rootInfo, err := os.Lstat(root)
	if err != nil {
		return "", fmt.Errorf("site root unavailable: %w", err)
	}
	if !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("site root must be a real directory")
	}
	target := filepath.Clean(filepath.Join(root, filepath.FromSlash(raw)))
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
		return "", fmt.Errorf("forbidden path traversal")
	}
	if rel == "." {
		return root, nil
	}

	parts := strings.Split(rel, string(os.PathSeparator))
	current := root
	for i, part := range parts {
		current = filepath.Join(current, part)
		info, statErr := os.Lstat(current)
		if os.IsNotExist(statErr) {
			if i != len(parts)-1 {
				return "", fmt.Errorf("parent directory does not exist")
			}
			return target, nil
		}
		if statErr != nil {
			return "", fmt.Errorf("inspect site path: %w", statErr)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("symlink paths are not allowed through the file manager")
		}
		if i != len(parts)-1 && !info.IsDir() {
			return "", fmt.Errorf("path component is not a directory")
		}
	}
	return target, nil
}
