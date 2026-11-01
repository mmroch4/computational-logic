import { test } from "node:test";
import assert from "node:assert/strict";
import { FALSUM, atom, implies, meta, not } from "../js/core/formula.js";
import { parseFormula } from "../js/core/parser.js";
import { parseSchema } from "../js/core/schema.js";
import {
  MAX_VARIABLES,
  SEMANTICS_ERROR_CODES,
  checkSequent,
  checkTautology,
  evaluate,
  truthTable,
  variablesOf,
} from "../js/core/semantics.js";
import { parseSequent } from "../js/core/sequent.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

const [p, q] = ["p", "q"].map((name) => atom(name));

function formula(text) {
  const result = parseFormula(text);
  assert.ok(result.ok, text);
  return result.formula;
}

function seq(text) {
  const result = parseSequent(text);
  assert.ok(result.ok, text);
  return result.sequent;
}

/** Todas as formas de completar `partial` com valores para as variáveis em falta. */
function completions(partial, names) {
  const missing = names.filter((name) => !partial.has(name));
  return Array.from({ length: 2 ** missing.length }, (_, row) => {
    const full = new Map(partial);
    missing.forEach((name, i) => full.set(name, ((row >> i) & 1) === 0));
    return full;
  });
}

function assertRefutes(sequent, partial) {
  const names = variablesOf([...sequent.premises, sequent.conclusion]);
  for (const valuation of completions(partial, names)) {
    for (const premise of sequent.premises) assert.equal(evaluate(premise, valuation), true);
    assert.equal(evaluate(sequent.conclusion, valuation), false);
  }
}

/** Confirma por força bruta que nenhum padrão com menos variáveis fixadas refuta o sequente. */
function assertNoSmaller(sequent, size) {
  const names = variablesOf([...sequent.premises, sequent.conclusion]);
  const refutes = (partial) =>
    completions(partial, names).every(
      (valuation) =>
        sequent.premises.every((premise) => evaluate(premise, valuation)) && !evaluate(sequent.conclusion, valuation),
    );
  for (let mask = 0; mask < 2 ** names.length; mask += 1) {
    const fixed = names.filter((_, i) => (mask >> i) & 1);
    if (fixed.length >= size) continue;
    for (let row = 0; row < 2 ** fixed.length; row += 1) {
      const partial = new Map(fixed.map((name, i) => [name, ((row >> i) & 1) === 0]));
      assert.equal(refutes(partial), false, [...partial].join(" "));
    }
  }
}

test("avalia cada conectivo", () => {
  const cases = [
    ["¬p", [false, false, true, true]],
    ["p ∧ q", [true, false, false, false]],
    ["p ∨ q", [true, true, true, false]],
    ["p → q", [true, false, true, true]],
  ];
  const valuations = [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ];
  for (const [text, expected] of cases) {
    valuations.forEach(([a, b], i) => {
      assert.equal(evaluate(formula(text), new Map([["p", a], ["q", b]])), expected[i], `${text} na linha ${i}`);
    });
  }
  assert.equal(evaluate(FALSUM, new Map()), false);
  assert.equal(evaluate(not(FALSUM), new Map()), true);
});

test("avalia precedências e associatividade pela árvore", () => {
  const valuation = new Map([["p", false], ["q", false], ["r", false]]);
  assert.equal(evaluate(formula("p → q → r"), valuation), true);
  assert.equal(evaluate(formula("(p → q) → r"), valuation), false);
});

test("avaliar sem o valor de uma variável é um erro, mesmo com nomes de Object.prototype", () => {
  assert.throws(() => evaluate(p, new Map()));
  assert.throws(() => evaluate(atom("constructor"), new Map()));
});

test("recusa o que não é proposicional", () => {
  assert.throws(() => evaluate({ kind: "forall", name: "x", args: [p] }, new Map()));
  assert.throws(() => evaluate(atom("P", [atom("a")]), new Map([["P", true]])));
});

test("as variáveis vêm sem repetições e por ordem natural", () => {
  assert.deepEqual(variablesOf([formula("q ∧ p10"), formula("p2 → q"), formula("p")]), ["p", "p2", "p10", "q"]);
  assert.deepEqual(variablesOf([FALSUM]), []);
});

test("a tabela vai de tudo V a tudo F, com a primeira variável a mudar mais devagar", () => {
  const { ok, table } = truthTable([formula("q → p"), formula("p ∧ q")]);
  assert.ok(ok);
  assert.deepEqual(table.variables, ["p", "q"]);
  assert.deepEqual(table.rows, [
    { values: [true, true], results: [true, true] },
    { values: [true, false], results: [true, false] },
    { values: [false, true], results: [false, false] },
    { values: [false, false], results: [true, false] },
  ]);
});

test("sem variáveis, a tabela tem uma linha", () => {
  assert.deepEqual(truthTable([FALSUM]).table, { variables: [], rows: [{ values: [], results: [false] }] });
});

test("reconhece tautologias", () => {
  for (const text of ["p ∨ ¬p", "p → p", "¬(p ∧ ¬p)", "((p → q) → p) → p", "F → p", "¬F"]) {
    assert.deepEqual(checkTautology(formula(text)), { ok: true, valid: true, counterexample: null }, text);
  }
});

test("uma fórmula que não é tautologia traz a valoração que a falsifica", () => {
  assert.deepEqual(checkTautology(formula("p → q")).counterexample, new Map([["p", true], ["q", false]]));
  assert.deepEqual(checkTautology(FALSUM), { ok: true, valid: false, counterexample: new Map() });
});

test("as metavariáveis contam como variáveis proposicionais", () => {
  const sound = parseSchema("(φ → ψ) ∧ φ → ψ");
  assert.equal(checkTautology(sound.formula).valid, true);
  const result = checkTautology(implies(meta("φ"), meta("ψ")));
  assert.deepEqual(result.counterexample, new Map([["φ", true], ["ψ", false]]));
});

test("sequentes válidos", () => {
  for (const text of [
    "p, p → q ⊢ q",
    "p → q, ¬q ⊢ ¬p",
    "p ∨ q, ¬p ⊢ q",
    "¬¬p ⊢ p",
    "p ∧ q ⊢ q ∧ p",
    "¬(p ∧ q) ⊢ ¬p ∨ ¬q",
    "⊢ p ∨ ¬p",
  ]) {
    assert.deepEqual(checkSequent(seq(text)), { ok: true, valid: true, counterexample: null }, text);
  }
});

test("premissas inconsistentes tornam o sequente válido, seja qual for a conclusão", () => {
  for (const text of ["p, ¬p ⊢ q", "p ∧ ¬p ⊢ F", "F ⊢ q", "p → q, p, ¬q ⊢ r ∧ ¬r", "p ∨ q, ¬p, ¬q ⊢ r"]) {
    assert.deepEqual(checkSequent(seq(text)), { ok: true, valid: true, counterexample: null }, text);
  }
});

test("sequentes inválidos trazem o contraexemplo", () => {
  const cases = [
    ["p → q, q ⊢ p", [["p", false], ["q", true]]],
    ["p → q, ¬p ⊢ ¬q", [["p", false], ["q", true]]],
    ["p ∨ q, p ⊢ ¬q", [["p", true], ["q", true]]],
    ["p ∨ q ⊢ p ∧ q", [["p", true], ["q", false]]],
    ["p ⊢ q", [["p", true], ["q", false]]],
    ["⊢ F", []],
  ];
  for (const [text, expected] of cases) {
    const result = checkSequent(seq(text));
    assert.equal(result.valid, false, text);
    assert.deepEqual(result.counterexample, new Map(expected), text);
    assertRefutes(seq(text), result.counterexample);
  }
});

test("o contraexemplo só fixa as variáveis necessárias", () => {
  const cases = [
    ["p ⊢ q ∨ (r ∧ s)", [["p", true], ["q", false], ["r", false]]],
    ["⊢ p ∧ q", [["p", false]]],
    ["q ∨ ¬q ⊢ p", [["p", false]]],
    ["p ⊢ q ∧ (r ∨ ¬r)", [["p", true], ["q", false]]],
    // s não aparece com efeito: r ∧ (s ∨ ¬s) equivale a r.
    ["(p ∧ q) ∨ r ⊢ r ∧ (s ∨ ¬s)", [["p", true], ["q", true], ["r", false]]],
  ];
  for (const [text, expected] of cases) {
    const sequent = seq(text);
    const { counterexample } = checkSequent(sequent);
    assert.deepEqual(counterexample, new Map(expected), text);
    assertRefutes(sequent, counterexample);
    assertNoSmaller(sequent, counterexample.size);
  }
});

test("com vários contraexemplos possíveis, escolhe um com o mínimo de variáveis fixadas", () => {
  for (const text of ["p → q, r → s ⊢ (p ∨ r) → (q ∧ s)", "p ∨ q, r ∨ s ⊢ (p ∧ r) ∨ (q ∧ s)", "¬p ∨ q ⊢ (q → r) ∧ (r → p)"]) {
    const sequent = seq(text);
    const { valid, counterexample } = checkSequent(sequent);
    assert.equal(valid, false, text);
    assertRefutes(sequent, counterexample);
    assertNoSmaller(sequent, counterexample.size);
  }
});

test("variáveis com nomes de Object.prototype funcionam", () => {
  const result = checkSequent(seq("constructor ⊢ toString"));
  assert.deepEqual(result.counterexample, new Map([["constructor", true], ["toString", false]]));
});

test("aceita o máximo de variáveis e recusa mais um", () => {
  const names = (count) => Array.from({ length: count }, (_, i) => `p${i}`).join(" ∧ ");
  const limit = checkTautology(formula(names(MAX_VARIABLES)));
  assert.equal(limit.valid, false);
  assert.equal(limit.counterexample.size, 1);
  const error = { code: "tooManyVariables", params: { count: MAX_VARIABLES + 1, max: MAX_VARIABLES } };
  const over = formula(names(MAX_VARIABLES + 1));
  assert.deepEqual(truthTable([over]), { ok: false, error });
  assert.deepEqual(checkTautology(over), { ok: false, error });
  assert.deepEqual(checkSequent(seq(`p ⊢ ${names(MAX_VARIABLES)}`)), {
    ok: false,
    error: { code: "tooManyVariables", params: { count: MAX_VARIABLES + 1, max: MAX_VARIABLES } },
  });
});

test("todas as mensagens existem em PT e em EN, com os mesmos parâmetros", () => {
  for (const code of SEMANTICS_ERROR_CODES) {
    for (const key of ["{count}", "{max}"]) {
      assert.ok(pt.semantics.errors[code].includes(key), code);
      assert.ok(en.semantics.errors[code].includes(key), code);
    }
  }
});
