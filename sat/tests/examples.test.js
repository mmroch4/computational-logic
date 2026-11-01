import { test } from "node:test";
import assert from "node:assert/strict";

import { EXAMPLES, EXAMPLE_SOURCES, examplesBySource, getExample } from "../js/core/examples.js";
import { solveDLL } from "../js/core/dll.js";
import { variablesOf } from "../js/core/clauses.js";
import { parse } from "../js/core/parser.js";
import { evaluate } from "../js/core/verify.js";

/** Todas as cláusulas são verdadeiras na valoração (parcial)? */
const satisfies = (S, assignment) => evaluate(S, assignment) === true;

test("14 exemplos: os 10 base e 4 extras, com ids únicos", () => {
  assert.equal(EXAMPLES.length, 14);
  assert.equal(EXAMPLES.filter((e) => e.source !== "extra").length, 10);
  assert.equal(new Set(EXAMPLES.map((e) => e.id)).size, EXAMPLES.length);
});

test("cada exemplo tem os campos todos, título e nota em pt e en", () => {
  for (const e of EXAMPLES) {
    assert.ok(EXAMPLE_SOURCES.includes(e.source), e.id);
    assert.ok(e.title.pt && e.title.en, e.id);
    assert.ok(e.note.pt && e.note.en, e.id);
    assert.ok(["sat", "unsat"].includes(e.expected), e.id);
    assert.equal(e.model === null, e.expected === "unsat", e.id);
  }
});

test("teste-chave: o solver dá o resultado esperado e o modelo devolvido satisfaz as cláusulas originais", () => {
  for (const e of EXAMPLES) {
    const parsed = parse(e.input);
    assert.ok(parsed.ok, `parse falhou: ${e.id}`);
    const { result } = solveDLL(parsed.clauses);
    assert.equal(result.sat, e.expected === "sat", e.id);
    if (result.sat) assert.ok(satisfies(parsed.clauses, result.assignment), e.id);
  }
});

test("os modelos de referência satisfazem as cláusulas e só usam variáveis do conjunto", () => {
  for (const e of EXAMPLES.filter((x) => x.model)) {
    const S = parse(e.input).clauses;
    assert.ok(satisfies(S, e.model), e.id);
    const vars = new Set(variablesOf(S));
    for (const v of Object.keys(e.model)) assert.ok(vars.has(v), `${e.id}: ${v}`);
  }
});

test("o exemplo de modelo único tem mesmo um só modelo e o DLL encontra-o", () => {
  const e = getExample("unit-then-branch");
  const { result } = solveDLL(parse(e.input).clauses);
  assert.deepEqual(result.assignment, e.model);
});

test("extras: tautologia sinalizada, «Três variáveis C» avisa da cláusula repetida, 8 variáveis com retrocesso", () => {
  const taut = parse(getExample("extra-tautology").input);
  assert.deepEqual(taut.warnings.map((w) => w.code), ["tautology"]);

  const c = parse(getExample("three-vars-c").input);
  assert.ok(c.warnings.some((w) => w.code === "duplicateClause"));

  const big = parse(getExample("extra-8-vars").input).clauses;
  assert.equal(variablesOf(big).length, 8);
  const { trace } = solveDLL(big);
  assert.ok(trace.some((ev) => ev.type === "backtrack"));
});

test("getExample e examplesBySource", () => {
  assert.equal(getExample("propagation-chain").source, "propagation");
  assert.equal(getExample("nao-existe"), null);
  assert.equal(examplesBySource("propagation").length, 2);
  assert.equal(examplesBySource("branching").length, 8);
  assert.equal(examplesBySource("extra").length, 4);
});
