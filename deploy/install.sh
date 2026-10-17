#!/usr/bin/env bash
set -euo pipefail

PREFIX="/opt/alfa-panel"
ETC="/etc/alfa-panel"
DATA="/opt/panel"
BIN="$PREFIX/bin"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi
command -v go >/dev/null || { echo "Go 1.26+ is required."; exit 1; }
command -v docker >/dev/null || { echo "Docker is required."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon is not reachable."; exit 1; }

install -d -m 0755 "$PREFIX" "$BIN" "$PREFIX/releases" "$ETC" "$DATA/data" "$DATA/backups" "$DATA/apps/sites"
getent group alfa-panel-agent >/dev/null || groupadd --system alfa-panel-agent
id alfa-panel >/dev/null 2>&1 || useradd --system --home "$PREFIX" --shell /usr/sbin/nologin alfa-panel
usermod -a -G alfa-panel-agent alfa-panel

if [[ ! -f "$ETC/api.env" ]]; then
  install -m 0640 -o root -g alfa-panel "$REPO_ROOT/.env.example" "$ETC/api.env"
  echo "Created $ETC/api.env. Configure PANEL_JWT_SECRET, PANEL_MASTER_KEY, admin credentials and PANEL_TOTP_SECRET before starting."
fi

RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
RELEASE_DIR="$PREFIX/releases/$RELEASE_ID"
install -d -m 0755 "$RELEASE_DIR"
(cd "$REPO_ROOT/go-src" && go build -trimpath -ldflags="-s -w" -o "$RELEASE_DIR/panel-api" ./cmd/panel-api)
(cd "$REPO_ROOT/go-src" && go build -trimpath -ldflags="-s -w" -o "$RELEASE_DIR/panel-agentd" ./cmd/panel-agentd)
(cd "$REPO_ROOT/go-src" && go build -trimpath -ldflags="-s -w" -o "$RELEASE_DIR/panel-agent" ./cmd/panel-agent)
chmod 0755 "$RELEASE_DIR"/*
ln -sfn "$RELEASE_DIR/panel-api" "$BIN/panel-api"
ln -sfn "$RELEASE_DIR/panel-agentd" "$BIN/panel-agentd"
ln -sfn "$RELEASE_DIR/panel-agent" "$BIN/panel-agent"

install -m 0644 "$REPO_ROOT/deploy/alfa-panel-agent.service" /etc/systemd/system/alfa-panel-agent.service
install -m 0644 "$REPO_ROOT/deploy/alfa-panel-api.service" /etc/systemd/system/alfa-panel-api.service
install -m 0644 "$REPO_ROOT/deploy/alfa-panel-acme.service" "$REPO_ROOT/deploy/alfa-panel-acme.timer" "$REPO_ROOT/deploy/alfa-panel-backup-retention.service" "$REPO_ROOT/deploy/alfa-panel-backup-retention.timer" /etc/systemd/system/

chown -R root:root "$PREFIX"
find "$PREFIX/releases" -mindepth 1 -maxdepth 1 -type d -printf "%T@ %p\\n" 2>/dev/null | sort -nr | tail -n +4 | cut -d" " -f2- | xargs -r rm -rf
chown -R root:root "$DATA"
chmod 0700 "$DATA/data" "$DATA/backups"
systemctl daemon-reload
systemctl restart alfa-panel-agent alfa-panel-api
for _ in {1..30}; do if curl -fsS http://127.0.0.1:8088/healthz >/dev/null 2>&1; then break; fi; sleep 1; done
curl -fsS http://127.0.0.1:8088/healthz >/dev/null || { echo "ALFA-PANEL health check failed; inspect systemd status and rollback to the previous release if required." >&2; exit 1; }
echo "Install complete. Configure $ETC/api.env, then: systemctl enable --now alfa-panel-agent alfa-panel-api alfa-panel-acme.timer alfa-panel-backup-retention.timer"
