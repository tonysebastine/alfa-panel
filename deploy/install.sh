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

install -d -m 0755 "$PREFIX" "$BIN" "$ETC" "$DATA/data" "$DATA/backups" "$DATA/apps/sites" /run/alfa-panel
getent group alfa-panel-agent >/dev/null || groupadd --system alfa-panel-agent
id alfa-panel >/dev/null 2>&1 || useradd --system --home "$PREFIX" --shell /usr/sbin/nologin alfa-panel
usermod -a -G alfa-panel-agent alfa-panel

if [[ ! -f "$ETC/api.env" ]]; then
  install -m 0640 -o root -g alfa-panel "$REPO_ROOT/.env.example" "$ETC/api.env"
  echo "Created $ETC/api.env. Configure PANEL_JWT_SECRET, PANEL_MASTER_KEY, admin credentials and PANEL_TOTP_SECRET before starting."
fi

(cd "$REPO_ROOT/go-src" && go build -trimpath -ldflags="-s -w" -o "$BIN/panel-api" ./cmd/panel-api)
(cd "$REPO_ROOT/go-src" && go build -trimpath -ldflags="-s -w" -o "$BIN/panel-agentd" ./cmd/panel-agentd)

chmod 0755 "$BIN/panel-api" "$BIN/panel-agentd"
install -m 0644 "$REPO_ROOT/deploy/alfa-panel-agent.service" /etc/systemd/system/alfa-panel-agent.service
install -m 0644 "$REPO_ROOT/deploy/alfa-panel-api.service" /etc/systemd/system/alfa-panel-api.service

chown -R root:root "$PREFIX"
chown -R root:root "$DATA"
chmod 0700 "$DATA/data" "$DATA/backups"
chmod 0750 /run/alfa-panel
systemctl daemon-reload
echo "Install complete. Configure $ETC/api.env, then: systemctl enable --now alfa-panel-agent alfa-panel-api"
