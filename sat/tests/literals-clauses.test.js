import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VARIABLE_RE, lit, complement, literalKey, literalFromKey, sameLiteral, isComplement,
  compareVariables, compareLiterals, splitVariable, formatVariable, formatLiteral,
} from "../js/core/literals.js";
import {
  dedupeLiterals, clauseKey, sameClause, dedupeClauses, isTautology, isEmptyClause,
  isUnitClause, isEmptySet, variablesOf, formatClause, formatSet,
} from "../js/core/clauses.js";

// Atalho: "-p1 q" → cláusula.
const C = (text) => (text.trim() ? text.trim().split(/\s+/).map(literalFromKey) : []);

// ---------- literals.js ----------

test("lit e complement: o complemento troca o sinal e é involutivo", () => {
  const p = lit("p1");
  assert.deepEqual(p, { v: "p1", neg: false });
  assert.deepEqual(complement(p), { v: "p1", neg: true });
  assert.deepEqual(complement(complement(p)), p);
  assert.equal(lit("q", 1).neg, true);
});

test("literalKey / literalFromKey são inversos", () => {
  assert.equal(literalKey(lit("p1", true)), "-p1");
  assert.equal(literalKey(lit("q")), "q");
  for (const key of ["p", "-p", "x_1", "-p11"]) assert.equal(literalKey(literalFromKey(key)), key);
});

test("sameLiteral e isComplement", () => {
  assert.ok(sameLiteral(lit("p"), lit("p")));
  assert.ok(!sameLiteral(lit("p"), lit("p", true)));
  assert.ok(isComplement(lit("p"), lit("p", true)));
  assert.ok(!isComplement(lit("p"), lit("q", true)));
  assert.ok(!isComplement(lit("p"), lit("p")));
});

test("VARIABLE_RE aceita [A-Za-z][A-Za-z0-9_]*", () => {
  for (const ok of ["p", "p1", "P_2", "abc_d9"]) assert.ok(VARIABLE_RE.test(ok), ok);
  for (const bad of ["1p", "_p", "p-1", "", "p q"]) assert.ok(!VARIABLE_RE.test(bad), bad);
});

test("compareVariables: ordem alfabética natural (p2 < p11)", () => {
  assert.ok(compareVariables("p2", "p11") < 0);
  assert.ok(compareVariables("p11", "p2") > 0);
  assert.ok(compareVariables("p", "p1") < 0);
  assert.ok(compareVariables("p7", "q") < 0);
  assert.equal(compareVariables("r", "r"), 0);
  const sorted = ["q", "p11", "p", "p2", "r", "p1", "p10"].sort(compareVariables);
  assert.deepEqual(sorted, ["p", "p1", "p2", "p10", "p11", "q", "r"]);
});

test("compareLiterals: pela variável, positivo antes do negativo", () => {
  const lits = [lit("q"), lit("p", true), lit("p2"), lit("p")].sort(compareLiterals);
  assert.deepEqual(lits.map(literalKey), ["p", "-p", "p2", "q"]);
});

test("splitVariable separa o sufixo numérico", () => {
  assert.deepEqual(splitVariable("p11"), { base: "p", index: "11" });
  assert.deepEqual(splitVariable("q"), { base: "q", index: "" });
  assert.deepEqual(splitVariable("x_3"), { base: "x_", index: "3" });
  assert.deepEqual(splitVariable("a1b"), { base: "a1b", index: "" });
});

test("formatVariable e formatLiteral nos 3 modos", () => {
  assert.equal(formatVariable("p11"), "p₁₁");
  assert.equal(formatVariable("p11", "compact"), "p11");
  assert.equal(formatVariable("p11", "latex"), "p_{11}");
  assert.equal(formatVariable("x_3", "latex"), "x\\__{3}");
  assert.equal(formatLiteral(lit("p1", true)), "¬p₁");
  assert.equal(formatLiteral(lit("p1", true), "compact"), "-p1");
  assert.equal(formatLiteral(lit("p1", true), "latex"), "\\neg p_{1}");
  assert.equal(formatLiteral(lit("q"), "latex"), "q");
});

// ---------- clauses.js ----------

test("dedupeLiterals colapsa repetidos e mantém a ordem de entrada", () => {
  const { clause, duplicates } = dedupeLiterals(C("q -p q r -p"));
  assert.deepEqual(clause.map(literalKey), ["q", "-p", "r"]);
  assert.deepEqual(duplicates, ["q", "-p"]);
  assert.deepEqual(dedupeLiterals([]).clause, []);
});

test("clauseKey / sameClause ignoram a ordem dos literais", () => {
  assert.equal(clauseKey(C("p -q")), clauseKey(C("-q p")));
  assert.ok(sameClause(C("p -q"), C("-q p")));
  assert.ok(!sameClause(C("p q"), C("p -q")));
  assert.ok(sameClause([], []));
});

test("dedupeClauses remove cláusulas iguais (a menos da ordem) e devolve os índices", () => {
  const { clauses, duplicates } = dedupeClauses([C("p -q"), C("q"), C("-q p"), C("q"), C("r")]);
  assert.deepEqual(clauses.map((c) => formatClause(c, "compact")), ["p -q", "q", "r"]);
  assert.deepEqual(duplicates, [2, 3]);
});

test("isTautology deteta p ∨ ¬p", () => {
  assert.ok(isTautology(C("p q -p")));
  assert.ok(!isTautology(C("p q -r")));
  assert.ok(!isTautology([]));
});

test("isEmptyClause, isUnitClause e isEmptySet", () => {
  assert.ok(isEmptyClause([]));
  assert.ok(!isEmptyClause(C("p")));
  assert.ok(isUnitClause(C("-p")));
  assert.ok(!isUnitClause(C("p q")));
  assert.ok(isEmptySet([]));
  assert.ok(!isEmptySet([[]])); // {F} não é o conjunto vazio
});

test("variablesOf: sem repetidos e em ordem natural", () => {
  assert.deepEqual(variablesOf([C("p11 -p2"), C("q p2"), C("-p")]), ["p", "p2", "p11", "q"]);
  assert.deepEqual(variablesOf([]), []);
});

test("formatClause: 3 modos e cláusula vazia = F", () => {
  const c = C("-p1 q");
  assert.equal(formatClause(c), "¬p₁ ∨ q");
  assert.equal(formatClause(c, "compact"), "-p1 q");
  assert.equal(formatClause(c, "latex"), "\\neg p_{1} \\lor q");
  for (const mode of ["unicode", "compact", "latex"]) assert.equal(formatClause([], mode), "F");
});

test("formatSet: estilo matemático, compacto e LaTeX", () => {
  const S = [C("p1"), C("-p1 -p2"), C("p3 p2")];
  assert.equal(formatSet(S), "{p₁, ¬p₁ ∨ ¬p₂, p₃ ∨ p₂}");
  assert.equal(formatSet(S, "compact"), "p1, -p1 -p2, p3 p2");
  assert.equal(formatSet(S, "latex"), "\\{p_{1}, \\neg p_{1} \\lor \\neg p_{2}, p_{3} \\lor p_{2}\\}");
  assert.equal(formatSet([]), "{}");
  assert.equal(formatSet([[]]), "{F}");
});
