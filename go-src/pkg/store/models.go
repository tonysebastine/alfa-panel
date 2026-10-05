package store

import "time"

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"password_hash"`
	Role         string    `json:"role"`
	TOTPSecret   string    `json:"totp_secret,omitempty"`
	Enabled      bool      `json:"enabled"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Session struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	RefreshHash  string    `json:"refresh_hash"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
	RevokedAt    *time.Time `json:"revoked_at,omitempty"`
	IPAddress    string    `json:"ip_address,omitempty"`
	UserAgent    string    `json:"user_agent,omitempty"`
}

type AuditEvent struct {
	ID         string         `json:"id"`
	Timestamp  time.Time      `json:"timestamp"`
	ActorID    string         `json:"actor_id,omitempty"`
	Action     string         `json:"action"`
	Resource   string         `json:"resource,omitempty"`
	ResourceID string         `json:"resource_id,omitempty"`
	IPAddress  string         `json:"ip_address,omitempty"`
	Success    bool           `json:"success"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}
