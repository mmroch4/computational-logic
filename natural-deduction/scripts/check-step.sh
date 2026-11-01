#!/usr/bin/env bash
# Página Passo a passo no Chrome headless (via check-page.sh), em PT e em EN, a 1280px e a 390px. Cada caso
# tem um EVAL que confirma o estado:
#   1) escolher um exemplo no menu abre o player, e a escolha recolhe-se;
#   2) escrever um sequente com um erro e depois certo, e ver a explicação de todos os passos até ao fim;
#   3) mudar de sequente com a prova aberta;
#   4) sequente inválido: contraexemplo no lugar do player, sem teclas ativas, e voltar a uma prova;
#   5) link para um passo e uma vista; link para um sequente inválido;
#   6) sem link, volta a última prova; um link manda sobre ela;
#   7) tudo com o localStorage bloqueado.
# Uso: scripts/check-step.sh [pasta-saída]   (por omissão: tmp/screens/step)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/tmp/screens/step}"
# Porta própria: o npm test corre outros scripts de Chrome ao mesmo tempo.
export PORT="${PORT:-8772}"
FAILED=0

server_up() { curl -s -o /dev/null "http://127.0.0.1:$PORT/"; }
if ! server_up; then
  node "$ROOT/scripts/serve.mjs" "$PORT" >/dev/null 2>&1 &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
  for _ in $(seq 1 100); do server_up && break; sleep 0.1; done
fi

# As duas larguras partilham o browser: cada documento de topo começa sem o que a outra guardou.
export PRELOAD='if (window === top) { try { localStorage.removeItem("nd:v1:step"); } catch {} }'

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
  const shown = (el) => el !== null && el.offsetParent !== null;
  const counter = () => $("[data-role=counter]")?.textContent ?? "";
  const playing = () => shown($("#step-player")) && $(".tl-range") !== null;
  const submit = (text) => {
    const field = $("#sequent");
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  };
  const key = (name) => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  const open = (path) => new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.onload = () => resolve(frame.contentDocument);
    frame.src = path;
    document.body.append(frame);
  });'

# Abre um exemplo pelo menu.
EXAMPLE='await until(() => $("#examples-menu summary"), "o menu");
  if (!shown($("#step-empty"))) throw new Error("sem o estado vazio");
  $("#examples-menu summary").click();
  await until(() => $("[data-example=chain]"), "os exemplos");
  $("[data-example=chain]").click();
  await until(playing, "o player");
  if (shown($("#step-empty"))) throw new Error("o estado vazio ficou");
  if (shown($("#sequent"))) throw new Error("a escolha devia recolher-se");
  if (!shown($("#step-change"))) throw new Error("sem o botão de mudar");
  if ($("#step-change").getAttribute("aria-expanded") !== "false") throw new Error("aria-expanded");
  if (!$(".step-player__sequent").textContent.includes("→")) throw new Error("sequente em falta");
  if (!location.search.includes("s=")) throw new Error("o sequente não foi para o endereço");
  if (counter() === "") throw new Error("sem contador");'

# Do início ao fim, cada passo com explicação própria, sem chaves por traduzir.
WALK='const seen = new Set();
  await until(() => $(".step-card__why"), "o cartão");
  const max = Number($(".tl-range").max);
  if (max < 3) throw new Error("prova curta de mais");
  for (let n = 0; n <= max; n++) {
    const why = $(".step-card__why").textContent.trim();
    if (why === "" || /strategies\.|player\./.test(why)) throw new Error("passo " + n + " sem explicação: " + why);
    seen.add(why);
    if (Number($(".tl-range").value) !== n) throw new Error("passo " + n + ": " + $(".tl-range").value);
    if (n < max) $("[data-role=next]").click();
    await wait(0);
  }
  if (seen.size < 2) throw new Error("as explicações são todas iguais");
  if (!$(".step-card .msg-ok")) throw new Error("o fim não diz que acabou");
  if (!location.search.includes("step=" + max)) throw new Error("o passo não foi para o endereço");'

# Todos os casos, num idioma: pasta, caminho e os textos que mudam.
language() {
  local lang="$1" path="$2" other="$3" invalid="$4" change="$5" yes="$6" no="$7" any="$8"
  local fixed="const INVALID = '$invalid', CHANGE = '$change', YES = '$yes', NO = '$no', ANY = '$any', OTHER = '$other';"

  run "$lang-exemplo" "$path" "$HELPERS
    $fixed
    $EXAMPLE
    if (!\$('#step-change').textContent.includes(CHANGE)) throw new Error('rótulo: ' + \$('#step-change').textContent);"

  run "$lang-escrever" "$path" "$HELPERS
    $(cat <<'JS'
    await until(() => $("#sequent"), "o campo");
    submit("a ∧");
    await wait(50);
    if (!shown($(".field-error"))) throw new Error("um erro de escrita devia ficar no campo");
    if (shown($("#step-player"))) throw new Error("um erro de escrita não abre o player");
    submit("a -> b, ~b |- ~a");
    await until(playing, "o player");
JS
)
    $WALK"

  run "$lang-mudar" "$path" "$HELPERS
    $EXAMPLE
    $(cat <<'JS'
    const before = $(".step-player__sequent").textContent;
    key("ArrowRight");
    await until(() => location.search.includes("step=1"), "o primeiro passo");
    $("#step-change").click();
    if (!shown($("#sequent"))) throw new Error("mudar não abriu a escolha");
    if (document.activeElement !== $("#sequent")) throw new Error("o foco devia ir para o campo");
    if ($("#step-change").getAttribute("aria-expanded") !== "true") throw new Error("aria-expanded");
    if (!shown($("#step-player"))) throw new Error("o player devia ficar por baixo");
    $("[data-view=tree]").click();
    submit("s ∧ t ⊢ t ∧ s");
    await until(() => $(".step-player__sequent").textContent !== before, "o sequente novo");
    if (shown($("#sequent"))) throw new Error("a escolha devia recolher-se");
    if (document.activeElement !== $("#step-change")) throw new Error("o foco perdeu-se");
    if ($(".tl-range").value !== "0") throw new Error("o sequente novo começa no início");
    if (!location.search.includes("view=tree")) throw new Error("a vista devia manter-se");
    if (location.search.includes("step=")) throw new Error("o passo antigo ficou no endereço");
JS
)"

  run "$lang-invalido" "$path" "$HELPERS
    $fixed
    $EXAMPLE
    $(cat <<'JS'
    $("#step-change").click();
    submit("a → b, b ⊢ a");
    await until(() => $("#step-message .msg-warn"), "o aviso");
    if (!$("#step-message").textContent.includes(INVALID)) throw new Error("texto: " + $("#step-message").textContent);
    const values = [...document.querySelectorAll("#step-message .assist__valuation li")].map((li) => li.textContent);
    if (values.join() !== `a = ${NO},b = ${YES}`) throw new Error("contraexemplo: " + values);
    if (shown($("#step-player")) || $(".tl-range")) throw new Error("sem prova não há player");
    if (document.body.classList.contains("has-timeline")) throw new Error("ficou o espaço da timeline");
    if (!shown($("#sequent"))) throw new Error("o campo devia ficar à vista");
    if (!shown($("h1"))) throw new Error("o título devia voltar");
    if (shown($("#step-change"))) throw new Error("mudar não faz sentido sem prova");
    if (!new URLSearchParams(location.search).get("s").includes("a")) throw new Error("endereço: " + location.search);
    for (const name of ["ArrowRight", "ArrowLeft", " ", "End", "?"]) key(name);
    submit("⊢ F");
    await until(() => $("#step-message").textContent.includes(ANY), "qualquer valoração");
    submit("a ∨ b ⊢ c");
    await until(() => $("#step-message").textContent.includes(OTHER), "as outras variáveis");
    submit("a ⊢ a");
    await until(playing, "o player de volta");
    if ($("#step-message").textContent !== "") throw new Error("o aviso ficou");
    if (!$("#step-player .step-card__why")) throw new Error("sem cartão");
JS
)"

  run "$lang-link" "$path?s=a+-%3E+b,+a+%7C-+b&step=1&view=tree" "$HELPERS
    $(cat <<'JS'
    await until(playing, "o player");
    if ($(".tl-range").value !== "1") throw new Error("o link não abriu no passo 1");
    if (!shown($(".step-player__tree"))) throw new Error("o link não abriu a árvore");
    if (shown($("#sequent"))) throw new Error("a escolha devia estar recolhida");
    $("#step-change").click();
    if (!/a → b, a ⊢ b/.test($("#sequent").value)) throw new Error("campo: " + $("#sequent").value);
JS
)"

  run "$lang-link-invalido" "$path?s=a+%7C-+b&step=2" "$HELPERS
    $(cat <<'JS'
    await until(() => $("#step-message .assist__valuation"), "o contraexemplo");
    if (!location.search.includes("step=2")) throw new Error("o endereço devia ficar");
    if (!shown($("#sequent"))) throw new Error("o campo devia ficar à vista");
    if ($("#sequent").value === "") throw new Error("o sequente devia ficar no campo");
JS
)"

  run "$lang-voltar" "$path" "$HELPERS
    $(cat <<JS
    const PATH = "$path";
JS
)
    $EXAMPLE
    $(cat <<'JS'
    key("ArrowRight");
    await until(() => location.search.includes("step=1"), "o primeiro passo");
    const saved = location.search;
    const again = await open(PATH);
    await until(() => again.querySelector(".tl-range"), "a prova guardada");
    if (again.querySelector(".tl-range").value !== "1") throw new Error("não voltou ao passo");
    if (again.defaultView.location.search !== saved) throw new Error("endereço: " + again.defaultView.location.search);
    const linked = await open(PATH + "?s=s+%7C-+s");
    await until(() => linked.querySelector(".tl-range"), "o link");
    if (!linked.querySelector(".step-player__sequent").textContent.startsWith("s")) throw new Error("o link não mandou");
JS
)"

  run "$lang-bloqueado" "$path" "$HELPERS
    $fixed
    $EXAMPLE
    $(cat <<'JS'
    $("#step-change").click();
    submit("a ⊢ b");
    await until(() => $("#step-message .assist__valuation"), "o contraexemplo");
JS
)" 1
}

language pt /passo-a-passo "outras variáveis" "não é válido" "Mudar de sequente" V F "Qualquer valoração"
language en /en/step-by-step "other variables" "not valid" "Change sequent" T F "Any valuation"

if [ "$FAILED" -gt 0 ]; then
  echo "check-step: $FAILED verificação(ões) com erros" >&2
  exit 1
fi
echo "check-step: tudo OK"
