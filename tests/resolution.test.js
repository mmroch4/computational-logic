import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../js/core/parser.js";
import { formatClause, formatSet, variablesOf } from "../js/core/clauses.js";
import { bruteForceSat } from "../js/core/verify.js";
import { generateFormula } from "../js/core/generator.js";
import { eliminateVariable, repeatedPairs, resolvent } from "../js/core/resolution.js";
import { HISTORY_EXAMPLE, historySteps, renderHistoryFigure } from "../js/ui/history-view.js";
import { setLang } from "../js/ui/i18n.js";

const clausesOf = (text) => {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
};

test("resolvente: de p ∨ C e ¬p ∨ D tira-se C ∨ D, sem literais repetidos", () => {
  const [a, b] = clausesOf("p q r, -p q s");
  assert.equal(formatClause(resolvent(a, b, "p"), "compact"), "q r s");
  const [u, v] = clausesOf("p, -p");
  assert.deepEqual(resolvent(u, v, "p"), []);
});

test("eliminar p no dois ramos dá {¬q, q} com duas tautologias descartadas", () => {
  const S = clausesOf(HISTORY_EXAMPLE);
  const result = eliminateVariable(S, "p");
  assert.deepEqual(result.positive, [2, 3]);
  assert.deepEqual(result.negative, [0, 1]);
  assert.equal(result.pairs.length, 4);
  assert.equal(result.pairs.filter((pair) => pair.tautology).length, 2);
  assert.equal(formatSet(result.after, "compact"), "-q, q");
  assert.deepEqual(eliminateVariable(result.after, "q").after, [[]]);
});

test("as cláusulas sem a variável passam iguais", () => {
  const S = clausesOf("p q, -p r, s t");
  const result = eliminateVariable(S, "p");
  assert.equal(formatSet(result.kept, "compact"), "s t");
  assert.equal(formatSet(result.after, "compact"), "s t, q r");
});

test("eliminar todas as variáveis por resolução concorda com a força bruta", () => {
  for (let seed = 1; seed <= 150; seed++) {
    let S = generateFormula({ seed, vars: 4, clauses: 6 }).clauses;
    const expected = bruteForceSat(S).sat;
    for (const v of variablesOf(S)) S = eliminateVariable(S, v).after;
    // No fim não há variáveis: ou {} (satisfazível) ou {F} (insatisfazível).
    assert.equal(S.length === 0, expected, `seed ${seed}`);
  }
});

test("figura da §6: eliminação e propagação em PT e EN, sem o aviso «brevemente» (o player do DP já existe)", () => {
  const { propagation } = historySteps();
  assert.deepEqual(propagation.after, [[]]);
  setLang("pt");
  const pt = renderHistoryFigure();
  assert.match(pt, /tautologia: descartada/);
  assert.doesNotMatch(pt, /Brevemente/);
  assert.equal((pt.match(/resolution-pair--dropped/g) || []).length, 2);
  setLang("en");
  assert.doesNotMatch(renderHistoryFigure(), /Coming soon/);
  setLang("pt");
});

test("repeatedPairs: resolvente igual a um par anterior ou a uma cláusula que fica; tautologias não contam", () => {
  const S = clausesOf("p q, p r, -p q, -p r, q");
  const { pairs, kept } = eliminateVariable(S, "p");
  const repeated = repeatedPairs(pairs, kept);
  // 0 = q, igual à cláusula que fica; 2 = r ∨ q, a mesma cláusula do par 1 (q ∨ r) por outra ordem.
  assert.deepEqual([...repeated], [0, 2]);
  assert.equal(repeatedPairs(eliminateVariable(clausesOf("p q, -p -q"), "p").pairs, []).size, 0);
});
