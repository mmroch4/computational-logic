import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../js/core/parser.js";
import { formatSet } from "../js/core/clauses.js";
import { solveDLL } from "../js/core/dll.js";
import { propagateClause, propagationStatus } from "../js/core/propagation.js";
import {
  LAB_EXAMPLES,
  labExampleClauses,
  renderPropagationLab,
  renderRulesDiagram,
} from "../js/ui/propagation-lab.js";
import { setLang, t } from "../js/ui/i18n.js";

const clausesOf = (text) => {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
};

// Propaga sempre a primeira unitária (como o DLL) e devolve os conjuntos intermédios.
function propagateAll(S) {
  const sets = [S];
  while (propagationStatus(S) === "units") {
    const index = S.findIndex((c) => c.length === 1);
    S = propagateClause(S, index).after;
    sets.push(S);
  }
  return sets;
}

test("propagateClause: as duas regras da propagação no exemplo do diagrama", () => {
  const step = propagateClause(clausesOf("p, p q, -p r, q s"), 0);
  assert.equal(step.type, "unit");
  assert.deepEqual(step.literal, { v: "p", neg: false });
  assert.deepEqual(step.removed, [0, 1]); // regra 1: {p} e p ∨ q
  assert.deepEqual(step.shortened.map((s) => s.idx), [2]); // regra 2: ¬p ∨ r → r
  assert.equal(formatSet(step.after), "{r, q ∨ s}");
});

test("propagateClause: null se a cláusula não for unitária ou não existir", () => {
  const S = clausesOf("p q, r");
  assert.equal(propagateClause(S, 0), null);
  assert.equal(propagateClause(S, 5), null);
  assert.notEqual(propagateClause(S, 1), null);
});

test("propagateClause: {l} e {l̃} dão F", () => {
  const step = propagateClause(clausesOf("p, -p"), 0);
  assert.equal(formatSet(step.after), "{F}");
  assert.equal(propagationStatus(step.after), "unsat");
});

test("propagationStatus: sat, unsat, units e stuck", () => {
  assert.equal(propagationStatus([]), "sat");
  assert.equal(propagationStatus(clausesOf("p q, F")), "unsat");
  assert.equal(propagationStatus(clausesOf("p q, r")), "units");
  assert.equal(propagationStatus(clausesOf("p q, -p -q")), "stuck");
});

test("cadeia de propagações: só com propagação passa por (2), (3) e acaba em F", () => {
  const sets = propagateAll(labExampleClauses("chain")).map((S) => formatSet(S));
  assert.ok(sets.includes("{¬p₂, p₃ ∨ p₂, ¬p₇ ∨ p₂, ¬p₃ ∨ p₄, ¬p₃ ∨ p₅, ¬p₄ ∨ ¬p ∨ q, ¬p₅ ∨ ¬p₆ ∨ r, ¬p ∨ ¬q ∨ p₆, p ∨ p₇, ¬r ∨ p₇}"));
  assert.ok(sets.includes("{p₃, ¬p₇, ¬p₃ ∨ p₄, ¬p₃ ∨ p₅, ¬p₄ ∨ ¬p ∨ q, ¬p₅ ∨ ¬p₆ ∨ r, ¬p ∨ ¬q ∨ p₆, p ∨ p₇, ¬r ∨ p₇}"));
  assert.ok(sets.at(-1).includes("F"));
});

test("exemplos do interativo: o fim da propagação é o anunciado e concorda com o DLL", () => {
  const expected = { chain: "unsat", sat: "sat", stuck: "stuck" };
  for (const { id, text } of LAB_EXAMPLES) {
    const sets = propagateAll(labExampleClauses(id));
    assert.equal(propagationStatus(sets.at(-1)), expected[id], id);
    const { result } = solveDLL(clausesOf(text));
    if (expected[id] !== "stuck") assert.equal(result.sat, expected[id] === "sat", id);
  }
});

test("renderPropagationLab: unitárias clicáveis só enquanto se pode propagar", () => {
  setLang("pt");
  const S = labExampleClauses("chain");
  const start = renderPropagationLab({ exampleId: "chain", S });
  assert.equal((start.match(/propagation-lab__unit/g) ?? []).length, 1); // só {p₁}
  assert.match(start, /data-action="undo" aria-disabled="true"/);
  assert.match(start, /Clica numa cláusula unitária/);

  const step = propagateClause(S, 0);
  const after = renderPropagationLab({ exampleId: "chain", S: step.after, last: step, propagated: [step.literal] });
  assert.match(after, /Regra 1:/);
  assert.match(after, /lit--strike/); // ¬p₁ riscado em ¬p₁ ∨ ¬p₂
  assert.match(after, /Propagaste:/);
  assert.doesNotMatch(after, /data-action="undo" aria-disabled="true"/);

  const unsat = renderPropagationLab({ exampleId: "chain", S: clausesOf("F") });
  assert.doesNotMatch(unsat, /propagation-lab__unit/);
  assert.match(unsat, /insatisfazível/);
});

test("renderRulesDiagram: antes/depois em PT e EN", () => {
  setLang("pt");
  const pt = renderRulesDiagram();
  assert.match(pt, /Antes/);
  assert.match(pt, /Depois/);
  assert.match(pt, /saem 2 cláusulas que contêm/);
  assert.match(pt, /1 cláusula perde/);
  setLang("en");
  assert.match(renderRulesDiagram(), /2 clauses are removed because they contain/);
  setLang("pt");
});

test("rule1Count/rule2Count: frases completas no singular, plural e zero (M8.2b)", () => {
  for (const lang of ["pt", "en"]) {
    setLang(lang);
    for (const n of [0, 1, 2]) {
      assert.ok(!/go away/.test(t("learn.propagation.rule1Count", { n })));
      assert.ok(t("learn.propagation.rule2Count", { n }).length > 0);
    }
  }
  setLang("en");
  assert.equal(t("learn.propagation.rule1Count", { n: 1 }), "1 clause is removed because it contains");
  assert.equal(t("learn.propagation.rule2Count", { n: 0 }), "no clause contains");
  setLang("pt");
  assert.equal(t("learn.propagation.rule2Count", { n: 0 }), "nenhuma cláusula contém");
});
