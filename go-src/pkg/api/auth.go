package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	// Default JWT HMAC Secret Key (overridden by JWT_SECRET env var in production)
	jwtSecretKey []byte
	refreshStore = struct { sync.Mutex; tokens map[[32]byte]time.Time }{tokens: make(map[[32]byte]time.Time)}
)

// SetJWTSecret overrides the signing secret.
func SetJWTSecret(secret string) { jwtSecretKey = []byte(secret) }

func init() { if s := strings.TrimSpace(os.Getenv("PANEL_JWT_SECRET")); s != "" { jwtSecretKey = []byte(s) } }

func AuthenticateIdentity(username, password, totpCode string) (string,string,error) {
	if persistentAuth() != nil {
		u,err:=authenticatePersistent(username,password,totpCode);if err!=nil{return "","",err};return u.ID,u.Role,nil
	}
	expectedUser := strings.TrimSpace(os.Getenv("PANEL_ADMIN_USERNAME"))
	hash := strings.TrimSpace(os.Getenv("PANEL_ADMIN_PASSWORD_BCRYPT"))
	secret := strings.TrimSpace(os.Getenv("PANEL_TOTP_SECRET"))
	if expectedUser == "" || hash == "" || secret == "" { return "","",errors.New("panel administrator credentials are not configured") }
	if !hmac.Equal([]byte(username), []byte(expectedUser)) || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil || !VerifyTOTP(secret, totpCode, 30, 1) { return "","",errors.New("invalid credentials") }
	return username,"admin",nil
}

func RefreshToken(token string) (*TokenPair, error) {
	claims, err := VerifyJWT(token); if err != nil || claims.TokenType != "refresh" { return nil, errors.New("invalid refresh token") }
	if s := persistentAuth(); s != nil {
		session, err := s.GetSession(claims.JTI)
		if err != nil || session.UserID != claims.Subject || session.RevokedAt != nil || time.Now().After(session.ExpiresAt) {
			return nil, errors.New("refresh token has been revoked or expired")
		}
		key := sha256.Sum256([]byte(token))
		if !hmac.Equal([]byte(session.RefreshHash), key[:]) { return nil, errors.New("refresh token has been revoked or expired") }
		now := time.Now().UTC()
		session.RevokedAt = &now
		if err := s.PutSession(*session); err != nil { return nil, errors.New("failed to rotate refresh session") }
		return GenerateTokenPair(claims.Subject, claims.Role)
	}
	key := sha256.Sum256([]byte(token)); refreshStore.Lock(); expiry, ok := refreshStore.tokens[key]; if ok { delete(refreshStore.tokens, key) }; refreshStore.Unlock()
	if !ok || time.Now().After(expiry) { return nil, errors.New("refresh token has been revoked or expired") }
	return GenerateTokenPair(claims.Subject, claims.Role)
}

func RevokeRefreshToken(token string) { refreshStore.Lock(); delete(refreshStore.tokens, sha256.Sum256([]byte(token))); refreshStore.Unlock() }

// TokenPair encapsulates short-lived access and refresh tokens.
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"` // seconds
	TokenType    string `json:"token_type"`
}

// JWTClaims holds standard and custom token payload fields.
type JWTClaims struct {
	Subject   string `json:"sub"`
	Role      string `json:"role"`
	TokenType string `json:"type"` // "access" | "refresh"
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
	JTI       string `json:"jti"`
}

// GenerateTokenPair issues a 15-minute access token and a 7-day refresh token.
func GenerateTokenPair(userID string, role string) (*TokenPair, error) {
	if len(jwtSecretKey) < 32 { return nil, errors.New("PANEL_JWT_SECRET must be configured with at least 32 bytes") }
	now := time.Now().UTC()
	accessJTI, err := newTokenID()
	if err != nil { return nil, err }
	refreshJTI, err := newTokenID()
	if err != nil { return nil, err }

	// Access Token: 15 minutes validity
	accessClaims := JWTClaims{
		Subject:   userID,
		Role:      role,
		TokenType: "access",
		JTI:       accessJTI,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(15 * time.Minute).Unix(),
	}
	accessToken, err := signJWT(accessClaims)
	if err != nil {
		return nil, fmt.Errorf("failed to sign access token: %w", err)
	}

	// Refresh Token: 7 days validity
	refreshClaims := JWTClaims{
		Subject:   userID,
		Role:      role,
		TokenType: "refresh",
		JTI:       refreshJTI,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(7 * 24 * time.Hour).Unix(),
	}
	refreshToken, err := signJWT(refreshClaims)
	if err != nil {
		return nil, fmt.Errorf("failed to sign refresh token: %w", err)
	}

	pair := &TokenPair{AccessToken: accessToken, RefreshToken: refreshToken, ExpiresIn: 900, TokenType: "Bearer"}
	if persistentAuth() != nil {
		if err := persistRefreshSession(userID, refreshToken, now.Add(7*24*time.Hour)); err != nil { return nil, fmt.Errorf("failed to persist refresh session: %w", err) }
	} else {
		refreshStore.Lock(); refreshStore.tokens[sha256.Sum256([]byte(refreshToken))] = now.Add(7 * 24 * time.Hour); refreshStore.Unlock()
	}
	return pair, nil
}


func newTokenID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil { return "", fmt.Errorf("failed to generate token id: %w", err) }
	return hex.EncodeToString(buf), nil
}

// signJWT signs claims using HMAC-SHA256.
func signJWT(claims JWTClaims) (string, error) {
	if len(jwtSecretKey) < 32 { return "", errors.New("PANEL_JWT_SECRET must be configured with at least 32 bytes") }
	header := map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	encodedHeader := base64.RawURLEncoding.EncodeToString(headerJSON)
	encodedClaims := base64.RawURLEncoding.EncodeToString(claimsJSON)
	signingInput := encodedHeader + "." + encodedClaims

	mac := hmac.New(sha256.New, jwtSecretKey)
	mac.Write([]byte(signingInput))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return signingInput + "." + signature, nil
}

// VerifyJWT validates the token signature and expiration, returning parsed claims.
func VerifyJWT(tokenString string) (*JWTClaims, error) {
	if len(jwtSecretKey) < 32 { return nil, errors.New("jwt signing secret is not configured") }
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed jwt: expected 3 dot-separated parts")
	}

	signingInput := parts[0] + "." + parts[1]
	providedSig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid signature encoding: %w", err)
	}

	mac := hmac.New(sha256.New, jwtSecretKey)
	mac.Write([]byte(signingInput))
	expectedSig := mac.Sum(nil)

	if !hmac.Equal(providedSig, expectedSig) {
		return nil, errors.New("jwt signature verification failed")
	}

	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode claims payload: %w", err)
	}

	var claims JWTClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, fmt.Errorf("failed to parse claims json: %w", err)
	}

	// Verify expiration
	if claims.ExpiresAt <= time.Now().UTC().Unix() || claims.IssuedAt > time.Now().UTC().Add(60*time.Second).Unix() {
		return nil, errors.New("jwt token has expired")
	}

	return &claims, nil
}

// -----------------------------------------------------------------------------
// RFC 6238 Standard TOTP (Time-Based One-Time Password) Verification
// -----------------------------------------------------------------------------

// VerifyTOTP validates a 6-digit TOTP code against a Base32 encoded secret.
// Allows clock drift window (+/- 1 time step = 30 seconds).
func VerifyTOTP(secretBase32 string, code string, timeStepSec int, window int) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return false
	}

	secretClean := strings.ToUpper(strings.ReplaceAll(secretBase32, " ", ""))
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secretClean)
	if err != nil {
		// Try standard padding decode
		key, err = base32.StdEncoding.DecodeString(secretClean)
		if err != nil {
			return false
		}
	}

	if timeStepSec <= 0 {
		timeStepSec = 30
	}
	currentStep := time.Now().UTC().Unix() / int64(timeStepSec)

	// Check time steps within the allowable window (-window to +window)
	for i := -window; i <= window; i++ {
		step := currentStep + int64(i)
		expectedCode := generateHOTP(key, step, 6)
		if hmac.Equal([]byte(expectedCode), []byte(code)) {
			return true
		}
	}

	return false
}

// generateHOTP computes standard HMAC-SHA1 HOTP for a given counter.
func generateHOTP(key []byte, counter int64, digits int) string {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(counter))

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	hash := mac.Sum(nil)

	// Dynamic Truncation
	offset := hash[len(hash)-1] & 0x0f
	binaryCode := binary.BigEndian.Uint32(hash[offset : offset+4])
	binaryCode &= 0x7fffffff

	mod := uint32(math.Pow10(digits))
	otp := binaryCode % mod

	format := fmt.Sprintf("%%0%dd", digits)
	return fmt.Sprintf(format, otp)
}
