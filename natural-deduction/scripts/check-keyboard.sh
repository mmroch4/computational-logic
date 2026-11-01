#!/usr/bin/env bash
# Navegação só com teclado nas páginas PT e EN (scripts/check-keyboard.mjs). Uso: scripts/check-keyboard.sh
# Arranca o servidor local se ainda não estiver a correr (e pára-o no fim).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
server_up() { curl -s -o /dev/null "http://127.0.0.1:$PORT/"; }

if ! server_up; then
  node "$ROOT/scripts/serve.mjs" "$PORT" >/dev/null 2>&1 &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
  for _ in $(seq 1 50); do server_up && break; sleep 0.1; done
  server_up || { echo "Não consegui arrancar o servidor na porta $PORT" >&2; exit 1; }
fi

node "$ROOT/scripts/check-keyboard.mjs" "http://127.0.0.1:$PORT"
