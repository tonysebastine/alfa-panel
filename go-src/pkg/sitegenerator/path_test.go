package sitegenerator

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsProtectedSiteControlPath(t *testing.T) {
	for _, path := range []string{".env", "./.env", ".env.production", "docker-compose.yml", "compose.yaml"} {
		if !IsProtectedSiteControlPath(path) {
			t.Errorf("expected %q to be protected", path)
		}
	}
	for _, path := range []string{"index.html", "app/.env", "src/main.py"} {
		if IsProtectedSiteControlPath(path) {
			t.Errorf("expected %q not to be a root control file", path)
		}
	}
}

func TestResolveSitePathRejectsSymlinkComponents(t *testing.T) {
	old := BaseSitesDir
	BaseSitesDir = t.TempDir()
	t.Cleanup(func() { BaseSitesDir = old })
	root := filepath.Join(BaseSitesDir, "app.example.com")
	outside := t.TempDir()
	if err := os.MkdirAll(root, 0750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("secret"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "link")); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolveSitePath("app.example.com", "link/secret.txt"); err == nil {
		t.Fatal("expected symlink traversal to be rejected")
	}
}

func TestResolveSitePathAllowsMissingLeafButNotMissingParent(t *testing.T) {
	old := BaseSitesDir
	BaseSitesDir = t.TempDir()
	t.Cleanup(func() { BaseSitesDir = old })
	if err := os.MkdirAll(filepath.Join(BaseSitesDir, "app.example.com"), 0750); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolveSitePath("app.example.com", "new.txt"); err != nil {
		t.Fatalf("missing leaf should be allowed: %v", err)
	}
	if _, err := ResolveSitePath("app.example.com", "missing/new.txt"); err == nil {
		t.Fatal("missing parent directory should be rejected")
	}
}
