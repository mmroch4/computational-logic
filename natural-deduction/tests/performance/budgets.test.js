// Orçamentos de tempo. Conta a melhor de 3 medições, para o ruído da máquina não fazer falhar o teste, e
// cada orçamento dá uma folga de cerca de 5 vezes sobre o medido: serve para apanhar regressões.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hint } from "../../js/core/hints.js";
import { createProof } from "../../js/core/proof.js";
import { ruleSet } from "../../js/core/rules.js";
import { parseSequent } from "../../js/core/sequent.js";
import { solve } from "../../js/core/solver.js";
import { SOLVER_TIMEOUT_MS } from "../../js/ui/solver-worker.js";
import { HARD_SEQUENT, LONG_INVALID, PIGEONHOLE } from "./fixtures.js";

const goalOf = (text) => parseSequent(text).sequent;

function bestOf(work, runs = 3) {
  let best = Infinity;
  let result;
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    result = work();
    best = Math.min(best, performance.now() - startedAt);
  }
  return { result, ms: best };
}

function withinBudget(work, budget, runs) {
  const { result, ms } = bestOf(work, runs);
  assert.ok(ms < budget, `demorou ${Math.round(ms)} ms, com orçamento de ${budget} ms`);
  return result;
}

const TEXTBOOK = [
  "p -> q, q -> r |- p -> r",
  "~q -> ~p |- p -> ~~q",
  "|- p | ~p",
  "|- ((p -> q) -> p) -> p",
  "~(p & q) |- ~p | ~q",
  "p -> q | r |- (p -> q) | (p -> r)",
];

test("sequentes de manual: até 50 ms cada", () => {
  for (const text of TEXTBOOK) {
    const result = withinBudget(() => solve(goalOf(text)), 50);
    assert.ok(result.provable, text);
  }
});

test("dica no início de uma prova: até 100 ms", () => {
  for (const text of TEXTBOOK) {
    const goal = goalOf(text);
    const result = withinBudget(() => hint(createProof([]).proof, goal), 100);
    assert.equal(result.status, "step", text);
  }
});

test("sequente inválido com 12 variáveis: até 2 s", () => {
  const result = withinBudget(() => solve(goalOf(LONG_INVALID)), 2000);
  assert.equal(result.valid, false);
});

test("procura que esgota os passos em 12 variáveis: até 6 s", () => {
  const result = withinBudget(() => solve(goalOf(PIGEONHOLE)), 6000);
  assert.equal(result.error.code, "stepLimit");
});

test("os limites de passos acabam dentro do tempo limite do Worker, mesmo na procura do modelo", () => {
  const rules = ruleSet({ set: "base", exclude: ["¬E", "RA"] });
  const result = withinBudget(() => solve(goalOf(HARD_SEQUENT), { rules }), SOLVER_TIMEOUT_MS, 1);
  assert.equal(result.error.code, "stepLimit");
});
