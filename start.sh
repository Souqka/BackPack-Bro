#!/usr/bin/env bash
# Double-click on macOS (rename/copy to start.command) or run: ./start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

need_node() {
  echo "Node.js 20+ is required. Install it from https://nodejs.org/ then run this file again." >&2
  exit 1
}

command -v node >/dev/null 2>&1 || need_node
command -v npm >/dev/null 2>&1 || need_node

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  echo "Found Node.js $(node -v); this project needs 20 or newer." >&2
  exit 1
fi

port_in_use() {
  if command -v curl >/dev/null 2>&1 && curl -sf "${URL}" >/dev/null 2>&1; then
    return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn | grep -q ":${PORT} "
    return $?
  fi
  return 1
}

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "${URL}" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${URL}" >/dev/null 2>&1 || true
  fi
}

wait_then_open() {
  for _ in $(seq 1 60); do
    if command -v curl >/dev/null 2>&1 && curl -sf "${URL}" >/dev/null 2>&1; then
      open_browser
      return 0
    fi
    sleep 1
  done
  open_browser
}

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if port_in_use; then
  echo "Server already running at ${URL}"
  open_browser
  exit 0
fi

echo "Starting local server at ${URL}"
wait_then_open &
exec npm run dev
