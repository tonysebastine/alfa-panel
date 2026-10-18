package api

import (
	"archive/zip"
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestExtractIPTrustedProxy(t *testing.T) {
	origTrust := os.Getenv("PANEL_TRUST_PROXY")
	origCIDRs := os.Getenv("PANEL_TRUSTED_PROXY_CIDRS")
	defer func() {
		os.Setenv("PANEL_TRUST_PROXY", origTrust)
		os.Setenv("PANEL_TRUSTED_PROXY_CIDRS", origCIDRs)
	}()

	mk := func(remote, xff string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = remote
		if xff != "" {
			r.Header.Set("X-Forwarded-For", xff)
		}
		return r
	}

	// 1. Untrusted peer with spoofed XFF
	os.Setenv("PANEL_TRUST_PROXY", "false")
	if got := extractIP(mk("203.0.113.9:5555", "1.2.3.4")); got != "203.0.113.9" {
		t.Errorf("spoofed XFF from untrusted peer honoured: %s", got)
	}

	// 2. Trusted proxy configured
	os.Setenv("PANEL_TRUST_PROXY", "true")
	os.Setenv("PANEL_TRUSTED_PROXY_CIDRS", "10.0.0.0/8, 172.16.0.0/12")

	if got := extractIP(mk("10.0.0.5:1", "198.51.100.7")); got != "198.51.100.7" {
		t.Errorf("trusted proxy XFF ignored: %s", got)
	}

	// 3. Client prepends a fake entry: right-most untrusted in the proxy chain must win
	if got := extractIP(mk("10.0.0.5:1", "6.6.6.6, 198.51.100.7, 10.0.0.9")); got != "198.51.100.7" {
		t.Errorf("prepended XFF spoof succeeded: got %s, want 198.51.100.7", got)
	}
}

func TestResolveSafePathSymlinks(t *testing.T) {
	root := t.TempDir()
	site := filepath.Join(root, "site")
	outside := filepath.Join(root, "outside")
	for _, d := range []string{site, filepath.Join(site, "data"), outside} {
		if err := os.MkdirAll(d, 0755); err != nil {
			t.Fatal(err)
		}
	}
	secret := filepath.Join(outside, "secret.txt")
	_ = os.WriteFile(secret, []byte("top secret"), 0600)
	_ = os.WriteFile(filepath.Join(site, "data", "ok.txt"), []byte("ok"), 0644)

	// Attempt symlinks pointing outside
	_ = os.Symlink(secret, filepath.Join(site, "data", "file-link"))
	_ = os.Symlink(outside, filepath.Join(site, "data", "dir-link"))
	_ = os.Symlink("/nonexistent/path/x", filepath.Join(site, "data", "dangling"))
	_ = os.Symlink(filepath.Join(site, "data", "ok.txt"), filepath.Join(site, "data", "inner-link"))

	mustFail := []string{
		"data/file-link",
		"data/dir-link/secret.txt",
		"data/dir-link/new.txt",
		"data/dangling",
		"../outside/secret.txt",
		"../../../../etc/passwd",
	}
	for _, p := range mustFail {
		if got, err := ResolveSafePath(site, p); err == nil {
			t.Errorf("%q should be rejected, resolved to %s", p, got)
		}
	}

	mustPass := []string{
		"data/ok.txt",
		"data/inner-link",
		"data/new-dir/new.txt",
		"/data/ok.txt",
	}
	for _, p := range mustPass {
		got, err := ResolveSafePath(site, p)
		if err != nil {
			t.Errorf("%q should be allowed: %v", p, err)
			continue
		}
		realSite, _ := filepath.EvalSymlinks(site)
		if !within(realSite, got) {
			t.Errorf("%q resolved outside site: %s", p, got)
		}
	}
}

func TestValidateWARArchive(t *testing.T) {
	dir := t.TempDir()
	writeZip := func(name string, entries ...string) string {
		path := filepath.Join(dir, name)
		f, err := os.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		zw := zip.NewWriter(f)
		for _, e := range entries {
			w, err := zw.Create(e)
			if err != nil {
				t.Fatal(err)
			}
			_, _ = w.Write([]byte("dummy content"))
		}
		_ = zw.Close()
		_ = f.Close()
		return path
	}

	if err := validateWARArchive(writeZip("good.war", "WEB-INF/web.xml", "index.jsp")); err != nil {
		t.Errorf("valid war rejected: %v", err)
	}
	if err := validateWARArchive(writeZip("evil.war", "WEB-INF/web.xml", "../../etc/cron.d/x")); err == nil {
		t.Error("zip-slip entry accepted")
	}
	if err := validateWARArchive(writeZip("abs.war", "/etc/passwd")); err == nil {
		t.Error("absolute entry accepted")
	}
	emptyZip := filepath.Join(dir, "empty.war")
	f, _ := os.Create(emptyZip)
	zw := zip.NewWriter(f)
	_ = zw.Close()
	_ = f.Close()
	if err := validateWARArchive(emptyZip); err == nil {
		t.Error("empty war accepted")
	}

	fake := filepath.Join(dir, "fake.war")
	_ = os.WriteFile(fake, []byte("PK\x03\x04 this is not really a zip"), 0644)
	if err := validateWARArchive(fake); err == nil {
		t.Error("fake PK-header file accepted")
	}

	if !warContextRegex.MatchString("ROOT") || !warContextRegex.MatchString("app_1") || !warContextRegex.MatchString("api-v2") {
		t.Error("valid context name rejected by regex")
	}
	if warContextRegex.MatchString("../x") || warContextRegex.MatchString("a b") || warContextRegex.MatchString("") {
		t.Error("invalid context name accepted by regex")
	}
}

func TestContainerExecForbidden(t *testing.T) {
	router := NewRouter()
	SetJWTSecret("01234567890123456789012345678901")
	tokenPair, err := GenerateTokenPair("admin", "admin")
	if err != nil {
		t.Fatal(err)
	}

	body := []byte(`{"command":["cat","/etc/shadow"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/sites/example.com/exec", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected /exec to be forbidden (403), got %d: %s", rec.Code, rec.Body.String())
	}
}
