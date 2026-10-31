// Casos-limite da entrada (M8.3): conjunto vazio, {F}, uma só variável, muitas variáveis e
// entradas grandes. Os limites vivem em INPUT_LIMITS (js/core/parser.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, INPUT_LIMITS } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { solveDP } from "../js/core/dp.js";

const variables = (n) => Array.from({ length: n }, (_, i) => `x${i + 1}`);

test("conjunto vazio: {} é satisfazível sem propagar nem ramificar (as três notações)", () => {
  for (const text of ["{}", "{ }"]) {
    const result = parse(text);
    assert.equal(result.ok, true, text);
    assert.deepEqual(result.clauses, []);
    const { result: dll } = solveDLL(result.clauses);
    assert.equal(dll.sat, true);
    assert.deepEqual(dll.assignment, {});
    assert.equal(solveDP(result.clauses).result.sat, true);
  }
});

test("{F}: F, {F} e {{}} são insatisfazíveis logo no início, sem ramificar", () => {
  for (const text of ["F", "{F}", "{{}}"]) {
    const result = parse(text);
    assert.equal(result.ok, true, text);
    assert.deepEqual(result.clauses, [[]]);
    const { result: dll } = solveDLL(result.clauses);
    assert.equal(dll.sat, false);
    assert.equal(dll.stats.branches, 0);
    assert.equal(solveDP(result.clauses).result.sat, false);
  }
});

test("uma só variável: p e ¬p resolvem-se por propagação; p, ¬p dá F", () => {
  assert.deepEqual(solveDLL(parse("p").clauses).result.assignment, { p: true });
  assert.deepEqual(solveDLL(parse("¬p").clauses).result.assignment, { p: false });
  const { result } = solveDLL(parse("p, ¬p").clauses);
  assert.equal(result.sat, false);
  assert.equal(result.stats.branches, 0);
});

test("até manyVariables variáveis não há aviso; acima há (e o DLL resolve na mesma)", () => {
  const ok = parse(variables(INPUT_LIMITS.manyVariables).join(" "));
  assert.deepEqual(ok.warnings, []);
  const text = variables(25).map((v, i) => `${v} -x${((i + 1) % 25) + 1}`).join(", ");
  const many = parse(text);
  assert.equal(many.ok, true);
  assert.deepEqual(many.warnings.map((w) => w.code), ["manyVariables"]);
  assert.equal(solveDLL(many.clauses).result.sat, true);
});

test("o limite de variáveis evita esgotar a pilha: maxVariables variáveis numa cadeia resolvem-se", () => {
  // Cada cláusula xi ∨ ¬x(i+1) obriga a ramificar em todas as variáveis (profundidade máxima).
  const n = INPUT_LIMITS.maxVariables;
  const text = variables(n).map((v, i) => (i + 1 < n ? `${v} -x${i + 2}` : `-${v} -x1`)).join(", ");
  const parsed = parse(text);
  assert.equal(parsed.ok, true);
  const { result } = solveDLL(parsed.clauses);
  assert.notEqual(result.sat, undefined);
});

test("no limite exato de caracteres e de cláusulas a entrada ainda é aceite", () => {
  const atChars = "p".repeat(INPUT_LIMITS.maxChars);
  assert.equal(parse(atChars).ok, true);
  const pairs = variables(40).flatMap((a, i, all) => all.slice(i + 1).map((b) => `${a} ${b}`));
  assert.equal(parse(pairs.slice(0, INPUT_LIMITS.maxClauses).join(", ")).ok, true);
});

test("repetidos não contam para o limite de cláusulas (conta o conjunto)", () => {
  const text = Array.from({ length: INPUT_LIMITS.maxClauses + 50 }, () => "p q").join(", ");
  assert.equal(text.length <= INPUT_LIMITS.maxChars, true);
  const result = parse(text);
  assert.equal(result.ok, true);
  assert.equal(result.clauses.length, 1);
});

test("entrada enorme é recusada antes de se ler (rápido) e erros de sintaxe vêm antes dos de tamanho", () => {
  const huge = Array.from({ length: 20000 }, (_, i) => `x${i} -x${i + 1}`).join(", ");
  const start = Date.now();
  assert.equal(parse(huge).error.code, "tooLong");
  assert.ok(Date.now() - start < 50, "a recusa não deve ler o texto todo");
  const badAndBig = variables(INPUT_LIMITS.maxVariables + 1).join(", ") + ", #";
  assert.equal(parse(badAndBig).error.code, "unexpectedChar");
});
