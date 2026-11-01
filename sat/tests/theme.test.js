// Tema: o @theme de css/src/app.css é a fonte dos tokens e o css/app.css publica-os como variáveis e
// utilitários.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

// Declarações --nome: valor de um bloco de CSS, com os espaços normalizados.
function declarations(css) {
  const found = {};
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) found[m[1]] = m[2].trim().replace(/\s+/g, " ").toLowerCase();
  return found;
}

const theme = declarations(stripComments(read("css/src/app.css")).match(/@theme static \{([\s\S]*?)\n\}/)[1]);

const TOKENS = `
  --color-bg --color-surface --color-surface-2 --color-hairline --color-border --color-border-strong
  --color-text --color-text-2 --color-text-muted --color-text-subtle --color-ink --color-ink-hover
  --color-tree-future --color-ev-unit --color-ev-unit-soft --color-ev-branch --color-ev-branch-soft
  --color-ev-conflict --color-ev-conflict-soft --color-ev-sat --color-ev-sat-soft --color-ev-back
  --color-ev-back-soft --color-ev-res --color-ev-res-soft --font-sans --font-mono --radius-xs --radius-sm
  --radius-md --radius-lg --radius-xl --radius-full --shadow-sm --shadow-md --shadow-lg --dur-fast
  --dur-base --dur-slow --ease --content-max
`.trim().split(/\s+/);

test("o @theme tem todos os tokens do sistema visual", () => {
  for (const token of TOKENS) assert.ok(token in theme, `${token} falta no @theme`);
});

test("só o css/app.css chega às páginas: nenhuma folha antiga fica ao lado dele", () => {
  assert.deepEqual(readdirSync(new URL("../css/", import.meta.url)).filter((f) => f.endsWith(".css")), ["app.css"]);
});

test("o css/app.css traz as variáveis do tema e os utilitários dos eventos", () => {
  const css = read("css/app.css");
  for (const token of ["--color-surface:#fafafa", "--color-ev-sat:#15803d", "--color-ev-res-soft:#fdf4ff", "--radius-lg:12px", "--dur-slow:.32s"]) {
    assert.ok(css.includes(token), `${token} não está no css/app.css`);
  }
  for (const event of ["unit", "branch", "conflict", "sat", "back", "res"]) {
    assert.ok(css.includes(`.text-ev-${event}`), `.text-ev-${event}`);
  }
});

test("as variáveis do Basecoat apontam para os tokens do redesign", () => {
  const css = stripComments(read("css/src/app.css"));
  const root = declarations(css.match(/:root \{\s*--radius[\s\S]*?\}/)[0]);
  const expected = {
    "--radius": "10px",
    "--background": "var(--color-bg)",
    "--foreground": "var(--color-text)",
    "--primary": "var(--color-ink)",
    "--primary-foreground": "#fff",
    "--secondary": "var(--color-surface-2)",
    "--muted": "var(--color-surface-2)",
    "--accent": "var(--color-surface-2)",
    "--muted-foreground": "var(--color-text-muted)",
    "--border": "var(--color-border)",
    "--input": "var(--color-border-strong)",
    "--ring": "var(--color-ink)",
    "--destructive": "var(--color-ev-conflict)",
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(root[name], value, name);
});

test("o índigo antigo não volta", () => {
  assert.doesNotMatch(read("css/app.css"), /#4338ca/i);
});

test("a cópia parcial do tema do Basecoat diz de que versão veio, a instalada", () => {
  const { version } = JSON.parse(read("node_modules/basecoat-css/package.json"));
  assert.ok(read("css/src/basecoat-vega.css").startsWith(`/* Parte de basecoat-css@${version} `));
});

test("o anel de foco vem depois do Basecoat, que tira o contorno aos componentes", () => {
  const css = stripComments(read("css/src/app.css"));
  const rule = css.match(/@layer components \{\s*:focus-visible \{([^}]*)\}/);
  assert.ok(rule, "falta :focus-visible em @layer components");
  assert.match(rule[1], /outline:\s*2px solid var\(--color-ink\)/);
  assert.match(rule[1], /outline-offset:\s*2px/);
  assert.ok(css.indexOf('@import "./basecoat-vega.css"') >= 0, "falta o tema do Basecoat");
  assert.ok(css.indexOf(rule[0]) > css.indexOf('@import "./basecoat-vega.css"'));
});
