package system

import (
	"context"
	"os"
	"strings"
	"testing"
)

func TestParseUFWEmptyOutputDoesNotInventRules(t *testing.T) {
	if got := parseUFWNumberedOutput("Status: active\nTo Action From\n-- ------ ----\n"); len(got) != 0 {
		t.Fatalf("expected no parsed rules, got %#v", got)
	}
}

func TestNftablesMutationDisabledByDefault(t *testing.T) {
	t.Setenv("PANEL_NFTABLES_MUTATIONS_ENABLED", "false")
	fm := &FirewallManager{backend: "nftables"}
	err := fm.AllowPort(context.Background(), 8443, "tcp", "test")
	if err == nil || !strings.Contains(err.Error(), "disabled by default") {
		t.Fatalf("expected safe refusal, got %v", err)
	}
}

func TestNftablesDoesNotCreateBaseChain(t *testing.T) {
	t.Setenv("PANEL_NFTABLES_MUTATIONS_ENABLED", "true")
	dir := t.TempDir()
	script := "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$NFT_CALL_LOG\"\nexit 1\n"
	if err := os.WriteFile(dir+"/nft", []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	logPath := dir + "/calls"
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
	t.Setenv("NFT_CALL_LOG", logPath)
	fm := &FirewallManager{backend: "nftables"}
	if err := fm.AllowPort(context.Background(), 8443, "tcp", "test"); err == nil {
		t.Fatal("expected failure when managed chain is absent")
	}
	b, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	calls := string(b)
	if strings.Contains(calls, "add chain") || strings.Contains(calls, "add table") {
		t.Fatalf("firewall code attempted to create a base chain/table: %s", calls)
	}
}

func TestDenySSHRequiresExplicitLockoutOverride(t *testing.T) {
	t.Setenv("PANEL_ALLOW_SSH_LOCKOUT", "false")
	fm := &FirewallManager{backend: "ufw"}
	err := fm.DenyPort(context.Background(), 22, "tcp")
	if err == nil || !strings.Contains(err.Error(), "refusing to deny SSH") {
		t.Fatalf("expected SSH lockout protection, got %v", err)
	}
}
