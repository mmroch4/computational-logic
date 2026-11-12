import { test } from "node:test";
import assert from "node:assert/strict";
import {
  equals, format, meta, metaTerm, metaVariable, substituted, term,
} from "../js/core/formula.js";
import { parseFormula } from "../js/core/parser.js";
import { BASE_RULES, FIRST_ORDER_RULES, RULES, condition, defineRule, subproof } from "../js/core/rules.js";
import {
  CONDITION_KINDS, PENDING, applySubstitution, checkCondition, matchSchema, parseSchema,
} from "../js/core/schema.js";

function formula(text) {
  const result = parseFormula(text);
  assert.ok(result.ok, `${text}: ${JSON.stringify(result.error)}`);
  return result.formula;
}

function schema(text) {
  const result = parseSchema(text);
  assert.ok(result.ok, `${text}: ${JSON.stringify(result.error)}`);
  return result.formula;
}

const rule = (id) => FIRST_ORDER_RULES.find((item) => item.id === id);

/** Casa as premissas pela ordem dada e depois a conclusão, como o verificador. */
function matchRule(id, premises, conclusion, { conclusionIndex = 0, start = {} } = {}) {
  const { premises: schemas, conclusions } = rule(id);
  let substitution = start;
  for (const [i, text] of premises.entries()) {
    const result = matchSchema(schemas[i].schema, formula(text), substitution);
    if (!result.ok) return result;
    substitution = result.substitution;
  }
  return matchSchema(conclusions[conclusionIndex], formula(conclusion), substitution);
}

/** Compara com uma fórmula, ou com um termo se `name` for uma metavariável de termo ou de variável. */
const assertBound = (substitution, name, text) => {
  const expected = /^[φψθ]$/.test(name) ? formula(text) : formula(`P(${text})`).args[0];
  assert.ok(equals(substitution[name], expected), `${name}: ${format(substitution[name])} ≠ ${text}`);
};

test("o parser de esquemas lê metavariáveis de termo e de variável e φ[t/x]", () => {
  assert.ok(equals(schema("φ[t/x]"), substituted(meta("φ"), metaTerm("t"), metaVariable("x"))));
  assert.ok(equals(schema("φ [ t₁ / x ]"), substituted(meta("φ"), metaTerm("t1"), metaVariable("x"))));
  assert.ok(equals(schema("φ[v/x]"), substituted(meta("φ"), metaVariable("v"), metaVariable("x"))));
  assert.equal(schema("t1 = t2").args[0].kind, "metaTerm");
  assert.equal(schema("P(x, f(t))").args[0].kind, "metaVariable");
  assert.equal(schema("P(a)").args[0].kind, "term");
  for (const text of ["∀x φ", "φ[t/x]", "φ[t₁/x] → ψ", "t₁ = t₂", "∃x ¬φ", "¬φ[v/x]"]) {
    assert.equal(format(schema(text)), text);
    assert.ok(equals(schema(format(schema(text))), schema(text)), text);
  }
  assert.throws(() => substituted(meta("φ"), metaTerm("t"), metaTerm("t")));
  assert.throws(() => metaTerm("x"));
  assert.throws(() => metaVariable("t"));
});

test("fora dos esquemas, t, x e [t/x] continuam a ser texto normal", () => {
  assert.equal(formula("P(t, x)").args[0].kind, "term");
  assert.equal(formula("t = x").args[1].kind, "term");
  assert.equal(parseFormula("p[t/x]").error?.code, "unexpectedChar");
  for (const text of ["φ[a/x]", "φ[t/a]", "φ[t/t]", "φ[t/x", "φ[]"]) {
    assert.equal(parseSchema(text).error?.code, "unexpectedChar", text);
  }
});

test("os quantificadores de um esquema ligam a sua variável", () => {
  const result = matchSchema(schema("∀x φ"), formula("∀y P(y)"));
  assert.ok(result.ok);
  assertBound(result.substitution, "x", "y");
  assertBound(result.substitution, "φ", "P(y)");
  const twice = matchSchema(schema("∀x φ → ∃x ψ"), formula("∀y P(y) → ∃z Q(z)"));
  assert.equal(twice.error?.code, "metavariableConflict");
  assert.equal(matchSchema(schema("∀x φ"), formula("∃y P(y)")).error?.code, "mismatch");
});

test("metavariáveis de termo casam com termos e as de variável só com nomes", () => {
  const equality = matchSchema(schema("t1 = t2"), formula("f(a) = b"));
  assertBound(equality.substitution, "t1", "f(a)");
  assert.equal(matchSchema(schema("t = t"), formula("a = b")).error?.code, "metavariableConflict");
  assert.ok(matchSchema(schema("t = t"), formula("g(a, b) = g(a, b)")).ok);
  assert.equal(matchSchema(schema("P(v)"), formula("P(f(a))")).error?.code, "mismatch");
  assert.ok(matchSchema(schema("P(v)"), formula("P(a)")).ok);
});

test("∀E: a conclusão escolhe o termo, igual em todas as ocorrências livres", () => {
  const ok = matchRule("∀E", ["∀x (P(x) → Q(x, b))"], "P(f(a)) → Q(f(a), b)");
  assert.ok(ok.ok);
  assertBound(ok.substitution, "t", "f(a)");
  assert.ok(!(PENDING in ok.substitution));
  assert.equal(matchRule("∀E", ["∀x (P(x) → Q(x))"], "P(a) → Q(b)").error?.code, "metavariableConflict");
  assert.equal(matchRule("∀E", ["∀x P(x)"], "Q(a)").error?.code, "mismatch");
  // As ocorrências ligadas por dentro não se substituem.
  assert.ok(matchRule("∀E", ["∀x (P(x) ∧ ∀x Q(x))"], "P(a) ∧ ∀x Q(x)").ok);
  assert.equal(matchRule("∀E", ["∀x (P(x) ∧ ∀x Q(x))"], "P(a) ∧ ∀x Q(a)").error?.code, "mismatch");
  // Sem x livre, a conclusão é o corpo e o termo fica por escolher.
  const vacuous = matchRule("∀E", ["∀x P(a)"], "P(a)");
  assert.ok(vacuous.ok);
  assert.equal(vacuous.substitution.t, undefined);
  // x pode ficar com o próprio x.
  assert.ok(matchRule("∀E", ["∀x P(x)"], "P(x)").ok);
});

test("∀E falha por captura", () => {
  const captured = matchRule("∀E", ["∀x ∃y R(x, y)"], "∃y R(y, y)");
  assert.equal(captured.error?.code, "capture");
  assert.equal(captured.error.params.variable, "x");
  assertBound(captured.error.params, "term", "y");
  assert.equal(matchRule("∀E", ["∀x ∃y R(x, y)"], "∃y R(f(y), y)").error?.code, "capture");
  assert.ok(matchRule("∀E", ["∀x ∃y R(x, y)"], "∃y R(z, y)").ok);
});

test("∃I aceita as várias conclusões possíveis da mesma premissa", () => {
  const premise = matchSchema(rule("∃I").premises[0].schema, formula("P(a, a)"));
  assert.ok(premise.ok);
  assert.equal(premise.substitution[PENDING].length, 1);
  for (const text of ["∃x P(x, a)", "∃x P(a, x)", "∃x P(x, x)", "∃y P(y, a)", "∃x P(a, a)"]) {
    const result = matchSchema(rule("∃I").conclusions[0], formula(text), premise.substitution);
    assert.ok(result.ok, text);
    assert.ok(!(PENDING in result.substitution), text);
  }
  assertBound(matchRule("∃I", ["P(a, a)"], "∃x P(x, a)").substitution, "t", "a");
  for (const text of ["∃x P(x, b)", "∃x Q(x, a)", "∀x P(x, a)"]) {
    assert.ok(!matchRule("∃I", ["P(a, a)"], text).ok, text);
  }
  assert.ok(matchRule("∃I", ["Q(f(b)) ∧ R(b)"], "∃z (Q(f(z)) ∧ R(b))").ok);
  assert.ok(matchRule("∃I", ["Q(f(b)) ∧ R(b)"], "∃z (Q(z) ∧ R(b))").ok);
});

test("∃I falha por captura", () => {
  // De ∀y R(y, y) não se tira ∃x ∀y R(x, y): o x ficaria ligado pelo ∀y.
  assert.equal(matchRule("∃I", ["∀y R(y, y)"], "∃x ∀y R(x, y)").error?.code, "capture");
  assert.ok(matchRule("∃I", ["∀y R(a, y)"], "∃x ∀y R(x, y)").ok);
});

test("=E reescreve só as ocorrências escolhidas", () => {
  const cases = [
    ["P(b, a)", "P(x, a)"],
    ["P(a, b)", "P(a, x)"],
    ["P(b, b)", "P(x, x)"],
    ["P(a, a)", "P(a, a)"],
  ];
  for (const [conclusion, phi] of cases) {
    const result = matchRule("=E", ["a = b", "P(a, a)"], conclusion);
    assert.ok(result.ok, conclusion);
    assertBound(result.substitution, "φ", phi);
    assert.ok(!(PENDING in result.substitution), conclusion);
  }
  assert.ok(matchRule("=E", ["f(a) = g(b)", "Q(f(a)) ∨ R(f(a), c)"], "Q(g(b)) ∨ R(f(a), c)").ok);
  assert.ok(!matchRule("=E", ["a = b", "P(a, a)"], "P(c, a)").ok);
  assert.ok(!matchRule("=E", ["a = b", "P(a, a)"], "Q(b, a)").ok);
  // b = a não reescreve a por b: só t1 passa a t2.
  assert.ok(!matchRule("=E", ["b = a", "P(a)"], "P(b)").ok);
});

test("=E casa com as premissas por qualquer ordem", () => {
  const [equality, before] = rule("=E").premises.map(({ schema: node }) => node);
  const first = matchSchema(before, formula("P(a) ∧ Q(a)"));
  const second = matchSchema(equality, formula("a = c"), first.substitution);
  assert.equal(second.substitution[PENDING].length, 1);
  const result = matchSchema(rule("=E").conclusions[0], formula("P(c) ∧ Q(a)"), second.substitution);
  assert.ok(result.ok);
  assertBound(result.substitution, "t2", "c");
});

test("=E falha por captura", () => {
  assert.equal(matchRule("=E", ["a = y", "∀y P(a, y)"], "∀y P(y, y)").error?.code, "capture");
  assert.equal(matchRule("=E", ["y = a", "∃y R(y, y)"], "∃y R(a, y)").error?.code, "capture");
  assert.ok(matchRule("=E", ["a = z", "∀y P(a, y)"], "∀y P(z, y)").ok);
});

test("∀I e ∃E: a variável da caixa liga-se e resolve o φ[v/x]", () => {
  const forallIntro = rule("∀I");
  assert.equal(forallIntro.premises[0].hypothesis, null);
  assert.equal(forallIntro.premises[0].fresh, "v");
  const box = matchSchema(forallIntro.premises[0].conclusion, formula("P(u) → Q(u)"), { v: term("u") });
  const done = matchSchema(forallIntro.conclusions[0], formula("∀x (P(x) → Q(x))"), box.substitution);
  assert.ok(done.ok);
  const [, notFree] = forallIntro.conditions;
  assert.equal(checkCondition(notFree, done.substitution), true);
  // ∀x(P(x) → Q(u)) encaixa no esquema, mas deixa v livre: é a condição que o recusa.
  const escaped = matchSchema(forallIntro.conclusions[0], formula("∀x (P(x) → Q(u))"), box.substitution);
  assert.ok(escaped.ok);
  assert.equal(checkCondition(notFree, escaped.substitution), false);

  const exists = rule("∃E");
  assert.equal(exists.premises[1].fresh, "v");
  const first = matchSchema(exists.premises[0].schema, formula("∃x P(x)"));
  const hypothesis = matchSchema(exists.premises[1].hypothesis, formula("P(u)"), { ...first.substitution, v: term("u") });
  assert.ok(hypothesis.ok);
  assert.equal(matchSchema(exists.premises[1].hypothesis, formula("P(w)"), { ...first.substitution, v: term("u") })
    .error?.code, "metavariableConflict");
});

test("applySubstitution substitui sem captura", () => {
  const binding = { φ: formula("∃y R(x, y)"), x: term("x") };
  const ok = applySubstitution(schema("φ[t/x]"), { ...binding, t: formula("P(f(a))").args[0] });
  assert.ok(ok.ok);
  assert.equal(format(ok.formula), "∃y R(f(a), y)");
  const captured = applySubstitution(schema("φ[t/x]"), { ...binding, t: term("y") });
  assert.equal(captured.error?.code, "capture");
  assert.equal(applySubstitution(schema("φ[t/x]"), binding).error?.code, "unboundMetavariable");
  const quantified = applySubstitution(schema("∀x φ"), binding);
  assert.equal(format(quantified.formula), "∀x∃y R(x, y)");
  assert.equal(format(applySubstitution(schema("∃x φ"), { ...binding, x: term("z") }).formula), "∃z∃y R(x, y)");
  assert.equal(applySubstitution(schema("t = t"), {}).error?.code, "unboundMetavariable");
});

test("as condições são declarativas e avaliam-se com a substituição", () => {
  assert.deepEqual(CONDITION_KINDS, ["fresh", "notIn", "substitutable", "notFree"]);
  const kinds = (id) => rule(id).conditions.map(({ kind }) => kind);
  assert.deepEqual(kinds("∀I"), ["fresh", "notFree"]);
  assert.deepEqual(kinds("∃E"), ["fresh", "notFree"]);
  assert.deepEqual(kinds("∀E"), ["substitutable"]);
  assert.deepEqual(kinds("=E"), ["substitutable", "substitutable"]);
  assert.deepEqual(kinds("=I"), []);
  for (const item of BASE_RULES) assert.deepEqual(item.conditions, [], item.id);

  const substitution = { φ: formula("∃y R(x, y)"), x: term("x"), v: term("y"), t: term("y"), ψ: formula("Q(y)") };
  assert.equal(checkCondition(condition.fresh("v"), substitution), null);
  assert.equal(checkCondition(condition.substitutable("x", "t", "φ"), substitution), false);
  assert.equal(checkCondition(condition.substitutable("x", "t", "φ"), { ...substitution, t: term("a") }), true);
  assert.equal(checkCondition(condition.notFree("v", "ψ"), substitution), false);
  assert.equal(checkCondition(condition.notFree("v", "∀x φ"), substitution), true);
  assert.equal(checkCondition(condition.notIn("v", "∀x φ"), substitution), false);
  assert.equal(checkCondition(condition.notIn("v", "ψ"), { ...substitution, v: term("z") }), true);
  assert.equal(checkCondition(condition.notFree("v", "θ"), substitution), null);
  assert.throws(() => checkCondition({ kind: "outra" }, substitution));
});

test("defineRule declara caixas com variável e condições", () => {
  const made = defineRule("X", [subproof(null, "φ[v/x]", { fresh: "v" })], "∀x φ", {
    conditions: [condition.fresh("v")],
  });
  assert.deepEqual(made.premises[0].fresh, "v");
  assert.equal(made.premises[0].hypothesis, null);
  assert.equal(made.conclusions.length, 1);
  assert.deepEqual(made.conditions, [{ kind: "fresh", variable: "v" }]);
  const plain = defineRule("Y", [subproof("φ", "ψ")], "φ → ψ");
  assert.equal(plain.premises[0].fresh, null);
  assert.deepEqual(plain.conditions, []);
  // A V3 junta as regras de 1.ª ordem às base; até lá, ficam fora.
  assert.ok(FIRST_ORDER_RULES.every(({ id }) => !RULES.some((item) => item.id === id)));
});
