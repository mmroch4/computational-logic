// prefers-reduced-motion (M8.2.3). As durações vêm só dos tokens --dur-*, que o tema põe a 0
// com movimento reduzido; por isso nenhuma transição ou animação pode ter um tempo escrito à mão.
// A verificação no browser (com emulação) é o check-page.sh com REDUCED_MOTION=1 (scripts/motion-audit.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
// Só o CSS escrito à mão: o css/app.css é gerado e traz o reset do Tailwind e o Basecoat.
const CSS_FILES = ["css/src/app.css"];

// Um tempo literal (300ms, .2s, 1s) fora de var(); calc(var(--dur-slow) * 2) não conta.
const LITERAL_TIME = /(^|[\s,(])\.?\d[\d.]*m?s\b/;

test("transições e animações só usam os tokens --dur-*", () => {
  let declarations = 0;
  for (const file of CSS_FILES) {
    const css = stripComments(read(file));
    for (const m of css.matchAll(/(?:^|[;{\s])((?:transition|animation)(?:-duration|-delay)?)\s*:\s*([^;}]+)/g)) {
      const [, property, value] = m;
      declarations++;
      assert.doesNotMatch(value.replace(/var\([^)]*\)/g, "var"), LITERAL_TIME, `${file}: ${property}: ${value.trim()}`);
    }
  }
  assert.ok(declarations >= 15, `só ${declarations} declarações encontradas`);
});

test("o tema põe as durações a 0 e trava as dos componentes do Basecoat, que não usam os tokens", () => {
  const css = stripComments(read("css/src/app.css"));
  const theme = css.match(/@theme static \{([\s\S]*?)\n\}/)[1];
  const names = [...theme.matchAll(/(--dur-[\w-]+)\s*:/g)].map((m) => m[1]);
  assert.ok(names.length >= 3, "tokens --dur-* em falta");
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const name of names) assert.match(block, new RegExp(`${name}\\s*:\\s*0ms`), `${name} não fica a 0`);
  for (const property of ["transition-duration", "animation-duration"]) {
    assert.match(block, new RegExp(`${property}:\\s*var\\(--dur-fast\\) !important`), property);
  }
  assert.match(block, /::details-content\s*\{/, "o <details> do Basecoat anima o conteúdo");
});

test("o JS não escreve tempos de animação à mão: só tokens, pelo js/ui/motion.js", () => {
  const files = [];
  for (const dir of ["js/ui", "js/pages"]) {
    for (const name of readdirSync(new URL(`../${dir}/`, import.meta.url))) {
      if (name.endsWith(".js")) files.push(`${dir}/${name}`);
    }
  }
  assert.ok(files.includes("js/ui/motion.js"), "falta o js/ui/motion.js");
  const LITERAL = /\b(?:dur|duration|delay|offset|stagger|gap)\s*:\s*(?:[1-9]|0?\.\d)/;
  for (const file of files) {
    const js = read(file);
    assert.doesNotMatch(js, LITERAL, `${file}: tempo escrito à mão`);
    assert.doesNotMatch(js, /\.animate\(/, `${file}: animações só pelo js/ui/motion.js`);
    if (file !== "js/ui/motion.js") assert.doesNotMatch(js, /vendor\/motion-mini/, `${file}: só o motion.js importa o vendor`);
  }
  // No motion.js, as durações que chegam ao motion vêm dos tokens.
  assert.match(read("js/ui/motion.js"), /--dur-\$\{token\}/);
});

test("scroll suave só com prefers-reduced-motion: no-preference (CSS e JS)", () => {
  for (const file of CSS_FILES) {
    const css = stripComments(read(file));
    for (const m of css.matchAll(/scroll-behavior\s*:\s*smooth/g)) {
      const before = css.slice(0, m.index);
      const media = before.lastIndexOf("@media (prefers-reduced-motion: no-preference)");
      assert.ok(media >= 0 && !/\n\}/.test(before.slice(media)), `${file}: scroll-behavior: smooth fora do no-preference`);
    }
  }
  // No JS, o scroll é sempre instantâneo ou herda o do CSS: nada de behavior: "smooth" escrito à mão.
  const jsDirs = ["js/ui", "js/pages"];
  for (const dir of jsDirs) {
    for (const f of readdirSync(new URL(`../${dir}/`, import.meta.url)).filter((n) => n.endsWith(".js"))) {
      assert.doesNotMatch(read(`${dir}/${f}`), /behavior\s*:\s*["']smooth["']/, `${dir}/${f}`);
    }
  }
});
