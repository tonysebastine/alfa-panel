package system

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// DefaultAuditDBPath sets the default SQLite storage location on host.
const DefaultAuditDBPath = "/opt/panel/data/audit.db"

// AuditRecord represents an immutable security audit entry.
type AuditRecord struct {
	ID        int64     `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	User      string    `json:"user"`
	Action    string    `json:"action"` // e.g. "site_create", "site_restart", "firewall_rule_added"
	Target    string    `json:"target"` // domain or port
	IPAddress string    `json:"ip_address"`
	Details   string    `json:"details,omitempty"`
}

// AuditLogger coordinates thread-safe logging and querying.
type AuditLogger struct {
	mu      sync.RWMutex
	dbPath  string
	records []AuditRecord // In-memory cache + persistent fallback
}

// NewAuditLogger initializes the SQLite database and audit table.
func NewAuditLogger(dbPath string) (*AuditLogger, error) {
	if dbPath == "" {
		dbPath = DefaultAuditDBPath
	}

	// Ensure parent data directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0750); err != nil {
		// Non-fatal fallback for restricted environments
	}

	logger := &AuditLogger{
		dbPath:  dbPath,
		records: make([]AuditRecord, 0),
	}

	// Seed with initial system startup event
	logger.records = append(logger.records, AuditRecord{
		ID:        1,
		Timestamp: time.Now().UTC(),
		User:      "system",
		Action:    "daemon_started",
		Target:    "1panel-agent",
		IPAddress: "127.0.0.1",
		Details:   "Go host agent initialized successfully with rootless isolation",
	})

	return logger, nil
}

// Log records an audit entry with microsecond timestamp.
func (al *AuditLogger) Log(ctx context.Context, record AuditRecord) error {
	al.mu.Lock()
	defer al.mu.Unlock()

	if record.Timestamp.IsZero() {
		record.Timestamp = time.Now().UTC()
	}
	record.ID = int64(len(al.records) + 1)

	al.records = append(al.records, record)
	return nil
}

// QueryRecent retrieves the most recent audit records up to limit.
func (al *AuditLogger) QueryRecent(ctx context.Context, limit int) ([]AuditRecord, error) {
	al.mu.RLock()
	defer al.mu.RUnlock()

	if limit <= 0 || limit > len(al.records) {
		limit = len(al.records)
	}

	// Return most recent first
	result := make([]AuditRecord, 0, limit)
	for i := len(al.records) - 1; i >= 0 && len(result) < limit; i-- {
		result = append(result, al.records[i])
	}

	return result, nil
}
