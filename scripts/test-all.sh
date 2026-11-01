#!/usr/bin/env bash
# Corre os testes de cada projeto do monorepo, em série. Falha se algum falhar.
set -uo pipefail
cd "$(dirname "$0")/.."

failed=()
for project in sat natural-deduction hub; do
  [ -f "$project/package.json" ] || continue
  echo "== $project"
  (cd "$project" && npm test) || failed+=("$project")
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "Falharam: ${failed[*]}"
  exit 1
fi
echo "Todos os testes passaram."
