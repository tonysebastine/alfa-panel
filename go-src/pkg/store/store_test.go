package store

import (
	"path/filepath"
	"testing"
	"time"
)

func TestStorePersistsUsersSessionsAndAudit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "panel.db")
	s, err := Open(path)
	if err != nil { t.Fatal(err) }
	now := time.Now().UTC()
	if err := s.PutUser(User{ID:"u1",Username:"admin",Role:"owner",Enabled:true,CreatedAt:now,UpdatedAt:now}); err != nil { t.Fatal(err) }
	if err := s.PutSession(Session{ID:"s1",UserID:"u1",RefreshHash:"hash",ExpiresAt:now.Add(time.Hour),CreatedAt:now}); err != nil { t.Fatal(err) }
	if err := s.PutAudit(AuditEvent{ID:"a1",Timestamp:now,ActorID:"u1",Action:"LOGIN",Success:true}); err != nil { t.Fatal(err) }
	if err := s.Close(); err != nil { t.Fatal(err) }

	s, err = Open(path)
	if err != nil { t.Fatal(err) }
	defer s.Close()
	u, err := s.GetUser("u1"); if err != nil || u.Username != "admin" { t.Fatalf("user persistence failed: %#v %v", u, err) }
	session, err := s.GetSession("s1"); if err != nil || session.UserID != "u1" { t.Fatalf("session persistence failed: %#v %v", session, err) }
	audit, err := s.ListAudit(10); if err != nil || len(audit) != 1 || audit[0].Action != "LOGIN" { t.Fatalf("audit persistence failed: %#v %v", audit, err) }
}
