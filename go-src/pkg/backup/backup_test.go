package backup

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestCreateRejectsSymlinkedSiteDirectory(t *testing.T) {
	root := t.TempDir()
	sites := filepath.Join(root, "sites")
	backups := filepath.Join(root, "backups")
	outside := filepath.Join(root, "outside")
	if err := os.MkdirAll(outside, 0750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outside, "private.txt"), []byte("outside"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(sites, 0750); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(sites, "app.example.com")); err != nil {
		t.Fatal(err)
	}
	if _, err := NewManager(sites, backups).Create("app.example.com"); err == nil {
		t.Fatal("expected symlinked site directory to be rejected")
	}
	if _, err := os.Stat(filepath.Join(backups, "app.example.com")); !os.IsNotExist(err) {
		t.Fatalf("backup unexpectedly created for symlinked site: %v", err)
	}
}

func TestCreateRejectsSymlinkedBackupRoot(t *testing.T) {
	root := t.TempDir()
	sites := filepath.Join(root, "sites")
	backups := filepath.Join(root, "backups")
	outside := filepath.Join(root, "outside")
	if err := os.MkdirAll(filepath.Join(sites, "app.example.com"), 0750); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(outside, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, backups); err != nil {
		t.Fatal(err)
	}
	if _, err := NewManager(sites, backups).Create("app.example.com"); err == nil {
		t.Fatal("expected symlinked backup root to be rejected")
	}
	entries, err := os.ReadDir(outside)
	if err != nil || len(entries) != 0 {
		t.Fatalf("outside backup target was modified: entries=%v err=%v", entries, err)
	}
}

func TestOffloadRejectsNilArtifact(t *testing.T) {
	if err := NewManager("/unused/sites", "/unused/backups").Offload(nil); err == nil {
		t.Fatal("expected nil artifact to be rejected")
	}
}

func TestBackupRestoreRejectsUnsafePaths(t *testing.T) {
	root := t.TempDir()
	sites := filepath.Join(root, "sites")
	backups := filepath.Join(root, "backups")
	if err := os.MkdirAll(filepath.Join(sites, "app.example.com"), 0750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sites, "app.example.com", "hello.txt"), []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	m := testManager(sites, backups)
	a, err := m.Create("app.example.com")
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Restore("../escape", a.Path); err == nil {
		t.Fatal("expected unsafe domain rejection")
	}
	if err := m.Restore("app.example.com", "/etc/passwd"); err == nil {
		t.Fatal("expected backup path rejection")
	}
	if err := os.Remove(filepath.Join(sites, "app.example.com", "hello.txt")); err != nil {
		t.Fatal(err)
	}
	if err := m.Restore("app.example.com", a.Path); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(sites, "app.example.com", "hello.txt"))
	if err != nil || string(data) != "hello" {
		t.Fatalf("restore failed: %v %q", err, data)
	}
}

func writeRestoreTestArchive(t *testing.T, path, name string, typeflag byte, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	h := &tar.Header{
		Name: name, Mode: 0600, Typeflag: typeflag,
		Size: int64(len(body)), Linkname: "/tmp/restore-test-outside",
	}
	if typeflag == tar.TypeDir || typeflag == tar.TypeSymlink {
		h.Size = 0
	}
	if err := tw.WriteHeader(h); err != nil {
		t.Fatal(err)
	}
	if h.Size > 0 {
		if _, err := tw.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}

func testManager(sitesDir, backupDir string) *Manager {
	manager := NewManager(sitesDir, backupDir)
	manager.RuntimeIdentity = func(string) (int, int, error) { return 1001, 1001, nil }
	return manager
}

func setupRestoreTest(t *testing.T) (*Manager, string, string) {
	t.Helper()
	root := t.TempDir()
	sites := filepath.Join(root, "sites")
	backups := filepath.Join(root, "backups")
	site := filepath.Join(sites, "app.example.com")
	if err := os.MkdirAll(site, 0750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(site, "keep.txt"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	artifact := filepath.Join(backups, "app.example.com", "test.tar.gz")
	return testManager(sites, backups), site, artifact
}

func TestRestoreRejectsAnotherSitesBackup(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	other := filepath.Join(filepath.Dir(filepath.Dir(artifact)), "other.example.com", "other.tar.gz")
	writeRestoreTestArchive(t, other, "owned.txt", tar.TypeReg, "other site")
	if err := m.Restore("app.example.com", other); err == nil {
		t.Fatal("expected cross-site backup restore to be rejected")
	}
	got, err := os.ReadFile(filepath.Join(site, "keep.txt"))
	if err != nil || string(got) != "original" {
		t.Fatalf("site changed after cross-site restore rejection: err=%v data=%q", err, got)
	}
}

func TestRestoreRejectsSymlinkedBackupArtifact(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	target := filepath.Join(filepath.Dir(artifact), "real.tar.gz")
	writeRestoreTestArchive(t, target, "owned.txt", tar.TypeReg, "content")
	if err := os.Symlink(target, artifact); err != nil {
		t.Fatal(err)
	}
	if err := m.Restore("app.example.com", artifact); err == nil {
		t.Fatal("expected symlinked backup artifact to be rejected")
	}
	got, err := os.ReadFile(filepath.Join(site, "keep.txt"))
	if err != nil || string(got) != "original" {
		t.Fatalf("site changed after symlinked artifact rejection: err=%v data=%q", err, got)
	}
}

func TestRestoreUsesTrustedRuntimeIdentityResolver(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	writeRestoreTestArchive(t, artifact, "owner.txt", tar.TypeReg, "owner")
	expectedUID, expectedGID := os.Getuid(), os.Getgid()
	m.RuntimeIdentity = func(domain string) (int, int, error) {
		if domain != "app.example.com" {
			return 0, 0, os.ErrInvalid
		}
		return expectedUID, expectedGID, nil
	}
	if err := m.Restore("app.example.com", artifact); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(site, "owner.txt"))
	if err != nil {
		t.Fatal(err)
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || int(stat.Uid) != expectedUID || int(stat.Gid) != expectedGID {
		t.Fatalf("restored ownership = %#v, want UID/GID %d:%d", info.Sys(), expectedUID, expectedGID)
	}
}

func TestRestoreRejectsTraversalWithoutChangingSite(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	writeRestoreTestArchive(t, artifact, "../outside.txt", tar.TypeReg, "bad")

	if err := m.Restore("app.example.com", artifact); err == nil {
		t.Fatal("expected traversal archive to be rejected")
	}
	got, err := os.ReadFile(filepath.Join(site, "keep.txt"))
	if err != nil || string(got) != "original" {
		t.Fatalf("existing site changed after rejected archive: err=%v data=%q", err, got)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(site), "outside.txt")); !os.IsNotExist(err) {
		t.Fatalf("unexpected outside file after rejected archive: err=%v", err)
	}
}

func TestRestoreRejectsInternalTraversalWithoutChangingSite(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	writeRestoreTestArchive(t, artifact, "a/../b.txt", tar.TypeReg, "malicious")

	if err := m.Restore("app.example.com", artifact); err == nil {
		t.Fatal("expected internal traversal archive path to be rejected")
	}

	got, err := os.ReadFile(filepath.Join(site, "keep.txt"))
	if err != nil || string(got) != "original" {
		t.Fatalf("existing site changed after rejected archive: err=%v data=%q", err, got)
	}
	if _, err := os.Stat(filepath.Join(site, "b.txt")); !os.IsNotExist(err) {
		t.Fatalf("unexpected b.txt after rejected archive: err=%v", err)
	}
}

func TestRestoreRejectsSymlinkEntryWithoutChangingSite(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	writeRestoreTestArchive(t, artifact, "link", tar.TypeSymlink, "")

	if err := m.Restore("app.example.com", artifact); err == nil {
		t.Fatal("expected symlink archive entry to be rejected")
	}
	got, err := os.ReadFile(filepath.Join(site, "keep.txt"))
	if err != nil || string(got) != "original" {
		t.Fatalf("existing site changed after rejected archive: err=%v data=%q", err, got)
	}
	if _, err := os.Lstat(filepath.Join(site, "link")); !os.IsNotExist(err) {
		t.Fatalf("unexpected symlink in site after rejected archive: err=%v", err)
	}
}

func TestRestorePreservesLiveEnvOverArchivedEnv(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	liveEnv := "UID=1001\nGID=1001\nAPP_SECRET=live-value\n"
	if err := os.WriteFile(filepath.Join(site, ".env"), []byte(liveEnv), 0600); err != nil {
		t.Fatal(err)
	}
	writeRestoreTestArchive(t, artifact, ".env", tar.TypeReg, "UID=1002\nGID=1002\nAPP_SECRET=stale-value\n")

	if err := m.Restore("app.example.com", artifact); err != nil {
		t.Fatalf("Restore() error = %v", err)
	}
	got, err := os.ReadFile(filepath.Join(site, ".env"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != liveEnv {
		t.Fatalf("live .env overwritten by archive: got %q, want %q", got, liveEnv)
	}
	info, err := os.Stat(filepath.Join(site, ".env"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("live .env mode = %04o, want 0600", info.Mode().Perm())
	}
}

func TestRestorePreservesLiveEnvWhenArchiveOmitsIt(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	liveEnv := "UID=1001\nGID=1001\nAPP_SECRET=keep-me\n"
	if err := os.WriteFile(filepath.Join(site, ".env"), []byte(liveEnv), 0600); err != nil {
		t.Fatal(err)
	}
	writeRestoreTestArchive(t, artifact, "restored.txt", tar.TypeReg, "restored")

	if err := m.Restore("app.example.com", artifact); err != nil {
		t.Fatalf("Restore() error = %v", err)
	}
	got, err := os.ReadFile(filepath.Join(site, ".env"))
	if err != nil || string(got) != liveEnv {
		t.Fatalf("live .env missing or changed: err=%v data=%q", err, got)
	}
	gotFile, err := os.ReadFile(filepath.Join(site, "restored.txt"))
	if err != nil || string(gotFile) != "restored" {
		t.Fatalf("restored file missing: err=%v data=%q", err, gotFile)
	}
}

func TestRestoreDoesNotIntroduceArchivedEnvWhenLiveEnvIsMissing(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	writeRestoreTestArchive(t, artifact, ".env", tar.TypeReg, "UID=1002\nGID=1002\nAPP_SECRET=stale-value\n")

	if err := m.Restore("app.example.com", artifact); err != nil {
		t.Fatalf("Restore() error = %v", err)
	}
	if _, err := os.Lstat(filepath.Join(site, ".env")); !os.IsNotExist(err) {
		t.Fatalf("restore unexpectedly introduced .env: err=%v", err)
	}
}

func TestRestoreRejectsSymlinkedLiveEnvWithoutChangingSite(t *testing.T) {
	m, site, artifact := setupRestoreTest(t)
	target := filepath.Join(site, "env-target")
	if err := os.WriteFile(target, []byte("UID=1001\nGID=1001\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(site, ".env")); err != nil {
		t.Fatal(err)
	}
	writeRestoreTestArchive(t, artifact, "restored.txt", tar.TypeReg, "restored")

	if err := m.Restore("app.example.com", artifact); err == nil {
		t.Fatal("expected symlinked live .env to be rejected")
	}
	got, err := os.ReadFile(filepath.Join(site, "keep.txt"))
	if err != nil || string(got) != "original" {
		t.Fatalf("existing site changed after rejected restore: err=%v data=%q", err, got)
	}
	info, err := os.Lstat(filepath.Join(site, ".env"))
	if err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("live .env symlink changed unexpectedly: info=%v err=%v", info, err)
	}
}

func TestEncryptedBackupRoundTripAndTamperDetection(t *testing.T) {
	root := t.TempDir()
	plain := filepath.Join(root, "payload.tar.gz")
	original := []byte("ALFA-PANEL authenticated backup test payload")
	if err := os.WriteFile(plain, original, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PANEL_BACKUP_PASSPHRASE", "this-is-a-test-passphrase-with-more-than-32-bytes")
	if err := encryptArtifact(plain); err != nil {
		t.Fatal(err)
	}
	encrypted := plain + ".enc"
	if _, err := os.Stat(plain); !os.IsNotExist(err) {
		t.Fatalf("plaintext artifact should be removed after encryption, err=%v", err)
	}
	decrypted, err := decryptArtifact(encrypted)
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(decrypted)
	got, err := os.ReadFile(decrypted)
	if err != nil || string(got) != string(original) {
		t.Fatalf("round-trip mismatch: %q, %v", got, err)
	}

	data, err := os.ReadFile(encrypted)
	if err != nil {
		t.Fatal(err)
	}
	data[len(data)-1] ^= 0x01
	if err := os.WriteFile(encrypted, data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := decryptArtifact(encrypted); err == nil {
		t.Fatal("tampered encrypted backup must fail authentication")
	}
}
