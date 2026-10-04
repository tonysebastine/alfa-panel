package sitegenerator

import (
	"strings"
	"testing"
)

func TestRenderVhostWithHTTPS(t *testing.T) {
	cfg := NewSiteConfig("api.production.internal", SiteTypePython)
	cfg.Port = 8000
	cfg.Proxy.EnableSSL = true
	cfg.Proxy.HSTS = true
	cfg.Proxy.EnableWebSocket = true
	cfg.Proxy.MaxBodySizeMB = 50

	pvc := BuildVhostConfig(cfg)
	out, err := RenderVhost(pvc)
	if err != nil {
		t.Fatalf("Failed to render vhost template: %v", err)
	}

	// 1. Verify upstream definition
	expectedUpstream := "upstream upstream_site_python_api_production_internal {"
	if !strings.Contains(out, expectedUpstream) {
		t.Errorf("Missing expected upstream declaration: %s", expectedUpstream)
	}
	expectedServer := "server site_python_api_production_internal:8000 max_fails=3"
	if !strings.Contains(out, expectedServer) {
		t.Errorf("Missing expected upstream server: %s", expectedServer)
	}

	// 2. Verify Port 80 ACME and HTTPS redirect
	if !strings.Contains(out, "listen 80;") {
		t.Errorf("Missing listen 80")
	}
	if !strings.Contains(out, "location ^~ /.well-known/acme-challenge/") {
		t.Errorf("Missing ACME challenge location block")
	}
	if !strings.Contains(out, "return 301 https://$host$request_uri;") {
		t.Errorf("Missing 301 redirect to HTTPS")
	}

	// 3. Verify Port 443 SSL block
	if !strings.Contains(out, "listen 443 ssl http2;") {
		t.Errorf("Missing listen 443 ssl http2")
	}
	if !strings.Contains(out, "ssl_certificate /opt/panel/ssl/api.production.internal/fullchain.pem;") {
		t.Errorf("Missing fullchain certificate path")
	}
	if !strings.Contains(out, "Strict-Transport-Security") {
		t.Errorf("Missing HSTS header")
	}

	// 4. Verify WebSocket upgrade map
	if !strings.Contains(out, "map $http_upgrade $connection_upgrade") {
		t.Errorf("Missing websocket upgrade map")
	}
	if !strings.Contains(out, "proxy_set_header Upgrade $http_upgrade;") {
		t.Errorf("Missing Upgrade proxy header")
	}

	// 5. Verify body size limit
	if !strings.Contains(out, "client_max_body_size 50M;") {
		t.Errorf("Missing client_max_body_size 50M")
	}
}

func TestRenderVhostPlainHTTP(t *testing.T) {
	cfg := NewSiteConfig("dev.tomcat.internal", SiteTypeTomcat)
	cfg.Port = 8080
	cfg.Proxy.EnableSSL = false

	pvc := BuildVhostConfig(cfg)
	out, err := RenderVhost(pvc)
	if err != nil {
		t.Fatalf("Failed to render vhost template: %v", err)
	}

	// Should not have listen 443 block
	if strings.Contains(out, "listen 443 ssl") {
		t.Errorf("Plain HTTP vhost should not contain listen 443 block")
	}

	// Port 80 should directly proxy_pass
	if !strings.Contains(out, "proxy_pass http://upstream_site_tomcat_dev_tomcat_internal;") {
		t.Errorf("Plain HTTP vhost should directly proxy_pass on port 80")
	}
}
