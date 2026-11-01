#!/usr/bin/env bash
# Testa o scripts/test-all.sh em cópias descartáveis do repositório, com suites falsas.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$ROOT/tmp"
WORK=$(mktemp -d "$ROOT/tmp/test-all.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

failures=0

suite() { # repositório, projeto, código de saída do npm test
  mkdir -p "$1/$2"
  printf '{"scripts":{"test":"echo a correr %s; exit %s"}}\n' "$2" "$3" > "$1/$2/package.json"
}

repo() { # nome: cria uma cópia só com o script
  mkdir -p "$WORK/$1/scripts"
  cp "$ROOT/scripts/test-all.sh" "$WORK/$1/scripts/"
  echo "$WORK/$1"
}

check() { # nome, repositório, código esperado, texto esperado na saída
  local output code
  output=$("$2/scripts/test-all.sh" 2>&1)
  code=$?
  if [ "$code" = "$3" ] && grep -qF -- "$4" <<<"$output"; then
    echo "ok: $1"
  else
    echo "FALHOU: $1 (código $code, esperado $3; texto esperado: $4)"
    echo "$output"
    failures=$((failures + 1))
  fi
}

r=$(repo pass); suite "$r" sat 0; suite "$r" natural-deduction 0
check "passa com as duas suites" "$r" 0 "Todos os testes passaram."

r=$(repo sat-fails); suite "$r" sat 1; suite "$r" natural-deduction 0
check "falha se o SAT falhar" "$r" 1 "Falharam: sat"
check "corre a suite seguinte depois de uma falha" "$r" 1 "a correr natural-deduction"

r=$(repo nd-fails); suite "$r" sat 0; suite "$r" natural-deduction 3
check "falha se a dedução natural falhar" "$r" 1 "Falharam: natural-deduction"

r=$(repo both-fail); suite "$r" sat 1; suite "$r" natural-deduction 1
check "lista as duas falhas" "$r" 1 "Falharam: sat natural-deduction"

r=$(repo missing); suite "$r" sat 0
check "falha se faltar uma suite obrigatória" "$r" 1 "Falta natural-deduction/package.json."

r=$(repo hub-passes); suite "$r" sat 0; suite "$r" natural-deduction 0; suite "$r" hub 0
check "inclui o hub quando existe" "$r" 0 "a correr hub"

r=$(repo hub-fails); suite "$r" sat 0; suite "$r" natural-deduction 0; suite "$r" hub 1
check "falha se o hub falhar" "$r" 1 "Falharam: hub"

r=$(repo hub-broken); suite "$r" sat 0; suite "$r" natural-deduction 0; mkdir "$r/hub"
check "falha se o hub existir sem package.json" "$r" 1 "Falta hub/package.json."

if [ "$failures" -gt 0 ]; then
  echo "$failures verificação(ões) falharam."
  exit 1
fi
echo "Todas as verificações passaram."
