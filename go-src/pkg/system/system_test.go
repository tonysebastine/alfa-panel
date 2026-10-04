package system

import (
	"context"
	"testing"
	"time"
)

func TestCollectMetrics(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	metrics, err := CollectMetrics(ctx)
	if err != nil {
		t.Fatalf("Failed to collect metrics: %v", err)
	}

	if metrics.Timestamp.IsZero() {
		t.Errorf("Metrics timestamp should not be zero")
	}
}

func TestFirewallPortValidation(t *testing.T) {
	fm := NewFirewallManager()
	ctx := context.Background()

	// Port out of bounds should fail immediately before command execution
	err := fm.AllowPort(ctx, 70000, "tcp", "invalid")
	if err == nil {
		t.Errorf("Expected port 70000 to be rejected")
	}

	err = fm.AllowPort(ctx, -5, "tcp", "invalid")
	if err == nil {
		t.Errorf("Expected negative port to be rejected")
	}

	err = fm.AllowPort(ctx, 8080, "invalid_proto", "test")
	if err == nil {
		t.Errorf("Expected invalid protocol to be rejected")
	}
}

func TestAuditLogger(t *testing.T) {
	logger, err := NewAuditLogger(":memory:")
	if err != nil {
		t.Fatalf("Failed to init audit logger: %v", err)
	}

	ctx := context.Background()
	_ = logger.Log(ctx, AuditRecord{
		User:      "admin",
		Action:    "site_restart",
		Target:    "api.internal.com",
		IPAddress: "10.0.0.5",
		Details:   "Graceful restart triggered via API",
	})

	records, err := logger.QueryRecent(ctx, 10)
	if err != nil {
		t.Fatalf("Failed to query audit records: %v", err)
	}

	if len(records) < 2 {
		t.Errorf("Expected at least 2 records, got %d", len(records))
	}

	// Most recent should be site_restart
	if records[0].Action != "site_restart" {
		t.Errorf("Expected most recent action to be 'site_restart', got '%s'", records[0].Action)
	}
}
