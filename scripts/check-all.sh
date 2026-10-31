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

# A Provar com uma prova aberta, nos dois idiomas e nas mesmas 3 condições: é aí que está o editor.
MIXED="$(node "$ROOT/scripts/prove-states.mjs" mixed)"
COMPLETE="$(node "$ROOT/scripts/prove-states.mjs" complete)"
HINT='document.querySelector("[data-assist=hint]").click();
  for (let i = 0; i < 100 && !document.querySelector(".assist__levels"); i++) await new Promise((r) => setTimeout(r, 50));
  if (!document.querySelector(".assist__levels")) throw new Error("a dica não apareceu");'
check_state() { # check_state <pasta> <caminho> <clique ou vazio> <EVAL ou vazio>
  for mode in "" REDUCED_MOTION BLOCK_STORAGE; do
    env ${mode:+$mode=1} FULL_PAGE=1 CLICK="$3" EVAL="$4" "$ROOT/scripts/check-page.sh" "$2" "$OUT/prove/$1/${mode:-normal}" || FAILED=$((FAILED + 1))
  done
}
for prove in /provar /en/prove; do
  lang="$(echo "$prove" | tr -c 'a-z\n' '-')"
  check_state "mixed$lang" "$prove?$MIXED" "" ""
  check_state "guided$lang" "$prove?$MIXED" "[data-mode=guided]" ""
  check_state "complete$lang" "$prove?$COMPLETE" "" ""
  check_state "complete-guided$lang" "$prove?$COMPLETE" "[data-mode=guided]" ""
  check_state "hint$lang" "$prove?$MIXED" "" "$HINT"
  check_state "rules$lang" "$prove?$MIXED" ".rules-panel__toggle" ""
done

if [ "$FAILED" -gt 0 ]; then
  echo "check-all: $FAILED verificação(ões) com erros" >&2
  exit 1
fi
echo "check-all: ${#PAGES[@]} páginas sem erros (normal, com movimento reduzido e sem localStorage)"
