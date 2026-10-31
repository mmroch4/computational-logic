import { test } from "node:test";
import assert from "node:assert/strict";
import { FALSUM, and, atom, equals, format, implies, meta, not, or } from "../js/core/formula.js";
import { INPUT_LIMITS, parseFormula } from "../js/core/parser.js";
import { SCHEMA_ERROR_CODES, applySubstitution, matchSchema, parseSchema } from "../js/core/schema.js";

const [p, q, r] = ["p", "q", "r"].map((name) => atom(name));
const [phi, psi, theta] = ["φ", "ψ", "θ"].map((name) => meta(name));

function schema(text) {
  const result = parseSchema(text);
  assert.ok(result.ok, `${text}: ${JSON.stringify(result.error)}`);
  return result.formula;
}

function formula(text) {
  const result = parseFormula(text);
  assert.ok(result.ok, `${text}: ${JSON.stringify(result.error)}`);
  return result.formula;
}

function assertMatches(schemaText, formulaText, expected) {
  const result = matchSchema(schema(schemaText), formula(formulaText));
  assert.ok(result.ok, `${schemaText} / ${formulaText}: ${JSON.stringify(result.error)}`);
  assert.deepEqual(Object.keys(result.substitution).sort(), Object.keys(expected).sort());
  for (const [name, value] of Object.entries(expected)) {
    assert.ok(equals(result.substitution[name], formula(value)), `${name} em ${schemaText}`);
  }
}

const errorOf = (schemaText, formulaText) => matchSchema(schema(schemaText), formula(formulaText)).error;

test("lê esquemas com metavariáveis e imprime-os", () => {
  assert.ok(equals(schema("φ ∧ ψ"), and(phi, psi)));
  assert.ok(equals(schema("¬¬θ"), not(not(theta))));
  assert.ok(equals(schema("(φ -> p) | F"), or(implies(phi, p), FALSUM)));
  assert.equal(format(schema("(φ→ψ)∧¬θ")), "(φ → ψ) ∧ ¬θ");
  assert.ok(equals(schema(format(schema("(φ→ψ)∧¬θ"))), schema("(φ→ψ)∧¬θ")));
});

test("só o parser de esquemas lê metavariáveis, e só φ, ψ e θ", () => {
  assert.equal(parseFormula("φ ∧ p").error?.code, "unexpectedChar");
  assert.equal(parseSchema("α ∧ p").error?.code, "unexpectedChar");
  assert.throws(() => meta("α"));
  assert.equal(parseSchema("φ ψ").error?.code, "missingOperator");
  assert.equal(parseSchema("φ ∧").error?.code, "missingOperand");
});

test("a metavariável é diferente de um átomo", () => {
  assert.ok(!equals(meta("φ"), p));
  assert.ok(!equals(meta("φ"), meta("ψ")));
});

test("correspondência com sucesso", () => {
  assertMatches("φ", "p ∧ q", { φ: "p ∧ q" });
  assertMatches("φ ∧ ψ", "p ∧ (q → r)", { φ: "p", ψ: "q → r" });
  assertMatches("φ → ψ", "(p ∨ q) → ¬r", { φ: "p ∨ q", ψ: "¬r" });
  assertMatches("¬¬φ", "¬¬¬p", { φ: "¬p" });
  assertMatches("φ ∧ φ", "(p → q) ∧ (p → q)", { φ: "p → q" });
  assertMatches("¬φ ∨ (φ → ψ)", "¬p ∨ (p → F)", { φ: "p", ψ: "F" });
});

test("duas metavariáveis podem receber a mesma fórmula", () => {
  assertMatches("φ ∧ ψ", "p ∧ p", { φ: "p", ψ: "p" });
});

test("átomos e F do esquema são literais", () => {
  assertMatches("p ∧ φ", "p ∧ q", { φ: "q" });
  assertMatches("φ → F", "p → F", { φ: "p" });
  assertMatches("F", "F", {});
  assert.equal(errorOf("p ∧ φ", "q ∧ q").code, "mismatch");
  assert.equal(errorOf("φ → F", "p → q").code, "mismatch");
});

test("conflito de metavariáveis", () => {
  const error = errorOf("φ ∧ φ", "p ∧ q");
  assert.equal(error.code, "metavariableConflict");
  assert.equal(error.params.metavariable, "φ");
  assert.ok(equals(error.params.bound, p));
  assert.ok(equals(error.params.found, q));

  assert.equal(errorOf("(φ → ψ) ∧ (ψ → φ)", "(p → q) ∧ (r → p)").params.metavariable, "ψ");
  assert.equal(errorOf("φ ∧ ¬φ", "p ∧ ¬¬p").code, "metavariableConflict");
});

test("a correspondência falha quando a forma difere", () => {
  const error = errorOf("φ ∧ ψ", "p ∨ q");
  assert.equal(error.code, "mismatch");
  assert.ok(equals(error.params.expected, schema("φ ∧ ψ")));
  assert.ok(equals(error.params.found, formula("p ∨ q")));

  assert.equal(errorOf("¬¬φ", "¬p").code, "mismatch");
  assert.ok(equals(errorOf("¬¬φ", "¬p").params.found, p));
  assert.equal(errorOf("φ → ψ", "p").code, "mismatch");
  assert.equal(errorOf("F", "p").code, "mismatch");
  assert.equal(errorOf("p", "F").code, "mismatch");
});

test("uma substituição partilha metavariáveis entre fórmulas, sem ser alterada", () => {
  const first = matchSchema(schema("φ → ψ"), formula("p → q"));
  assert.ok(first.ok);
  const before = { ...first.substitution };

  const second = matchSchema(schema("φ ∧ θ"), formula("p ∧ r"), first.substitution);
  assert.ok(second.ok);
  assert.deepEqual(Object.keys(second.substitution).sort(), ["θ", "φ", "ψ"].sort());
  assert.deepEqual(first.substitution, before);

  const conflict = matchSchema(schema("φ"), formula("q"), first.substitution);
  assert.equal(conflict.error?.code, "metavariableConflict");
  assert.ok(equals(conflict.error.params.bound, p));
});

test("uma correspondência falhada não altera a substituição recebida", () => {
  const start = Object.freeze({ φ: p });
  assert.equal(matchSchema(schema("ψ ∧ (φ ∧ θ)"), formula("q ∧ (r ∧ p)"), start).ok, false);
  assert.deepEqual(Object.keys(start), ["φ"]);
});

test("a substituição devolvida é imutável", () => {
  assert.ok(Object.isFrozen(matchSchema(phi, p).substitution));
});

test("aplica substituições", () => {
  const applied = (text, substitution) => {
    const result = applySubstitution(schema(text), substitution);
    assert.ok(result.ok, `${text}: ${JSON.stringify(result.error)}`);
    return result.formula;
  };
  assert.equal(format(applied("φ ∧ ψ", { φ: p, ψ: formula("q → r") })), "p ∧ (q → r)");
  assert.equal(format(applied("¬φ", { φ: formula("p ∨ q") })), "¬(p ∨ q)");
  assert.equal(format(applied("(φ → F) ∧ p", { φ: q })), "(q → F) ∧ p");
  assert.equal(format(applied("φ ∧ φ", { φ: q, ψ: r })), "q ∧ q");
  assert.equal(format(applied("p → F", {})), "p → F");
  assert.ok(Object.isFrozen(applied("φ ∧ p", { φ: q })));
  assert.ok(Object.isFrozen(applied("φ ∧ p", { φ: q }).args));
});

test("a substituição é simultânea", () => {
  const result = applySubstitution(schema("φ → ψ"), { φ: psi, ψ: phi });
  assert.equal(format(result.formula), "ψ → φ");
});

test("aplicar falha se faltar uma metavariável", () => {
  assert.deepEqual(applySubstitution(schema("φ ∧ ψ"), { φ: p }), {
    ok: false,
    error: { code: "unboundMetavariable", params: { metavariable: "ψ" } },
  });
});

test("aplicar a substituição encontrada devolve a fórmula", () => {
  const pairs = [
    ["φ ∧ ψ", "(p → q) ∧ ¬r"],
    ["(φ → ψ) ∧ φ", "(p → q) ∧ p"],
    ["¬¬φ", "¬¬(p ∨ F)"],
  ];
  for (const [schemaText, formulaText] of pairs) {
    const { substitution } = matchSchema(schema(schemaText), formula(formulaText));
    const result = applySubstitution(schema(schemaText), substitution);
    assert.ok(equals(result.formula, formula(formulaText)), schemaText);
  }
});

test("no limite de tamanho, instâncias não esgotam a pilha", () => {
  const { maxChars } = INPUT_LIMITS;
  const deepSchema = schema(`${"¬".repeat(maxChars - 1)}φ`);
  const deepFormula = formula(`${"¬".repeat(maxChars - 1)}p`);

  assert.deepEqual(applySubstitution(deepSchema, { φ: deepFormula }), {
    ok: false,
    error: { code: "tooLarge", params: { size: 2 * maxChars - 1, max: maxChars } },
  });

  const fits = applySubstitution(schema(`${"¬".repeat(maxChars - 1)}φ`), { φ: p });
  assert.ok(fits.ok);
  assert.ok(equals(fits.formula, deepFormula));
  assert.ok(matchSchema(deepSchema, deepFormula).ok);
  assert.ok(matchSchema(schema("φ ∧ φ"), and(deepFormula, deepFormula)).ok);
});

test("substituições repetidas não fazem crescer a instância sem limite", () => {
  const twice = schema("φ ∧ φ");
  let current = { ok: true, formula: p };
  let steps = 0;
  while (current.ok) {
    current = applySubstitution(twice, { φ: current.formula });
    steps += 1;
  }
  assert.ok(steps < 12);
  assert.equal(current.error.code, "tooLarge");
});

test("lista de códigos de erro", () => {
  assert.deepEqual(
    [...SCHEMA_ERROR_CODES].sort(),
    ["metavariableConflict", "mismatch", "tooLarge", "unboundMetavariable"],
  );
});
