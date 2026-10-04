package api

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
)

var (
	// Default JWT HMAC Secret Key (overridden by JWT_SECRET env var in production)
	jwtSecretKey = []byte("1panel-super-secret-production-signing-key-32b")
)

// SetJWTSecret overrides the signing secret.
func SetJWTSecret(secret string) {
	jwtSecretKey = []byte(secret)
}

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
}

// GenerateTokenPair issues a 15-minute access token and a 7-day refresh token.
func GenerateTokenPair(userID string, role string) (*TokenPair, error) {
	now := time.Now().UTC()

	// Access Token: 15 minutes validity
	accessClaims := JWTClaims{
		Subject:   userID,
		Role:      role,
		TokenType: "access",
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
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(7 * 24 * time.Hour).Unix(),
	}
	refreshToken, err := signJWT(refreshClaims)
	if err != nil {
		return nil, fmt.Errorf("failed to sign refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900,
		TokenType:    "Bearer",
	}, nil
}

// signJWT signs claims using HMAC-SHA256.
func signJWT(claims JWTClaims) (string, error) {
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
	if time.Now().UTC().Unix() > claims.ExpiresAt {
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
