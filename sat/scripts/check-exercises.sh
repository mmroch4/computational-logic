#!/usr/bin/env bash
# Exercícios no Chrome headless (via check-page.sh), cada caso com um EVAL que confirma o estado:
#   1) lista: filtro sem resultados, foco e progresso em barra;
#   2) Próximo passo jogado até ao fim com as dicas: alvo, Recomeçar a meio, erro, resumo e EN;
#   3) Satisfazível? até ao fim: setas, valoração, verificação, Mudar a resposta, resumo e EN;
#   4) progresso guardado: abrir e acabar exercícios muda a lista depois de recarregar, e repor limpa;
#   5) os dois modos com o localStorage bloqueado (SecurityError): jogam-se na mesma, sem erros.
# Uso: scripts/check-exercises.sh [pasta-saída]   (por omissão: tmp/screens/exercises)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/tmp/screens/exercises}"
FAILED=0
# EN=1 corre o mesmo no caminho EN.
EX=/exercicios
[ "${EN:-0}" = 1 ] && EX=/en/exercises

run() { # run <nome> <caminho> <EVAL> [BLOCK_STORAGE]
  BLOCK_STORAGE="${4:-0}" EVAL="$3" "$ROOT/scripts/check-page.sh" "$2" "$OUT/$1" || FAILED=$((FAILED + 1))
}

HELPERS='const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const counters = () => $("[data-counters]").textContent.replace(/\s+/g, " ").trim();
  const reset = () => { try { localStorage.removeItem("dpsat:v1:progress"); } catch {} };'

# Abre `path` num iframe (uma carga nova da página, com o mesmo storage) e devolve o documento.
OPEN='const open = (path) => new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.onload = async () => { await wait(300); resolve(frame.contentDocument); };
    frame.src = path;
    document.body.append(frame);
  });'

# 1) Lista.
run "lista" "$EX" "$HELPERS
  $(cat <<'JS'
  if (document.querySelectorAll(".exercise-item").length < 10) throw new Error("faltam linhas");
  if (!$(".exercise-progress__bar[role=progressbar]")) throw new Error("sem barra de progresso");
  $("[data-filter=done]").click();
  await wait(50);
  if (!$("[data-filter=done]").matches(":focus")) throw new Error("o filtro perdeu o foco");
  $("[data-filter=all]").click();
  await wait(50);
JS
)"

# 2) Próximo passo: dicas até à jogada, recomeçar, um erro e depois até ao fim.
STEP_JS="$HELPERS
  $(cat <<'JS'
  const hintToMove = async () => {
    while ($("[data-play=hint]")) { $("[data-play=hint]").click(); await wait(5); }
  };
  await hintToMove();
  if (!$(".play__target")) throw new Error("a dica 3 não marcou a jogada");
  if (!$(".play__target").matches(":focus")) throw new Error("o foco não foi para a jogada");
  $("[data-play=restart]").click();
  await wait(30);
  if (!/^0 /.test(counters()) || $(".play__hint-list")) throw new Error("Recomeçar não limpou: " + counters());
  if ($("[data-play-feedback]").textContent !== "") throw new Error("Recomeçar não limpou o feedback");
  $("[data-clause]").click();
  await wait(30);
  for (let n = 0; n < 60 && !$(".play__done"); n++) {
    await hintToMove();
    $(".play__target").click();
    await wait(10);
  }
  if (!$(".play__done")) throw new Error("o exercício não acabou");
  if (!$("[data-play-feedback] .msg-ok")) throw new Error("sem mensagem final");
  if (!$(".play__done-actions .btn").matches(":focus")) throw new Error("foco no fim");
  if (document.querySelectorAll(".tree-node").length < 2) throw new Error("árvore por desenhar");
  if (document.querySelectorAll("[data-play-board]").length !== 1) throw new Error("jogo duplicado");
JS
)"

# 3) Satisfazível? em dois exercícios: com valoração e insatisfazível.
SAT_JS="$HELPERS
  $(cat <<'JS'
  const key = (el, name) => el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  const set = async (v, value) => {
    const button = $(`[data-var="${v}"][data-value="${value}"]`);
    if (button.getAttribute("aria-pressed") !== "true") button.click();
    await wait(10);
  };
  $('[data-sat="sat"]').focus();
  key($('[data-sat="sat"]'), "ArrowRight");
  await wait(30);
  if (!/^0 /.test(counters())) throw new Error("a seta deu uma resposta: " + counters());
  $('[data-sat="unsat"]').click();
  await wait(30);
  if (!$("[data-sat-feedback] .msg-error")) throw new Error("a resposta errada não deu erro");
  if ($('[data-sat="sat"]').getAttribute("aria-pressed") !== "true") throw new Error("o Sim devia ficar premido");
  if (document.activeElement.dataset.var !== "p") throw new Error("o foco não foi para a valoração");
  await set("p", true);
  key($('[data-var="p"][data-value="true"]'), "ArrowRight");
  await wait(30);
  if ($('[data-var="p"][data-value="false"]').getAttribute("aria-pressed") !== "true") throw new Error("seta no V/F");
  $('[data-var="p"][data-value="false"]').click();
  await wait(20);
  if ($('[data-var="p"][aria-pressed="true"]')) throw new Error("carregar outra vez não tirou o valor");
  for (const v of ["p", "q", "r"]) await set(v, false);
  $('[data-sat="check"]').click();
  await wait(30);
  if (!$(".sat-check__row--bad")) throw new Error("sem linha falsa");
  await set("q", true);
  if ($(".sat-check__row")) throw new Error("ficou a verificação da valoração anterior");
  $('[data-sat="change"]').click();
  await wait(20);
  if ($("[data-var]")) throw new Error("Mudar a resposta não voltou à pergunta");
  $('[data-sat="sat"]').click();
  await wait(20);
  for (const v of ["p", "q", "r"]) await set(v, true);
  $('[data-sat="check"]').click();
  await wait(40);
  if (!$(".play__done--sat") || !$(".sat-check__row")) throw new Error("não acabou com a verificação à vista");
  $('[data-sat="restart"]').click();
  await wait(30);
  if ($(".play__done--sat")) throw new Error("Recomeçar não limpou");
JS
)"

run "passo" "$EX?ex=three-vars-b" "$STEP_JS"
run "sat" "$EX?ex=three-vars-b&mode=sat" "$SAT_JS"
run "sat-unsat" "$EX?ex=three-vars-a&mode=sat" "$HELPERS
  $(cat <<'JS'
  $('[data-sat="unsat"]').click();
  await wait(50);
  if (!$(".play__done--unsat") || $(".sat-check__title")) throw new Error("fim sem valoração errado");
JS
)"

# 4) Progresso: começa limpo, joga, recarrega e confirma; repor apaga.
run "progresso" "$EX?ex=two-branches&mode=sat" "$HELPERS
  $OPEN
  $(cat <<'JS'
  reset();
  $('[data-sat="unsat"]').click();
  await wait(60);
  if (!$(".exercise-summary")) throw new Error("sem resumo");
  await open(location.pathname + "?ex=three-vars-a");
  const list = await open(location.pathname);
  if (!/^1 (de|of) 10 (feitos|done)/.test($(".exercise-progress__label b", list).textContent)) throw new Error("feitos: " + $(".exercise-progress__label", list).textContent);
  if (!$(".exercise-progress__bar", list).getAttribute("aria-valuetext").match(/1 (em curso|in progress)$/)) throw new Error("em curso");
  if (!/(Continuar · em curso|Continue · in progress)/.test($(".exercise-next", list).textContent)) throw new Error("Continuar");
  if (!/(Três variáveis A|Three variables A)/.test($(".exercise-next", list).textContent)) throw new Error("exercício do Continuar");
  $('[data-reset="ask"]', list).click();
  await wait(30);
  $('[data-reset="yes"]', list).click();
  await wait(50);
  if (!$("a.exercise-next", list).matches(":focus")) throw new Error("foco depois de repor");
  const clean = await open(location.pathname);
  if (!/^0 (de|of) 10 (feitos|done)/.test($(".exercise-progress__label b", clean).textContent)) throw new Error("repor não apagou");
  if (!/(Começar · por fazer|Start · to do)/.test($(".exercise-next", clean).textContent)) throw new Error("Começar");
  reset();
JS
)"

# 5) Com o localStorage bloqueado os dois modos jogam-se até ao fim.
run "blocked-passo" "$EX?ex=three-vars-b" "$STEP_JS" 1
run "blocked-sat" "$EX?ex=three-vars-b&mode=sat" "$SAT_JS" 1

if [ "$FAILED" -gt 0 ]; then
  echo "check-exercises: $FAILED verificação(ões) com erros" >&2
  exit 1
fi
echo "check-exercises: tudo OK"
