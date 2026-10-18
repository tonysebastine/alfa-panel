package api

import (
	"context"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type contextKey string

const (
	UserContextKey contextKey = "api_user_claims"
)

// ClientBucket tracks request counts for IP rate limiting.
type ClientBucket struct {
	tokens     float64
	lastRefill time.Time
}

// RateLimiter manages thread-safe token bucket rate limiting per IP.
type RateLimiter struct {
	mu         sync.Mutex
	buckets    map[string]*ClientBucket
	capacity   float64
	refillRate float64 // tokens per second
}

// NewRateLimiter creates a token bucket rate limiter.
func NewRateLimiter(requestsPerMinute int, burstCapacity int) *RateLimiter {
	rl := &RateLimiter{
		buckets:    make(map[string]*ClientBucket),
		capacity:   float64(burstCapacity),
		refillRate: float64(requestsPerMinute) / 60.0,
	}

	// Background routine to evict stale IP entries every 5 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			rl.mu.Lock()
			cutoff := time.Now().Add(-10 * time.Minute)
			for ip, b := range rl.buckets {
				if b.lastRefill.Before(cutoff) {
					delete(rl.buckets, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()

	return rl
}

// Allow checks if client IP can perform a request.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	bucket, exists := rl.buckets[ip]
	if !exists {
		rl.buckets[ip] = &ClientBucket{
			tokens:     rl.capacity - 1.0,
			lastRefill: now,
		}
		return true
	}

	// Refill tokens based on elapsed duration
	elapsed := now.Sub(bucket.lastRefill).Seconds()
	bucket.tokens += elapsed * rl.refillRate
	if bucket.tokens > rl.capacity {
		bucket.tokens = rl.capacity
	}
	bucket.lastRefill = now

	if bucket.tokens >= 1.0 {
		bucket.tokens -= 1.0
		return true
	}

	return false
}

// Middleware creates an HTTP middleware enforcing rate limits.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !rl.Allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "10")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"rate_limit_exceeded","message":"Too many requests. Please try again later."}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// JWTMiddleware validates Bearer tokens on protected endpoints.
func JWTMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"unauthorized","message":"Missing Authorization header"}`))
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"unauthorized","message":"Malformed Authorization header, expected 'Bearer <token>'"}`))
			return
		}

		claims, err := VerifyJWT(parts[1])
		if err != nil || claims.TokenType != "access" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"unauthorized","message":"invalid or expired access token"}`))
			return
		}

		// Inject verified claims into request context
		ctx := context.WithValue(r.Context(), UserContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// SecurityHeadersMiddleware injects defense-in-depth headers on all API responses.
func SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		w.Header().Set("Content-Security-Policy", "default-src 'self'")
		next.ServeHTTP(w, r)
	})
}

func isTrustedProxy(ip net.IP) bool {
	if ip == nil {
		return false
	}
	for _, raw := range strings.Split(os.Getenv("PANEL_TRUSTED_PROXY_CIDRS"), ",") {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		_, cidr, err := net.ParseCIDR(trimmed)
		if err == nil && cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// extractIP obtains the client IP address considering reverse proxy headers.
// When trusted proxies are configured, it traverses X-Forwarded-For from right to left
// and selects the first untrusted IP to prevent client-side header spoofing.
func extractIP(r *http.Request) string {
	remote := r.RemoteAddr
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		host = remote
	}
	if os.Getenv("PANEL_TRUST_PROXY") != "true" {
		return host
	}
	remoteIP := net.ParseIP(host)
	if !isTrustedProxy(remoteIP) {
		return host
	}
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			ipStr := strings.TrimSpace(parts[i])
			ip := net.ParseIP(ipStr)
			if ip == nil {
				break
			}
			if !isTrustedProxy(ip) {
				return ip.String()
			}
		}
	}
	if real := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); real != nil {
		if !isTrustedProxy(real) {
			return real.String()
		}
	}
	return host
}

func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
		origin:=strings.TrimSpace(r.Header.Get("Origin"))
		allowed:=false
		if origin!="" { for _,v:=range strings.Split(os.Getenv("PANEL_CORS_ORIGINS"),","){if strings.TrimSpace(v)==origin{allowed=true;break}} }
		if allowed { w.Header().Set("Access-Control-Allow-Origin",origin);w.Header().Set("Vary","Origin");w.Header().Set("Access-Control-Allow-Headers","Authorization, Content-Type");w.Header().Set("Access-Control-Allow-Methods","GET, POST, PUT, DELETE, OPTIONS") }
		if r.Method==http.MethodOptions { if allowed {w.WriteHeader(http.StatusNoContent)} else {w.WriteHeader(http.StatusForbidden)};return }
		next.ServeHTTP(w,r)
	})
}

