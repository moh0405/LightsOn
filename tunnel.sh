#!/usr/bin/env bash
# Exposes the web app (5173) over HTTPS so phone sensors work.
set -euo pipefail
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install it: brew install cloudflared" >&2
  exit 1
fi
exec cloudflared tunnel --url http://127.0.0.1:5173
