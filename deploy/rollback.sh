#!/usr/bin/env bash
set -euo pipefail
PREFIX=/opt/alfa-panel
BIN="$PREFIX/bin"
RELEASES="$PREFIX/releases"
if [[ "$(id -u)" -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi
target="${1:-}"
if [[ -z "$target" ]]; then
  target="$(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | sed -n '2p' | cut -d' ' -f2-)"
fi
[[ -n "$target" && -d "$target" ]] || { echo "No rollback release found." >&2; exit 1; }
for name in panel-api panel-agentd panel-agent; do [[ -x "$target/$name" ]] || { echo "Invalid release: missing $name" >&2; exit 1; }; done
for svc in alfa-panel-agent alfa-panel-api; do systemctl stop "$svc" || true; done
ln -sfn "$target/panel-api" "$BIN/panel-api"
ln -sfn "$target/panel-agentd" "$BIN/panel-agentd"
ln -sfn "$target/panel-agent" "$BIN/panel-agent"
systemctl start alfa-panel-agent alfa-panel-api
for _ in {1..30}; do if curl -fsS http://127.0.0.1:8088/healthz >/dev/null 2>&1; then echo "Rollback successful: $target"; exit 0; fi; sleep 1; done
echo "Rollback health check failed." >&2
exit 1
