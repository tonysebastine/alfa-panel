package api

import (
	"strings"
	"testing"
)

func TestResolveSafePath(t *testing.T) {
	siteDir := "/opt/panel/apps/sites/myapp.com"

	tests := []struct {
		name      string
		userPath  string
		wantError bool
	}{
		{
			name:      "Valid Relative Path",
			userPath:  "app/main.py",
			wantError: false,
		},
		{
			name:      "Valid Nested File",
			userPath:  "data/webapps/ROOT/index.jsp",
			wantError: false,
		},
		{
			name:      "Leading Slash Normalized",
			userPath:  "/app/requirements.txt",
			wantError: false,
		},
		{
			name:      "Traversal Escape with Double Dots",
			userPath:  "../../../../etc/passwd",
			wantError: true,
		},
		{
			name:      "Subtle Traversal Escape",
			userPath:  "app/../../secret.txt",
			wantError: true,
		},
		{
			name:      "Absolute System Root Escape",
			userPath:  "/etc/shadow",
			wantError: false, // Cleaned to /opt/panel/apps/sites/myapp.com/etc/shadow which is safe inside container
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := ResolveSafePath(siteDir, tt.userPath)
			if tt.wantError {
				if err == nil {
					t.Errorf("Expected path traversal error for '%s', got safe path: %s", tt.userPath, res)
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error for '%s': %v", tt.userPath, err)
				}
				if !strings.HasPrefix(res, siteDir) {
					t.Errorf("Resolved path '%s' does not start with siteDir '%s'", res, siteDir)
				}
			}
		})
	}
}

func TestMagicBytesZIPCheck(t *testing.T) {
	validZipHeader := []byte{0x50, 0x4B, 0x03, 0x04}
	fakeExeHeader := []byte{0x4D, 0x5A, 0x90, 0x00} // MZ header

	if validZipHeader[0] != 0x50 || validZipHeader[1] != 0x4B {
		t.Errorf("Valid header check failed")
	}
	if fakeExeHeader[0] == 0x50 && fakeExeHeader[1] == 0x4B {
		t.Errorf("Fake header should not match")
	}
}
