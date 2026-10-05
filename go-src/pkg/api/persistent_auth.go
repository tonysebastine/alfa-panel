package api

import (
	"crypto/sha256"
	"errors"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/panel/panel-agent/pkg/store"
	"golang.org/x/crypto/bcrypt"
)

var (
	persistentAuthMu sync.RWMutex
	persistentAuthDB *store.Store
	persistentAuthOnce sync.Once
)

func ConfigurePersistentAuth(s *store.Store) {
	persistentAuthMu.Lock()
	defer persistentAuthMu.Unlock()
	persistentAuthDB = s
}

func persistentAuth() *store.Store {
	persistentAuthMu.RLock()
	defer persistentAuthMu.RUnlock()
	return persistentAuthDB
}

func BootstrapAdminIfNeeded(s *store.Store) error {
	users, err := s.ListUsers()
	if err != nil { return err }
	if len(users) > 0 { return nil }
	username := strings.TrimSpace(os.Getenv("PANEL_ADMIN_USERNAME"))
	hash := strings.TrimSpace(os.Getenv("PANEL_ADMIN_PASSWORD_BCRYPT"))
	totp := strings.TrimSpace(os.Getenv("PANEL_TOTP_SECRET"))
	if username == "" || hash == "" || totp == "" { return errors.New("persistent store is empty and bootstrap admin credentials are not configured") }
	now := time.Now().UTC()
	return s.PutUser(store.User{ID:"admin-"+username,Username:username,PasswordHash:hash,Role:"admin",TOTPSecret:totp,Enabled:true,CreatedAt:now,UpdatedAt:now})
}

func authenticatePersistent(username, password, code string) error {
	s := persistentAuth()
	if s == nil { return errors.New("persistent auth unavailable") }
	users, err := s.ListUsers()
	if err != nil { return errors.New("authentication backend unavailable") }
	for _, u := range users {
		if !u.Enabled || !strings.EqualFold(u.Username, strings.TrimSpace(username)) { continue }
		if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil { return errors.New("invalid credentials") }
		if !VerifyTOTP(u.TOTPSecret, code, 30, 1) { return errors.New("invalid credentials") }
		return nil
	}
	return errors.New("invalid credentials")
}

func persistRefreshSession(userID, refreshToken string, expiresAt time.Time) error {
	s := persistentAuth()
	if s == nil { return nil }
	claims, err := VerifyJWT(refreshToken); if err != nil { return err }
	h := sha256.Sum256([]byte(refreshToken))
	return s.PutSession(store.Session{ID:claims.JTI,UserID:userID,RefreshHash: string(h[:]),ExpiresAt:expiresAt,CreatedAt:time.Now().UTC()})
}

func ConfigurePersistentAuthFromEnv() {
	path := strings.TrimSpace(os.Getenv("PANEL_STORE_PATH"))
	if path == "" { return }
	persistentAuthOnce.Do(func() {
		s, err := store.Open(path)
		if err != nil { panic(err) }
		if err := BootstrapAdminIfNeeded(s); err != nil { _ = s.Close(); panic(err) }
		ConfigurePersistentAuth(s)
	})
}
