#!/usr/bin/env bash
# Lighthouse (mobile, throttling simulado) nas 10 páginas e na 404, servidas pelo scripts/serve.mjs
# (compressão e cleanUrls como na Vercel). Falha se Performance, Acessibilidade, Boas práticas ou SEO
# ficarem abaixo de MIN (por omissão 95) em alguma página, ou se o SEO de uma página indexável não
# for 100. A 404 tem noindex de propósito: o SEO dela não conta.
#
# Uso: scripts/lighthouse.sh [pasta-saída]   (tmp/screens/lighthouse, PORT=8770 e MIN=95 por omissão)
# O Lighthouse corre com `npx --yes lighthouse@12` (ferramenta de verificação, não é dependência).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/tmp/screens/lighthouse}"
port="${PORT:-8770}"
min="${MIN:-95}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

node "$root/scripts/serve.mjs" "$port" >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
for _ in $(seq 50); do curl -s -o /dev/null "http://localhost:$port/" && break; sleep 0.1; done
# Aquece a cache de compressão do servidor (a Vercel serve os ficheiros já comprimidos).
(cd "$root" && find css js -name '*.css' -o -name '*.js' && ls *.html en/*.html) | while read -r file; do
  curl -s -o /dev/null -H 'Accept-Encoding: br' "http://localhost:$port/$file"
done

check='
    const [file, name, min] = process.argv.slice(1);
    const report = require(file);
    const a = report.audits;
    const scores = Object.values(report.categories).map((c) => [c.id, Math.round(c.score * 100)]);
    const metrics = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time",
      "cumulative-layout-shift", "speed-index"].map((k) => `${k.split("-").map((w) => w[0]).join("").toUpperCase()} ${a[k].displayValue}`);
    const low = scores.filter(([id, s]) => {
      if (id !== "seo") return s < Number(min);
      return name !== "404" && s < 100;
    });
    console.log(`${low.length ? "FALHOU" : "ok"}  ${name.padEnd(14)} ${scores.map(([id, s]) => `${id}=${s}`).join(" ")}  (${metrics.join(", ")})`);
    for (const [id, audit] of Object.entries(a)) {
      if (low.length && audit.score !== null && audit.score < 0.9 && ["binary", "numeric", "metricSavings"].includes(audit.scoreDisplayMode) && audit.details?.type !== "debugdata")
        console.log(`      ${id}: ${audit.displayValue ?? audit.title}`);
    }
    process.exit(low.length ? 1 : 0);
  '

# Mede uma página uma vez: escreve o relatório e o resultado, e falha se ficar abaixo do mínimo.
measure() {
  local name="$1" path="$2"
  # Corre em /tmp: o npx não deve procurar pacotes no projeto.
  (cd /tmp && npx --yes lighthouse@12 "http://localhost:$port$path" \
    --chrome-path=/usr/bin/google-chrome --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=json --output=html --output-path="$out/$name" --quiet) || { echo "FALHOU: $name (lighthouse)"; return 1; }
  node -e "$check" "$out/$name.report.json" "$name" "$min"
}

failed=0
# Caminhos limpos (como na Vercel). A 404 é pedida por /404: o Lighthouse recusa respostas com 404.
for entry in "index:/" "provar:/provar" "passo-a-passo:/passo-a-passo" "aprender:/aprender" \
  "exercicios:/exercicios" "en-index:/en" "en-prove:/en/prove" "en-step:/en/step-by-step" \
  "en-learn:/en/learn" "en-exercises:/en/exercises" "404:/404"; do
  name="${entry%%:*}"
  path="${entry#*:}"
  # A Performance varia entre corridas: quem falha é medido mais duas vezes e tem de passar nas duas
  # (a mediana das três). As outras categorias não dependem da sorte, por isso não mudam.
  measure "$name" "$path" && continue
  { measure "$name" "$path" && measure "$name" "$path"; } || failed=1
done

if [ "$failed" -ne 0 ]; then echo "Lighthouse: há páginas abaixo de $min"; exit 1; fi
echo "Lighthouse: todas as páginas ≥ $min"
