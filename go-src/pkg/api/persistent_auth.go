package api

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
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
	persistentPruneOnce sync.Once
)

func masterKey() ([]byte,error) {
	raw:=strings.TrimSpace(os.Getenv("PANEL_MASTER_KEY"))
	if len(raw)<32 { return nil,errors.New("PANEL_MASTER_KEY must be configured with at least 32 bytes") }
	sum:=sha256.Sum256([]byte(raw)); return sum[:],nil
}

func encryptSecret(plain string)(string,error){
	key,err:=masterKey();if err!=nil{return "",err};block,err:=aes.NewCipher(key);if err!=nil{return "",err};gcm,err:=cipher.NewGCM(block);if err!=nil{return "",err}
	nonce:=make([]byte,gcm.NonceSize());if _,err:=rand.Read(nonce);err!=nil{return "",err}
	out:=gcm.Seal(nonce,nonce,[]byte(plain),nil);return "enc1:"+base64.RawStdEncoding.EncodeToString(out),nil
}

func decryptSecret(value string)(string,error){
	if !strings.HasPrefix(value,"enc1:"){return value,nil}
	key,err:=masterKey();if err!=nil{return "",err};block,err:=aes.NewCipher(key);if err!=nil{return "",err};gcm,err:=cipher.NewGCM(block);if err!=nil{return "",err}
	data,err:=base64.RawStdEncoding.DecodeString(strings.TrimPrefix(value,"enc1:"));if err!=nil{return "",err}
	n:=gcm.NonceSize();if len(data)<n{return "",errors.New("encrypted secret is malformed")}
	plain,err:=gcm.Open(nil,data[:n],data[n:],nil);if err!=nil{return "",errors.New("encrypted secret authentication failed")}
	return string(plain),nil
}

func ConfigurePersistentAuth(s *store.Store) {
	persistentAuthMu.Lock()
	defer persistentAuthMu.Unlock()
	persistentAuthDB = s
	persistentPruneOnce.Do(func(){go func(){ticker:=time.NewTicker(6*time.Hour);defer ticker.Stop();for range ticker.C{_ = s.Prune(time.Now().UTC(),90*24*time.Hour)}}()})
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
	totp, err = encryptSecret(totp); if err != nil { return err }
	now := time.Now().UTC()
	return s.PutUser(store.User{ID:"admin-"+username,Username:username,PasswordHash:hash,Role:"admin",TOTPSecret:totp,Enabled:true,CreatedAt:now,UpdatedAt:now})
}

func authenticatePersistent(username, password, code string) (*store.User,error) {
	s := persistentAuth()
	if s == nil { return nil,errors.New("persistent auth unavailable") }
	users, err := s.ListUsers()
	if err != nil { return nil,errors.New("authentication backend unavailable") }
	for _, u := range users {
		if !u.Enabled || !strings.EqualFold(u.Username, strings.TrimSpace(username)) { continue }
		if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil { return nil,errors.New("invalid credentials") }
		totp, err := decryptSecret(u.TOTPSecret); if err != nil { return nil,errors.New("authentication backend unavailable") }
		if !VerifyTOTP(totp, code, 30, 1) { return nil,errors.New("invalid credentials") }
		u.TOTPSecret=""
		return &u,nil
	}
	return nil,errors.New("invalid credentials")
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

func CreatePersistentUser(username,password,totp,role string) (*store.User,error) {
	s:=persistentAuth();if s==nil{return nil,errors.New("persistent auth unavailable")}
	username=strings.TrimSpace(username);role=strings.ToLower(strings.TrimSpace(role))
	if username==""||password==""||totp==""{return nil,errors.New("username, password and TOTP are required")}
	switch role{case "owner","admin","developer","viewer":default:return nil,errors.New("invalid role")}
	users,err:=s.ListUsers();if err!=nil{return nil,err};for _,u:=range users{if strings.EqualFold(u.Username,username){return nil,errors.New("username already exists")}}
	hash,err:=bcrypt.GenerateFromPassword([]byte(password),bcrypt.DefaultCost);if err!=nil{return nil,err}
	enc,err:=encryptSecret(totp);if err!=nil{return nil,err}
	now:=time.Now().UTC();u:=store.User{ID:newUserID(),Username:username,PasswordHash:string(hash),Role:role,TOTPSecret:enc,Enabled:true,CreatedAt:now,UpdatedAt:now}
	if err:=s.PutUser(u);err!=nil{return nil,err};u.TOTPSecret="";return &u,nil
}

func newUserID() string { b:=make([]byte,12);if _,err:=rand.Read(b);err!=nil{return "user-"+time.Now().UTC().Format("20060102150405.000000000")};return "user-"+hex.EncodeToString(b) }
