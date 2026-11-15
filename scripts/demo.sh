#!/usr/bin/env bash
# One command for the human test / demo: server + web + cloudflared tunnel, with public URLs printed.
#   ./scripts/demo.sh              live demo (DATA_MODE=kit, AGENT_MODE=live, DEMO_MODE=1; spends Bedrock budget)
#   ./scripts/demo.sh --fixtures   zero-cost rehearsal (DATA_MODE=fixtures, AGENT_MODE=fake)
#   ./scripts/demo.sh --dry-run    print what would start, start nothing (combine with --fixtures)
#   ./scripts/demo.sh --no-tunnel  local only (phone sensors need HTTPS, so only for laptop checks)
# Ctrl-C stops everything. Key values are never printed; only key names.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

FIXTURES=0; DRY=0; TUNNEL=1
for arg in "$@"; do
  case "$arg" in
    --fixtures) FIXTURES=1 ;;
    --dry-run) DRY=1 ;;
    --no-tunnel) TUNNEL=0 ;;
    -h|--help) sed -n 2,7p "$0"; exit 0 ;;
    *) echo "unknown flag: $arg (try --help)" >&2; exit 2 ;;
  esac
done

if [ "$FIXTURES" = 1 ]; then DATA_MODE=fixtures; AGENT_MODE=fake; else DATA_MODE=kit; AGENT_MODE=live; fi
DEMO_MODE=1
export DATA_MODE AGENT_MODE DEMO_MODE

# --- preflight: names only, never values ---
fail=0
[ -f .env ] || { echo "MISSING .env at repo root (cp .env.example .env)"; fail=1; }
has_key() { grep -Eq "^[[:space:]]*$1=[^[:space:]#]+" .env 2>/dev/null; }
need=(HOST_PIN)
[ "$AGENT_MODE" = live ] && need+=(AWS_REGION)
for k in "${need[@]}"; do
  if has_key "$k"; then echo "ok       $k set"; else echo "MISSING  $k"; fail=1; fi
done
if [ "$AGENT_MODE" = live ]; then
  if has_key AWS_ACCESS_KEY_ID && has_key AWS_SECRET_ACCESS_KEY; then echo "ok       AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY set"
  elif has_key AWS_PROFILE || [ -n "${AWS_PROFILE:-}" ]; then echo "ok       AWS_PROFILE set"
  else echo "MISSING  AWS credentials (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, or AWS_PROFILE)"; fail=1; fi
fi
has_key COSTAR_DATA_DIR && echo "ok       COSTAR_DATA_DIR set (optional)" || echo "absent   COSTAR_DATA_DIR (optional; default data/costar)"
for k in ELEVENLABS_API_KEY LANGSMITH_API_KEY PHOTON_PROJECT_ID; do
  has_key "$k" && echo "ok       $k set (optional)" || echo "absent   $k (optional; fallbacks apply)"
done
KIT_DIR="$(grep -E '^[[:space:]]*COSTAR_DATA_DIR=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"'"' || true)"
KIT_DIR="${KIT_DIR:-data/costar}"
if [ "$DATA_MODE" = kit ] && [ ! -f "$KIT_DIR/index.sqlite" ]; then
  echo "MISSING  $KIT_DIR/index.sqlite (run: uv run --project server python scripts/build_kit_index.py)"; fail=1
fi
[ "$TUNNEL" = 1 ] && ! command -v cloudflared >/dev/null 2>&1 && { echo "MISSING  cloudflared (brew install cloudflared)"; fail=1; }

echo "mode     DATA_MODE=$DATA_MODE AGENT_MODE=$AGENT_MODE DEMO_MODE=$DEMO_MODE"

if [ "$DRY" = 1 ]; then
  echo "--- dry run: would start ---"
  echo "server   (cd server && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000)"
  echo "web      pnpm --filter @lights-on/web dev   (port 5173)"
  [ "$TUNNEL" = 1 ] && echo "tunnel   cloudflared tunnel --url http://127.0.0.1:5173; then PUBLIC_BASE_URL=<tunnel url>"
  echo "urls     <base>/screen  <base>/play  <base>/admin   (HOST_PIN from .env)"
  echo "preflight problems: $fail (a real run would stop if non-zero)"
  exit 0
fi
[ "$fail" = 0 ] || { echo "Fix the above, or use --fixtures for a zero-cost rehearsal." >&2; exit 1; }

# The server reads .env itself; shell exports (above) take precedence over it.
LOGDIR="$(mktemp -d)"
PIDS=()
cleanup() { trap - EXIT INT TERM; echo; echo "stopping..."; for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; wait 2>/dev/null || true; rm -rf "$LOGDIR"; }
trap cleanup EXIT INT TERM

start_server() {
  (cd server && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000) >"$LOGDIR/server.log" 2>&1 &
  PIDS+=($!)
}
wait_http() { # url, tries
  for _ in $(seq 1 "$2"); do curl -fsS -o /dev/null "$1" 2>/dev/null && return 0; sleep 1; done; return 1
}

# Tunnel first so PUBLIC_BASE_URL is known before the server starts.
BASE="http://localhost:5173"
if [ "$TUNNEL" = 1 ]; then
  cloudflared tunnel --url http://127.0.0.1:5173 >"$LOGDIR/tunnel.log" 2>&1 &
  PIDS+=($!)
  echo "waiting for tunnel URL..."
  URL=""
  for _ in $(seq 1 60); do
    URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGDIR/tunnel.log" | head -1 || true)"
    [ -n "$URL" ] && break; sleep 1
  done
  [ -n "$URL" ] || { echo "tunnel did not come up in 60 s; see below" >&2; tail -5 "$LOGDIR/tunnel.log" >&2; exit 1; }
  BASE="$URL"
fi
export PUBLIC_BASE_URL="$BASE"

start_server
(pnpm --filter @lights-on/web dev) >"$LOGDIR/web.log" 2>&1 &
PIDS+=($!)

echo "waiting for server and web..."
wait_http http://127.0.0.1:8000/api/health 60 || wait_http http://127.0.0.1:8000/ 5 || { echo "server not up; tail:" >&2; tail -15 "$LOGDIR/server.log" >&2; exit 1; }
wait_http http://127.0.0.1:5173/ 60 || { echo "web not up; tail:" >&2; tail -15 "$LOGDIR/web.log" >&2; exit 1; }
if [ "$TUNNEL" = 1 ]; then
  echo "waiting for tunnel to answer..."
  wait_http "$BASE/" 60 || echo "WARNING: tunnel URL not answering yet; give it 20 s and reload"
fi

cat <<MSG

================ LIGHTS ON IS UP ================
 mode    $DATA_MODE / $AGENT_MODE / DEMO_MODE=$DEMO_MODE
 screen  $BASE/screen   (projector laptop; fullscreen)
 play    $BASE/play     (phones; the QR on /screen points here)
 admin   $BASE/admin    (host controls; enter HOST_PIN from .env)
 HOST_PIN: use the value in .env (not printed here)
 Trace panel: press T on /screen.   Ctrl-C stops everything.
=================================================
MSG
wait
