// M8.5b: fontes e imagens otimizadas. O pedido ao Google Fonts traz só os pesos que o CSS usa (Geist
// 400/500/600, JetBrains Mono 400/500), com font-display: swap e preconnect, e o CSS
// não pede pesos fora desses (o browser sintetizava um negrito falso ou descarregava mais uma face).
// A medição no browser (fontes usadas e descarregadas, peso por página) é o check-page.sh com MEASURE=1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const PAGES = ["index.html", "resolver.html", "passo-a-passo.html", "aprender.html", "exercicios.html", "404.html"];
// Só o CSS escrito à mão: o css/app.css é gerado e traz o reset do Tailwind e o Basecoat.
const CSS_FILES = ["css/src/app.css"];

const WEIGHTS = { Geist: ["400", "500", "600"], "JetBrains Mono": ["400", "500"] };

// "family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500" → { Geist: [...], ... }
function requestedWeights(href) {
  const families = {};
  for (const m of href.matchAll(/family=([^:&]+):wght@([\d;]+)/g)) families[m[1].replace(/\+/g, " ")] = m[2].split(";");
  return families;
}

test("cada página pede ao Google Fonts só os pesos usados, com display=swap e preconnect", () => {
  for (const page of PAGES) {
    const html = read(page);
    // M8.5c: a CSS das fontes não bloqueia o primeiro desenho (preload, e o js/boot.js acrescenta a
    // stylesheet), com um <noscript> para quem não tem JS. Ambos pedem o mesmo URL.
    const links = [
      ...html.matchAll(
        /<link rel="preload" as="style" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)">/g,
      ),
    ];
    assert.equal(links.length, 1, `${page}: um só pedido de fontes`);
    const fallback = [...html.matchAll(/<noscript><link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"><\/noscript>/g)];
    assert.deepEqual(fallback.map((m) => m[1]), [links[0][1]], `${page}: <noscript> com o mesmo pedido`);
    assert.doesNotMatch(html, /(?<!<noscript>)<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/, `${page}: CSS das fontes a bloquear`);
    const href = links[0][1].replace(/&amp;/g, "&");
    assert.deepEqual(requestedWeights(href), WEIGHTS, page);
    assert.match(href, /[?&]display=swap\b/, `${page}: falta display=swap`);
    assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/, `${page}: preconnect da CSS`);
    assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/, `${page}: preconnect das fontes`);
    // O preconnect tem de vir antes da folha de estilo para abrir a ligação mais cedo.
    assert.ok(html.indexOf("fonts.gstatic.com") < html.indexOf(links[0][0]), `${page}: preconnect depois da CSS`);
  }
});

test("o CSS só usa os pesos descarregados (tokens --weight-*, sem bold nem 700)", () => {
  const tokens = stripComments(read("css/src/app.css"));
  const tokenWeights = Object.fromEntries([...tokens.matchAll(/(--weight-[\w-]+)\s*:\s*(\d+)/g)].map((m) => [m[1], m[2]]));
  const allowed = new Set([...WEIGHTS.Geist, ...WEIGHTS["JetBrains Mono"]]);
  for (const value of Object.values(tokenWeights)) assert.ok(allowed.has(value), `token com peso ${value} não descarregado`);

  let declarations = 0;
  for (const file of CSS_FILES) {
    const css = stripComments(read(file));
    for (const m of css.matchAll(/font-weight\s*:\s*([^;}]+)/g)) {
      const value = m[1].trim();
      declarations++;
      const token = value.match(/^var\((--weight-[\w-]+)\)$/)?.[1];
      assert.ok(token ? token in tokenWeights : value === "inherit", `${file}: font-weight: ${value}`);
    }
    // O atalho font: … bold também contaria; não se usa.
    assert.doesNotMatch(css, /\bfont\s*:[^;}]*\b(bold|bolder|[7-9]00)\b/, `${file}: atalho font com negrito`);
  }
  assert.ok(declarations >= 30, `só ${declarations} declarações encontradas`);
});

test("o mono nunca pede o semibold (o JetBrains Mono só vem até ao 500)", () => {
  let mono = 0;
  for (const file of CSS_FILES) {
    for (const [, selector, body] of stripComments(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/font-family:\s*var\(--font-mono\)/.test(body)) continue;
      mono++;
      assert.doesNotMatch(body, /font-weight:\s*var\(--weight-semibold\)/, `${file}: ${selector.trim()}`);
    }
  }
  assert.ok(mono >= 20, `só ${mono} regras em mono encontradas`);
});

test("strong e b usam o semibold (o negrito do browser é 700, que não se descarrega)", () => {
  const base = stripComments(read("css/src/app.css"));
  assert.match(base, /strong,\s*b\s*\{\s*font-weight:\s*var\(--weight-semibold\);/);
});

test("as imagens servidas são pequenas (favicon SVG, apple-touch-icon e og-image)", () => {
  const size = (file) => statSync(new URL(`../${file}`, import.meta.url)).size;
  assert.ok(size("favicon.svg") <= 2 * 1024, "favicon.svg > 2 KB");
  assert.ok(size("apple-touch-icon.png") <= 20 * 1024, "apple-touch-icon.png > 20 KB");
  // A og-image só é lida pelas pré-visualizações de links (não pela página); 1200×630 em PNG.
  assert.ok(size("og-image.png") <= 150 * 1024, "og-image.png > 150 KB");
  assert.ok(size("og-image-en.png") <= 150 * 1024, "og-image-en.png > 150 KB");
  // Nenhuma página carrega imagens raster (<img> ou url() no CSS): os ícones são SVG inline.
  for (const page of PAGES) assert.doesNotMatch(read(page), /<img\b/, `${page}: <img>`);
  for (const file of CSS_FILES) assert.doesNotMatch(stripComments(read(file)), /url\(/, `${file}: url()`);
});
