// A parte pura do campo de sequente. No browser, ver o scripts/check-sequent-input.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setLang } from "../js/ui/i18n.js";
import { renderExamplesPanel } from "../js/ui/examples-menu.js";
import {
  SYMBOL_KEYS,
  analyze,
  conversionTarget,
  errorHtml,
  errorRange,
  fieldErrorHtml,
  insertSymbol,
  keyboardOpen,
} from "../js/ui/sequent-input.js";
import { parseSequent } from "../js/core/sequent.js";

test("insertSymbol substitui a seleção e põe o cursor depois do símbolo", () => {
  assert.deepEqual(insertSymbol("p  q", 1, 3, " ∧ "), { value: "p ∧ q", caret: 4 });
  assert.deepEqual(insertSymbol("pq", 1, 1, "¬"), { value: "p¬q", caret: 2 });
});

test("insertSymbol não duplica espaços", () => {
  assert.equal(insertSymbol("p ", 2, 2, " ∧ ").value, "p ∧ ");
  assert.equal(insertSymbol("p q", 1, 1, " ∧ ").value, "p ∧ q");
  assert.equal(insertSymbol("", 0, 0, " ⊢ ").value, "⊢ ");
});

test("todas as teclas produzem texto que o parser aceita", () => {
  const key = Object.fromEntries(SYMBOL_KEYS.map(({ name, insert }) => [name, insert]));
  const typed = [
    key.not, key.open, "p", key.and, "q", key.or, "r", key.implies, key.falsum, key.close, key.comma, "s", key.turnstile, "t",
  ].join("");
  assert.equal(typed, "¬(p ∧ q ∨ r → F), s ⊢ t");
  assert.ok(parseSequent(typed).ok);
  assert.equal(Object.keys(key).length, SYMBOL_KEYS.length);
});

test("analyze: vazio só é erro depois de pedir, e um sequente válido é ok", () => {
  assert.equal(analyze("  ").state, "empty");
  assert.equal(analyze("  ", { showEmptyError: true }).state, "error");
  assert.equal(analyze("p ⊢ p").state, "ok");
  assert.equal(analyze("p ⊢").state, "error");
});

test("errorRange aponta o fim quando falta o ⊢, e fora disso o sítio do parser", () => {
  const missing = parseSequent("p ∧ q  ").error;
  assert.deepEqual(errorRange(missing, "p ∧ q  "), { start: 5, end: 5 });
  const bad = parseSequent("p ∧ ) ⊢ q").error;
  assert.deepEqual(errorRange(bad, "p ∧ ) ⊢ q"), { start: bad.start, end: bad.end });
});

test("errorHtml marca o intervalo e escapa o texto", () => {
  assert.equal(errorHtml("a<b", { start: 1, end: 2 }), "a<mark>&lt;</mark>b");
  assert.equal(errorHtml("ab", { start: 2, end: 2 }), "ab<mark>&nbsp;</mark>");
});

test("fieldErrorHtml dá a coluna e a mensagem, nos dois idiomas", () => {
  const text = "p ∧ ? ⊢ q";
  const { error } = parseSequent(text);
  setLang("pt", { silent: true });
  assert.equal(fieldErrorHtml(error, text), "<b>Coluna 5:</b> O símbolo «?» não faz parte da notação.");
  setLang("en", { silent: true });
  assert.equal(fieldErrorHtml(error, text), "<b>Column 5:</b> The symbol “?” is not part of the notation.");
  setLang("pt", { silent: true });
});

test("fieldErrorHtml conta caracteres, e o texto vazio não tem coluna", () => {
  const text = "😀 ? ⊢ q";
  const error = { code: "unexpectedChar", params: { char: "?" }, start: 3, end: 4 };
  assert.match(fieldErrorHtml(error, text), /Coluna 3:/);
  assert.equal(fieldErrorHtml(parseSequent("").error, ""), "Escreve uma fórmula.");
});

test("conversionTarget: só em símbolos é que se passa a ASCII", () => {
  assert.equal(conversionTarget("symbols"), "ascii");
  assert.equal(conversionTarget("ascii"), "symbols");
  assert.equal(conversionTarget("mixed"), "symbols");
});

test("keyboardOpen distingue o teclado de uma barra do browser", () => {
  assert.equal(keyboardOpen(844, 844), false);
  assert.equal(keyboardOpen(844, 780), false);
  assert.equal(keyboardOpen(844, 504), true);
});

test("o painel de exemplos mostra o título e o sequente", () => {
  const html = renderExamplesPanel();
  assert.match(html, /Lei de Peirce/);
  assert.match(html, /⊢ \(\(a → b\) → a\) → a/);
  assert.match(html, /data-example="cases"/);
});

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";

test("no Chrome a 390px: toques, teclado virtual e erros", { skip: !existsSync(CHROME) }, () => {
  const run = spawnSync("node", ["scripts/check-sequent-input.mjs"], { encoding: "utf8", timeout: 60000 });
  assert.equal(run.status, 0, run.stderr + run.stdout);
});
