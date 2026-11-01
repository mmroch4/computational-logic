import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, parseCompact, parseCompactRaw, normalizeClauses } from "../js/core/parser.js";
import { formatSet } from "../js/core/clauses.js";
import { literalFromKey } from "../js/core/literals.js";

// Atalho: "-p1 q" → cláusula.
const C = (text) => (text.trim() ? text.trim().split(/\s+/).map(literalFromKey) : []);

// As 10 fórmulas de referência, na notação compacta, com literais e ordem como foram escritos.
const ENTRIES = [
  "p1, -p1 -p2, p3 p2, -p7 p2, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7",
  "-p -q, -p q, p -q, p q",
  "p q r, -p -q -r, p -q -r, p q -r, -p q, -p r, p -q r",
  "-p q r, p q r, p q -r, p -q r, p -q -r",
  "p -q -r, -p q r, -p q r, -p q, -p r",
  "p -q r, -p q r, p -q -r, -p q -r, -p -q -r",
  "p -q -r, -p q r, -p -q -r, -p -q r, -p q -r, p q -r",
  "p11 p12, p21 p22, p31 p32, -p11 -p21, -p11 -p31, -p21 -p31, -p12 -p22, -p12 -p32, -p22 -p32",
  "-p q, -p -q r, -p, -r",
  "s p -q, -p -q -r, -s p -q, -s -p q, -s p -r, -s -q r, s",
];

// Nº de cláusulas esperado em cada entrada, já sem repetidos (a (c) repete "-p q r").
const EXPECTED_SIZES = [11, 4, 7, 5, 4, 5, 6, 9, 4, 7];

test("as 10 fórmulas de referência fazem parse", () => {
  ENTRIES.forEach((entry, i) => {
    const result = parse(entry);
    assert.equal(result.ok, true, `entrada ${i + 1}: ${JSON.stringify(result.error)}`);
    assert.equal(result.notation, "compact");
    assert.equal(result.clauses.length, EXPECTED_SIZES[i], `entrada ${i + 1}`);
  });
});

test("Entrada → formatSet compact devolve o mesmo texto (sem repetidos)", () => {
  for (const entry of ENTRIES) {
    const raw = parseCompactRaw(entry);
    assert.equal(formatSet(raw.clauses, "compact"), entry);
  }
});

test("cadeia de propagações: literais e ordem preservados", () => {
  const { clauses } = parse(ENTRIES[0]);
  assert.deepEqual(clauses[0], C("p1"));
  assert.deepEqual(clauses[1], C("-p1 -p2"));
  assert.deepEqual(clauses[6], C("-p4 -p q"));
  assert.deepEqual(clauses[10], C("-r p7"));
});

test("cláusula repetida colapsa com aviso duplicateClause", () => {
  const result = parse(ENTRIES[4]);
  assert.deepEqual(result.clauses, [C("p -q -r"), C("-p q r"), C("-p q"), C("-p r")]);
  assert.deepEqual(result.warnings, [
    { code: "duplicateClause", params: { index: 2, clause: "-p q r" } },
  ]);
});

test("a 1.ª Entrada não tem avisos", () => {
  assert.deepEqual(parse(ENTRIES[0]).warnings, []);
});

test("todas as negações: - ¬ ~ !", () => {
  const result = parse("-p, ¬q, ~r, !s");
  assert.deepEqual(result.clauses, [C("-p"), C("-q"), C("-r"), C("-s")]);
});

test("espaços extra, tabs e mudanças de linha", () => {
  assert.deepEqual(parse("  p1   -p2 ,\t q  ").clauses, [C("p1 -p2"), C("q")]);
  // Mudança de linha separa cláusulas; linhas em branco e "vírgula + linha" não criam vazias.
  assert.deepEqual(parse("p q\n\n-p\nr,\nq").clauses, [C("p q"), C("-p"), C("r"), C("q")]);
});

test("nomes de variáveis com dígitos e _", () => {
  assert.deepEqual(parse("x_1 -p11, Q2").clauses, [C("x_1 -p11"), C("Q2")]);
});

test("F sozinho é a cláusula vazia", () => {
  assert.deepEqual(parse("F").clauses, [[]]);
  assert.deepEqual(parse("p, F").clauses, [C("p"), []]);
});

test("F não pode estar negado nem junto de outros literais", () => {
  assert.deepEqual(parse("p F").error, { code: "reservedF", params: {}, start: 2, end: 3 });
  assert.deepEqual(parse("-F").error, { code: "reservedF", params: {}, start: 0, end: 2 });
});

test("literal repetido colapsa com aviso duplicateLiteral", () => {
  const result = parse("p q p");
  assert.deepEqual(result.clauses, [C("p q")]);
  assert.deepEqual(result.warnings, [{ code: "duplicateLiteral", params: { index: 0, literal: "p" } }]);
});

test("cláusulas iguais por outra ordem também colapsam", () => {
  const result = parse("p -q, -q p");
  assert.deepEqual(result.clauses, [C("p -q")]);
  assert.equal(result.warnings[0].code, "duplicateClause");
});

test("tautologias ficam no conjunto, só com aviso", () => {
  const result = parse("p -p, q");
  assert.deepEqual(result.clauses, [C("p -p"), C("q")]);
  assert.deepEqual(result.warnings, [{ code: "tautology", params: { index: 0, clause: "p -p" } }]);
});

test("entrada vazia ou só espaços → emptyInput", () => {
  assert.equal(parse("").error.code, "emptyInput");
  assert.equal(parse("   \n ").error.code, "emptyInput");
  assert.equal(parse(undefined).error.code, "emptyInput");
});

test("vírgula sem cláusula → emptyClause na posição da vírgula", () => {
  assert.deepEqual(parse("p, , q").error, { code: "emptyClause", params: {}, start: 3, end: 4 });
  assert.deepEqual(parse(", p").error, { code: "emptyClause", params: {}, start: 0, end: 1 });
  assert.deepEqual(parse("p, q,").error, { code: "emptyClause", params: {}, start: 4, end: 5 });
});

test("caracter inesperado aponta para o próprio caracter", () => {
  assert.deepEqual(parse("p, q@r").error, { code: "unexpectedChar", params: { char: "@" }, start: 4, end: 5 });
  assert.deepEqual(parse("--p").error, { code: "unexpectedChar", params: { char: "-" }, start: 1, end: 2 });
});

test("variável inválida → badVariable com o token todo", () => {
  assert.deepEqual(parse("p, 1q").error, { code: "badVariable", params: { token: "1q" }, start: 3, end: 5 });
  assert.deepEqual(parse("p -").error, { code: "badVariable", params: { token: "-" }, start: 2, end: 3 });
});

test("parseCompact e normalizeClauses exportados diretamente", () => {
  assert.equal(parseCompact("p").notation, "compact");
  const { clauses, warnings } = normalizeClauses([C("p p"), C("p")]);
  assert.deepEqual(clauses, [C("p")]);
  assert.deepEqual(warnings.map((w) => w.code), ["duplicateLiteral", "duplicateClause"]);
});

test("todos os avisos contam a cláusula pela posição em que foi escrita", () => {
  // A tautologia é a 4.ª cláusula escrita, mesmo sendo a 3.ª depois de colapsar o p repetido.
  const result = parse("p, p, q q, r -r");
  assert.deepEqual(result.warnings, [
    { code: "duplicateLiteral", params: { index: 2, literal: "q" } },
    { code: "duplicateClause", params: { index: 1, clause: "p" } },
    { code: "tautology", params: { index: 3, clause: "r -r" } },
  ]);
});
