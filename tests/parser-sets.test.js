import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, parseSets, parseSetsRaw } from "../js/core/parser.js";
import { literalFromKey } from "../js/core/literals.js";

// Atalho: "-p1 q" → cláusula.
const C = (text) => (text.trim() ? text.trim().split(/\s+/).map(literalFromKey) : []);

// Atalho para verificar um erro: código e posição [start, end).
function assertError(text, code, start, end) {
  const result = parseSetsRaw(text);
  assert.equal(result.ok, false, `devia falhar: ${text}`);
  assert.equal(result.error.code, code, `${text}: ${JSON.stringify(result.error)}`);
  if (start !== undefined) assert.deepEqual([result.error.start, result.error.end], [start, end], text);
  return result.error;
}

test("conjunto de conjuntos: {{p, ¬q}, {q}}", () => {
  const result = parse("{{p, ¬q}, {q}}");
  assert.equal(result.ok, true);
  assert.equal(result.notation, "sets");
  assert.deepEqual(result.clauses, [C("p -q"), C("q")]);
  assert.deepEqual(result.warnings, []);
});

test("estilo matemático: {p ∨ ¬q, q}", () => {
  assert.deepEqual(parse("{p ∨ ¬q, q}").clauses, [C("p -q"), C("q")]);
});

test("aliases de disjunção e negação: | \\/ v e - ~ !", () => {
  const expected = [C("p -q r"), C("-s")];
  for (const text of ["{p | -q | r, ~s}", "{p \\/ ~q \\/ r, !s}", "{p v !q v r, -s}", "{p∨¬q∨r,¬s}"]) {
    assert.deepEqual(parse(text).clauses, expected, text);
  }
});

test("`v` só é disjunção sozinho: v1 e vx são variáveis", () => {
  assert.deepEqual(parse("{v1 v vx}").clauses, [C("v1 vx")]);
});

test("parênteses opcionais à volta de uma cláusula", () => {
  assert.deepEqual(parse("{(p ∨ q), (¬r), s}").clauses, [C("p q"), C("-r"), C("s")]);
});

test("negação separada por espaço e mudanças de linha", () => {
  assert.deepEqual(parse("{\n  {¬ p1, p2},\n  {p3}\n}").clauses, [C("-p1 p2"), C("p3")]);
});

test("formas misturadas no mesmo conjunto", () => {
  assert.deepEqual(parse("{{p, q}, ¬p ∨ r}").clauses, [C("p q"), C("-p r")]);
});

test("{} é o conjunto vazio", () => {
  const result = parse("{}");
  assert.equal(result.ok, true);
  assert.deepEqual(result.clauses, []);
  assert.deepEqual(parse("  { }  ").clauses, []);
});

test("{{}}, {F} e {{F}} contêm a cláusula vazia", () => {
  for (const text of ["{{}}", "{F}", "{{F}}", "{ { } }"]) {
    assert.deepEqual(parse(text).clauses, [[]], text);
  }
  assert.deepEqual(parse("{p, F}").clauses, [C("p"), []]);
});

test("F com outros literais ou negado dá reservedF", () => {
  assertError("{p ∨ F}", "reservedF", 5, 6);
  assertError("{{p, F}}", "reservedF", 5, 6);
  assertError("{¬F}", "reservedF", 1, 3);
});

test("repetidos colapsam com avisos e tautologias ficam sinalizadas", () => {
  const result = parseSets("{{p, p, q}, {q, p}, p ∨ ¬p}");
  assert.equal(result.ok, true);
  assert.deepEqual(result.clauses, [C("p q"), C("p -p")]);
  assert.deepEqual(
    result.warnings.map((w) => w.code),
    ["duplicateLiteral", "duplicateClause", "tautology"],
  );
  assert.deepEqual(result.warnings[1].params, { index: 1, clause: "q p" });
});

test("chavetas por fechar ou a mais dão unbalanced", () => {
  assertError("{{p, q}", "unbalanced", 0, 1);
  assertError("{p, {q", "unbalanced", 4, 5);
  assertError("{(p ∨ q}", "unexpectedChar", 7, 8);
  assertError("{(p ∨ q", "unbalanced", 1, 2);
  assertError("{p}}", "unbalanced", 3, 4);
});

test("vírgula sem cláusula dá emptyClause", () => {
  assertError("{p, , q}", "emptyClause", 4, 5);
  assertError("{p, }", "emptyClause", 4, 5);
  assertError("{, p}", "emptyClause", 1, 2);
});

test("literais sem separador dão missingSeparator", () => {
  const error = assertError("{p q}", "missingSeparator", 3, 4);
  assert.deepEqual(error.params, { token: "q" });
  assertError("{{p q}}", "missingSeparator", 4, 5);
});

test("caracteres e tokens inesperados dão unexpectedChar", () => {
  assert.deepEqual(assertError("{p ∧ q}", "unexpectedChar", 3, 4).params, { char: "∧" });
  assertError("{p → q}", "unexpectedChar", 3, 4);
  assertError("{¬¬p}", "unexpectedChar", 2, 3);
  assertError("{p ∨ }", "unexpectedChar", 5, 6);
  assertError("{{p, }}", "unexpectedChar", 5, 6);
  assertError("{{p ∨ q}}", "unexpectedChar", 4, 5);
  assertError("{p} q", "unexpectedChar", 4, 5);
});

test("variáveis a começar por dígito dão badVariable", () => {
  assert.deepEqual(assertError("{1p, q}", "badVariable", 1, 3).params, { token: "1p" });
});

test("texto vazio dá emptyInput", () => {
  assertError("   ", "emptyInput", 0, 3);
});

test("parse() continua a usar a compacta quando o texto não começa por {", () => {
  const result = parse("p1, -p1 -p2");
  assert.equal(result.notation, "compact");
  assert.deepEqual(result.clauses, [C("p1"), C("-p1 -p2")]);
});
