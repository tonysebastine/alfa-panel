package api

import (
    "bytes"
    "encoding/json"
    "io"
    "net/http"
    "strings"
    "time"
)

// SecureLoginMiddleware performs the real credential check before the legacy token issuer.
// The request body is restored so the existing handler remains API-compatible.
func SecureLoginMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { next.ServeHTTP(w, r); return }
        body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16<<10))
        if err != nil { writeJSONError(w, http.StatusBadRequest, "invalid request body"); return }
        r.Body = io.NopCloser(bytes.NewReader(body))
        var req LoginRequest
        if err := json.Unmarshal(body, &req); err != nil || strings.TrimSpace(req.Username) == "" || req.Password == "" || req.TOTPCode == "" {
            recordAuthAudit("LOGIN_FAILED", req.Username, extractIP(r), false); writeJSONError(w, http.StatusUnauthorized, "invalid credentials"); return
        }
        if err := AuthenticateAdmin(req.Username, req.Password, req.TOTPCode); err != nil {
            recordAuthAudit("LOGIN_FAILED", req.Username, extractIP(r), false); writeJSONError(w, http.StatusUnauthorized, "invalid credentials"); return
        }
        recordAuthAudit("LOGIN", req.Username, extractIP(r), true)
        next.ServeHTTP(w, r)
    })
}

func HandleRefresh(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost { writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed"); return }
    var req struct { RefreshToken string `json:"refresh_token"` }
    if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req) != nil || strings.TrimSpace(req.RefreshToken) == "" {
        writeJSONError(w, http.StatusUnauthorized, "invalid refresh token"); return
    }
    pair, err := RefreshToken(req.RefreshToken)
    if err != nil { writeJSONError(w, http.StatusUnauthorized, "invalid refresh token"); return }
    writeJSON(w, http.StatusOK, pair)
}

func HandleLogout(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost { writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed"); return }
    var req struct { RefreshToken string `json:"refresh_token"` }
    if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req) == nil && req.RefreshToken != "" {
		if s := persistentAuth(); s != nil {
			if claims, err := VerifyJWT(req.RefreshToken); err == nil {
				if session, err := s.GetSession(claims.JTI); err == nil {
					now := time.Now().UTC(); session.RevokedAt = &now; _ = s.PutSession(*session)
				}
			}
		} else { RevokeRefreshToken(req.RefreshToken) }
	}
    writeJSON(w, http.StatusNoContent, nil)
}