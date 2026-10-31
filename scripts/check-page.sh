#!/usr/bin/env bash
# Verificação visual de uma página: screenshots a 1280px e 390px e falha se houver erros.
# Uso: [FULL_PAGE=1] [PDF=1] [REDUCED_MOTION=1] [BLOCK_STORAGE=1] [MEASURE=1] [CHROME_LANG=pt-PT] [EXPECT_404="texto"] [CLICK="seletor"] [EVAL="js"] scripts/check-page.sh <caminho> [pasta-saída]
#   ex.: scripts/check-page.sh "/provar" tmp/screens/provar   (por omissão: tmp/screens)
# Arranca o servidor local na porta 8765 se ainda não estiver a correr (e pára-o no fim).
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <caminho> [pasta-saída]" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
PAGE_PATH="$1"
OUT_DIR="${2:-$ROOT/tmp/screens}"
case "$PAGE_PATH" in /*) ;; *) PAGE_PATH="/$PAGE_PATH" ;; esac

server_up() { curl -s -o /dev/null "http://127.0.0.1:$PORT/"; }

SERVER_PID=""
if ! server_up; then
  node "$ROOT/scripts/serve.mjs" "$PORT" >/dev/null 2>&1 &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
  for _ in $(seq 1 50); do server_up && break; sleep 0.1; done
  server_up || { echo "Não consegui arrancar o servidor na porta $PORT" >&2; exit 1; }
fi

node "$ROOT/scripts/check-page.mjs" "http://127.0.0.1:$PORT$PAGE_PATH" "$OUT_DIR"
