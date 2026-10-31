// Procura de provas: toda a prova encontrada passa por `verifyProof` com o catálogo completo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { and, atom, FALSUM, implies, not, or } from "../js/core/formula.js";
import { formatProof } from "../js/core/proof-text.js";
import { RULES } from "../js/core/rules.js";
import { checkSequent } from "../js/core/semantics.js";
import { formatSequent, parseSequent, sequent } from "../js/core/sequent.js";
import { MAX_STEPS, SOLVER_ERROR_CODES, solve } from "../js/core/solver.js";
import { verifyProof } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

const parse = (text) => {
  const result = parseSequent(text);
  assert.ok(result.ok, text);
  return result.sequent;
};

function assertProved(goal, options) {
  const text = formatSequent(goal);
  const result = solve(goal, options);
  assert.ok(result.ok && result.valid, `${text}: ${JSON.stringify(result.error)}`);
  const verdict = verifyProof(result.proof, goal, RULES);
  assert.ok(verdict.ok, `${text}\n${JSON.stringify(verdict.lineErrors)}`);
  return result.proof;
}

const VALID = [
  // Identidade e estruturais
  "p ⊢ p",
  "p, q ⊢ p",
  "p, p ⊢ p",
  "⊢ p → p",
  "p ⊢ q → p",
  // Conjunção e implicação
  "p ∧ q ⊢ q ∧ p",
  "p ∧ (q ∧ r) ⊢ (p ∧ q) ∧ r",
  "p → q, q → r ⊢ p → r",
  "p → (q → r) ⊢ (p ∧ q) → r",
  "(p ∧ q) → r ⊢ p → (q → r)",
  "(p ∧ q) → r, p, q ⊢ r",
  "⊢ (p → (q → r)) → ((p → q) → (p → r))",
  // Disjunção
  "p ∨ q ⊢ q ∨ p",
  "p ∨ (q ∨ r) ⊢ (p ∨ q) ∨ r",
  "p ∧ (q ∨ r) ⊢ (p ∧ q) ∨ (p ∧ r)",
  "(p ∧ q) ∨ (p ∧ r) ⊢ p ∧ (q ∨ r)",
  "p ∨ (q ∧ r) ⊢ (p ∨ q) ∧ (p ∨ r)",
  "(p ∨ q) ∧ (p ∨ r) ⊢ p ∨ (q ∧ r)",
  "p → r, q → r, p ∨ q ⊢ r",
  "p ∨ q, ¬p ⊢ q",
  // Negação e absurdo
  "p, ¬p ⊢ q",
  "F ⊢ p",
  "p → q, ¬q ⊢ ¬p",
  "p ⊢ ¬¬p",
  "¬¬p ⊢ p",
  "¬q → ¬p ⊢ p → ¬¬q",
  "p → q ⊢ ¬q → ¬p",
  "⊢ ¬(p ∧ ¬p)",
  "p → ¬p ⊢ ¬p",
  // Clássicos, só com RA
  "⊢ p ∨ ¬p",
  "¬q → ¬p ⊢ p → q",
  "¬(p ∧ q) ⊢ ¬p ∨ ¬q",
  "¬p ∨ ¬q ⊢ ¬(p ∧ q)",
  "¬(p ∨ q) ⊢ ¬p ∧ ¬q",
  "¬p ∧ ¬q ⊢ ¬(p ∨ q)",
  "⊢ ((p → q) → p) → p",
  "p → q ⊢ ¬p ∨ q",
  "¬p ∨ q ⊢ p → q",
  "¬(p → q) ⊢ p ∧ ¬q",
  "⊢ (p → q) ∨ (q → p)",
  "(p → q) → q ⊢ (q → p) → p",
  "(¬p → q) ∧ (¬p → ¬q) ⊢ p",
  "p → q ∨ r ⊢ (p → q) ∨ (p → r)",
  "(p → q) ∧ (q → p), (q → r) ∧ (r → q) ⊢ p → r",
  // Implicações para o absurdo
  "p → F, p ⊢ q",
  "p → F ⊢ ¬p",
];

test("há pelo menos 40 sequentes válidos clássicos, todos diferentes", () => {
  assert.ok(new Set(VALID).size >= 40);
  for (const text of VALID) assert.equal(checkSequent(parse(text)).valid, true, text);
});

for (const text of VALID) {
  test(`prova ${text}`, () => {
    assertProved(parse(text));
  });
}

test("a prova sai no formato de B4, com as premissas à cabeça e a conclusão no fim", () => {
  const goal = parse("p → q, q → r ⊢ p → r");
  const { lines } = assertProved(goal);
  assert.deepEqual(lines.slice(0, 2).map(({ kind }) => kind), ["premise", "premise"]);
  assert.equal(lines.at(-1).rule, "→I");
  assert.equal(lines.at(-1).depth, 0);
  const text = formatProof({ lines }, pt.proofText, pt.rules.labels);
  assert.ok(text.includes("→E"), text);
});

test("os factos que a prova não usa não viram linhas", () => {
  const { lines } = assertProved(parse("a ∧ b, c → d, c, e ∧ f ⊢ a"));
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.at(-1).citations, [{ kind: "line", line: 1 }]);
});

test("o RA é a saída quando não há outra regra para a conclusão", () => {
  const { lines } = assertProved(parse("⊢ ¬¬p → p ∨ ¬p"));
  assert.ok(lines.length > 1);
  assert.ok(assertProved(parse("⊢ p ∨ ¬p")).lines.some(({ rule }) => rule === "RA"));
});

test("as premissas repetem-se como no sequente", () => {
  const { lines } = assertProved(parse("p, p ⊢ q → p"));
  assert.deepEqual(lines.slice(0, 2).map(({ kind }) => kind), ["premise", "premise"]);
});

test("um sequente inválido devolve o contraexemplo, sem prova", () => {
  const result = solve(parse("p → q, q ⊢ p"));
  assert.equal(result.ok, true);
  assert.equal(result.valid, false);
  assert.equal(result.proof, undefined);
  assert.deepEqual([...result.counterexample], [["p", false], ["q", true]]);
});

test("variáveis a mais são o erro da semântica", () => {
  const names = Array.from({ length: 13 }, (_, index) => atom(`p${index}`));
  const goal = sequent([names.reduce(and)], names[0]);
  assert.equal(solve(goal).error.code, "tooManyVariables");
});

test("com o limite atingido não há veredicto sobre a prova", () => {
  const result = solve(parse("⊢ ((p → q) → p) → p"), { maxSteps: 2 });
  assert.deepEqual(result, { ok: false, error: { code: "stepLimit", params: { max: 2 } } });
});

test("o limite por omissão chega para os exemplos, com folga", () => {
  for (const text of VALID) {
    assert.ok(solve(parse(text)).steps < MAX_STEPS / 10, text);
  }
});

test("as mensagens de erro existem nos dois idiomas", () => {
  for (const code of SOLVER_ERROR_CODES) {
    assert.ok(pt.solver.errors[code], code);
    assert.ok(en.solver.errors[code], code);
  }
  assert.ok(pt.solver.errors.stepLimit.includes("{max}"));
  assert.ok(en.solver.errors.stepLimit.includes("{max}"));
});

test("fórmulas muito profundas não rebentam a pilha", () => {
  let negations = atom("p");
  for (let count = 0; count < 400; count += 1) negations = not(not(negations));
  assertProved(sequent([negations], atom("p")));

  let arrows = atom("p");
  for (let count = 0; count < 300; count += 1) arrows = implies(atom("q"), arrows);
  assertProved(sequent([atom("p")], arrows));
});

// Sequentes aleatórios, com semente fixa

function createRandom(seed) {
  let state = seed;
  return (limit) => {
    state = (Math.imul(state, 48271) >>> 0) % 2147483647;
    return state % limit;
  };
}

function randomFormula(random, size, names) {
  if (size <= 0) return atom(names[random(names.length)]);
  const choice = random(9);
  if (choice === 0) return FALSUM;
  if (choice <= 2) return not(randomFormula(random, size - 1, names));
  const left = randomFormula(random, random(size), names);
  const right = randomFormula(random, size - 1 - random(size), names);
  return [and, or, implies][choice % 3](left, right);
}

const SEEDS = [0x4e44, 7919, 104729, 1299709];
const TRIES_PER_SEED = 400;

test("tudo o que é válido nos sequentes aleatórios tem prova", () => {
  let proved = 0;
  for (const seed of SEEDS) {
    const random = createRandom(seed);
    for (let round = 0; round < TRIES_PER_SEED; round += 1) {
      const names = ["p", "q", "r", "s"].slice(0, 2 + random(3));
      const premises = Array.from({ length: random(4) }, () => randomFormula(random, 3, names));
      const goal = sequent(premises, randomFormula(random, 4, names));
      const result = solve(goal);
      if (result.ok && !result.valid) continue;
      assert.ok(result.ok, `${formatSequent(goal)}: ${result.error?.code}`);
      assert.ok(verifyProof(result.proof, goal, RULES).ok, formatSequent(goal));
      proved += 1;
    }
  }
  assert.ok(proved > 100, String(proved));
});
