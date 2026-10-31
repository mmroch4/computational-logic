import { test } from "node:test";
import assert from "node:assert/strict";
import { FALSUM, RESERVED_NAMES, and, atom, displayName, equals, format, implies, isAtomName, not, or } from "../js/core/formula.js";

const [p, q, r] = ["p", "q", "r"].map((name) => atom(name));

test("os nós são imutáveis", () => {
  const formula = and(p, not(q));
  assert.throws(() => { formula.kind = "or"; }, TypeError);
  assert.throws(() => { formula.args[0] = q; }, TypeError);
  assert.throws(() => { formula.args.push(q); }, TypeError);
  assert.throws(() => { p.name = "q"; }, TypeError);
  assert.throws(() => { FALSUM.args.push(p); }, TypeError);
});

test("igualdade estrutural", () => {
  assert.ok(equals(and(atom("p"), not(atom("q"))), and(p, not(q))));
  assert.ok(equals(FALSUM, FALSUM));
  assert.ok(!equals(p, q));
  assert.ok(!equals(and(p, q), or(p, q)));
  assert.ok(!equals(and(p, q), and(q, p)));
  assert.ok(!equals(p, FALSUM));
  assert.ok(!equals(not(p), not(not(p))));
});

test("o AST já suporta termos e quantificadores sem mudar a igualdade", () => {
  const x = Object.freeze({ kind: "variable", name: "x", args: [] });
  const y = Object.freeze({ kind: "variable", name: "y", args: [] });
  assert.ok(equals(atom("P", [x]), atom("P", [x])));
  assert.ok(!equals(atom("P", [x]), atom("P", [y])));
  assert.ok(!equals(atom("P", [x]), atom("P")));

  const forall = (name, body) => ({ kind: "forall", name, args: [body] });
  assert.ok(equals(forall("x", atom("P", [x])), forall("x", atom("P", [x]))));
  assert.ok(!equals(forall("x", p), forall("y", p)));
});

test("nomes de átomos", () => {
  for (const name of ["p", "q1", "x_2", "Ab3", "V", "f"]) assert.ok(isAtomName(name), name);
  for (const name of ["", "1p", "_p", "p q", "p-q", ...RESERVED_NAMES]) {
    assert.ok(!isAtomName(name), name);
    assert.throws(() => atom(name), Error);
  }
});

test("sufixo numérico em subscrito", () => {
  assert.equal(displayName("p11"), "p₁₁");
  assert.equal(displayName("x_20"), "x_₂₀");
  assert.equal(displayName("p1a"), "p1a");
  assert.equal(displayName("q"), "q");
});

test("impressão com o mínimo de parênteses", () => {
  const cases = [
    [p, "p"],
    [FALSUM, "F"],
    [atom("p12"), "p₁₂"],
    [not(not(p)), "¬¬p"],
    [not(FALSUM), "¬F"],
    [not(and(p, q)), "¬(p ∧ q)"],
    [and(not(p), q), "¬p ∧ q"],
    [or(and(p, q), r), "p ∧ q ∨ r"],
    [and(or(p, q), r), "(p ∨ q) ∧ r"],
    [implies(or(p, q), and(p, r)), "p ∨ q → p ∧ r"],
    [or(implies(p, q), r), "(p → q) ∨ r"],
    [implies(p, implies(q, r)), "p → q → r"],
    [implies(implies(p, q), r), "(p → q) → r"],
    [and(and(p, q), r), "p ∧ q ∧ r"],
    [and(p, and(q, r)), "p ∧ (q ∧ r)"],
    [or(or(p, q), r), "p ∨ q ∨ r"],
    [or(p, or(q, r)), "p ∨ (q ∨ r)"],
    [not(implies(p, FALSUM)), "¬(p → F)"],
  ];
  for (const [formula, text] of cases) assert.equal(format(formula), text);
});
