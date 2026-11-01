// M8.2b: o l/l̃ do pseudocódigo vai em mono no texto traduzido, e o risco do l̃ não pode ser um traço
// horizontal (à altura do ¬ lia-se como «−p»).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitSymbols } from "../js/ui/layout.js";
import { LOCALES } from "../js/ui/i18n.js";

const symbols = (text) => splitSymbols(text).filter((p) => p.symbol).map((p) => p.text);

test("splitSymbols: l e l̃ isolados viram símbolos, o resto fica igual", () => {
  assert.deepEqual(splitSymbols("S ∪ {l̃}"), [{ text: "S ∪ {" }, { text: "l̃", symbol: true }, { text: "}" }]);
  assert.deepEqual(symbols("dado um literal l, o complementar l̃ é ¬l"), ["l", "l̃", "l"]);
  assert.deepEqual(symbols("(l × l̃)"), ["l", "l̃"]);
  assert.deepEqual(splitSymbols("sem símbolos"), [{ text: "sem símbolos" }]);
  assert.deepEqual(splitSymbols(""), [{ text: "" }]);
});

test("splitSymbols: não toca em palavras nem em variáveis com l", () => {
  for (const text of ["literal", "lógica", "l2", "pl", "l_1", "clause", "Logemann", "l̃x"]) {
    assert.deepEqual(symbols(text), [], text);
  }
});

test("splitSymbols: a junção dos pedaços devolve o texto em todos os locales", () => {
  const walk = (node) =>
    typeof node === "string" ? [node] : typeof node === "object" ? Object.values(node).flatMap(walk) : [];
  for (const locale of Object.values(LOCALES)) {
    for (const text of walk(locale)) {
      assert.equal(splitSymbols(text).map((p) => p.text).join(""), text);
    }
  }
});

test("l̃ riscado: risco diagonal na cor da propagação, sem traço horizontal", () => {
  const css = readFileSync(new URL("../css/src/app.css", import.meta.url), "utf8");
  const rule = css.match(/\n  \.lit--strike \{([^}]*\([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /to top right/);
  assert.match(rule, /var\(--color-ev-unit\)/);
  assert.match(rule, /color: var\(--color-text-subtle\)/);
  assert.doesNotMatch(rule, /\/ 100% 2px/);
});
