#!/usr/bin/env bash
# Corre o check-page.sh nas 10 páginas (PT e EN) + 404, normal, com movimento reduzido (REDUCED_MOTION=1,
# screenshots em <pasta-saída>/reduced-motion) e com o localStorage bloqueado (BLOCK_STORAGE=1,
# em <pasta-saída>/blocked-storage). Uso: scripts/check-all.sh [pasta-saída]   (por omissão: tmp/screens/all)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/tmp/screens/all}"
PAGES=(/ /provar /passo-a-passo /aprender /exercicios /en /en/prove /en/step-by-step /en/learn /en/exercises /404)
FAILED=0

for page in "${PAGES[@]}"; do
  "$ROOT/scripts/check-page.sh" "$page" "$OUT" || FAILED=$((FAILED + 1))
  REDUCED_MOTION=1 "$ROOT/scripts/check-page.sh" "$page" "$OUT/reduced-motion" || FAILED=$((FAILED + 1))
  BLOCK_STORAGE=1 "$ROOT/scripts/check-page.sh" "$page" "$OUT/blocked-storage" || FAILED=$((FAILED + 1))
done

if [ "$FAILED" -gt 0 ]; then
  echo "check-all: $FAILED verificação(ões) com erros" >&2
  exit 1
fi
echo "check-all: ${#PAGES[@]} páginas sem erros (normal, com movimento reduzido e sem localStorage)"
