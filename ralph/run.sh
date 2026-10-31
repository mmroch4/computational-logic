#!/usr/bin/env bash
# Corre as tarefas de ralph/PLAN.md, uma sessão nova do Claude por tarefa.
#
#   ralph/run.sh             corre até uma pausa, um bloqueio ou o fim
#   ralph/run.sh --dry-run   mostra a próxima tarefa e o prompt, sem chamar o Claude
#   ralph/run.sh --status    mostra o progresso
#   ralph/run.sh --continue  aprova a pausa atual e continua
#
# Variáveis: MODEL (opus), MAX_ATTEMPTS (3), TASK_TIMEOUT (3600 s), LIMIT_WAIT (1800 s),
# MAX_LIMIT_WAITS (12), MAX_TASKS (0 = sem limite).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PLAN=ralph/PLAN.md
LOGS=ralph/logs
SAT_SOURCE="${SAT_SOURCE:-../davis-putnam-sat}"
MODEL="${MODEL:-opus}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
TASK_TIMEOUT="${TASK_TIMEOUT:-3600}"
LIMIT_WAIT="${LIMIT_WAIT:-1800}"
MAX_LIMIT_WAITS="${MAX_LIMIT_WAITS:-12}"
MAX_TASKS="${MAX_TASKS:-0}"

ALLOWED_TOOLS=(
  Read Write Edit Glob Grep
  "Bash(node *)" "Bash(npm test*)" "Bash(npm run *)" "Bash(npm install*)" "Bash(npm ci*)"
  "Bash(UPDATE_SNAPSHOTS=1 npm test*)" "Bash(npx tailwindcss *)" "Bash(npx --yes lighthouse*)"
  "Bash(scripts/*)" "Bash(./scripts/*)" "Bash(PORT=* scripts/*)" "Bash(EN=1 scripts/*)"
  "Bash(REDUCED_MOTION=1 scripts/*)" "Bash(BLOCK_STORAGE=1 scripts/*)" "Bash(MEASURE=1 scripts/*)"
  "Bash(git status*)" "Bash(git diff*)" "Bash(git log*)" "Bash(git show*)"
  "Bash(git add *)" "Bash(git commit *)"
  "Bash(mkdir *)" "Bash(cp *)" "Bash(mv *)" "Bash(ls *)" "Bash(pwd)" "Bash(wc *)"
  "Bash(grep *)" "Bash(find *)" "Bash(chmod +x *)" "Bash(pdftoppm *)"
)
DENIED_TOOLS=(
  "Bash(git push*)" "Bash(git remote*)" "Bash(git config*)" "Bash(git reset*)"
  "Bash(rm -rf*)" "Bash(sudo *)" "Bash(curl *)" "Bash(wget *)"
  "Edit(.reference/**)" "Write(.reference/**)" "Edit(ralph/PLAN.md)" "Write(ralph/PLAN.md)"
  "Edit(ralph/run.sh)" "Write(ralph/run.sh)"
)

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

next_line() { grep -n -m1 -E '^### \[ \] ' "$PLAN" | cut -d: -f1; }
task_id() { sed -n "${1}p" "$PLAN" | sed -E 's/^### \[ \] ([A-Za-z0-9-]+).*/\1/'; }
task_block() { awk -v s="$1" 'NR==s{print; next} NR>s && /^##/{exit} NR>s{print}' "$PLAN"; }
mark_done() { sed -i "${1}s/^### \[ \]/### [x]/" "$PLAN"; }

status() {
  local done total
  done=$(grep -c -E '^### \[x\] ' "$PLAN")
  total=$(grep -c -E '^### \[[ x]\] ' "$PLAN")
  echo "Tarefas: $done de $total"
  local line
  line=$(next_line)
  if [ -n "$line" ]; then sed -n "${line}p" "$PLAN" | sed 's/^### \[ \] /Próxima: /'; else echo "Sem tarefas pendentes."; fi
}

bootstrap() {
  if [ ! -d .git ]; then
    git init -q
    log "Repositório git local criado."
  fi
  if [ ! -d .reference/sat ]; then
    [ -d "$SAT_SOURCE" ] || { log "Falta $SAT_SOURCE."; exit 1; }
    mkdir -p .reference/sat
    tar -C "$SAT_SOURCE" --exclude=.git --exclude=node_modules --exclude=tmp -cf - . \
      | tar -C .reference/sat -xf -
    log "Cópia de referência do SAT criada em .reference/sat."
  fi
  if [ ! -f .gitignore ]; then
    printf 'node_modules/\ntmp/\n.reference/\nralph/logs/\nconteudos/\n.claude/\n' > .gitignore
  fi
  if ! git rev-parse -q --verify HEAD >/dev/null; then
    git add .gitignore CLAUDE.md SPEC.md ralph/PLAN.md ralph/PROMPT.md ralph/NOTES.md ralph/run.sh
    git commit -q -m "Plano e especificação" \
      -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  fi
}

build_prompt() { # bloco, ficheiro com a falha anterior (opcional)
  cat ralph/PROMPT.md
  printf '\n## A tua tarefa\n\n%s\n' "$1"
  if [ -n "${2:-}" ] && [ -s "$2" ]; then
    printf '\n## Tentativa anterior\n\nA tentativa anterior falhou. O trabalho dela pode estar na árvore de trabalho, por commitar. Avalia-o antes de recomeçar. Motivo:\n\n```\n'
    cat "$2"
    printf '\n```\n'
  fi
}

run_claude() { # prompt, ficheiro json
  timeout "$TASK_TIMEOUT" claude -p "$1" \
    --model "$MODEL" \
    --output-format json \
    --setting-sources project \
    --strict-mcp-config \
    --disable-slash-commands \
    --tools "Read,Write,Edit,Glob,Grep,Bash" \
    --permission-mode acceptEdits \
    --allowedTools "${ALLOWED_TOOLS[@]}" \
    --disallowedTools "${DENIED_TOOLS[@]}" \
    < /dev/null > "$2" 2> "$2.err"
}

gate() { # valida sem confiar na palavra da sessão
  if [ -f package.json ]; then
    npm test > "$1" 2>&1 || { tail -40 "$1" > "$1.tail"; mv "$1.tail" "$1"; return 1; }
  fi
  if [ -n "$(git status --porcelain)" ]; then
    git status --short > "$1"
    echo "Ficaram alterações por commitar." >> "$1"
    return 1
  fi
  : > "$1"
}

run_task() { # linha
  local line=$1 id block attempt=1 waits=0 before fail json result
  id=$(task_id "$line")
  block=$(task_block "$line")
  before=$(git rev-parse HEAD)
  fail=$(mktemp)

  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    json="$LOGS/$id.$attempt.json"
    log "$id: tentativa $attempt de $MAX_ATTEMPTS"
    run_claude "$(build_prompt "$block" "$fail")" "$json"
    local code=$?
    result=$(jq -r '.result // empty' "$json" 2>/dev/null)

    if grep -qiE 'usage limit|rate limit|limit reached|hit your .*limit|overloaded' "$json" "$json.err" \
       && ! grep -q '<promise>' <<<"$result"; then
      waits=$((waits + 1))
      if [ "$waits" -gt "$MAX_LIMIT_WAITS" ]; then
        log "$id: limite de uso não passou. Volta a correr o script mais tarde."
        return 3
      fi
      log "$id: limite de uso, a aguardar ${LIMIT_WAIT}s ($waits de $MAX_LIMIT_WAITS)"
      sleep "$LIMIT_WAIT"
      continue
    fi

    if grep -q '<promise>BLOCKED' <<<"$result"; then
      log "$id: BLOQUEADA"
      grep -o '<promise>BLOCKED[^<]*' <<<"$result" | sed 's/<promise>//'
      return 2
    fi

    if [ "$code" -eq 124 ]; then
      echo "A sessão excedeu ${TASK_TIMEOUT}s." > "$fail"
    elif ! grep -q '<promise>TASK_DONE</promise>' <<<"$result"; then
      { echo "A sessão terminou sem TASK_DONE (código $code):"; tail -c 1500 <<<"$result"; } > "$fail"
    elif [ "$(git rev-parse HEAD)" = "$before" ]; then
      echo "A sessão declarou TASK_DONE sem fazer commit." > "$fail"
    elif gate "$fail"; then
      mark_done "$line"
      git add "$PLAN"
      git commit -q -m "ralph: $id concluída" \
        -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
      local cost
      cost=$(jq -r '.total_cost_usd // 0' "$LOGS/$id".*.json 2>/dev/null | awk '{s+=$1} END {printf "%.2f", s}')
      log "$id: concluída (custo estimado \$$cost)"
      rm -f "$fail"
      return 0
    fi
    log "$id: falhou: $(head -c 200 "$fail" | tr '\n' ' ')"
    attempt=$((attempt + 1))
  done
  log "$id: esgotou as tentativas. Vê $LOGS/$id.*.json"
  return 1
}

command -v jq >/dev/null || { echo "Falta o jq."; exit 1; }
mkdir -p "$LOGS"

case "${1:-}" in
  --status) status; exit 0 ;;
  --dry-run)
    line=$(next_line)
    [ -n "$line" ] || { echo "Sem tarefas pendentes."; exit 0; }
    build_prompt "$(task_block "$line")" ""
    exit 0 ;;
  --continue)
    line=$(next_line)
    if [ -n "$line" ] && [[ "$(task_id "$line")" == PAUSA-* ]]; then
      id=$(task_id "$line")
      mark_done "$line"
      git add "$PLAN" && git commit -q -m "ralph: $id aprovada" \
        -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
      log "$id aprovada."
    fi ;;
  "") ;;
  *) echo "Opção desconhecida: $1"; exit 1 ;;
esac

bootstrap

if [ -n "$(git status --porcelain)" ]; then
  log "Há alterações por commitar. Trata delas antes de correr o loop."
  git status --short
  exit 1
fi

count=0
while :; do
  line=$(next_line)
  if [ -z "$line" ]; then log "Plano concluído."; exit 0; fi
  id=$(task_id "$line")
  if [[ "$id" == PAUSA-* ]]; then
    log "Pausa para revisão:"
    task_block "$line"
    log "Quando estiver tudo bem, corre: ralph/run.sh --continue"
    exit 0
  fi
  run_task "$line"
  rc=$?
  [ "$rc" -eq 0 ] || exit "$rc"
  count=$((count + 1))
  if [ "$MAX_TASKS" -gt 0 ] && [ "$count" -ge "$MAX_TASKS" ]; then
    log "Atingido MAX_TASKS=$MAX_TASKS."
    exit 0
  fi
done
