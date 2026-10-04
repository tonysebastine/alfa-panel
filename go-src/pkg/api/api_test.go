package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJWTIssuanceAndVerification(t *testing.T) {
	pair, err := GenerateTokenPair("admin_user", "admin")
	if err != nil {
		t.Fatalf("Failed to generate token pair: %v", err)
	}

	claims, err := VerifyJWT(pair.AccessToken)
	if err != nil {
		t.Fatalf("Failed to verify access token: %v", err)
	}

	if claims.Subject != "admin_user" || claims.Role != "admin" {
		t.Errorf("Claims mismatch: %+v", claims)
	}
}

func TestTOTPVerification(t *testing.T) {
	// Standard test vector RFC 6238 (secret: JBSWY3DPEHPK3PXP)
	secret := "JBSWY3DPEHPK3PXP"
	// Generate current code
	curCode := generateHOTP([]byte("12345678901234567890"), 59, 6)

	// In test, check standard code length
	if len(curCode) != 6 {
		t.Errorf("Expected 6-digit code, got %s", curCode)
	}

	// Verify with invalid code
	if VerifyTOTP(secret, "000000", 30, 0) {
		t.Errorf("VerifyTOTP should have failed for fake code")
	}
}

func TestRateLimiter(t *testing.T) {
	rl := NewRateLimiter(60, 3) // Capacity 3
	ip := "192.168.1.100"

	if !rl.Allow(ip) || !rl.Allow(ip) || !rl.Allow(ip) {
		t.Errorf("Initial 3 requests should be permitted")
	}

	if rl.Allow(ip) {
		t.Errorf("4th request should exceed burst capacity")
	}
}

func TestCreateSiteValidation(t *testing.T) {
	router := NewRouter()

	// Obtain valid token
	tokenPair, _ := GenerateTokenPair("admin", "admin")

	tests := []struct {
		name       string
		payload    CreateSiteRequest
		wantStatus int
	}{
		{
			name: "Privileged Port (< 1024) Rejected",
			payload: CreateSiteRequest{
				Domain:  "valid.app.internal",
				AppType: "tomcat",
				Port:    80, // Forbidden: must be >= 1024 for rootless execution
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "Directory Traversal in Domain Rejected",
			payload: CreateSiteRequest{
				Domain:  "../../etc/shadow",
				AppType: "python",
				Port:    8000,
			},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.payload)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/sites", bytes.NewReader(body))
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tt.wantStatus, rec.Code, rec.Body.String())
			}
		})
	}
}
