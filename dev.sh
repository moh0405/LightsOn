#!/usr/bin/env bash
# Starts the server (8000) and web app (5173). Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")"
trap 'kill 0' EXIT
(cd server && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
(pnpm --filter @lights-on/web dev) &
wait
