// Solver de 1.ª ordem (M3): first-order-search.js, as caixas [v] no derivation.js e a ligação ao solve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STRATEGY_CODES } from "../js/core/derivation.js";
import { searchFirstOrder } from "../js/core/first-order-search.js";
import { format } from "../js/core/formula.js";
import { formatProof } from "../js/core/proof-text.js";
import { subproofs } from "../js/core/proof.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { MAX_STEPS, solve } from "../js/core/solver.js";
import { COUNTERMODEL_LIMITS, isCountermodel } from "../js/core/structures.js";
import { verifyProof } from "../js/core/verify.js";
import { INVALID_FIRST_ORDER, VALID_FIRST_ORDER } from "./fixtures/first-order-sequents.js";

const goalOf = (text) => parseSequent(text).sequent;
const textOf = (proof) => formatProof(proof).split("\n").map((line) => line.trimEnd()).join("\n");
const UNDECIDED = { ok: false, error: { code: "undecided", params: { maxSize: COUNTERMODEL_LIMITS.maxSize } } };

test("a lista fixa tem pelo menos 20 sequentes válidos e todos se leem", () => {
  assert.ok(VALID_FIRST_ORDER.length >= 20);
  for (const text of [...VALID_FIRST_ORDER, ...INVALID_FIRST_ORDER]) assert.ok(goalOf(text), text);
});

test("todos os válidos têm prova verificada, dentro de MAX_STEPS, com estratégias conhecidas", () => {
  for (const text of VALID_FIRST_ORDER) {
    const goal = goalOf(text);
    const result = solve(goal);
    assert.equal(result.ok && result.provable, true, text);
    assert.ok(result.steps <= MAX_STEPS, text);
    assert.equal(verifyProof(result.proof, goal, RULES).ok, true, text);
    for (const line of result.proof.lines) {
      if (line.kind !== "premise") assert.ok(STRATEGY_CODES.includes(line.strategy), text);
    }
  }
});

test("nenhum inválido dá prova: sai o contramodelo ou, sem ele, «por decidir»", () => {
  for (const text of INVALID_FIRST_ORDER) {
    const goal = goalOf(text);
    const result = solve(goal);
    if (result.ok) {
      assert.equal(result.valid, false, text);
      assert.equal(isCountermodel(goal, result.structure), true, text);
    } else {
      assert.deepEqual(result, UNDECIDED, text);
    }
    // A procura sozinha, sem o contramodelo à frente, também não encontra nada.
    assert.notEqual(searchFirstOrder(goal, { rules: RULES, maxSteps: 5000 }).status, "found", text);
  }
});

test("a prova do exemplo dos slides sai como no SPEC, com a caixa [v] no ∀E", () => {
  const result = solve(goalOf("∀x(P(x) → Q(x)), ∀x P(x) ⊢ ∀x Q(x)"));
  assert.equal(textOf(result.proof), [
    "1 | ∀x(P(x) → Q(x))   premissa",
    "2 | ∀x P(x)           premissa",
    "3 |  [u] P(u)         ∀E, 2",
    "4 |   P(u) → Q(u)     ∀E, 1",
    "5 |   Q(u)            →E, 3, 4",
    "6 | ∀x Q(x)           ∀I, 3–5",
  ].join("\n"));
  assert.equal(result.proof.lines[2].strategy, "openForallBox");
  assert.equal(result.proof.lines[5].strategy, "concludeForall");
});

test("o ∃E abre uma caixa com a hipótese [v] e o objetivo sai dela", () => {
  const result = solve(goalOf("∀x(P(x) → Q(x)), ∃x P(x) ⊢ ∃x Q(x)"));
  const hypothesis = result.proof.lines.find(({ kind }) => kind === "hypothesis");
  assert.equal(hypothesis.fresh, "u");
  assert.equal(hypothesis.strategy, "assumeWitness");
  const last = result.proof.lines.at(-1);
  assert.equal(last.rule, "∃E");
  assert.equal(last.strategy, "concludeFromWitness");
  assert.ok(result.proof.lines.some(({ rule, strategy }) => rule === "∃I" && strategy === "showWitness"));
});

test("um ∀I que começa numa hipótese usa a linha de etiqueta", () => {
  const result = solve(goalOf("∀x(P(x) → Q(x)), ∀x(Q(x) → R(x)) ⊢ ∀x(P(x) → R(x))"));
  const hypothesis = result.proof.lines.find(({ kind }) => kind === "hypothesis");
  assert.equal(hypothesis.label, "u");
  assert.ok(subproofs(result.proof).some(({ fresh, label }) => fresh === "u" && label));
});

test("duas caixas do ∀I seguidas: a de fora começa por repetir um facto, ou por =I sem nenhum", () => {
  const repeated = solve(goalOf("∀x∀y R(x, y) ⊢ ∀y∀x R(x, y)")).proof.lines;
  assert.deepEqual([repeated[1].rule, repeated[1].fresh, repeated[1].strategy], ["R", "u", "separateBoxes"]);
  assert.equal(repeated[2].fresh, "v");
  const reflexive = solve(goalOf("⊢ ∀x∀y(P(x) → P(x))")).proof.lines;
  assert.deepEqual([reflexive[0].rule, reflexive[0].fresh, reflexive[0].strategy], ["=I", "u", "separateBoxes"]);
});

test("as variáveis novas não ocorrem no sequente", () => {
  const result = solve(goalOf("∀u P(u), ∀v Q(v) ⊢ ∀w(P(w) ∧ Q(w))"));
  assert.equal(result.provable, true);
  const fresh = result.proof.lines.map((line) => line.fresh ?? line.label).filter(Boolean);
  assert.deepEqual(fresh, ["s"]);
});

test("um termo do objetivo serve para o ∀E, e um sequente sem termos usa uma constante", () => {
  const withFunction = solve(goalOf("∀x∀y(f(x) = y → R(x, y)) ⊢ ∀x R(x, f(x))"));
  assert.equal(withFunction.provable, true);
  assert.ok(withFunction.proof.lines.some(({ rule, formula }) => rule === "=I" && format(formula) === "f(u) = f(u)"));
  const constant = solve(goalOf("∀x P(x) ⊢ ∃x P(x)"));
  assert.equal(textOf(constant.proof), [
    "1 | ∀x P(x)   premissa",
    "2 | P(a)      ∀E, 1",
    "3 | ∃x P(x)   ∃I, 2",
  ].join("\n"));
});

test("respeita o conjunto ativo: sem RA usa ¬I e ¬E, sem a regra precisa fica por decidir", () => {
  const goal = goalOf("¬∀x P(x) ⊢ ∃x ¬P(x)");
  const rules = ruleSet({ set: "base", exclude: ["RA"] });
  const result = solve(goal, { rules });
  assert.equal(result.provable, true);
  assert.equal(verifyProof(result.proof, goal, rules).ok, true);
  assert.ok(result.proof.lines.every(({ rule }) => rule !== "RA"));
  assert.deepEqual(solve(goalOf("⊢ ∀x x = x"), { rules: ruleSet({ set: "base", exclude: ["∀I"] }) }), UNDECIDED);
  assert.deepEqual(solve(goalOf("a = b ⊢ b = a"), { rules: ruleSet({ set: "base", exclude: ["=I"] }) }), UNDECIDED);
});

test("a procura acaba com stepLimit ou exhausted e nunca passa de maxSteps", () => {
  const goal = goalOf(INVALID_FIRST_ORDER.at(-1));
  const limited = searchFirstOrder(goal, { rules: RULES, maxSteps: 300 });
  assert.equal(limited.status, "stepLimit");
  assert.ok(limited.steps <= 301);
  const rules = ruleSet({ set: "restrito", only: ["∀E", "→E"] });
  const exhausted = searchFirstOrder(goalOf("∀x(P(x) → Q(x)) ⊢ Q(a)"), { rules, maxSteps: MAX_STEPS });
  assert.equal(exhausted.status, "exhausted");
});
