#!/usr/bin/env bash
# Constrói a cópia nova do monorepo. Corre uma vez, e nunca faz push nem toca nos originais.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$(dirname "$HERE")"
ND="$SOURCE/natural-deduction"
TARGET="$(dirname "$SOURCE")/computational-logic-monorepo"
SAT_BASE=ac9dfe8
TRAILER=$'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_019NVHTAYYGFd2iZBQGxzhbG'

[ ! -e "$TARGET" ] || { echo "Já existe: $TARGET"; exit 1; }
[ -z "$(git -C "$ND" status --porcelain)" ] || { echo "natural-deduction tem alterações"; exit 1; }

git clone -q git@github.com:mmroch4/computational-logic.git "$TARGET"
cd "$TARGET"
[ "$(git rev-parse --short=7 HEAD)" = "$SAT_BASE" ] || { echo "O main já não está em $SAT_BASE"; exit 1; }
git switch -q -c monorepo

mkdir sat
git ls-tree --name-only HEAD | grep -vx sat | xargs -I{} git mv {} sat/
git commit -q -m "Move o site do SAT para sat/" -m "$TRAILER"

git remote add nd "$ND"
git fetch -q nd master
git merge -q -s ours --no-commit --allow-unrelated-histories nd/master
git read-tree --prefix=natural-deduction/ -u nd/master
git commit -q -m "Junta a dedução natural com o histórico" -m "$TRAILER"
git remote remove nd

test "$(git rev-parse HEAD:sat)" = "$(git rev-parse "$SAT_BASE^{tree}")"
test "$(git rev-parse HEAD:natural-deduction)" = "$(git -C "$ND" rev-parse 'HEAD^{tree}')"

printf 'node_modules/\ntmp/\n.vercel/\n.DS_Store\n.claude/\nralph/logs/\n' > .gitignore
mkdir -p ralph scripts
cp "$HERE/run.sh" "$HERE/PROMPT.md" "$HERE/PLAN.md" "$HERE/bootstrap.sh" ralph/
cp "$SOURCE/MONOREPO-PLAN.md" ralph/MONOREPO-PLAN.md
: > ralph/NOTES.md
cp "$HERE/test-all.sh" scripts/test-all.sh
chmod +x ralph/run.sh ralph/bootstrap.sh scripts/test-all.sh
git add .gitignore ralph scripts
git commit -q -m "Prepara o loop da migração" -m "$TRAILER"

(cd sat && npm ci --silent)
(cd natural-deduction && npm ci --silent)
cp -a "$ND/conteudos" natural-deduction/ 2>/dev/null || true
git status --short
git log --oneline -3
