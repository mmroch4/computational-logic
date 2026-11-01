// Contraste AA: mede com a fórmula WCAG 2.1 os pares de cores usados no site, com os valores do @theme de
// css/src/app.css. Se alguém mudar um token, o teste diz que par deixou de passar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// Todas as cores #rrggbb do @theme.
function readTokens() {
  const tokens = {};
  for (const m of stripComments(read("css/src/app.css")).matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]] = m[2].toLowerCase();
  }
  return tokens;
}

// Cor de um token (sem o prefixo --color-); o branco é literal.
const color = (tokens, name) => (name.startsWith("#") ? name : tokens[`--color-${name}`]);

// Luminância relativa (WCAG 2.1): canais sRGB linearizados, pesos 0,2126 / 0,7152 / 0,0722.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5; // texto normal
const UI = 3; // contornos e foco

test("contrastRatio: valores de referência da WCAG", () => {
  assert.equal(contrastRatio("#000000", "#ffffff").toFixed(2), "21.00");
  assert.equal(contrastRatio("#ffffff", "#ffffff").toFixed(2), "1.00");
  // A ordem não importa.
  assert.equal(contrastRatio("#767676", "#ffffff").toFixed(2), contrastRatio("#ffffff", "#767676").toFixed(2));
  assert.ok(contrastRatio("#767676", "#ffffff") >= 4.5); // o cinzento mais claro que passa AA no branco
});

// Primeiro plano, fundo e mínimo. O --border (1,27:1) fica de fora: é decorativo, a forma dos cartões lê-se
// pelo conteúdo.
const NEUTRALS = [
  ["text", "bg", TEXT],
  ["text", "surface-2", TEXT],
  ["text-2", "bg", TEXT],
  ["text-muted", "bg", TEXT],
  ["text-muted", "surface-2", TEXT],
  ["text-subtle", "bg", TEXT],
  ["text-subtle", "surface", TEXT],
  ["#ffffff", "ink", TEXT],
  ["#ffffff", "ink-hover", TEXT],
  ["border-strong", "bg", UI],
  ["border-strong", "surface", UI],
  ["ink", "bg", UI],
  ["text-muted", "bg", UI],
];

// Em cada evento, a cor sobre bg, surface e o fundo suave, e o texto branco sobre a cor cheia.
const EVENTS = ["unit", "branch", "conflict", "sat", "back", "res"];
const eventPairs = (event) => [
  [`ev-${event}`, "bg", TEXT],
  [`ev-${event}`, "surface", TEXT],
  [`ev-${event}`, `ev-${event}-soft`, TEXT],
  ["#ffffff", `ev-${event}`, TEXT],
];

test("cada par de cores tem o contraste mínimo", () => {
  const tokens = readTokens();
  const pairs = [...NEUTRALS, ...EVENTS.flatMap(eventPairs)];
  assert.equal(pairs.length, 37);
  for (const [fg, bg, min] of pairs) {
    const [fgHex, bgHex] = [color(tokens, fg), color(tokens, bg)];
    assert.ok(fgHex && bgHex, `${fg} ou ${bg} não está no @theme`);
    const measured = contrastRatio(fgHex, bgHex);
    assert.ok(measured >= min, `${fg} sobre ${bg}: ${measured.toFixed(2)}, mínimo ${min}`);
  }
});

test("text-subtle nunca sobre surface-2 (4,40 falha o AA)", () => {
  const tokens = readTokens();
  assert.ok(contrastRatio(tokens["--color-text-subtle"], tokens["--color-surface-2"]) < TEXT);

  // CSS: a mesma regra com os dois tokens.
  for (const [, selector, body] of stripComments(read("css/src/app.css")).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const subtle = /(^|;)\s*color\s*:\s*var\(--color-text-subtle\)/.test(body);
    const onSurface2 = /background(-color)?\s*:[^;]*var\(--color-surface-2\)/.test(body);
    assert.ok(!(subtle && onSurface2), `${selector.trim()} usa text-subtle sobre surface-2`);
  }

  // Utilitários: as duas classes no mesmo elemento.
  const sources = readdirSync(new URL("../js/ui/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => `js/ui/${f}`);
  for (const file of sources) {
    for (const [, classes] of read(file).matchAll(/class="([^"]*)"/g)) {
      const both = classes.includes("text-text-subtle") && classes.includes("bg-surface-2");
      assert.ok(!both, `${file}: text-text-subtle com bg-surface-2`);
    }
  }
});
