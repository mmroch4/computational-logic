import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, parseLogic, parseLogicRaw } from "../js/core/parser.js";
import { literalFromKey } from "../js/core/literals.js";

// Atalho: "-p1 q" → cláusula.
const C = (text) => (text.trim() ? text.trim().split(/\s+/).map(literalFromKey) : []);

// Atalho para verificar um erro: código e posição [start, end).
function assertError(text, code, start, end) {
  const result = parseLogicRaw(text);
  assert.equal(result.ok, false, `devia falhar: ${text}`);
  assert.equal(result.error.code, code, `${text}: ${JSON.stringify(result.error)}`);
  if (start !== undefined) assert.deepEqual([result.error.start, result.error.end], [start, end], text);
  return result.error;
}

test("exemplo do plano: (p ∨ ¬q) ∧ q", () => {
  const result = parse("(p ∨ ¬q) ∧ q");
  assert.equal(result.ok, true);
  assert.equal(result.notation, "logic");
  assert.deepEqual(result.clauses, [C("p -q"), C("q")]);
  assert.deepEqual(result.warnings, []);
});

test("todos os aliases ASCII de ∧, ∨ e ¬", () => {
  const expected = [C("p -q"), C("-r s")];
  const texts = [
    "(p ∨ ¬q) ∧ (¬r ∨ s)",
    "(p | -q) & (~r | s)",
    "(p \\/ !q) /\\ (-r \\/ s)",
    "(p v ~q) ^ (!r v s)",
    "(p∨¬q)∧(¬r∨s)",
    "( p ∨ ¬ q )\n∧\n( ¬ r ∨ s )",
  ];
  for (const text of texts) assert.deepEqual(parse(text).clauses, expected, text);
});

test("parênteses opcionais em cláusulas de 1 literal e redundantes", () => {
  assert.deepEqual(parseLogic("p ∧ (q) ∧ ¬r").clauses, [C("p"), C("q"), C("-r")]);
  assert.deepEqual(parseLogic("((p ∨ q)) ∧ ((¬r))").clauses, [C("p q"), C("-r")]);
  assert.deepEqual(parseLogic("(p ∨ q) ∨ r").clauses, [C("p q r")]);
  assert.deepEqual(parseLogic("((p ∧ q) ∧ r)").clauses, [C("p"), C("q"), C("r")]);
});

test("uma só cláusula sem parênteses: p ∨ ¬q", () => {
  assert.deepEqual(parse("p ∨ ¬q").clauses, [C("p -q")]);
  assert.equal(parse("p ∨ ¬q").notation, "logic");
});

test("precedência: ∧ liga mais do que ∨, por isso ∧ ∨ sem parênteses não é FNC", () => {
  // p ∧ q ∨ r = (p ∧ q) ∨ r
  assert.equal(assertError("p ∧ q ∨ r", "notCNF", 2, 3).params.reason, "andInsideOr");
  assert.deepEqual(parseLogic("p ∧ (q ∨ r)").clauses, [C("p"), C("q r")]);
});

test("F sozinho é a cláusula vazia; F numa disjunção é reservedF", () => {
  assert.deepEqual(parseLogic("(p ∨ q) ∧ F").clauses, [C("p q"), []]);
  assert.deepEqual(parseLogic("F").clauses, [[]]);
  assertError("p ∨ F", "reservedF", 4, 5);
  assertError("¬F", "reservedF", 0, 2);
});

test("variáveis com índices e nomes longos: p11, x_3, v1", () => {
  assert.deepEqual(parseLogic("(p11 ∨ ¬x_3) ∧ v1").clauses, [C("p11 -x_3"), C("v1")]);
});

test("normaliza como as outras notações (duplicados e tautologias)", () => {
  const result = parseLogic("(p ∨ p ∨ q) ∧ (q ∨ p) ∧ (r ∨ ¬r)");
  assert.deepEqual(result.clauses, [C("p q"), C("r -r")]);
  assert.deepEqual(
    result.warnings.map((w) => w.code),
    ["duplicateLiteral", "duplicateClause", "tautology"],
  );
});

test("notCNF: implicação e equivalência (→ ↔ e aliases)", () => {
  assert.equal(assertError("p → q", "notCNF", 2, 3).params.reason, "implication");
  assert.equal(assertError("p -> q", "notCNF", 2, 4).params.reason, "implication");
  assert.equal(assertError("p => q", "notCNF", 2, 4).params.reason, "implication");
  assert.equal(assertError("p ↔ q", "notCNF", 2, 3).params.reason, "equivalence");
  assert.equal(assertError("(p ∨ q) ∧ (r <-> s)", "notCNF", 13, 16).params.reason, "equivalence");
  assert.deepEqual(assertError("p <=> q", "notCNF", 2, 5).params, { char: "<=>", reason: "equivalence" });
});

test("notCNF: negação de uma fórmula ¬(...) ou dupla negação", () => {
  assert.equal(assertError("¬(p ∨ q)", "notCNF", 0, 1).params.reason, "negation");
  assert.equal(assertError("q ∧ ¬¬p", "notCNF", 4, 5).params.reason, "negation");
});

test("notCNF: ∧ dentro de uma disjunção", () => {
  assert.deepEqual(assertError("p ∨ (q ∧ r)", "notCNF", 7, 8).params, { char: "∧", reason: "andInsideOr" });
  // Pela precedência, p ∨ q ∧ r = p ∨ (q ∧ r).
  assertError("p ∨ q ∧ r", "notCNF", 6, 7);
});

test("erros de sintaxe com posição", () => {
  assertError("", "emptyInput", 0, 0);
  assertError("   ", "emptyInput", 0, 3);
  assert.deepEqual(assertError("(p ∨ q", "unbalanced", 0, 1).params, { char: "(" });
  assert.deepEqual(assertError("p ∨ q)", "unbalanced", 5, 6).params, { char: ")" });
  assert.deepEqual(assertError("(p ∨ q) ∧", "missingOperand", 8, 9).params, { char: "∧" });
  assertError("∨ p", "missingOperand", 0, 1);
  assertError("p ∧ ∨ q", "missingOperand", 4, 5);
  assertError("()", "unbalanced", 1, 2);
  assert.deepEqual(assertError("p q", "missingSeparator", 2, 3).params, { token: "q" });
  assert.deepEqual(assertError("p ∧ q, r", "unexpectedChar", 5, 6).params, { char: "," });
  assert.deepEqual(assertError("p ∧ q?", "unexpectedChar", 5, 6).params, { char: "?" });
  assertError("p ∧ 2q", "badVariable", 4, 6);
});

test("parse() escolhe a notação: compacta sem operadores, lógica com eles", () => {
  assert.equal(parse("p1, -p1 -p2").notation, "compact");
  assert.equal(parse("p ∧ q").notation, "logic");
  assert.equal(parse("p v q").notation, "logic");
  assert.equal(parse("(p)").notation, "logic");
  assert.equal(parse("p -> q").ok, false);
  assert.equal(parse("{p ∨ q}").notation, "sets");
});
