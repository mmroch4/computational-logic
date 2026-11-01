import { test } from "node:test";
import assert from "node:assert/strict";
import { clauseSetModel, renderClauseSet } from "../js/ui/clause-set-view.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { getExample } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

function traceOf(text) {
  return solveDLL(parse(text).clauses).trace;
}

const states = (model) => model.cards.map((c) => c.state);

test("start: o conjunto de entrada, todas as cláusulas normais e sem regra", () => {
  const model = clauseSetModel(traceOf("p1, -p1 -p2, p3 p2"), 0);
  assert.equal(model.type, "start");
  assert.equal(model.rule, null);
  assert.deepEqual(states(model), ["normal", "normal", "normal"]);
  assert.equal(model.after, null);
});

test("unit (cadeia de propagações, passo 1): {p1} unitária, ¬p1 riscado, o resto igual", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  const model = clauseSetModel(trace, 1);
  assert.equal(model.rule, "unit");
  assert.equal(states(model)[0], "unit");
  assert.equal(states(model)[1], "shortened");
  assert.deepEqual(model.cards[1].struck, [0]); // ¬p1 em ¬p1 ∨ ¬p2
  assert.ok(states(model).slice(2).every((s) => s === "normal"));
  assert.deepEqual(model.after, trace[1].after);
});

test("unit: cláusulas com l ficam satisfeitas; a que fica sem literais fica F", () => {
  // p, p q, -p: propagar p remove {p} e {p ∨ q}; {¬p} fica F.
  const model = clauseSetModel(traceOf("p, p q, -p"), 1);
  assert.deepEqual(states(model), ["unit", "satisfied", "empty"]);
  assert.deepEqual(model.cards[2].struck, [0]);
});

test("unit: cláusula encurtada igual a outra colapsa (merged)", () => {
  // propagar p: ¬p ∨ q fica q, que já existe.
  const model = clauseSetModel(traceOf("p, q r, q, -p q"), 1);
  assert.deepEqual(states(model), ["unit", "normal", "normal", "merged"]);
});

test("branch: a cláusula {l} acrescentada no fim é 'nova'", () => {
  const trace = traceOf(getExample("two-branches").input);
  const model = clauseSetModel(trace, 1);
  assert.equal(model.rule, "branch");
  assert.deepEqual(states(model), ["normal", "normal", "normal", "normal", "new"]);
  assert.deepEqual(model.cards[4].clause, [{ v: "p", neg: false }]);
});

test("conflict, backtrack e sat", () => {
  const trace = traceOf(getExample("two-branches").input);
  const conflict = clauseSetModel(trace, 4);
  assert.equal(conflict.rule, "conflict");
  assert.ok(states(conflict).includes("empty"));

  // O backtrack volta ao conjunto do nó pai (o before da ramificação seguinte).
  const back = clauseSetModel(trace, 5);
  assert.equal(back.rule, "backtrack");
  assert.deepEqual(back.cards.map((c) => c.clause), trace[6].before);

  const sat = traceOf("p q");
  const last = sat.findIndex((e) => e.type === "sat");
  assert.equal(clauseSetModel(sat, last).cards.length, 0);
});

test("result: mostra o último conjunto conhecido", () => {
  const trace = traceOf(getExample("two-branches").input);
  const model = clauseSetModel(trace, trace.length - 1);
  assert.deepEqual(model.cards.map((c) => c.clause), trace[9].S);
});

test("renderClauseSet: etiquetas, literal riscado com texto para leitores de ecrã, F e 'Fica'", () => {
  setLang("pt", { silent: true });
  const html = renderClauseSet(clauseSetModel(traceOf("p, p q, -p"), 1));
  assert.match(html, /clause-set rule-unit/);
  assert.match(html, /clause unit[^]*unitária/);
  assert.match(html, /clause gone[^]*satisfeita/);
  assert.match(html, /<s class="lit lit--strike">¬p<span class="sr-only"> \(removido\)<\/span><\/s>/);
  assert.match(html, /Fica:<\/span> <span class="clause-set__after-set">\{F\}/);
  assert.match(html, /3 → 1 cláusula/);
});

test("renderClauseSet: S vazio e EN", () => {
  setLang("en", { silent: true });
  const trace = traceOf("p q");
  const html = renderClauseSet(clauseSetModel(trace, trace.findIndex((e) => e.type === "sat")));
  assert.match(html, /rule-sat/);
  assert.match(html, /\{ \}/);
  assert.match(html, /empty set/);
  setLang("pt", { silent: true });
});

test("renderClauseSet: F sem literais riscados não repete a etiqueta F", () => {
  setLang("pt", { silent: true });
  const trace = traceOf("p, -p");
  const html = renderClauseSet(clauseSetModel(trace, trace.findIndex((e) => e.type === "conflict")));
  assert.match(html, /clause clause--empty/);
  assert.doesNotMatch(html, /clause__tag/);
});

test("último passo: S vazio desenhado no resultado satisfazível, e a última conclusão no insatisfazível", () => {
  setLang("pt", { silent: true });
  const sat = traceOf("p q");
  const model = clauseSetModel(sat, sat.length - 1);
  assert.equal(model.rule, "sat");
  assert.match(renderClauseSet(model), /clause-set__empty-set">\{ \}/);
  assert.match(renderClauseSet(model), /conjunto vazio/);

  const unsat = traceOf("p, -p");
  const last = clauseSetModel(unsat, unsat.length - 1);
  assert.equal(last.rule, "conflict");
  assert.doesNotMatch(renderClauseSet(last), /clause-set__empty/);
});
