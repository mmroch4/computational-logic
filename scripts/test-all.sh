#!/usr/bin/env bash
# Corre os testes de cada projeto do monorepo, em série. Falha se algum falhar.
# Corre sempre todas as suites, para o resumo final mostrar todas as falhas.
set -uo pipefail
cd "$(dirname "$0")/.."

required=(sat natural-deduction)
optional=(hub) # só passa a contar quando existir

failed=()
summary=()

run_suite() { # projeto
  local project=$1 start=$SECONDS status=ok
  echo "== $project"
  if [ ! -f "$project/package.json" ]; then
    echo "Falta $project/package.json."
    status=FALHOU
  elif ! (cd "$project" && npm test); then
    status=FALHOU
  fi
  [ "$status" = ok ] || failed+=("$project")
  summary+=("$(printf '%-20s %-7s %4d s' "$project" "$status" "$((SECONDS - start))")")
}

for project in "${required[@]}"; do
  run_suite "$project"
done
for project in "${optional[@]}"; do
  if [ -e "$project" ]; then run_suite "$project"; fi
done

echo
echo "== Resumo"
printf '%s\n' "${summary[@]}"

if [ "${#failed[@]}" -gt 0 ]; then
  echo "Falharam: ${failed[*]}"
  exit 1
fi
echo "Todos os testes passaram."
