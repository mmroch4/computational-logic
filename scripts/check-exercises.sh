#!/usr/bin/env bash
# Exercícios no Chrome headless (via check-page.sh), cada caso com um EVAL que confirma o estado:
#   1) lista: níveis, modos, filtro sem resultados, foco e barra de progresso;
#   2) prova a escrever até ao fim: regra proibida, dica, progresso e próximo exercício;
#   3) a mesma prova no modo guiado, com a regra proibida a tracejado;
#   4) encontra o passo errado até ao fim: linha certa, explicação errada, resolvido e progresso;
#   5) solução automática: completa a prova e não conta;
#   6) progresso: acabar um exercício muda a lista depois de recarregar, e repor limpa;
#   7) os dois modos com o localStorage bloqueado: fazem-se na mesma, sem erros;
#   8) os dois modos em EN e um exercício que não existe.
# Uso: scripts/check-exercises.sh [pasta-saída]   (por omissão: tmp/screens/exercises)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/tmp/screens/exercises}"
# Porta própria: o npm test corre outros scripts de Chrome ao mesmo tempo.
export PORT="${PORT:-8771}"
FAILED=0

server_up() { curl -s -o /dev/null "http://127.0.0.1:$PORT/"; }
if ! server_up; then
  node "$ROOT/scripts/serve.mjs" "$PORT" >/dev/null 2>&1 &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
  for _ in $(seq 1 100); do server_up && break; sleep 0.1; done
fi

check() { FULL_PAGE=1 BLOCK_STORAGE="${4:-0}" EVAL="$3" "$ROOT/scripts/check-page.sh" "$2" "$OUT/$1" 2>&1; }

run() { # run <nome> <caminho> <EVAL> [BLOCK_STORAGE]
  local output
  if output="$(check "$@")"; then echo "$output"; return; fi
  # O Chrome às vezes falha o pedido às Google Fonts ao arrancar: só esse erro, e só ele, tem nova tentativa.
  case "$output" in
    *ERR_CERT_VERIFIER_CHANGED*) if output="$(check "$@")"; then echo "$output"; return; fi ;;
  esac
  echo "$output"
  FAILED=$((FAILED + 1))
}

HELPERS='const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const until = async (test, what) => {
    for (let n = 0; n < 200; n++) { if (test()) return; await wait(50); }
    throw new Error("à espera de: " + what);
  };
  const clean = () => { try { localStorage.removeItem("nd:v1:progress"); } catch {} };
  const open = (path) => new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.onload = () => resolve(frame.contentDocument);
    frame.src = path;
    document.body.append(frame);
  });
  const fill = (field, text) => {
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const line = (n) => $(`.fitch-edit__line[data-line="${n}"]`);
  const write = async (n, formula, why) => {
    await until(() => line(n), "a linha " + n);
    fill($("[data-field=formula]", line(n)), formula);
    const field = $("[data-field=justification]", line(n));
    fill(field, why);
    field.focus();
  };
  const enter = (field) => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));'

# Um desafio até ao fim: a linha certa recusa-se, a errada passa, e depois a explicação.
PUZZLE='const playPuzzle = async (id) => {
    const { findEntry } = await import("/js/core/exercise-page.js");
    const { exercise } = findEntry(id);
    const fine = exercise.line === 1 ? 2 : 1;
    $(`[data-line="${fine}"] .fitch__pick`).click();
    await until(() => $(`[data-line="${fine}"]`).dataset.state === "ok", "a linha certa assinalada");
    $(`[data-line="${exercise.line}"] .fitch__pick`).click();
    await until(() => $("[data-reason]"), "as explicações");
    $(`[data-reason="${exercise.distractors[0]}"]`).click();
    await until(() => $(`[data-reason="${exercise.distractors[0]}"]`).disabled, "a explicação recusada");
    if ($(".exercise-result").textContent !== "") throw new Error("uma explicação errada resolveu o desafio");
    $(`[data-reason="${exercise.answer}"]`).click();
    await until(() => $(".exercise-result a.btn"), "o resultado");
  };'

# Em ex-two-links (r → s, s → t, r ⊢ t ∧ r), a escrever.
PROVE='const playProof = async () => {
    await write(4, "s", "→E, 3, 1");
    enter($("[data-field=justification]", line(4)));
    await write(5, "t", "→E, 4, 2");
    enter($("[data-field=justification]", line(5)));
    await write(6, "t ∧ r", "∧I, 5, 3");
    await until(() => $(".exercise-result a.btn"), "o resultado da prova");
  };'

# 1) Lista.
run "lista" "/exercicios" "$HELPERS
  $(cat <<'JS'
  clean();
  await until(() => $(".exercise-item"), "a lista");
  if (document.querySelectorAll(".exercise-item").length < 50) throw new Error("faltam exercícios");
  if (document.querySelectorAll(".exercise-group").length !== 5) throw new Error("faltam níveis");
  if (!$(".exercise-progress__bar[role=progressbar]")) throw new Error("sem barra de progresso");
  $("[data-filter=done]").click();
  if (!$("[data-filter=done]").matches(":focus")) throw new Error("o filtro perdeu o foco");
  if (!$(".exercise-list__empty")) throw new Error("filtro sem resultados");
  $("[data-filter=all]").click();
  $("[data-list-mode=findError]").click();
  if (!$("[data-list-mode=findError]").matches(":focus")) throw new Error("o modo perdeu o foco");
  if (document.querySelectorAll(".exercise-item").length < 10) throw new Error("faltam desafios");
  if (!location.search.includes("mode=findError")) throw new Error("o modo não ficou no URL");
  $("[data-list-mode=proof]").click();
JS
)"

# 2) Prova a escrever até ao fim, depois de uma regra proibida e de uma dica.
run "prova" "/exercicios?ex=ex-two-links" "$HELPERS
  $PROVE
  $(cat <<'JS'
  clean();
  await until(() => line(4), "o editor");
  if (![...document.querySelectorAll(".exercise-rules__list li")].some((li) => li.textContent === "→E")) throw new Error("regras permitidas");
  if ([...document.querySelectorAll(".exercise-rules__list li")].some((li) => li.textContent === "MT")) throw new Error("MT não é permitida");
  if (document.activeElement.matches(".fitch-edit__field")) throw new Error("abrir não deve pôr o foco no campo");
  await write(4, "s", "MT, 1, 3");
  document.activeElement.blur();
  await until(() => line(4).dataset.state === "error", "o erro da regra proibida");
  if (!/permitida/.test(line(4).textContent)) throw new Error("erro pouco claro: " + line(4).textContent);
  $("[data-assist=hint]").click();
  await until(() => $(".assist__levels"), "a dica");
  await playProof();
  if (!$('.exercise-detail__eyebrow [data-status="solved"]')) throw new Error("o estado não mudou");
  if (!$(".exercise-result a.btn").href.includes("?ex=ex-")) throw new Error("sem próximo exercício");
  if ($(".exercise-result a.btn").href.includes("ex-two-links")) throw new Error("o próximo é o mesmo");
  clean();
JS
)"

# 3) Modo guiado: o mesmo exercício só com cliques.
run "guiado" "/exercicios?ex=ex-two-links" "$HELPERS
  $(cat <<'JS'
  clean();
  await until(() => line(4), "o editor");
  $("[data-mode=guided]").click();
  await until(() => $("[data-pick]"), "o modo guiado");
  const forbidden = $('[data-rule="MT"]');
  if (forbidden && forbidden.getAttribute("aria-disabled") !== "true") throw new Error("regra proibida ativa");
  const pick = async (...lines) => { for (const n of lines) { $(`[data-pick="${n}"]`).click(); await wait(10); } };
  const rule = async (id) => { $(`[data-rule="${id}"]`).click(); await wait(10); };
  const choose = async () => { if ($("[data-choice]")) { $("[data-choice]").click(); await wait(10); } };
  await pick(3, 1); await rule("→E"); await choose();
  await pick(4, 2); await rule("→E"); await choose();
  await pick(5, 3); await rule("∧I"); await choose();
  await until(() => $(".exercise-result a.btn"), "o resultado do modo guiado");
  if (!$('.exercise-detail__eyebrow [data-status="solved"]')) throw new Error("o estado não mudou");
  clean();
JS
)"

# 4) Encontra o passo errado até ao fim.
run "desafio" "/exercicios?ex=ex-err-negation-gained" "$HELPERS
  $PUZZLE
  $(cat <<'JS'
  clean();
  await until(() => $(".fitch__pick"), "o desafio");
  await playPuzzle("ex-err-negation-gained");
  if (!$(".find-error__done")) throw new Error("o desafio não acabou");
  if (!$('.exercise-detail__eyebrow [data-status="solved"]')) throw new Error("o estado não mudou");
  if (!$(".exercise-result a.btn").href.includes("?ex=ex-err-")) throw new Error("o próximo devia ser outro desafio");
  clean();
JS
)"

# 5) A solução automática completa a prova, mas não conta.
run "solucao" "/exercicios?ex=ex-two-links" "$HELPERS
  $(cat <<'JS'
  clean();
  await until(() => $("[data-assist=solve]"), "a ajuda");
  $("[data-assist=solve]").click();
  await until(() => $("[data-assist=use]"), "a solução");
  $("[data-assist=use]").click();
  await until(() => $(".exercise-result [class*=msg]"), "o aviso");
  if (!$('.exercise-detail__eyebrow [data-status="todo"]')) throw new Error("a solução automática contou");
  let saved = "{}";
  try { saved = localStorage.getItem("nd:v1:progress") ?? "{}"; } catch {}
  if (saved.includes("ex-two-links")) throw new Error("a solução automática ficou guardada");
JS
)"

# 6) Progresso: resolve dois, vê a lista numa carga nova, repõe e confirma.
run "progresso" "/exercicios?ex=ex-err-negation-gained" "$HELPERS
  $PUZZLE
  $(cat <<'JS'
  clean();
  await until(() => $(".fitch__pick"), "o desafio");
  await playPuzzle("ex-err-negation-gained");
  localStorage.setItem("nd:v1:progress", JSON.stringify({
    ...JSON.parse(localStorage.getItem("nd:v1:progress")),
    "ex-two-links": { status: "solvedWithUserRules" },
    "quiz-keep": { score: 1 },
  }));
  const list = await open(location.pathname);
  const ready = () => $(".exercise-progress__label b", list);
  await until(ready, "a lista");
  if (!/^2 de \d+ resolvidos/.test(ready().textContent)) throw new Error("feitos: " + ready().textContent);
  if (!/1 com regras próprias/.test($(".exercise-progress__own-note", list).textContent)) throw new Error("regras próprias à parte");
  if (!$(".exercise-status--own", list)) throw new Error("estado na lista");
  if (!/Continuar/.test($(".exercise-next", list).textContent)) throw new Error("Continuar");
  $('[data-reset="ask"]', list).click();
  if (!$('[data-reset="no"]', list).matches(":focus")) throw new Error("foco na confirmação");
  $('[data-reset="no"]', list).click();
  if (!JSON.parse(localStorage.getItem("nd:v1:progress"))["ex-two-links"]) throw new Error("cancelar apagou");
  $('[data-reset="ask"]', list).click();
  $('[data-reset="yes"]', list).click();
  if (!$("a.exercise-next", list).matches(":focus")) throw new Error("foco depois de repor");
  const kept = JSON.parse(localStorage.getItem("nd:v1:progress"));
  if (Object.keys(kept).join() !== "quiz-keep") throw new Error("repor: " + Object.keys(kept));
  const fresh = await open(location.pathname);
  await until(() => $(".exercise-progress__label b", fresh), "a lista depois de repor");
  if (!/^0 de /.test($(".exercise-progress__label b", fresh).textContent)) throw new Error("repor não apagou");
  if (!/Começar/.test($(".exercise-next", fresh).textContent)) throw new Error("Começar");
  clean();
JS
)"

# 7) Com o localStorage bloqueado os dois modos fazem-se até ao fim.
run "bloqueado-prova" "/exercicios?ex=ex-two-links" "$HELPERS
  $PROVE
  await until(() => line(4), 'o editor');
  await playProof();" 1
run "bloqueado-desafio" "/exercicios?ex=ex-err-negation-gained" "$HELPERS
  $PUZZLE
  await until(() => \$('.fitch__pick'), 'o desafio');
  await playPuzzle('ex-err-negation-gained');" 1

# 8) Os dois modos em EN, e um exercício que não existe.
run "en-prova" "/en/exercises?ex=ex-two-links" "$HELPERS
  $PROVE
  $(cat <<'JS'
  clean();
  await until(() => line(4), "the editor");
  if (!/Allowed rules/.test($(".exercise-rules__label").textContent)) throw new Error("rules label");
  await playProof();
  if (!/Next exercise/.test($(".exercise-result a.btn").textContent)) throw new Error("next link");
  if (!$(".exercise-result a.btn").href.includes("/en/exercises") ) throw new Error("next link path");
  clean();
JS
)"
run "en-desafio" "/en/exercises?ex=ex-err-negation-gained" "$HELPERS
  $PUZZLE
  $(cat <<'JS'
  clean();
  await until(() => $(".fitch__pick"), "the puzzle");
  await playPuzzle("ex-err-negation-gained");
  if (!/Find the wrong step/.test($("h1").textContent)) throw new Error("title");
  if (!$(".exercise-detail__back").href.endsWith("/en/exercises?mode=findError")) throw new Error("back link");
  clean();
JS
)"
run "nao-existe" "/exercicios?ex=ex-nothing" "$HELPERS
  await until(() => \$('.exercise-detail__back'), 'a mensagem');"

if [ "$FAILED" -gt 0 ]; then
  echo "check-exercises: $FAILED verificação(ões) com erros" >&2
  exit 1
fi
echo "check-exercises: tudo OK"
