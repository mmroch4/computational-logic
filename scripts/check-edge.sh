#!/usr/bin/env bash
# Casos-limite do M8.3b no Chrome headless (via check-page.sh), cada um com um EVAL que confirma o estado:
#   1) idioma trocado a meio do play no Passo a passo (DLL e DP): é uma navegação para a página EN que
#      mantém a fórmula, o algoritmo e o passo, com o texto em EN e no URL certo;
#   2) idioma trocado no Aprender: vai para a lição EN na mesma secção;
#   3) localStorage bloqueado (SecurityError): todas as páginas abrem, trocam de idioma e guardam o
#      histórico em memória, sem erros na consola.
# Uso: scripts/check-edge.sh [pasta-saída]   (por omissão: tmp/screens/edge)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/tmp/screens/edge}"
FAILED=0

run() { # run <nome> <caminho> <EVAL> [BLOCK_STORAGE]
  BLOCK_STORAGE="${4:-0}" EVAL="$3" "$ROOT/scripts/check-page.sh" "$2" "$OUT/$1" || FAILED=$((FAILED + 1))
}

WAIT='const wait = (ms) => new Promise((r) => setTimeout(r, ms));'
# Abre `path` num iframe, carrega no EN e devolve o documento da página para onde foi.
SWITCH='const load = (frame) => new Promise((resolve) => { frame.onload = async () => { await wait(500); resolve(frame.contentDocument); }; });
  const openFrame = async (path) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "width:1200px;height:800px";
    const ready = load(frame);
    frame.src = path;
    document.body.append(frame);
    return { frame, doc: await ready };
  };
  const toEn = async (frame, doc, before = () => {}) => {
    const ready = load(frame);
    await before(doc);
    doc.querySelector(".hdr [data-lang=\"en\"]").click();
    return ready;
  };'
STEP_SET="/passo-a-passo?f=p1%20p2,-p1%20p3,-p2%20-p3,p3%20p4,-p4%20p1,p2%20-p1"

# 1) Passo a passo em play; `$1` escolhe o algoritmo. A navegação tem de manter o passo em que ia.
play_js() {
  echo "$WAIT
    $SWITCH
    const { frame, doc } = await openFrame('$STEP_SET&a=$1');
    let before = 0;
    const en = await toEn(frame, doc, async (d) => {
      d.querySelector('[data-role=play]').click();
      await wait(1500);
      before = Number(d.querySelector('[data-role=range]').value);
    });
    const url = frame.contentWindow.location;
    if (url.pathname !== '/en/step-by-step') throw new Error('foi para ' + url.pathname);
    if (en.documentElement.lang !== 'en') throw new Error('lang=' + en.documentElement.lang);
    if (Number(en.querySelector('[data-role=range]').value) < before) throw new Error('o passo recuou');
    if (before === 0) throw new Error('o play não avançou');
    if (en.querySelector('[data-algo=$1]').getAttribute('aria-pressed') !== 'true') throw new Error('mudou de algoritmo');
    if (!new URLSearchParams(url.search).get('f')) throw new Error('perdeu a fórmula');
    if (/Propagação|Eliminação|Passo \\d/.test(en.querySelector('main').textContent)) throw new Error('ainda há PT');"
}
run "lang-play-dll" "$STEP_SET" "$(play_js dll)"
run "lang-play-dp" "$STEP_SET" "$(play_js dp)"

# 2) Aprender: a secção que se está a ler vai para o hash e a troca de idioma volta a ela.
run "lang-section" "/aprender" "$WAIT
  $SWITCH
  const { frame, doc } = await openFrame('/aprender');
  const en = await toEn(frame, doc, async (d) => {
    d.getElementById('historia').scrollIntoView({ behavior: 'instant' });
    await wait(300);
  });
  const url = frame.contentWindow.location;
  if (url.pathname + url.hash !== '/en/learn#historia') throw new Error('foi para ' + url.pathname + url.hash);
  if (en.documentElement.lang !== 'en') throw new Error('lang=' + en.documentElement.lang);"

# 2a) O link de idioma do rodapé faz o mesmo que o seletor: mantém o estado que está no URL.
run "lang-footer" "/resolver" "$WAIT
  $SWITCH
  const { frame, doc } = await openFrame('/resolver?f=p%2C-p');
  const before = frame.contentWindow.location.search;
  if (!new URLSearchParams(before).get('f')) throw new Error('a fórmula não chegou ao URL');
  const ready = load(frame);
  doc.querySelector('.ftr a[data-lang=\\"en\\"]').click();
  await ready;
  const url = frame.contentWindow.location;
  if (url.pathname !== '/en/solver') throw new Error('foi para ' + url.pathname);
  if (new URLSearchParams(url.search).get('f') !== new URLSearchParams(before).get('f')) throw new Error('perdeu a fórmula: ' + url.search);"

# 2b) O Resolver mantém a fórmula e volta ao PT.
run "lang-solver" "/resolver" "$WAIT
  $SWITCH
  const { frame, doc } = await openFrame('/resolver?f=p,-p');
  const en = await toEn(frame, doc);
  const url = frame.contentWindow.location;
  if (url.pathname !== '/en/solver' || !url.search.includes('f=')) throw new Error('foi para ' + url.href);
  if (!en.querySelector('#result').textContent.trim()) throw new Error('sem resultado');
  const back = load(frame);
  en.querySelector('.hdr [data-lang=\"pt\"]').click();
  await back;
  if (frame.contentWindow.location.pathname !== '/resolver') throw new Error('não voltou ao PT');"

# 2c) A 404 escolhe o idioma pelo caminho pedido.
EXPECT_404=nao-existe run "not-found-lang" "/" "$WAIT
  $SWITCH
  for (const [path, lang, home] of [['/en/nao-existe', 'en', '/en'], ['/nao-existe', 'pt-PT', '/']]) {
    const { doc } = await openFrame(path);
    if (doc.documentElement.lang !== lang) throw new Error(path + ': lang=' + doc.documentElement.lang);
    if (doc.querySelector('.not-found__actions a').getAttribute('href') !== home) throw new Error(path + ': link do início');
    if (doc.querySelector('.wm').getAttribute('href') !== home) throw new Error(path + ': marca');
    if (!doc.querySelector('meta[name=robots][content=noindex]')) throw new Error(path + ': sem noindex');
  }"

# 3) localStorage bloqueado.
BLOCKED_JS="$WAIT
  let blocked = false;
  try { localStorage; } catch (e) { blocked = e.name === 'SecurityError'; }
  if (!blocked) throw new Error('o localStorage não está bloqueado');"
for page in / /en /resolver /en/solver /passo-a-passo /en/step-by-step /aprender /en/learn /exercicios /en/exercises "/exercicios?ex=propagation-chain" /404; do
  name="blocked$(echo "$page" | tr -c 'a-z0-9\n' '-')"
  run "$name" "$page" "$BLOCKED_JS" 1
done
# Resolver e Passo a passo: o histórico fica em memória durante a sessão (o menu mostra-o).
HISTORY_JS="$WAIT
  const ta = document.querySelector('textarea');
  ta.value = 'p, -p q, r';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('.formula-input__submit').click();
  await wait(400);
  const speed = document.querySelector('[data-role=speed]');
  if (speed) { speed.value = '2'; speed.dispatchEvent(new Event('change', { bubbles: true })); }
  document.querySelector('#examples-menu summary').click();
  await wait(200);
  if (!document.querySelector('[data-history=\"0\"]')) throw new Error('histórico em memória vazio');"
run "blocked-history" "/resolver" "$HISTORY_JS" 1
run "blocked-history" "/passo-a-passo" "$HISTORY_JS" 1

if [ "$FAILED" -gt 0 ]; then
  echo "check-edge: $FAILED verificação(ões) com erros" >&2
  exit 1
fi
echo "check-edge: tudo OK"
