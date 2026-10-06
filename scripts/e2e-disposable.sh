#!/usr/bin/env bash
set -euo pipefail
ROOT="$(mktemp -d)"
SOCK="$ROOT/agent.sock"
SITES="$ROOT/sites"
VHOSTS="$ROOT/vhosts"
SSL="$ROOT/ssl"
mkdir -p "$SITES" "$VHOSTS" "$SSL"
cleanup(){ if [[ -n "${AGENT_PID:-}" ]]; then kill "$AGENT_PID" 2>/dev/null || true; fi; rm -rf "$ROOT"; }
trap cleanup EXIT

command -v docker >/dev/null
command -v curl >/dev/null

cat >"$ROOT/Dockerfile" <<'EOF'
FROM python:3.12-slim-bookworm
RUN pip install --no-cache-dir fastapi==0.116.1 uvicorn==0.35.0
EOF
docker build -t alfa-e2e-python:local "$ROOT" >/dev/null

(cd go-src && go build -o "$ROOT/panel-agentd" ./cmd/panel-agentd)
PANEL_SITES_DIR="$SITES" PANEL_PROXY_VHOST_DIR="$VHOSTS" PANEL_PROXY_SSL_DIR="$SSL" PANEL_AGENT_SOCKET="$SOCK" PANEL_SKIP_PROXY_ACTIVATION=true "$ROOT/panel-agentd" >"$ROOT/agent.log" 2>&1 &
AGENT_PID=$!
for _ in {1..50}; do [[ -S "$SOCK" ]] && break; sleep .1; done
[[ -S "$SOCK" ]]

payload='{"domain":"e2e.example.test","type":"python","base_dir":"'"$SITES"'","network_name":"panel-site-e2e","port":8000,"resources":{"cpu_limit":"1","memory_limit":"512M","memory_reservation":"128M","pids_limit":100},"security":{"no_new_privileges":true,"drop_caps":["ALL"],"add_caps":[],"read_only_rootfs":true,"uid":1001,"gid":1001},"python":{"python_version":"3.12","image":"alfa-e2e-python:local","runner":"uvicorn","app_module":"main:app","workers":1,"threads":1,"auto_install_reqs":false,"virtualenv_path":"/opt/venv"},"proxy":{"enable_ssl":false,"enable_websocket":true,"max_body_size_mb":100,"upstream_port":8000,"hsts":false},"env_vars":{}}'
curl --fail --silent --show-error --unix-socket "$SOCK" -H 'Content-Type: application/json' -d "{\"operation\":\"create_site\",\"domain\":\"e2e.example.test\",\"payload\":$payload}" http://agent/v1/operate >/dev/null
mkdir -p "$SITES/e2e.example.test/app"
cat >"$SITES/e2e.example.test/app/main.py" <<'EOF'
from fastapi import FastAPI
app = FastAPI()
@app.get("/healthz")
def healthz(): return {"status":"ok"}
EOF
curl --fail --silent --show-error --unix-socket "$SOCK" -H 'Content-Type: application/json' -d '{"operation":"start","domain":"e2e.example.test"}' http://agent/v1/operate >/dev/null
for _ in {1..60}; do
  state="$(docker inspect -f '{{.State.Running}}' site_python_e2e_example_test 2>/dev/null || true)"
  [[ "$state" == "true" ]] && break
  sleep .5
done
[[ "$state" == "true" ]]
curl --fail --silent --show-error --unix-socket "$SOCK" -H 'Content-Type: application/json' -d '{"operation":"status","domain":"e2e.example.test"}' http://agent/v1/operate >/dev/null
curl --fail --silent --show-error --unix-socket "$SOCK" -H 'Content-Type: application/json' -d '{"operation":"backup_create","domain":"e2e.example.test"}' http://agent/v1/operate >/dev/null
curl --fail --silent --show-error --unix-socket "$SOCK" -H 'Content-Type: application/json' -d '{"operation":"stop","domain":"e2e.example.test"}' http://agent/v1/operate >/dev/null
curl --fail --silent --show-error --unix-socket "$SOCK" -H 'Content-Type: application/json' -d '{"operation":"delete","domain":"e2e.example.test","purge":true}' http://agent/v1/operate >/dev/null
echo "ALFA-PANEL disposable Docker E2E: PASS"
