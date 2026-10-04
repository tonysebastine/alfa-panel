package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/panel/panel-agent/pkg/sitegenerator"
)

// Maximum upload limits
const (
	MaxWarUploadSize  = 500 * 1024 * 1024 // 500 MB
	MaxTextEditSize   = 5 * 1024 * 1024   // 5 MB
)

// FileNode represents a single filesystem entry in the site directory tree.
type FileNode struct {
	Name       string      `json:"name"`
	Path       string      `json:"path"` // relative to site root
	IsDir      bool        `json:"is_dir"`
	Size       int64       `json:"size"`
	Mode       string      `json:"mode"`
	ModTime    time.Time   `json:"mod_time"`
	Children   []*FileNode `json:"children,omitempty"`
}

// FileContentPayload represents read/save body for file editor.
type FileContentPayload struct {
	Path    string `json:"path"` // relative path
	Content string `json:"content"`
}

// ResolveSafePath ensures user-supplied path remains strictly confined inside siteDir.
func ResolveSafePath(siteDir string, userPath string) (string, error) {
	cleanSiteDir := filepath.Clean(siteDir)
	raw := strings.TrimSpace(userPath)
	if raw == "" || strings.ContainsAny(raw, "\\x00") {
		return "", fmt.Errorf("invalid path")
	}
	raw = strings.ReplaceAll(raw, "\\", "/")
	wasRooted := strings.HasPrefix(raw, "/")
	raw = strings.TrimPrefix(raw, "/")
	parts := strings.Split(raw, "/")
	for _, part := range parts {
		if part == ".." {
			return "", fmt.Errorf("forbidden path traversal attempt: '%s' escapes '%s'", userPath, siteDir)
		}
	}
	if wasRooted {
		switch parts[0] {
		case "app", "data", "logs", "config", "webapps":
		default:
			return "", fmt.Errorf("forbidden absolute path: '%s'", userPath)
		}
	}
	cleanUserPath := filepath.Clean(filepath.FromSlash(raw))
	targetPath := filepath.Join(cleanSiteDir, cleanUserPath)
	if targetPath != cleanSiteDir && !strings.HasPrefix(targetPath, cleanSiteDir+string(filepath.Separator)) {
		return "", fmt.Errorf("forbidden path traversal attempt: '%s' escapes '%s'", userPath, siteDir)
	}
	return targetPath, nil
}

// HandleDeployWAR streams uploaded .war, validates ZIP magic bytes, saves to data/webapps/ROOT.war, and triggers restart.
func HandleDeployWAR(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	domain := extractDomainParam(r.URL.Path)
	cleanDomain, err := sitegenerator.SanitizeDomain(domain)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	siteDir := filepath.Join(sitegenerator.BaseSitesDir, cleanDomain)
	webappsDir := filepath.Join(siteDir, "data", "webapps")

	if err := os.MkdirAll(webappsDir, 0750); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create webapps dir: %v", err))
		return
	}

	// Limit upload stream size to prevent memory exhaustion
	r.Body = http.MaxBytesReader(w, r.Body, MaxWarUploadSize)

	// Parse multipart file
	file, fileHeader, err := r.FormFile("war_file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Failed reading multipart 'war_file': %v", err))
		return
	}
	defer file.Close()

	// 1. Validate File Magic Bytes: ZIP / WAR header check (PK\x03\x04)
	magicHeader := make([]byte, 4)
	if _, err := io.ReadFull(file, magicHeader); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid or empty WAR file stream")
		return
	}

	isZip := bytes.Equal(magicHeader, []byte{0x50, 0x4B, 0x03, 0x04}) ||
		bytes.Equal(magicHeader, []byte{0x50, 0x4B, 0x05, 0x06}) ||
		bytes.Equal(magicHeader, []byte{0x50, 0x4B, 0x07, 0x08})

	if !isZip {
		writeJSONError(w, http.StatusBadRequest, "Uploaded file is not a valid Java WAR archive (missing ZIP magic bytes PK..)")
		return
	}

	// Determine destination filename (e.g. custom context "api.war" or default "ROOT.war")
	contextName := r.FormValue("context_name")
	if contextName == "" {
		contextName = "ROOT"
	}
	// Sanitize context name
	contextName = strings.TrimSuffix(strings.ReplaceAll(contextName, "/", ""), ".war")
	targetWarPath := filepath.Join(webappsDir, contextName+".war")

	// 2. Stream to temporary file and atomically rename
	tmpFile, err := os.CreateTemp(webappsDir, ".upload-*.war")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Failed creating temp file: %v", err))
		return
	}
	tmpName := tmpFile.Name()
	defer os.Remove(tmpName)

	// Write magic header first
	if _, err := tmpFile.Write(magicHeader); err != nil {
		_ = tmpFile.Close()
		writeJSONError(w, http.StatusInternalServerError, "Write error")
		return
	}

	// Stream rest of payload
	writtenBytes, err := io.Copy(tmpFile, file)
	if err != nil {
		_ = tmpFile.Close()
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Streaming upload failed: %v", err))
		return
	}
	_ = tmpFile.Sync()
	_ = tmpFile.Close()

	// Chmod to 0640
	_ = os.Chmod(tmpName, 0640)

	// Atomic rename to final target
	if err := os.Rename(tmpName, targetWarPath); err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Atomic rename failed: %v", err))
		return
	}

	// 3. Trigger container restart for clean context hot reload
	restartErr := sitegenerator.RestartSite(r.Context(), cleanDomain)
	restartStatus := "restarted"
	if restartErr != nil {
		restartStatus = fmt.Sprintf("war_placed_restart_pending (%v)", restartErr)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":         "deployed",
		"domain":         cleanDomain,
		"filename":       fileHeader.Filename,
		"context":        contextName,
		"deployed_path":  targetWarPath,
		"size_bytes":     writtenBytes + 4,
		"restart_status": restartStatus,
	})
}

// HandlePythonInstallDeps executes pip install inside running container for requirements.txt.
func HandlePythonInstallDeps(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	domain := extractDomainParam(r.URL.Path)
	cleanDomain, err := sitegenerator.SanitizeDomain(domain)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	siteDir := filepath.Join(sitegenerator.BaseSitesDir, cleanDomain)
	reqFile := filepath.Join(siteDir, "app", "requirements.txt")

	if _, err := os.Stat(reqFile); os.IsNotExist(err) {
		writeJSONError(w, http.StatusNotFound, "requirements.txt not found in app directory")
		return
	}

	// Execute pip install inside container
	cmd := []string{"pip", "install", "--no-cache-dir", "--user", "-r", "requirements.txt"}
	output, execErr := sitegenerator.ExecInApp(r.Context(), cleanDomain, cmd)

	if execErr != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"status": "failed",
			"domain": cleanDomain,
			"error":  execErr.Error(),
			"output": output,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status": "installed",
		"domain": cleanDomain,
		"output": output,
	})
}

// HandleFileTree lists directory entries under /opt/panel/apps/sites/<domain>/.
func HandleFileTree(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	domain := extractDomainParam(r.URL.Path)
	cleanDomain, err := sitegenerator.SanitizeDomain(domain)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	siteDir := filepath.Join(sitegenerator.BaseSitesDir, cleanDomain)
	if _, err := os.Stat(siteDir); os.IsNotExist(err) {
		writeJSONError(w, http.StatusNotFound, "Site directory not found")
		return
	}

	rootNode := &FileNode{
		Name:  cleanDomain,
		Path:  "/",
		IsDir: true,
	}

	var walk func(currentDir string, currentNode *FileNode, depth int) error
	walk = func(currentDir string, currentNode *FileNode, depth int) error {
		if depth > 5 {
			return nil // Prevent unbounded depth
		}
		entries, err := os.ReadDir(currentDir)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			info, err := entry.Info()
			if err != nil {
				continue
			}
			relPath, _ := filepath.Rel(siteDir, filepath.Join(currentDir, entry.Name()))
			child := &FileNode{
				Name:    entry.Name(),
				Path:    "/" + filepath.ToSlash(relPath),
				IsDir:   entry.IsDir(),
				Size:    info.Size(),
				Mode:    info.Mode().String(),
				ModTime: info.ModTime(),
			}
			currentNode.Children = append(currentNode.Children, child)
			if entry.IsDir() {
				_ = walk(filepath.Join(currentDir, entry.Name()), child, depth+1)
			}
		}
		return nil
	}

	_ = walk(siteDir, rootNode, 1)
	writeJSON(w, http.StatusOK, rootNode)
}

// HandleFileContent reads or writes text file content with strict path traversal isolation.
func HandleFileContent(w http.ResponseWriter, r *http.Request) {
	domain := extractDomainParam(r.URL.Path)
	cleanDomain, err := sitegenerator.SanitizeDomain(domain)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	siteDir := filepath.Join(sitegenerator.BaseSitesDir, cleanDomain)

	switch r.Method {
	case http.MethodGet:
		relPath := r.URL.Query().Get("path")
		if relPath == "" {
			writeJSONError(w, http.StatusBadRequest, "Missing 'path' query parameter")
			return
		}

		safePath, err := ResolveSafePath(siteDir, relPath)
		if err != nil {
			writeJSONError(w, http.StatusForbidden, err.Error())
			return
		}

		fi, err := os.Stat(safePath)
		if os.IsNotExist(err) {
			writeJSONError(w, http.StatusNotFound, "File not found")
			return
		} else if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}

		if fi.IsDir() {
			writeJSONError(w, http.StatusBadRequest, "Specified path is a directory, not a text file")
			return
		}
		if fi.Size() > MaxTextEditSize {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("File size %d bytes exceeds 5MB edit limit", fi.Size()))
			return
		}

		data, err := os.ReadFile(safePath)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, FileContentPayload{
			Path:    relPath,
			Content: string(data),
		})

	case http.MethodPut:
		var payload FileContentPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Invalid JSON payload")
			return
		}

		if payload.Path == "" {
			writeJSONError(w, http.StatusBadRequest, "Missing 'path' in request body")
			return
		}

		safePath, err := ResolveSafePath(siteDir, payload.Path)
		if err != nil {
			writeJSONError(w, http.StatusForbidden, err.Error())
			return
		}

		// Ensure parent directory exists
		if err := os.MkdirAll(filepath.Dir(safePath), 0750); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Failed to create directory")
			return
		}

		// Atomically write file with 0640 permissions
		dir := filepath.Dir(safePath)
		tmp, err := os.CreateTemp(dir, ".edit-*")
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Failed creating temp file")
			return
		}
		tmpName := tmp.Name()
		defer os.Remove(tmpName)

		if _, err := tmp.WriteString(payload.Content); err != nil {
			_ = tmp.Close()
			writeJSONError(w, http.StatusInternalServerError, "Failed writing content")
			return
		}
		_ = tmp.Sync()
		_ = tmp.Close()
		_ = os.Chmod(tmpName, 0640)

		if err := os.Rename(tmpName, safePath); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Failed saving file")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{
			"status": "saved",
			"path":   payload.Path,
		})

	default:
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
	}
}
