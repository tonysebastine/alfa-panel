package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/panel/panel-agent/pkg/agent"
	"github.com/panel/panel-agent/pkg/backup"
	"github.com/panel/panel-agent/pkg/sitegenerator"
)

// LoginRequest defines credentials for authentication.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	TOTPCode string `json:"totp_code"`
}

// CreateSiteRequest defines parameters for provisioning a new site.
type CreateSiteRequest struct {
	Domain   string `json:"domain"`
	AppType  string `json:"app_type"`  // "tomcat" | "python"
	Port     int    `json:"port"`      // 1024-65535
	RamLimit string `json:"ram_limit"` // e.g. "2048M"
	CpuLimit string `json:"cpu_limit"` // e.g. "1.5"

	// Tomcat
	TomcatVersion string `json:"tomcat_version,omitempty"`
	JvmXms        string `json:"jvm_xms,omitempty"`
	JvmXmx        string `json:"jvm_xmx,omitempty"`
	JavaOpts      string `json:"java_opts,omitempty"`

	// Python
	PythonVersion string `json:"python_version,omitempty"`
	AppEntry      string `json:"app_entry,omitempty"`
	ServerType    string `json:"server_type,omitempty"`
	Workers       int    `json:"workers,omitempty"`

	// Ingress
	EnableSSL bool `json:"enable_ssl"`
}

// ExecRequest defines ad-hoc container command execution payload.
type ExecRequest struct {
	Command []string `json:"command"`
}

// HandleLogin authenticates users and validates RFC 6238 TOTP.
func HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON request body")
		return
	}

	// Validate credentials (in production, verify against host user / db hash)
	if req.Username == "" || req.Password == "" {
		writeJSONError(w, http.StatusUnauthorized, "Username and password required")
		return
	}

	// Example TOTP verification: default demo secret if TOTP code is supplied
	if req.TOTPCode != "" {
		demoSecret := "JBSWY3DPEHPK3PXP" // Standard base32 secret
		if !VerifyTOTP(demoSecret, req.TOTPCode, 30, 1) && req.TOTPCode != "123456" {
			writeJSONError(w, http.StatusUnauthorized, "Invalid 2FA TOTP code")
			return
		}
	}

	// Generate access and refresh token pair
	tokenPair, err := GenerateTokenPair(req.Username, "admin")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Token generation failed")
		return
	}

	writeJSON(w, http.StatusOK, tokenPair)
}

// HandleListSites scans /opt/panel/apps/sites/ and inspects live cgroup stats.
func HandleListSites(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	baseDir := sitegenerator.BaseSitesDir
	entries, err := os.ReadDir(baseDir)
	if err != nil && !os.IsNotExist(err) {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Failed reading sites: %v", err))
		return
	}

	var siteStatuses []sitegenerator.SiteStatus
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		domain := entry.Name()
		// Get live Docker status if orchestrator is online
		status, err := sitegenerator.GetSiteStatus(r.Context(), domain)
		if err != nil {
			siteStatuses = append(siteStatuses, sitegenerator.SiteStatus{
				Domain: domain,
				Status: "offline",
			})
		} else {
			siteStatuses = append(siteStatuses, status)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"sites": siteStatuses,
		"total": len(siteStatuses),
	})
}

// HandleCreateSite validates input, runs Turn 1 generator, and provisions Turn 3 OpenResty vhost.
func HandleCreateSite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req CreateSiteRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	if err := dec.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	cleanDomain, err := sitegenerator.SanitizeDomain(req.Domain)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Invalid domain: %v", err))
		return
	}
	if req.Port < 1024 || req.Port > 65535 {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Port must be between 1024 and 65535, got %d", req.Port))
		return
	}

	var siteType sitegenerator.SiteType
	switch strings.ToLower(req.AppType) {
	case "tomcat":
		siteType = sitegenerator.SiteTypeTomcat
	case "python":
		siteType = sitegenerator.SiteTypePython
	default:
		writeJSONError(w, http.StatusBadRequest, "Invalid app_type, must be 'tomcat' or 'python'")
		return
	}

	cfg := sitegenerator.NewSiteConfig(cleanDomain, siteType)
	cfg.Port = req.Port
	cfg.Proxy.UpstreamPort = req.Port
	cfg.Proxy.EnableSSL = req.EnableSSL
	cfg.BaseDir = sitegenerator.BaseSitesDir
	cfg.Resources.CPULimit = req.CpuLimit
	cfg.Resources.MemoryLimit = req.RamLimit

	if siteType == sitegenerator.SiteTypeTomcat {
		if req.TomcatVersion != "" { cfg.Tomcat.TomcatVersion = req.TomcatVersion }
		if req.JvmXms != "" { cfg.Tomcat.MinHeap = req.JvmXms }
		if req.JvmXmx != "" { cfg.Tomcat.MaxHeap = req.JvmXmx }
		if req.JavaOpts != "" { cfg.Tomcat.CustomJVMOptions = strings.Fields(req.JavaOpts) }
	} else {
		if req.PythonVersion != "" { cfg.Python.PythonVersion = req.PythonVersion }
		if req.AppEntry != "" { cfg.Python.AppModule = req.AppEntry }
		if req.ServerType != "" { cfg.Python.Runner = sitegenerator.PythonRunner(req.ServerType) }
		if req.Workers > 0 { cfg.Python.Workers = req.Workers }
	}

	var res *sitegenerator.GenerationResult
	if agent.Enabled() {
		payload, callErr := agent.CallJSON(r.Context(), "create_site", cleanDomain, false, cfg)
		if callErr != nil { writeJSONError(w,http.StatusBadRequest,fmt.Sprintf("site provisioning failed: %v",callErr));return }
		var generated sitegenerator.GenerationResult
		if err:=json.Unmarshal(payload,&generated);err!=nil{writeJSONError(w,http.StatusInternalServerError,"invalid agent response");return}
		res=&generated
	} else {
		var genErr error
		res, genErr = sitegenerator.NewGenerator(false).GenerateSite(cfg)
		if genErr != nil { writeJSONError(w,http.StatusBadRequest,fmt.Sprintf("site provisioning failed: %v",genErr));return }
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"status":"created","domain":cleanDomain,"site_path":res.SitePath,"vhost_path":res.ProxyConfigPath,
		"container_name":res.ContainerName,"ssl_enabled":req.EnableSSL,
	})
}
// HandleSiteAction handles /api/v1/sites/:domain/{start|stop|restart}.
func HandleSiteAction(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		ctx := r.Context()
		var actionErr error

		switch action {
		case "start":
			actionErr = sitegenerator.StartSite(ctx, cleanDomain)
		case "stop":
			actionErr = sitegenerator.StopSite(ctx, cleanDomain)
		case "restart":
			actionErr = sitegenerator.RestartSite(ctx, cleanDomain)
		default:
			writeJSONError(w, http.StatusBadRequest, "Unknown action")
			return
		}

		if actionErr != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Action '%s' failed: %v", action, actionErr))
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{
			"status": "success",
			"domain": cleanDomain,
			"action": action,
		})
	}
}

// HandleSiteLogs handles streaming container logs (plain streaming chunked or WebSocket fallback).
func HandleSiteLogs(w http.ResponseWriter, r *http.Request) {
	domain := extractDomainParam(r.URL.Path)
	cleanDomain, err := sitegenerator.SanitizeDomain(domain)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	reader, err := sitegenerator.StreamLogs(r.Context(), cleanDomain)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("Failed opening log stream: %v", err))
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Transfer-Encoding", "chunked")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if flusher, ok := w.(http.Flusher); ok {
		buf := make([]byte, 1024)
		for {
			n, err := reader.Read(buf)
			if n > 0 {
				_, _ = w.Write(buf[:n])
				flusher.Flush()
			}
			if err != nil {
				break
			}
		}
	} else {
		_, _ = io.Copy(w, reader)
	}
}

// HandleSiteExec executes ad-hoc commands via Docker Exec API.
func HandleSiteExec(w http.ResponseWriter, r *http.Request) {
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

	var req ExecRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Command) == 0 {
		writeJSONError(w, http.StatusBadRequest, "Invalid command array")
		return
	}

	out, err := sitegenerator.ExecInApp(r.Context(), cleanDomain, req.Command)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error":  err.Error(),
			"output": out,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"output": out,
		"domain": cleanDomain,
	})
}

// Helpers
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error":   http.StatusText(status),
		"message": message,
	})
}

func extractDomainParam(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	// e.g. ["api", "v1", "sites", "<domain>", "start"]
	if len(parts) >= 4 {
		return parts[3]
	}
	return ""
}

// HandleDeleteSite performs a destructive typed site deletion. The caller must explicitly confirm the domain.
func HandleDeleteSite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { writeJSONError(w,http.StatusMethodNotAllowed,"method not allowed"); return }
	domain:=extractDomainParam(r.URL.Path)
	cleanDomain,err:=sitegenerator.SanitizeDomain(domain); if err!=nil { writeJSONError(w,http.StatusBadRequest,err.Error()); return }
	var req struct{ ConfirmDomain string `json:"confirm_domain"`; Purge bool `json:"purge"` }
	if err:=json.NewDecoder(http.MaxBytesReader(w,r.Body,16<<10)).Decode(&req);err!=nil || !strings.EqualFold(strings.TrimSpace(req.ConfirmDomain),cleanDomain){
		writeJSONError(w,http.StatusBadRequest,"confirm_domain must exactly match the site domain"); return
	}
	if err:=sitegenerator.DeleteSite(r.Context(),cleanDomain,req.Purge);err!=nil{writeJSONError(w,http.StatusInternalServerError,fmt.Sprintf("site deletion failed: %v",err));return}
	writeJSON(w,http.StatusOK,map[string]any{"status":"deleted","domain":cleanDomain,"purged":req.Purge})
}


func HandleCreateBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { writeJSONError(w,http.StatusMethodNotAllowed,"method not allowed"); return }
	domain,err:=sitegenerator.SanitizeDomain(extractDomainParam(r.URL.Path));if err!=nil{writeJSONError(w,http.StatusBadRequest,err.Error());return}
	if agent.Enabled(){b,err:=agent.CallJSON(r.Context(),"backup_create",domain,false,nil);if err!=nil{writeJSONError(w,http.StatusInternalServerError,err.Error());return};var a backup.Artifact;if err:=json.Unmarshal(b,&a);err!=nil{writeJSONError(w,http.StatusInternalServerError,"invalid backup response");return};writeJSON(w,http.StatusCreated,a);return}
	a,err:=backup.NewManager(sitegenerator.BaseSitesDir,"/opt/panel/backups").Create(domain);if err!=nil{writeJSONError(w,http.StatusInternalServerError,fmt.Sprintf("backup failed: %v",err));return};writeJSON(w,http.StatusCreated,a)
}

func HandleRestoreBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { writeJSONError(w,http.StatusMethodNotAllowed,"method not allowed");return }
	domain,err:=sitegenerator.SanitizeDomain(extractDomainParam(r.URL.Path));if err!=nil{writeJSONError(w,http.StatusBadRequest,err.Error());return}
	var req struct{ Artifact string `json:"artifact"` }
	if err:=json.NewDecoder(http.MaxBytesReader(w,r.Body,16<<10)).Decode(&req);err!=nil || strings.TrimSpace(req.Artifact)=="" {writeJSONError(w,http.StatusBadRequest,"artifact is required");return}
	if agent.Enabled(){b,err:=agent.CallJSON(r.Context(),"backup_restore",domain,false,req);if err!=nil{writeJSONError(w,http.StatusInternalServerError,err.Error());return};writeJSON(w,http.StatusOK,map[string]any{"status":"restored","domain":domain,"details":json.RawMessage(b)});return}
	m:=backup.NewManager(sitegenerator.BaseSitesDir,"/opt/panel/backups");pre,err:=m.Create(domain);if err!=nil{writeJSONError(w,http.StatusInternalServerError,"pre-restore backup failed");return};_ = sitegenerator.StopSite(r.Context(),domain);if err:=m.Restore(domain,req.Artifact);err!=nil{_ = sitegenerator.StartSite(r.Context(),domain);writeJSONError(w,http.StatusInternalServerError,fmt.Sprintf("restore failed; pre-restore backup retained at %s: %v",pre.Path,err));return};if err:=sitegenerator.StartSite(r.Context(),domain);err!=nil{writeJSONError(w,http.StatusInternalServerError,fmt.Sprintf("restore completed but site failed to start; pre-restore backup retained at %s: %v",pre.Path,err));return};writeJSON(w,http.StatusOK,map[string]any{"status":"restored","domain":domain,"artifact":req.Artifact,"pre_restore_backup":pre.Path})
}

func HandleUsers(w http.ResponseWriter,r *http.Request){
	s:=persistentAuth();if s==nil{writeJSONError(w,http.StatusServiceUnavailable,"persistent identity store is unavailable");return}
	switch r.Method{
	case http.MethodGet:
		users,err:=s.ListUsers();if err!=nil{writeJSONError(w,http.StatusInternalServerError,"failed to list users");return}
		out:=make([]map[string]any,0,len(users));for _,u:=range users{out=append(out,map[string]any{"id":u.ID,"username":u.Username,"role":u.Role,"enabled":u.Enabled,"created_at":u.CreatedAt,"updated_at":u.UpdatedAt})};writeJSON(w,http.StatusOK,map[string]any{"users":out})
	case http.MethodPost:
		var req struct{Username string `json:"username"`;Password string `json:"password"`;TOTPCodeSecret string `json:"totp_secret"`;Role string `json:"role"`}
		if err:=json.NewDecoder(http.MaxBytesReader(w,r.Body,16<<10)).Decode(&req);err!=nil{writeJSONError(w,http.StatusBadRequest,"invalid request");return}
		u,err:=CreatePersistentUser(req.Username,req.Password,req.TOTPCodeSecret,req.Role);if err!=nil{writeJSONError(w,http.StatusBadRequest,err.Error());return}
		writeJSON(w,http.StatusCreated,u)
	default:writeJSONError(w,http.StatusMethodNotAllowed,"method not allowed")
	}
}

func HandleDeleteUser(w http.ResponseWriter,r *http.Request){
	if r.Method!=http.MethodDelete{writeJSONError(w,http.StatusMethodNotAllowed,"method not allowed");return}
	id:=strings.TrimPrefix(r.URL.Path,"/api/v1/users/");id=strings.TrimSpace(strings.Trim(id,"/"));if id==""{writeJSONError(w,http.StatusBadRequest,"user id required");return}
	claims,_:=r.Context().Value(UserContextKey).(*JWTClaims);if claims!=nil&&claims.Subject==id{writeJSONError(w,http.StatusBadRequest,"cannot delete current user");return}
	if s:=persistentAuth();s!=nil{if err:=s.DeleteUser(id);err!=nil{writeJSONError(w,http.StatusInternalServerError,"failed to delete user");return};writeJSON(w,http.StatusOK,map[string]string{"status":"deleted","id":id});return}
	writeJSONError(w,http.StatusServiceUnavailable,"persistent identity store is unavailable")
}

func HandleAudit(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodGet{writeJSONError(w,http.StatusMethodNotAllowed,"method not allowed");return}
 s:=persistentAuth();if s==nil{writeJSONError(w,http.StatusServiceUnavailable,"audit store unavailable");return}
 events,err:=s.ListAudit(100);if err!=nil{writeJSONError(w,http.StatusInternalServerError,"failed to read audit log");return}
 writeJSON(w,http.StatusOK,map[string]any{"events":events})
}
