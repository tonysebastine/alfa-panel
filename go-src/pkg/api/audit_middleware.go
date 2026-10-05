package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/panel/panel-agent/pkg/store"
)

type auditResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *auditResponseWriter) WriteHeader(status int) { w.status=status; w.ResponseWriter.WriteHeader(status) }
func (w *auditResponseWriter) Write(p []byte) (int,error) {
	if w.status==0 { w.status=http.StatusOK }
	return w.ResponseWriter.Write(p)
}

func newAuditID() string {
	b:=make([]byte,16)
	if _,err:=rand.Read(b);err!=nil { return time.Now().UTC().Format("20060102150405.000000000") }
	return time.Now().UTC().Format("20060102T150405.000000000Z")+"-"+hex.EncodeToString(b)
}

func AuditMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
		aw:=&auditResponseWriter{ResponseWriter:w}
		next.ServeHTTP(aw,r)
		s:=persistentAuth()
		if s==nil { return }
		claims,_:=r.Context().Value(UserContextKey).(*JWTClaims)
		actor:=""
		if claims!=nil { actor=claims.Subject }
		action:=r.Method+" "+r.URL.Path
		resourceID:=""
		parts:=strings.Split(strings.Trim(r.URL.Path,"/"),"/")
		if len(parts)>=4 { resourceID=parts[3] }
		status:=aw.status
		if status==0 { status=http.StatusOK }
		_ = s.PutAudit(store.AuditEvent{
			ID:newAuditID(), Timestamp:time.Now().UTC(), ActorID:actor, Action:action,
			Resource:"api", ResourceID:resourceID, IPAddress:extractIP(r), Success:status<400,
			Metadata:map[string]any{"status":status},
		})
	})
}

func recordAuthAudit(action, username, ip string, success bool) {
	s:=persistentAuth(); if s==nil{return}
	_ = s.PutAudit(store.AuditEvent{ID:newAuditID(),Timestamp:time.Now().UTC(),ActorID:username,Action:action,Resource:"auth",IPAddress:ip,Success:success})
}
