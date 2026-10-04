package api

import (
	"net/http"
	"strings"
)

// ServerConfig configures the API service.
type ServerConfig struct {
	ListenAddr string
	RateLimit  int
}

// NewRouter constructs the complete REST API routing tree with security middleware.
func NewRouter() http.Handler {
	mux := http.NewServeMux()

	// Rate limiters
	loginRateLimiter := NewRateLimiter(10, 5)   // 10 req/min, burst 5 for auth
	generalRateLimiter := NewRateLimiter(300, 50) // 300 req/min for API

	// Public routes
	mux.Handle("/api/v1/auth/login", loginRateLimiter.Middleware(http.HandlerFunc(HandleLogin)))

	// Sites router dispatching paths under /api/v1/sites
	sitesHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		if path == "/api/v1/sites" || path == "/api/v1/sites/" {
			if r.Method == http.MethodGet {
				HandleListSites(w, r)
				return
			} else if r.Method == http.MethodPost {
				HandleCreateSite(w, r)
				return
			}
			http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		// Sub-routes: /api/v1/sites/:domain/...
		if strings.HasSuffix(path, "/start") {
			HandleSiteAction("start")(w, r)
			return
		}
		if strings.HasSuffix(path, "/stop") {
			HandleSiteAction("stop")(w, r)
			return
		}
		if strings.HasSuffix(path, "/restart") {
			HandleSiteAction("restart")(w, r)
			return
		}
		if strings.HasSuffix(path, "/logs") {
			HandleSiteLogs(w, r)
			return
		}
		if strings.HasSuffix(path, "/exec") {
			HandleSiteExec(w, r)
			return
		}

		// Turn 5: WAR Deploy & Python Dependencies
		if strings.HasSuffix(path, "/tomcat/deploy-war") {
			HandleDeployWAR(w, r)
			return
		}
		if strings.HasSuffix(path, "/python/install-deps") {
			HandlePythonInstallDeps(w, r)
			return
		}

		// Turn 5: File Manager
		if strings.HasSuffix(path, "/files/tree") {
			HandleFileTree(w, r)
			return
		}
		if strings.HasSuffix(path, "/files/content") {
			HandleFileContent(w, r)
			return
		}

		http.NotFound(w, r)
	})

	// Wrap sites with JWT protection and general rate limiter
	mux.Handle("/api/v1/sites", generalRateLimiter.Middleware(JWTMiddleware(sitesHandler)))
	mux.Handle("/api/v1/sites/", generalRateLimiter.Middleware(JWTMiddleware(sitesHandler)))

	// Wrap all routes with security headers
	return SecurityHeadersMiddleware(mux)
}
