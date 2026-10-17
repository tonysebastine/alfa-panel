package backup

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"filippo.io/age"
	"golang.org/x/sys/unix"
)

type Manager struct {
	SitesDir        string
	BackupDir       string
	RuntimeIdentity func(domain string) (uid, gid int, err error)
}

type Artifact struct {
	ID        string    `json:"id"`
	Domain    string    `json:"domain"`
	Path      string    `json:"path"`
	CreatedAt time.Time `json:"created_at"`
	SizeBytes int64     `json:"size_bytes"`
}

func NewManager(sitesDir, backupDir string) *Manager {
	return &Manager{SitesDir: sitesDir, BackupDir: backupDir}
}

func validDomainPath(base, domain string) (string, error) {
	if domain == "" || strings.Contains(domain, "..") || strings.ContainsAny(domain, "/\\") {
		return "", errors.New("invalid domain")
	}
	root, err := filepath.Abs(base)
	if err != nil {
		return "", err
	}
	target, err := filepath.Abs(filepath.Join(root, domain))
	if err != nil {
		return "", err
	}
	if target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) {
		return "", errors.New("path escapes site root")
	}
	return target, nil
}

func (m *Manager) Create(domain string) (*Artifact, error) {
	src, err := validDomainPath(m.SitesDir, domain)
	if err != nil {
		return nil, err
	}
	srcInfo, err := os.Lstat(src)
	if err != nil {
		return nil, fmt.Errorf("site not found: %w", err)
	}
	if !srcInfo.IsDir() || srcInfo.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("site backup source must be a real directory")
	}

	backupRoot, err := filepath.Abs(m.BackupDir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(backupRoot, 0700); err != nil {
		return nil, fmt.Errorf("create backup root: %w", err)
	}
	rootInfo, err := os.Lstat(backupRoot)
	if err != nil {
		return nil, err
	}
	if !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("backup root must be a real directory")
	}
	realBackupRoot, err := filepath.EvalSymlinks(backupRoot)
	if err != nil {
		return nil, err
	}
	dir := filepath.Join(backupRoot, domain)
	if err := os.Mkdir(dir, 0700); err != nil && !errors.Is(err, os.ErrExist) {
		return nil, fmt.Errorf("create site backup directory: %w", err)
	}
	dirInfo, err := os.Lstat(dir)
	if err != nil {
		return nil, err
	}
	if !dirInfo.IsDir() || dirInfo.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("site backup path must be a real directory")
	}
	realDir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return nil, err
	}
	if realDir == realBackupRoot || !strings.HasPrefix(realDir, realBackupRoot+string(os.PathSeparator)) {
		return nil, errors.New("site backup directory escapes backup root")
	}
	if err := os.Chmod(realDir, 0700); err != nil {
		return nil, fmt.Errorf("secure site backup directory: %w", err)
	}

	now := time.Now().UTC()
	random, err := randomID()
	if err != nil {
		return nil, err
	}
	id := now.Format("20060102T150405Z") + "-" + random
	final := filepath.Join(dir, id+".tar.gz")
	tmp := final + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0600)
	if err != nil {
		return nil, err
	}
	ok := false
	defer func() {
		_ = f.Close()
		if !ok {
			_ = os.Remove(tmp)
		}
	}()
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	err = filepath.Walk(src, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("refusing to backup symlink: %s", rel)
		}
		if info.IsDir() {
			return tw.WriteHeader(&tar.Header{Name: rel, Mode: int64(info.Mode().Perm()), Typeflag: tar.TypeDir, ModTime: info.ModTime()})
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("unsupported file type: %s", rel)
		}
		h := &tar.Header{Name: rel, Mode: int64(info.Mode().Perm()), Size: info.Size(), ModTime: info.ModTime(), Typeflag: tar.TypeReg}
		if err := tw.WriteHeader(h); err != nil {
			return err
		}
		fd, err := unix.Open(path, unix.O_RDONLY|unix.O_CLOEXEC|unix.O_NOFOLLOW, 0)
		if err != nil {
			return fmt.Errorf("open backup file without following symlinks: %w", err)
		}
		in := os.NewFile(uintptr(fd), path)
		openedInfo, statErr := in.Stat()
		if statErr != nil {
			_ = in.Close()
			return statErr
		}
		if !openedInfo.Mode().IsRegular() {
			_ = in.Close()
			return fmt.Errorf("refusing to backup non-regular file: %s", rel)
		}
		_, copyErr := io.Copy(tw, in)
		closeErr := in.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
	if err == nil {
		err = tw.Close()
	}
	if err == nil {
		err = gz.Close()
	}
	if err == nil {
		err = f.Sync()
	}
	if err != nil {
		return nil, fmt.Errorf("backup failed: %w", err)
	}
	if err := f.Close(); err != nil {
		return nil, err
	}
	if err := os.Rename(tmp, final); err != nil {
		return nil, err
	}
	encryption := strings.ToLower(strings.TrimSpace(os.Getenv("PANEL_BACKUP_ENCRYPTION")))
	switch encryption {
	case "", "none":
	case "age":
		if err := encryptArtifact(final); err != nil {
			_ = os.Remove(final)
			return nil, err
		}
		final += ".enc"
	case "openssl":
		_ = os.Remove(final)
		return nil, errors.New("legacy OpenSSL CBC encryption is no longer used for new backups; set PANEL_BACKUP_ENCRYPTION=age")
	default:
		_ = os.Remove(final)
		return nil, fmt.Errorf("unsupported PANEL_BACKUP_ENCRYPTION value %q", encryption)
	}
	ok = true
	st, err := os.Stat(final)
	if err != nil {
		return nil, err
	}
	return &Artifact{ID: id, Domain: domain, Path: final, CreatedAt: now, SizeBytes: st.Size()}, nil
}

func randomID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate backup ID: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// preserveRuntimeEnv copies the live site's .env into the restore staging tree.
// Runtime configuration must come from the live site, never from an archive.
func preserveRuntimeEnv(siteDir, stageDir string) error {
	livePath := filepath.Join(siteDir, ".env")
	stagePath := filepath.Join(stageDir, ".env")

	fd, err := unix.Open(livePath, unix.O_RDONLY|unix.O_CLOEXEC|unix.O_NOFOLLOW, 0)
	if err != nil {
		if errors.Is(err, unix.ENOENT) {
			if removeErr := os.Remove(stagePath); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
				return fmt.Errorf("remove archived .env: %w", removeErr)
			}
			return nil
		}
		return fmt.Errorf("open live .env without following symlinks: %w", err)
	}
	src := os.NewFile(uintptr(fd), livePath)
	defer src.Close()

	var st unix.Stat_t
	if err := unix.Fstat(fd, &st); err != nil {
		return fmt.Errorf("stat live .env: %w", err)
	}
	if st.Mode&unix.S_IFMT != unix.S_IFREG {
		return errors.New("live .env is not a regular file")
	}

	tmp, err := os.CreateTemp(stageDir, ".env-preserve-*")
	if err != nil {
		return fmt.Errorf("create staged .env: %w", err)
	}
	tmpPath := tmp.Name()
	keepTemp := false
	defer func() {
		_ = tmp.Close()
		if !keepTemp {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := io.Copy(tmp, src); err != nil {
		return fmt.Errorf("copy live .env: %w", err)
	}
	if err := tmp.Chown(int(st.Uid), int(st.Gid)); err != nil {
		return fmt.Errorf("preserve live .env ownership: %w", err)
	}
	if err := tmp.Chmod(os.FileMode(st.Mode & 0777)); err != nil {
		return fmt.Errorf("preserve live .env permissions: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		return fmt.Errorf("sync staged .env: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close staged .env: %w", err)
	}

	// Remove an archived .env only after the live copy is safely staged.
	// A non-empty archived .env directory is rejected rather than traversed.
	if err := os.Remove(stagePath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove archived .env: %w", err)
	}
	if err := os.Rename(tmpPath, stagePath); err != nil {
		return fmt.Errorf("install preserved live .env: %w", err)
	}
	keepTemp = true
	return nil
}

func (m *Manager) Restore(domain, artifact string) error {
	const (
		maxEntries    = 100000
		maxFileBytes  = int64(2 << 30)
		maxTotalBytes = int64(10 << 30)
	)

	dst, err := validDomainPath(m.SitesDir, domain)
	if err != nil {
		return err
	}

	// Do not replace a symlink in place of the site directory.
	dstInfo, err := os.Lstat(dst)
	if err != nil {
		return fmt.Errorf("site directory unavailable: %w", err)
	}
	if !dstInfo.IsDir() || dstInfo.Mode()&os.ModeSymlink != 0 {
		return errors.New("site destination is not a real directory")
	}

	base, err := filepath.Abs(m.BackupDir)
	if err != nil {
		return err
	}
	src, err := filepath.Abs(artifact)
	if err != nil {
		return err
	}
	domainBackupDir, err := validDomainPath(base, domain)
	if err != nil {
		return err
	}
	if src == domainBackupDir || !strings.HasPrefix(src, domainBackupDir+string(os.PathSeparator)) {
		return errors.New("backup artifact must belong to the requested site's backup directory")
	}

	// Resolve each directory and reject artifact symlinks to prevent cross-site
	// restore and path redirection through a writable backup directory.
	realBase, err := filepath.EvalSymlinks(base)
	if err != nil {
		return fmt.Errorf("backup root unavailable: %w", err)
	}
	realDomainDir, err := filepath.EvalSymlinks(domainBackupDir)
	if err != nil {
		return fmt.Errorf("site backup directory unavailable: %w", err)
	}
	if realDomainDir == realBase || !strings.HasPrefix(realDomainDir, realBase+string(os.PathSeparator)) {
		return errors.New("site backup directory resolves outside backup root")
	}
	linkInfo, err := os.Lstat(src)
	if err != nil {
		return fmt.Errorf("backup artifact unavailable: %w", err)
	}
	if linkInfo.Mode()&os.ModeSymlink != 0 {
		return errors.New("backup artifact must not be a symlink")
	}
	realSrc, err := filepath.EvalSymlinks(src)
	if err != nil {
		return fmt.Errorf("backup artifact unavailable: %w", err)
	}
	if realSrc == realDomainDir || !strings.HasPrefix(realSrc, realDomainDir+string(os.PathSeparator)) {
		return errors.New("backup artifact resolves outside the requested site's backup directory")
	}
	srcInfo, err := os.Stat(realSrc)
	if err != nil {
		return err
	}
	if !srcInfo.Mode().IsRegular() {
		return errors.New("backup artifact is not a regular file")
	}

	restorePath := realSrc
	var decrypted string
	if strings.HasSuffix(src, ".enc") {
		decrypted, err = decryptArtifact(src)
		if err != nil {
			return err
		}
		restorePath = decrypted
		defer os.Remove(decrypted)
	}

	in, err := os.Open(restorePath)
	if err != nil {
		return err
	}
	defer in.Close()

	gz, err := gzip.NewReader(in)
	if err != nil {
		return fmt.Errorf("invalid backup archive: %w", err)
	}
	defer gz.Close()

	parent := filepath.Dir(dst)
	stage, err := os.MkdirTemp(parent, "."+domain+".restore-stage-")
	if err != nil {
		return fmt.Errorf("create restore staging directory: %w", err)
	}
	stageExists := true
	defer func() {
		if stageExists {
			_ = os.RemoveAll(stage)
		}
	}()

	tr := tar.NewReader(gz)
	seen := make(map[string]struct{})
	var totalBytes int64
	entries := 0

	for {
		h, nextErr := tr.Next()
		if nextErr == io.EOF {
			break
		}
		if nextErr != nil {
			return fmt.Errorf("read backup archive: %w", nextErr)
		}

		entries++
		if entries > maxEntries {
			return errors.New("backup archive exceeds entry limit")
		}
		if h.Size < 0 || h.Size > maxFileBytes {
			return errors.New("backup archive contains an oversized file")
		}

		// Tar paths use slash separators; reject backslashes rather than
		// interpreting platform-dependent path tricks.
		if h.Name == "" || strings.Contains(h.Name, "\\") || strings.HasPrefix(h.Name, "/") {
			return errors.New("archive contains unsafe path")
		}
		for _, part := range strings.Split(filepath.ToSlash(h.Name), "/") {
			if part == ".." {
				return errors.New("archive contains unsafe path")
			}
		}
		name := filepath.Clean(filepath.FromSlash(h.Name))
		if name == "." || name == ".." || filepath.IsAbs(name) ||
			name == string(filepath.Separator)+".." ||
			strings.HasPrefix(name, ".."+string(filepath.Separator)) {
			return errors.New("archive contains unsafe path")
		}

		target := filepath.Join(stage, name)
		if target == stage || !strings.HasPrefix(target, stage+string(os.PathSeparator)) {
			return errors.New("archive escapes staging directory")
		}
		if _, exists := seen[name]; exists {
			return errors.New("archive contains duplicate paths")
		}
		seen[name] = struct{}{}

		switch h.Typeflag {
		case tar.TypeDir:
			if h.Size != 0 {
				return errors.New("archive directory has unexpected data")
			}
			if err := os.MkdirAll(target, 0750); err != nil {
				return err
			}
			continue

		case tar.TypeReg, tar.TypeRegA:
			totalBytes += h.Size
			if totalBytes > maxTotalBytes {
				return errors.New("backup archive exceeds expanded-size limit")
			}
			if err := os.MkdirAll(filepath.Dir(target), 0750); err != nil {
				return err
			}

			mode := os.FileMode(h.Mode) & 0777
			mode &^= 06000 // Never restore setuid/setgid bits.
			out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
			if err != nil {
				return err
			}
			_, copyErr := io.CopyN(out, tr, h.Size)
			closeErr := out.Close()
			if copyErr != nil {
				return fmt.Errorf("extract %q: %w", name, copyErr)
			}
			if closeErr != nil {
				return fmt.Errorf("close extracted file %q: %w", name, closeErr)
			}

		default:
			return fmt.Errorf("backup contains unsupported entry type for %q", name)
		}
	}

	if err := gz.Close(); err != nil {
		return fmt.Errorf("validate compressed archive: %w", err)
	}

	if err := preserveRuntimeEnv(dst, stage); err != nil {
		return err
	}

	// Use the existing site's runtime identity, not values from the
	// untrusted archive. Restore ownership in staging and leave .env untouched.
	if m.RuntimeIdentity == nil {
		return errors.New("trusted runtime identity resolver is required for restore")
	}
	uid, gid, err := m.RuntimeIdentity(domain)
	if err != nil {
		return fmt.Errorf("resolve trusted runtime identity: %w", err)
	}
	err = filepath.Walk(stage, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info == nil {
			return errors.New("missing filesystem entry during restore")
		}
		if path == filepath.Join(stage, ".env") {
			return nil
		}
		if err := os.Chown(path, uid, gid); err != nil {
			return fmt.Errorf("set restored ownership for %q: %w", path, err)
		}
		return nil
	})
	if err != nil {
		return err
	}
	if err := os.Chmod(stage, 0750); err != nil {
		return err
	}

	// Atomically exchange the staged tree with the live site. If the
	// filesystem or kernel does not support this operation, fail closed and
	// leave the existing site at its canonical path.
	if err := unix.Renameat2(unix.AT_FDCWD, stage, unix.AT_FDCWD, dst, unix.RENAME_EXCHANGE); err != nil {
		return fmt.Errorf("atomically promote restored site: %w", err)
	}

	// The exchange moved the previous site to stage. Prevent the deferred
	// cleanup from being skipped; it must remove the old tree now at stage.
	if err := os.RemoveAll(stage); err != nil {
		// Keep stageExists true so deferred cleanup retries removal.
		return fmt.Errorf("restore completed, but old site cleanup failed at %q: %w", stage, err)
	}
	stageExists = false
	return nil
}
func (m *Manager) Prune(domain string, keep int) (int, error) {
	if keep < 1 {
		return 0, errors.New("keep must be at least 1")
	}
	clean, err := validDomainPath(m.BackupDir, domain)
	if err != nil {
		return 0, err
	}
	entries, err := os.ReadDir(clean)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	type item struct {
		name string
		mod  time.Time
	}
	items := make([]item, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		items = append(items, item{e.Name(), info.ModTime()})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].mod.After(items[j].mod) })
	removed := 0
	for i := keep; i < len(items); i++ {
		if err := os.Remove(filepath.Join(clean, items[i].name)); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

const ageHeader = "age-encryption.org/v1\n"

func backupPassphrase() (string, error) {
	pass := os.Getenv("PANEL_BACKUP_PASSPHRASE")
	if len([]byte(pass)) < 32 {
		return "", errors.New("PANEL_BACKUP_PASSPHRASE must contain at least 32 bytes when backup encryption is enabled")
	}
	return pass, nil
}

func encryptArtifact(path string) error {
	pass, err := backupPassphrase()
	if err != nil {
		return err
	}
	in, err := openRegularNoFollow(path)
	if err != nil {
		return fmt.Errorf("open backup for encryption: %w", err)
	}
	defer in.Close()

	outPath := path + ".enc"
	tmp, err := os.CreateTemp(filepath.Dir(outPath), ".backup-encrypt-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	keepTmp := false
	defer func() {
		if !keepTmp {
			_ = os.Remove(tmpPath)
		}
	}()
	if err := tmp.Chmod(0600); err != nil {
		_ = tmp.Close()
		return err
	}

	recipient, err := age.NewScryptRecipient(pass)
	if err != nil {
		_ = tmp.Close()
		return errors.New("initialize backup encryption")
	}
	writer, err := age.Encrypt(tmp, recipient)
	if err != nil {
		_ = tmp.Close()
		return errors.New("initialize backup encryption")
	}
	if _, err := io.Copy(writer, in); err != nil {
		_ = writer.Close()
		_ = tmp.Close()
		return fmt.Errorf("encrypt backup stream: %w", err)
	}
	if err := writer.Close(); err != nil {
		_ = tmp.Close()
		return errors.New("finalize encrypted backup")
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	// Link refuses to overwrite an existing artifact; a stale collision is not
	// silently replaced. Both files are on the same filesystem.
	if err := os.Link(tmpPath, outPath); err != nil {
		return fmt.Errorf("publish encrypted backup without overwrite: %w", err)
	}
	if err := os.Remove(tmpPath); err != nil {
		_ = os.Remove(outPath)
		return err
	}
	keepTmp = true // tmpPath was removed; defer is harmless and documents publication.
	if err := syncDirectory(filepath.Dir(outPath)); err != nil {
		_ = os.Remove(outPath)
		return err
	}
	if err := os.Remove(path); err != nil {
		_ = os.Remove(outPath)
		return fmt.Errorf("encrypted backup published but original cleanup failed: %w", err)
	}
	return syncDirectory(filepath.Dir(path))
}

func decryptArtifact(path string) (string, error) {
	pass, err := backupPassphrase()
	if err != nil {
		return "", errors.New("backup passphrase is not configured or is too short")
	}
	in, err := openRegularNoFollow(path)
	if err != nil {
		return "", fmt.Errorf("open encrypted backup: %w", err)
	}
	defer in.Close()
	reader := bufio.NewReader(in)
	prefix, peekErr := reader.Peek(len(ageHeader))
	if peekErr == nil && string(prefix) == ageHeader {
		identity, err := age.NewScryptIdentity(pass)
		if err != nil {
			return "", errors.New("initialize backup decryption")
		}
		plain, err := age.Decrypt(reader, identity)
		if err != nil {
			return "", errors.New("encrypted backup authentication or decryption failed")
		}
		return writeDecryptedTemp(filepath.Dir(path), plain)
	}
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("PANEL_ALLOW_LEGACY_CBC_RESTORE")), "true") {
		return "", errors.New("backup is not an age-encrypted artifact; legacy CBC restore is disabled")
	}
	return decryptLegacyOpenSSL(path, pass)
}

func writeDecryptedTemp(dir string, plaintext io.Reader) (string, error) {
	tmp, err := os.CreateTemp(dir, ".restore-*.tar.gz")
	if err != nil {
		return "", err
	}
	path := tmp.Name()
	ok := false
	defer func() {
		_ = tmp.Close()
		if !ok {
			_ = os.Remove(path)
		}
	}()
	if err := tmp.Chmod(0600); err != nil {
		return "", err
	}
	if _, err := io.Copy(tmp, plaintext); err != nil {
		return "", errors.New("encrypted backup authentication or decryption failed")
	}
	if err := tmp.Sync(); err != nil {
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	ok = true
	return path, nil
}

func decryptLegacyOpenSSL(path, pass string) (string, error) {
	if _, err := exec.LookPath("openssl"); err != nil {
		return "", errors.New("openssl is required for explicitly enabled legacy CBC restore")
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".legacy-restore-*.tar.gz")
	if err != nil {
		return "", err
	}
	tmpPath := tmp.Name()
	if err := tmp.Chmod(0600); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return "", err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}
	cmd := exec.Command("openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-in", path, "-out", tmpPath, "-pass", "env:PANEL_BACKUP_PASSPHRASE")
	cmd.Env = append(os.Environ(), "PANEL_BACKUP_PASSPHRASE="+pass)
	if err := cmd.Run(); err != nil {
		_ = os.Remove(tmpPath)
		return "", errors.New("legacy CBC backup decryption failed")
	}
	return tmpPath, nil
}

func openRegularNoFollow(path string) (*os.File, error) {
	fd, err := unix.Open(path, unix.O_RDONLY|unix.O_CLOEXEC|unix.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	file := os.NewFile(uintptr(fd), path)
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}
	if !info.Mode().IsRegular() {
		_ = file.Close()
		return nil, errors.New("expected a regular file")
	}
	return file, nil
}

func syncDirectory(path string) error {
	dir, err := os.Open(path)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func (m *Manager) Offload(a *Artifact) error {
	if a == nil {
		return errors.New("backup artifact is required")
	}
	remote := strings.TrimSpace(os.Getenv("PANEL_BACKUP_REMOTE"))
	if remote == "" {
		return nil
	}
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("PANEL_BACKUP_ENCRYPTION")), "age") {
		return errors.New("off-host backup requires PANEL_BACKUP_ENCRYPTION=age")
	}
	if !strings.HasSuffix(strings.ToLower(a.Path), ".enc") {
		return errors.New("off-host backup must be encrypted before transfer")
	}
	if _, err := exec.LookPath("rclone"); err != nil {
		return errors.New("rclone is required when PANEL_BACKUP_REMOTE is configured")
	}
	dst := strings.TrimSuffix(remote, "/") + "/" + a.Domain
	cmd := exec.Command("rclone", "copy", a.Path, dst, "--immutable")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("off-host backup failed: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}
