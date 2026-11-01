import { test } from "node:test";
import assert from "node:assert/strict";

import { bruteForceSat, evaluate, evaluateClause } from "../js/core/verify.js";
import { solveDLL } from "../js/core/dll.js";
import { parse } from "../js/core/parser.js";
import { mulberry32 } from "../js/core/generator.js";
import { randomFormula } from "./helpers/random-formula.js";

const S = (text) => parse(text).clauses;

test("evaluateClause: verdadeira, falsa, por decidir e a cláusula vazia F", () => {
  const [c] = S("p -q");
  assert.equal(evaluateClause(c, { p: true }), true);
  assert.equal(evaluateClause(c, { q: false }), true);
  assert.equal(evaluateClause(c, { p: false, q: true }), false);
  assert.equal(evaluateClause(c, { p: false }), null);
  assert.equal(evaluateClause([], {}), false);
});

test("evaluate: conjunção das cláusulas, com o conjunto vazio sempre verdadeiro", () => {
  const set = S("p -q, q");
  assert.equal(evaluate(set, { p: true, q: true }), true);
  assert.equal(evaluate(set, { p: false, q: true }), false);
  assert.equal(evaluate(set, { q: true }), null);
  assert.equal(evaluate(set, { p: true, q: false }), false); // q falsa decide, mesmo com p ∨ ¬q verdadeira
  assert.equal(evaluate([], {}), true);
  assert.equal(evaluate([[]], { p: true }), false);
});

test("bruteForceSat: tabela de verdade começa em V e conta as linhas", () => {
  assert.deepEqual(bruteForceSat([]), { sat: true, assignment: {}, checked: 1 });
  assert.deepEqual(bruteForceSat([[]]), { sat: false, assignment: null, checked: 1 });

  // p ∨ ¬q, q: a 1.ª linha (p V, q V) já satisfaz.
  assert.deepEqual(bruteForceSat(S("p -q, q")), { sat: true, assignment: { p: true, q: true }, checked: 1 });
  // ¬p, ¬q: só a última linha (F, F) satisfaz.
  assert.deepEqual(bruteForceSat(S("-p, -q")), { sat: true, assignment: { p: false, q: false }, checked: 4 });
  // p, ¬p: insatisfazível; percorre as 2 linhas.
  assert.deepEqual(bruteForceSat(S("p, -p")), { sat: false, assignment: null, checked: 2 });
  // ordem natural das variáveis: p2 antes de p11 (p2 é o bit mais significativo).
  assert.deepEqual(bruteForceSat(S("-p2, p11")).assignment, { p2: false, p11: true });
});

test("propriedade: em 500 fórmulas aleatórias (seed fixa) o DLL e a força bruta concordam sempre", () => {
  const random = mulberry32(20261029);
  let sat = 0;
  let unsat = 0;
  for (let i = 0; i < 500; i++) {
    const text = randomFormula(random);
    const parsed = parse(text);
    assert.ok(parsed.ok, text);
    const { result } = solveDLL(parsed.clauses);
    const brute = bruteForceSat(parsed.clauses);
    assert.equal(result.sat, brute.sat, text);
    // O modelo do DLL (parcial) tem de tornar o conjunto verdadeiro.
    if (result.sat) assert.equal(evaluate(parsed.clauses, result.assignment), true, text);
    if (brute.sat) sat++;
    else unsat++;
  }
  // A amostra tem de ter casos dos dois tipos para o teste valer alguma coisa.
  assert.ok(sat > 50 && unsat > 50, `sat=${sat} unsat=${unsat}`);
});
