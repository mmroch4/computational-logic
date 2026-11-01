import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { generateFormula } from "../js/core/generator.js";
import { EXAMPLES } from "../js/core/examples.js";
import { checkValuation, satMove, startSatGame } from "../js/core/exercise-sat.js";

const clausesOf = (input) => parse(input).clauses;

test("checkValuation: cláusula a cláusula, com literais verdadeiros, falsas e por decidir", () => {
  const S = clausesOf("p q, -p r, -q");
  const full = checkValuation(S, { p: true, q: false, r: true });
  assert.equal(full.value, true);
  assert.deepEqual(full.rows.map((r) => r.value), [true, true, true]);
  assert.deepEqual(full.rows.map((r) => r.trueLiterals), [[0], [1], [0]]);
  assert.deepEqual(full.rows.map((r) => r.missing), [[], [], []]);

  const bad = checkValuation(S, { p: true, q: false, r: false });
  assert.equal(bad.value, false);
  assert.equal(bad.falseCount, 1);
  assert.equal(bad.rows[1].value, false);

  const partial = checkValuation(S, { q: false });
  assert.equal(partial.value, null);
  assert.equal(partial.undecidedCount, 2);
  assert.equal(partial.falseCount, 0);
  assert.deepEqual(partial.rows.map((r) => r.missing), [["p"], ["p", "r"], []]);

  // Variáveis que não estão em S e valores que não são booleanos não contam.
  assert.deepEqual(checkValuation(S, { z: true, p: "x", q: false }).assignment, { q: false });
});

test("checkValuation: F é sempre falsa e o conjunto vazio é sempre verdadeiro", () => {
  assert.equal(checkValuation(clausesOf("F"), {}).value, false);
  assert.equal(checkValuation([], {}).value, true);
});

test("responder insatisfazível: certo num conjunto insatisfazível, erro num satisfazível", () => {
  const unsat = startSatGame(clausesOf("{¬p ∨ q, ¬p ∨ ¬q, p ∨ q, p ∨ ¬q}"));
  const right = satMove(unsat, { type: "answer", answer: "unsat" });
  assert.equal(right.outcome, "correctUnsat");
  assert.equal(right.state.finished, "unsat");
  assert.equal(right.state.errors, 0);

  const sat = startSatGame(clausesOf("p, -p q"));
  const wrong = satMove(sat, { type: "answer", answer: "unsat" });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.outcome, "wrongUnsat");
  assert.equal(wrong.state.phase, "valuation");
  assert.equal(wrong.state.errors, 1);
  assert.equal(wrong.state.finished, null);
});

test("responder satisfazível pede uma valoração; só acaba quando a valoração satisfaz S", () => {
  let state = startSatGame(clausesOf("p, -p q"));
  let result = satMove(state, { type: "answer", answer: "sat" });
  assert.equal(result.outcome, "askValuation");
  state = result.state;

  result = satMove(state, { type: "check", assignment: { p: true, q: false } });
  assert.equal(result.outcome, "falsifies");
  assert.equal(result.state.errors, 1);
  assert.equal(result.state.check.rows[1].value, false);
  state = result.state;

  result = satMove(state, { type: "check", assignment: { p: true } });
  assert.equal(result.outcome, "undecided");
  assert.equal(result.state.errors, 1);
  state = result.state;

  result = satMove(state, { type: "check", assignment: { p: true, q: true } });
  assert.equal(result.outcome, "satisfies");
  assert.equal(result.state.finished, "sat");
  assert.deepEqual(result.state.assignment, { p: true, q: true });
  assert.equal(result.state.moves, 4);
});

test("num conjunto insatisfazível nenhuma valoração serve; pode mudar a resposta", () => {
  let state = satMove(startSatGame(clausesOf("p, -p")), { type: "answer", answer: "sat" }).state;
  for (const p of [true, false]) {
    const result = satMove(state, { type: "check", assignment: { p } });
    assert.equal(result.outcome, "falsifies");
    state = result.state;
  }
  const changed = satMove(state, { type: "change" });
  assert.equal(changed.outcome, "changed");
  assert.equal(changed.state.phase, "answer");
  assert.equal(changed.state.check, null);
  const done = satMove(changed.state, { type: "answer", answer: "unsat" });
  assert.equal(done.state.finished, "unsat");
  assert.equal(done.state.errors, 2);
});

test("jogadas fora de fase são inválidas e não mudam o estado", () => {
  const state = startSatGame(clausesOf("p"));
  assert.equal(satMove(state, { type: "check", assignment: { p: true } }).outcome, "invalid");
  assert.equal(satMove(state, { type: "change" }).state, state);
  const done = satMove(state, { type: "answer", answer: "sat" }).state;
  const finished = satMove(done, { type: "check", assignment: { p: true } }).state;
  assert.equal(satMove(finished, { type: "answer", answer: "unsat" }).outcome, "invalid");
});

test("a resposta certa concorda com o DLL nos exemplos e em 200 fórmulas aleatórias; a valoração do DLL é aceite", () => {
  const sets = [
    ...EXAMPLES.map((example) => clausesOf(example.input)),
    ...Array.from({ length: 200 }, (_, seed) => generateFormula({ seed, vars: 1 + (seed % 5), clauses: 2 + (seed % 9) }).clauses),
  ];
  for (const S of sets) {
    const { sat, assignment } = solveDLL(S).result;
    const state = startSatGame(S);
    assert.equal(state.sat, sat);
    if (sat) {
      const asked = satMove(state, { type: "answer", answer: "sat" }).state;
      assert.equal(satMove(asked, { type: "check", assignment }).outcome, "satisfies");
    } else {
      assert.equal(satMove(state, { type: "answer", answer: "unsat" }).outcome, "correctUnsat");
    }
  }
});
