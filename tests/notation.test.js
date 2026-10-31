import { test } from "node:test";
import assert from "node:assert/strict";
import { convertNotation, detectNotation } from "../js/core/notation.js";
import { formatSequent, parseSequent } from "../js/core/sequent.js";

const read = (text) => formatSequent(parseSequent(text).sequent);

test("para símbolos: todas as escritas aceites", () => {
  assert.equal(convertNotation("p -> q, ~r, !s |- t", "symbols"), "p → q, ¬r, ¬s ⊢ t");
  assert.equal(convertNotation("a /\\ b & c ^ d => e", "symbols"), "a ∧ b ∧ c ∧ d → e");
  assert.equal(convertNotation("a \\/ b | c v d", "symbols"), "a ∨ b ∨ c ∨ d");
  assert.equal(convertNotation("⊥ -> p1_2 -> q12", "symbols"), "F → p1_₂ → q₁₂");
});

test("para ASCII: átomos sem subscritos, e nunca - como negação", () => {
  assert.equal(convertNotation("p₁ ∧ ¬q → r ∨ F ⊢ s", "ascii"), "p1 & ~q -> r | F |- s");
  assert.equal(convertNotation("p ∨¬q ⊢ r", "ascii"), "p |~q |- r");
  assert.equal(convertNotation("p ∨-q ⊢ r", "ascii"), "p |~q |- r");
});

test("`v` só é disjunção como palavra inteira", () => {
  assert.equal(convertNotation("v1 v vv", "symbols"), "v₁ ∨ vv");
  assert.equal(convertNotation("x_v v y", "symbols"), "x_v ∨ y");
});

test("`|-` é ⊢, e com espaço é disjunção e negação", () => {
  assert.equal(convertNotation("p|-q", "symbols"), "p⊢q");
  assert.equal(convertNotation("p | -q ⊢ r", "symbols"), "p ∨ ¬q ⊢ r");
});

test("texto com erros: o que não é símbolo fica como está", () => {
  assert.equal(convertNotation("p ?? -> 1q  (", "symbols"), "p ?? → 1q  (");
  assert.equal(convertNotation("😀 -> p", "symbols"), "😀 → p");
  assert.equal(convertNotation("", "ascii"), "");
});

test("converter não muda o significado, nas duas direções", () => {
  const sequents = [
    "p -> q, ~q |- ~p",
    "p|~q|-r",
    "p ∨¬q ⊢ r",
    "a1 /\\ a2 \\/ a3 => F |- ⊥ -> v2",
    "x ∧ (y ∨ z), ¬¬x ⊢ (x → y) → z",
    "|- --p | !p",
  ];
  for (const text of sequents) {
    const symbols = convertNotation(text, "symbols");
    const ascii = convertNotation(text, "ascii");
    assert.equal(read(symbols), read(text), text);
    assert.equal(read(ascii), read(text), text);
    assert.equal(read(convertNotation(ascii, "symbols")), read(text), text);
    assert.equal(convertNotation(symbols, "symbols"), symbols, text);
    assert.equal(convertNotation(ascii, "ascii"), ascii, text);
  }
});

test("detectNotation", () => {
  assert.equal(detectNotation("p → q ⊢ r"), "symbols");
  assert.equal(detectNotation("p -> q |- r"), "ascii");
  assert.equal(detectNotation("p → q |- r"), "mixed");
  assert.equal(detectNotation("p, q"), null);
  assert.equal(detectNotation(""), null);
  assert.equal(detectNotation("p v q"), "mixed");
});
