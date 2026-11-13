// Semântica de 1.ª ordem em estruturas finitas: avaliação, procura de contramodelos e resultado de três estados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFormula } from "../js/core/parser.js";
import { parseSequent } from "../js/core/sequent.js";
import {
  COUNTERMODEL_LIMITS,
  evaluateIn,
  findCountermodel,
  firstOrderVerdict,
  isCountermodel,
  signatureOf,
} from "../js/core/structures.js";
import { finiteCountermodel } from "./helpers/finite-models.js";

const formulaOf = (text) => {
  const result = parseFormula(text);
  assert.ok(result.ok, text);
  return result.formula;
};
const goalOf = (text) => {
  const result = parseSequent(text);
  assert.ok(result.ok, text);
  return result.sequent;
};

// Domínio {0, 1, 2}: a = 0, b = 2, s(x) = x + 1 mod 3, P = {1}, R = ordem estrita, p verdadeiro.
const STRUCTURE = {
  size: 3,
  constants: [
    { name: "a", value: 0 },
    { name: "b", value: 2 },
  ],
  functions: [{ name: "s", arity: 1, table: [0, 1, 2].map((x) => ({ args: [x], value: (x + 1) % 3 })) }],
  predicates: [
    { name: "P", arity: 1, extension: [[1]] },
    {
      name: "R",
      arity: 2,
      extension: [
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    },
    { name: "p", arity: 0, extension: [[]] },
    { name: "q", arity: 0, extension: [] },
  ],
};

test("evaluateIn: átomos, funções, igualdade e conectivos", () => {
  const cases = [
    ["P(s(a))", true],
    ["P(a)", false],
    ["R(a, b)", true],
    ["R(b, a)", false],
    ["s(s(b)) = s(a)", true],
    ["a = b", false],
    ["p & ~q", true],
    ["q | P(b)", false],
    ["P(a) -> F", true],
    ["F", false],
  ];
  for (const [text, expected] of cases) assert.equal(evaluateIn(formulaOf(text), STRUCTURE), expected, text);
});

test("evaluateIn: quantificadores", () => {
  const cases = [
    ["exists x P(x)", true],
    ["forall x P(x)", false],
    ["forall x exists y R(x, y)", false],
    ["exists x forall y (x = y | R(x, y))", true],
    ["forall x ~R(x, x)", true],
    ["forall x exists y s(y) = x", true],
    ["forall x forall y forall z (R(x, y) & R(y, z) -> R(x, z))", true],
    ["exists x (P(x) & forall x R(a, x))", false],
  ];
  for (const [text, expected] of cases) assert.equal(evaluateIn(formulaOf(text), STRUCTURE), expected, text);
});

test("evaluateIn: um quantificador que tapa outro não pisa a casa de um terceiro", () => {
  const structure = { size: 2, constants: [], functions: [], predicates: [{ name: "R", arity: 2, extension: [[0, 1]] }] };
  assert.equal(evaluateIn(formulaOf("exists x exists x exists y R(x, y)"), structure), true);
  assert.equal(evaluateIn(formulaOf("forall x exists x forall y ~R(y, x)"), structure), true);
});

test("evaluateIn: o env dá valor às variáveis livres; sem ele, lê-se a constante", () => {
  const formula = formulaOf("P(x)");
  assert.equal(evaluateIn(formula, STRUCTURE, new Map([["x", 1]])), true);
  assert.equal(evaluateIn(formula, STRUCTURE, new Map([["x", 2]])), false);
  assert.equal(evaluateIn(formula, { ...STRUCTURE, constants: [{ name: "x", value: 1 }] }), true);
  assert.equal(evaluateIn(formulaOf("forall y (R(x, y) -> P(y) | y = b)"), STRUCTURE, new Map([["x", 0]])), true);
});

test("evaluateIn: lança um erro se faltar um símbolo ou um valor sair do domínio", () => {
  assert.throws(() => evaluateIn(formulaOf("Q(a)"), STRUCTURE));
  assert.throws(() => evaluateIn(formulaOf("P(c)"), STRUCTURE));
  assert.throws(() => evaluateIn(formulaOf("g(a) = a"), STRUCTURE));
  assert.throws(() => evaluateIn(formulaOf("P(a)"), { ...STRUCTURE, constants: [{ name: "a", value: 3 }] }));
  const partial = { ...STRUCTURE, functions: [{ name: "s", arity: 1, table: [{ args: [0], value: 1 }] }] };
  assert.throws(() => evaluateIn(formulaOf("s(a) = a"), partial));
});

test("signatureOf: nomes livres são constantes, cada símbolo com a sua aridade", () => {
  const signature = signatureOf([formulaOf("forall x (P(x, f(a)) -> exists y y = g(x, y, c)) & P2 & P(b)")]);
  assert.deepEqual(signature.constants, ["a", "b", "c"]);
  assert.deepEqual(signature.functions, [
    { name: "f", arity: 1 },
    { name: "g", arity: 3 },
  ]);
  assert.deepEqual(signature.predicates, [
    { name: "P", arity: 1 },
    { name: "P", arity: 2 },
    { name: "P2", arity: 0 },
  ]);
});

const CLASSIC_INVALID = ["∃x P(x) ⊢ ∀x P(x)", "∀x∃y R(x, y) ⊢ ∃y∀x R(x, y)"];

const INVALID = [
  ...CLASSIC_INVALID,
  "∀x P(x) → ∀x Q(x) ⊢ ∀x(P(x) → Q(x))",
  "∃x P(x), ∃x Q(x) ⊢ ∃x(P(x) ∧ Q(x))",
  "∀x(P(x) ∨ Q(x)) ⊢ ∀x P(x) ∨ ∀x Q(x)",
  "∀x∃y R(x, y), ∀x ¬R(x, x) ⊢ ∃x∃y(R(x, y) ∧ R(y, x))",
  "P(a) ⊢ P(b)",
  "⊢ ∃x∃y ¬x = y",
  "∀x P(f(x)) ⊢ ∀x P(x)",
  "∀x∀y(f(x) = f(y) → x = y) ⊢ ∀y∃x f(x) = y ∧ ∃x∃y ¬x = y",
  "p ∨ q ⊢ p",
  "∀x(P(x) → ∃y R(x, y)) ⊢ ∃y∀x(P(x) → R(x, y))",
];

const VALID = [
  "∀x P(x) ⊢ ∃x P(x)",
  "∃y∀x R(x, y) ⊢ ∀x∃y R(x, y)",
  "∀x(P(x) → Q(x)), ∀x P(x) ⊢ ∀x Q(x)",
  "¬∃x P(x) ⊢ ∀x ¬P(x)",
  "P(a), a = b ⊢ P(b)",
  "⊢ ∀x x = x",
  "⊢ ∃x(P(x) → ∀y P(y))",
  "∀x∀y(f(x) = f(y) → x = y), ∀y∃x f(x) = y ⊢ ∀x∃y f(y) = x",
  "p → q, p ⊢ q",
  "⊢ ∀x∀x∀y(R(x, y) ∨ ¬R(x, y))",
];

test("os sequentes inválidos clássicos dão contramodelo dentro do orçamento", () => {
  for (const text of CLASSIC_INVALID) {
    const goal = goalOf(text);
    const result = findCountermodel(goal);
    assert.equal(result.status, "found", text);
    assert.ok(result.steps <= COUNTERMODEL_LIMITS.budget, text);
    assert.ok(isCountermodel(goal, result.structure), text);
  }
});

test("todo o contramodelo devolvido falha o sequente quando reavaliado", () => {
  for (const text of INVALID) {
    const goal = goalOf(text);
    const result = findCountermodel(goal);
    assert.equal(result.status, "found", text);
    const { structure } = result;
    assert.ok(structure.size >= 1 && structure.size <= COUNTERMODEL_LIMITS.maxSize, text);
    for (const premise of goal.premises) assert.equal(evaluateIn(premise, structure), true, text);
    assert.equal(evaluateIn(goal.conclusion, structure), false, text);
  }
});

test("o contramodelo é o mais pequeno e mostra domínio, constantes, funções e extensões", () => {
  assert.deepEqual(findCountermodel(goalOf("∃x P(x) ⊢ ∀x P(x)")).structure, {
    size: 2,
    constants: [],
    functions: [],
    predicates: [{ name: "P", arity: 1, extension: [[0]] }],
  });
  const { structure } = findCountermodel(goalOf("∀x P(f(x)) ⊢ P(a)"));
  assert.equal(structure.size, 2);
  assert.deepEqual(structure.constants, [{ name: "a", value: 0 }]);
  assert.deepEqual(structure.functions[0].table, [
    { args: [0], value: 1 },
    { args: [1], value: 1 },
  ]);
  assert.deepEqual(structure.predicates, [{ name: "P", arity: 1, extension: [[1]] }]);
});

test("sequentes válidos esgotam a procura sem contramodelo", () => {
  for (const text of VALID) {
    const result = findCountermodel(goalOf(text));
    assert.equal(result.status, "exhausted", text);
    assert.equal(result.structure, undefined, text);
  }
});

test("a procura acha o mesmo que a força bruta dos testes", () => {
  for (const text of [...INVALID, ...VALID]) {
    const goal = goalOf(text);
    const brute = finiteCountermodel(goal, { maxSize: 3, budget: 1 << 16 });
    const result = findCountermodel(goal, { maxSize: 3 });
    assert.equal(result.status === "found", brute !== null, text);
    if (brute) assert.equal(result.structure.size, brute.size, text);
  }
});

test("a procura respeita o domínio máximo e o orçamento", () => {
  const needsThree = goalOf("∀x∃y R(x, y), ∀x ¬R(x, x) ⊢ ∃x∃y(R(x, y) ∧ R(y, x))");
  assert.equal(findCountermodel(needsThree, { maxSize: 2 }).status, "exhausted");
  assert.equal(findCountermodel(needsThree, { maxSize: 3 }).structure.size, 3);

  assert.deepEqual(findCountermodel(needsThree, { budget: 0 }), { status: "exhausted", checked: 0, steps: 0 });
  const small = findCountermodel(needsThree, { budget: 50 });
  assert.equal(small.status, "exhausted");
  // Para na primeira estrutura que passa o orçamento: no máximo uma avaliação a mais.
  assert.ok(small.steps >= 50 && small.steps < 50 + 64, String(small.steps));

  const valid = findCountermodel(goalOf("⊢ ∀x∀y∀z(R(x, y) ∧ R(y, z) → R(x, z)) ∨ ¬∀x∀y∀z(R(x, y) ∧ R(y, z) → R(x, z))"));
  assert.equal(valid.status, "exhausted");
  assert.ok(valid.steps >= COUNTERMODEL_LIMITS.budget, String(valid.steps));
});

test("firstOrderVerdict: inválido com contramodelo, válido com prova, ou desconhecido", () => {
  let calls = 0;
  const prove = () => {
    calls += 1;
    return { lines: [] };
  };
  const invalid = firstOrderVerdict(goalOf("∃x P(x) ⊢ ∀x P(x)"), { prove });
  assert.equal(invalid.status, "invalid");
  assert.ok(isCountermodel(goalOf("∃x P(x) ⊢ ∀x P(x)"), invalid.structure));
  assert.equal(calls, 0, "com contramodelo, não se procura prova");

  const goal = goalOf("∀x P(x) ⊢ ∃x P(x)");
  assert.deepEqual(firstOrderVerdict(goal, { prove }), { status: "valid", proof: { lines: [] } });
  assert.equal(calls, 1);
  assert.deepEqual(firstOrderVerdict(goal, { prove: () => null }), { status: "unknown" });
  assert.deepEqual(firstOrderVerdict(goal), { status: "unknown" });
  // Um sequente inválido cujo contramodelo não cabe nos limites também não se afirma inválido.
  const big = goalOf("∀x∃y R(x, y), ∀x ¬R(x, x) ⊢ ∃x∃y(R(x, y) ∧ R(y, x))");
  assert.deepEqual(firstOrderVerdict(big, { limits: { maxSize: 2, budget: 1000 } }), { status: "unknown" });
});
