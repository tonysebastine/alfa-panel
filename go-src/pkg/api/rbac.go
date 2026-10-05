package api

import (
	"net/http"
	"strings"
)

const (
	PermSitesRead    = "sites.read"
	PermSitesCreate  = "sites.create"
	PermSitesDeploy  = "sites.deploy"
	PermSitesOperate = "sites.operate"
	PermSitesDelete  = "sites.delete"
	PermUsersManage  = "users.manage"
	PermAuditRead    = "audit.read"
	PermSystemManage = "system.manage"
)

var rolePermissions = map[string]map[string]bool{
	"owner": {
		PermSitesRead:true, PermSitesCreate:true, PermSitesDeploy:true, PermSitesOperate:true, PermSitesDelete:true,
		PermUsersManage:true, PermAuditRead:true, PermSystemManage:true,
	},
	"admin": {
		PermSitesRead:true, PermSitesCreate:true, PermSitesDeploy:true, PermSitesOperate:true, PermSitesDelete:true,
		PermUsersManage:true, PermAuditRead:true, PermSystemManage:true,
	},
	"developer": {
		PermSitesRead:true, PermSitesCreate:true, PermSitesDeploy:true, PermSitesOperate:true,
	},
	"viewer": { PermSitesRead:true, PermAuditRead:true },
}

func HasPermission(role, permission string) bool {
	return rolePermissions[strings.ToLower(strings.TrimSpace(role))][permission]
}

func RequirePermission(permission string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(UserContextKey).(*JWTClaims)
		if !ok || claims == nil || !HasPermission(claims.Role, permission) {
			writeJSONError(w, http.StatusForbidden, "insufficient permissions")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func SitePermissionForRequest(r *http.Request) string {
	path := r.URL.Path
	switch {
	case r.Method == http.MethodGet && (path == "/api/v1/sites" || path == "/api/v1/sites/"):
		return PermSitesRead
	case r.Method == http.MethodPost && (path == "/api/v1/sites" || path == "/api/v1/sites/"):
		return PermSitesCreate
	case strings.HasSuffix(path, "/tomcat/deploy-war"), strings.HasSuffix(path, "/python/install-deps"):
		return PermSitesDeploy
	case strings.HasSuffix(path, "/delete"):
		return PermSitesDelete
	default:
		return PermSitesOperate
	}
}

func RequireSitePermission(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		permission := SitePermissionForRequest(r)
		claims, ok := r.Context().Value(UserContextKey).(*JWTClaims)
		if !ok || claims == nil || !HasPermission(claims.Role, permission) {
			writeJSONError(w, http.StatusForbidden, "insufficient permissions for this site operation")
			return
		}
		next.ServeHTTP(w, r)
	})
}
