package main

import (
	"context"
	"net"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveAgentSocketPath(t *testing.T) {
	if got, err := resolveAgentSocketPath(""); err != nil || got != defaultSocket {
		t.Fatalf("default socket = %q, %v", got, err)
	}
	if _, err := resolveAgentSocketPath("/tmp/alfa-agent.sock"); err == nil {
		t.Fatal("custom socket path should be rejected")
	}
}

func TestValidateAgentRuntimeDirectoryRequiresRootOwnershipAndSafeMode(t *testing.T) {
	dir := t.TempDir()
	if err := validateAgentRuntimeDirectory(dir); err != nil && os.Geteuid() == 0 {
		t.Fatalf("root-owned safe temporary directory should pass: %v", err)
	}
	link := filepath.Join(t.TempDir(), "runtime-link")
	if err := os.Symlink(dir, link); err != nil {
		t.Fatal(err)
	}
	if err := validateAgentRuntimeDirectory(link); err == nil {
		t.Fatal("symlink runtime directory should be rejected")
	}
}

func TestRemoveStaleAgentSocketRefusesRegularFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.sock")
	if err := os.WriteFile(path, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := removeStaleAgentSocket(path); err == nil {
		t.Fatal("expected refusal for regular file")
	}
	if got, err := os.ReadFile(path); err != nil || string(got) != "keep" {
		t.Fatalf("regular file was changed: %q, %v", got, err)
	}
}

func TestRemoveStaleAgentSocketDoesNotRemoveLiveSocket(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.sock")
	ln, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if err := removeStaleAgentSocket(path); err == nil || !strings.Contains(err.Error(), "already listening") {
		t.Fatalf("expected active socket refusal, got %v", err)
	}
	if _, err := os.Lstat(path); err != nil {
		t.Fatalf("live socket path was removed: %v", err)
	}
}

func TestAgentAuthorizationRequiresExpectedPeerUID(t *testing.T) {
	old := expectedAgentPeerUID
	expectedAgentPeerUID = 1001
	t.Cleanup(func() { expectedAgentPeerUID = old })
	request := httptest.NewRequest("POST", "/v1/operate", strings.NewReader(`{"operation":"status"}`))
	if authorizedAgentPeer(request) {
		t.Fatal("request without peer credentials must be rejected")
	}
	ctx := context.WithValue(request.Context(), peerCredentialKey{}, peerCredentials{UID: 1002})
	if authorizedAgentPeer(request.WithContext(ctx)) {
		t.Fatal("wrong peer UID must be rejected")
	}
	ctx = context.WithValue(request.Context(), peerCredentialKey{}, peerCredentials{UID: 1001})
	if !authorizedAgentPeer(request.WithContext(ctx)) {
		t.Fatal("configured API UID should be accepted")
	}
}

func TestDecodePayloadRejectsUnknownAndTrailingFields(t *testing.T) {
	var payload struct {
		Port int `json:"port"`
	}
	if err := decodePayload([]byte(`{"port":443,"extra":true}`), &payload); err == nil {
		t.Fatal("unknown field should be rejected")
	}
	if err := decodePayload([]byte(`{"port":443} {}`), &payload); err == nil {
		t.Fatal("trailing JSON should be rejected")
	}
	if err := decodePayload([]byte(`{"port":443}`), &payload); err != nil || payload.Port != 443 {
		t.Fatalf("valid payload rejected: %#v, %v", payload, err)
	}
}
