package api

import (
	"os"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestTokenPairRequiresConfiguredSecret(t *testing.T) {
	old := jwtSecretKey
	t.Cleanup(func() { jwtSecretKey = old })
	jwtSecretKey = nil
	if _, err := GenerateTokenPair("admin", "admin"); err == nil {
		t.Fatal("expected missing JWT secret to fail")
	}
}

func TestRefreshTokenIsSingleUse(t *testing.T) {
	SetJWTSecret("01234567890123456789012345678901")
	hash, err := bcrypt.GenerateFromPassword([]byte("test-password"), bcrypt.MinCost)
	if err != nil { t.Fatal(err) }
	os.Setenv("PANEL_ADMIN_USERNAME", "admin")
	os.Setenv("PANEL_ADMIN_PASSWORD_BCRYPT", string(hash))
	os.Setenv("PANEL_TOTP_SECRET", "JBSWY3DPEHPK3PXP")
	defer os.Unsetenv("PANEL_ADMIN_USERNAME")
	defer os.Unsetenv("PANEL_ADMIN_PASSWORD_BCRYPT")
	defer os.Unsetenv("PANEL_TOTP_SECRET")

	pair, err := GenerateTokenPair("admin", "admin")
	if err != nil { t.Fatal(err) }

	rotated, err := RefreshToken(pair.RefreshToken)
	if err != nil { t.Fatal(err) }
	if rotated.RefreshToken == pair.RefreshToken { t.Fatal("refresh token was not rotated") }

	if _, err := RefreshToken(pair.RefreshToken); err == nil {
		t.Fatal("expected original refresh token to be single-use")
	}
}
