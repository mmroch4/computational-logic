#!/usr/bin/env bash
# Casos-limite no Chrome headless (via check-page.sh), cada um com um EVAL que confirma o estado:
#   1) idioma trocado no Passo a passo: é uma navegação para a página EN que mantém a query;
#   2) idioma trocado no Aprender: vai para a lição EN e mantém o hash;
#   3) link de idioma do rodapé e volta ao PT;
#   4) a 404 escolhe o idioma pelo caminho pedido;
#   5) localStorage bloqueado (SecurityError): todas as páginas abrem sem erros na consola.
# Quem acrescentar estado a uma página (play, histórico) junta aqui o caso correspondente.
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

# 1) Passo a passo: a troca de idioma mantém a query, que é onde a página guarda o estado.
run "lang-query" "/passo-a-passo" "$WAIT
  $SWITCH
  const { frame, doc } = await openFrame('/passo-a-passo?s=p&step=2');
  const en = await toEn(frame, doc);
  const url = frame.contentWindow.location;
  if (url.pathname !== '/en/step-by-step') throw new Error('foi para ' + url.pathname);
  if (url.search !== '?s=p&step=2') throw new Error('perdeu a query: ' + url.search);
  if (en.documentElement.lang !== 'en') throw new Error('lang=' + en.documentElement.lang);"

# 1b) A troca de idioma a meio do play leva o passo em que ia.
run "lang-play" "/passo-a-passo" "$WAIT
  $SWITCH
  const { frame, doc } = await openFrame('/passo-a-passo?s=p+-%3E+q,+~q+%7C-+~p&step=1');
  for (let i = 0; i < 100 && !doc.querySelector('[data-role=play]'); i++) await wait(50);
  let before = 0;
  const en = await toEn(frame, doc, async (d) => {
    d.querySelector('[data-role=play]').click();
    await wait(2000);
    before = Number(d.querySelector('[data-role=range]').value);
  });
  for (let i = 0; i < 100 && !en.querySelector('[data-role=range]'); i++) await wait(50);
  if (before < 2) throw new Error('o play não andou');
  if (Number(en.querySelector('[data-role=range]').value) < before) throw new Error('o passo recuou');"

# 2) Aprender: o hash vai com a troca de idioma.
run "lang-hash" "/aprender" "$WAIT
  $SWITCH
  const { frame, doc } = await openFrame('/aprender#negacao');
  const en = await toEn(frame, doc);
  const url = frame.contentWindow.location;
  if (url.pathname + url.hash !== '/en/learn#negacao') throw new Error('foi para ' + url.pathname + url.hash);
  if (en.documentElement.lang !== 'en') throw new Error('lang=' + en.documentElement.lang);"

# 3) O link de idioma do rodapé faz o mesmo que o seletor, e o seletor volta ao PT.
run "lang-footer" "/provar" "$WAIT
  $SWITCH
  const { frame, doc } = await openFrame('/provar?s=p');
  const ready = load(frame);
  doc.querySelector('.ftr a[data-lang=\\"en\\"]').click();
  const en = await ready;
  const url = frame.contentWindow.location;
  if (url.pathname + url.search !== '/en/prove?s=p') throw new Error('foi para ' + url.pathname + url.search);
  const back = load(frame);
  en.querySelector('.hdr [data-lang=\\"pt\\"]').click();
  await back;
  if (frame.contentWindow.location.pathname !== '/provar') throw new Error('não voltou ao PT');"

# 4) A 404 escolhe o idioma pelo caminho pedido.
EXPECT_404=nao-existe run "not-found-lang" "/" "$WAIT
  $SWITCH
  for (const [path, lang, home] of [['/en/nao-existe', 'en', '/en'], ['/nao-existe', 'pt-PT', '/']]) {
    const { doc } = await openFrame(path);
    if (doc.documentElement.lang !== lang) throw new Error(path + ': lang=' + doc.documentElement.lang);
    if (doc.querySelector('.not-found__actions a').getAttribute('href') !== home) throw new Error(path + ': link do início');
    if (doc.querySelector('.wm').getAttribute('href') !== home) throw new Error(path + ': marca');
    if (!doc.querySelector('meta[name=robots][content=noindex]')) throw new Error(path + ': sem noindex');
  }"

# 5) localStorage bloqueado.
BLOCKED_JS="$WAIT
  let blocked = false;
  try { localStorage; } catch (e) { blocked = e.name === 'SecurityError'; }
  if (!blocked) throw new Error('o localStorage não está bloqueado');"
for page in / /en /provar /en/prove /passo-a-passo /en/step-by-step /aprender /en/learn /exercicios /en/exercises /404; do
  name="blocked$(echo "$page" | tr -c 'a-z0-9\n' '-')"
  run "$name" "$page" "$BLOCKED_JS" 1
done

if [ "$FAILED" -gt 0 ]; then
  echo "check-edge: $FAILED verificação(ões) com erros" >&2
  exit 1
fi
echo "check-edge: tudo OK"
