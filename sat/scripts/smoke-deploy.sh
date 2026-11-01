#!/usr/bin/env bash
# Smoke test do deploy com curl: o que o Google e um navegador veem.
# Uso: scripts/smoke-deploy.sh [url-base]
# Sem url-base, arranca o serve.mjs numa porta livre; com ela, corre contra esse site (ex.: produção).
set -u
cd "$(dirname "$0")/.."

BASE="${1:-}"
if [ -z "$BASE" ]; then
  LOG="$(mktemp)"
  node scripts/serve.mjs 0 > "$LOG" &
  SERVER=$!
  trap 'kill "$SERVER" 2>/dev/null; rm -f "$LOG"' EXIT
  for _ in $(seq 50); do
    BASE="$(grep -o 'http://localhost:[0-9]*' "$LOG" | head -1)"
    [ -n "$BASE" ] && break
    sleep 0.1
  done
fi
BASE="${BASE%/}"
[ -n "$BASE" ] || { echo "smoke: o servidor não arrancou" >&2; exit 1; }

FAILED=0
pass() { echo "ok    $1"; }
fail() { echo "FALHA $1" >&2; FAILED=1; }
status() { curl -s -o /dev/null -w '%{http_code}' "$BASE$1"; }
header() { curl -s -D - -o /dev/null "$BASE$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d' ' -f2-; }

expect_status() {
  local got; got="$(status "$1")"
  if [ "$got" = "$2" ]; then pass "$1 → $2"; else fail "$1 → $got (esperado $2)"; fi
}
expect_redirect() {
  local got; got="$(curl -s -o /dev/null -w '%{http_code} %header{location}' "$BASE$1")"
  if [ "$got" = "308 $2" ]; then pass "$1 → 308 $2"; else fail "$1 → $got (esperado 308 $2)"; fi
}
expect_header() {
  local got; got="$(header "$1" "$2")"
  case "$got" in
    $3) pass "$1 $2: $got" ;;
    *) fail "$1 $2: «$got» (esperado $3)" ;;
  esac
}

for path in / /aprender /resolver /passo-a-passo /exercicios /en /en/learn /en/solver /en/step-by-step /en/exercises; do
  expect_status "$path" 200
done

expect_redirect "/resolver.html?f=p" "/resolver?f=p"
expect_redirect "/index" "/"
expect_redirect "/en/index" "/en"

# A 404 serve os dois idiomas e o JS escolhe pelo caminho (o check-edge confirma o inglês).
expect_status /en/nao-existe 404
expect_status /nao-existe 404
for path in /README.md /package.json /LICENSE /css/src/app.css /scripts/serve.mjs /tests/deploy.test.js; do
  expect_status "$path" 404
done

expect_status /robots.txt 200
expect_header /robots.txt content-type "text/plain*"
expect_status /sitemap.xml 200
expect_header /sitemap.xml content-type "application/xml*"
expect_header /site.webmanifest content-type "application/manifest+json*"

for path in / /en/solver /nao-existe; do
  expect_header "$path" x-content-type-options nosniff
  expect_header "$path" referrer-policy strict-origin-when-cross-origin
  expect_header "$path" permissions-policy "camera=()*"
  expect_header "$path" x-frame-options SAMEORIGIN
  expect_header "$path" content-security-policy "default-src 'self'; script-src 'self';*"
done

expect_header / cache-control "*max-age=0*"
expect_header /js/boot.js cache-control "*max-age=0*"
expect_header /og-image.png cache-control "*max-age=86400*"

if [ "$FAILED" = 0 ]; then echo "smoke: tudo OK ($BASE)"; else echo "smoke: há falhas ($BASE)" >&2; fi
exit "$FAILED"
