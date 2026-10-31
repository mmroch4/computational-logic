import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SYMBOLS,
  variableHtml,
  literalHtml,
  clauseHtml,
  setHtml,
  setPreviewHtml,
  errorHtml,
  insertSymbol,
  analyze,
  fieldErrorHtml,
} from "../js/ui/formula-input.js";
import { parse } from "../js/core/parser.js";
import { lit } from "../js/core/literals.js";
import { setLang } from "../js/ui/i18n.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

test("início do conjunto: corta em cláusulas inteiras, com … só se faltar alguma", () => {
  const { clauses } = parse("p q r, -p -q -r, p -q -r, p q -r, -p q");
  assert.equal(setPreviewHtml(clauses), "{p ∨ q ∨ r, ¬p ∨ ¬q ∨ ¬r, p ∨ ¬q ∨ ¬r, …}");
  assert.equal(setPreviewHtml(clauses.slice(0, 2)), "{p ∨ q ∨ r, ¬p ∨ ¬q ∨ ¬r}");
  assert.equal(setPreviewHtml(clauses, 1), "{p ∨ q ∨ r, …}", "a primeira cláusula aparece sempre");
  assert.equal(setPreviewHtml(parse("p11 p12, -p11").clauses, 40), "{p<sub>11</sub> ∨ p<sub>12</sub>, ¬p<sub>11</sub>}");
});

test("variáveis, literais e cláusulas em HTML com subscritos e F", () => {
  assert.equal(variableHtml("p11"), "p<sub>11</sub>");
  assert.equal(variableHtml("x_2"), "x_<sub>2</sub>");
  assert.equal(variableHtml("q"), "q");
  assert.equal(literalHtml(lit("p1", true)), "¬p<sub>1</sub>");
  assert.equal(clauseHtml([lit("p1", true), lit("q")]), "¬p<sub>1</sub> ∨ q");
  assert.equal(clauseHtml([]), "F");
});

test("setHtml formata o conjunto no estilo matemático", () => {
  const { clauses } = parse("p1, -p1 -p2, F");
  assert.equal(setHtml(clauses), "{p<sub>1</sub>, ¬p<sub>1</sub> ∨ ¬p<sub>2</sub>, F}");
  assert.equal(setHtml(parse("{}").clauses), "{}");
});

test("errorHtml sublinha o intervalo do erro e escapa o texto", () => {
  const text = "p # q";
  const { error } = parse(text);
  assert.equal(errorHtml(text, error.start, error.end), "p <mark>#</mark> q");
  assert.equal(errorHtml("<p", 0, 1), "<mark>&lt;</mark>p");
  // Intervalo vazio ou fora do texto: marca um espaço no fim.
  assert.equal(errorHtml("p ∨", 3, 3), "p ∨<mark>&nbsp;</mark>");
  assert.equal(errorHtml("p", 5, 9), "p<mark>&nbsp;</mark>");
  // Erro sem posição (o conjunto inteiro é grande demais): nada marcado.
  assert.equal(errorHtml("p <q", undefined, undefined), "p &lt;q");
});

test("insertSymbol insere na seleção sem duplicar espaços", () => {
  assert.deepEqual(insertSymbol("p", 1, 1, " ∨ "), { value: "p ∨ ", caret: 4 });
  assert.deepEqual(insertSymbol("p ", 2, 2, " ∨ "), { value: "p ∨ ", caret: 4 });
  assert.deepEqual(insertSymbol("", 0, 0, " ∧ "), { value: "∧ ", caret: 2 });
  assert.deepEqual(insertSymbol("p q", 1, 1, " ∨ "), { value: "p ∨ q", caret: 3 });
  assert.deepEqual(insertSymbol("pXq", 1, 2, "¬"), { value: "p¬q", caret: 2 });
  assert.deepEqual(insertSymbol("p", 1, 1, ", "), { value: "p, ", caret: 3 });
});

test("analyze: vazio, erro (emptyInput só ao resolver) e ok", () => {
  assert.equal(analyze("   ").state, "empty");
  const empty = analyze("", { showEmptyError: true });
  assert.equal(empty.state, "error");
  assert.equal(empty.result.error.code, "emptyInput");
  assert.equal(analyze("{p, q").state, "error");
  const ok = analyze("(p ∨ ¬q) ∧ q");
  assert.equal(ok.state, "ok");
  assert.equal(ok.result.notation, "logic");
});

test("strings do input existem em PT e EN para cada símbolo", () => {
  for (const locale of [pt, en]) {
    for (const key of ["label", "placeholder", "submit", "shortcut", "symbolsLabel"]) {
      assert.equal(typeof locale.formulaInput[key], "string", key);
    }
    for (const s of SYMBOLS) assert.equal(typeof locale.formulaInput.symbols[s.name], "string", s.name);
  }
});

test("fieldErrorHtml: «Coluna N:» a negrito, sem coluna no texto vazio nem nos erros do conjunto inteiro", () => {
  setLang("pt", { silent: true });
  const column = fieldErrorHtml(parse("p, q#").error);
  assert.match(column, /^<b>Coluna 5:<\/b> /);
  assert.ok(column.includes("«#»"));
  assert.doesNotMatch(fieldErrorHtml(parse("").error), /<b>/);
  assert.doesNotMatch(fieldErrorHtml({ code: "tooManyClauses", params: { count: 2, max: 1 } }), /<b>/);
  setLang("en", { silent: true });
  assert.match(fieldErrorHtml(parse("p, q#").error), /^<b>Column 5:<\/b> /);
  setLang("pt", { silent: true });
});
