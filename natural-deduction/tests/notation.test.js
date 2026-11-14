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

test("quantificadores: forall e exists ↔ ∀ e ∃", () => {
  assert.equal(convertNotation("forall x P(x) |- exists y P(y)", "symbols"), "∀x P(x) ⊢ ∃y P(y)");
  assert.equal(convertNotation("forall  xP(x)", "symbols"), "∀xP(x)");
  assert.equal(convertNotation("forall x forall y R(x, y)", "symbols"), "∀x∀y R(x, y)");
  assert.equal(convertNotation("forall x(P(x) -> Q(x))", "symbols"), "∀x(P(x) → Q(x))");
  assert.equal(convertNotation("∀x P(x) ⊢ ∃y P(y)", "ascii"), "forall x P(x) |- exists y P(y)");
  assert.equal(convertNotation("∀xP(x)", "ascii"), "forall xP(x)");
  assert.equal(convertNotation("∀x∀y R(x, y)", "ascii"), "forall x forall y R(x, y)");
  assert.equal(convertNotation("¬∃x₁ x₁ = f(a)", "ascii"), "~exists x1 x1 = f(a)");
  assert.equal(convertNotation("foralls ∧ exists1", "ascii"), "foralls & exists1");
});

test("em posição de termo o `v` é um nome; entre fórmulas, a disjunção", () => {
  assert.equal(convertNotation("P(v) v Q(v, v)", "symbols"), "P(v) ∨ Q(v, v)");
  assert.equal(convertNotation("forall v P(v) v q", "symbols"), "∀v P(v) ∨ q");
  assert.equal(convertNotation("a = v v v = b", "symbols"), "a = v ∨ v = b");
  assert.equal(convertNotation("∀x v = x", "symbols"), "∀x v = x");
  assert.equal(convertNotation("P(f(v)) v p", "ascii"), "P(f(v)) | p");
  assert.equal(convertNotation("∀v P(v)", "ascii"), "forall v P(v)");
});

test("converter sequentes de 1.ª ordem não muda o significado", () => {
  const sequents = [
    "forall x (P(x) -> Q(x)), forall x P(x) |- forall x Q(x)",
    "∀x∀y R(x, y) ⊢ ∀y∀x R(x, y)",
    "exists v P(v) v exists v Q(v) |- exists x (P(x) | Q(x))",
    "a = b, P(a, f(b)) ⊢ P(b, f(a))",
    "∀xP(x) ⊢ ¬∃x¬P(x)",
    "|- forall v v = v",
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
  assert.equal(detectNotation("∀x P(x) ⊢ ∃x P(x)"), "symbols");
  assert.equal(detectNotation("forall x P(x) |- exists x P(x)"), "ascii");
  assert.equal(detectNotation("P(a, v), a = b"), null);
  assert.equal(detectNotation("p → q ⊢ r"), "symbols");
  assert.equal(detectNotation("p -> q |- r"), "ascii");
  assert.equal(detectNotation("p → q |- r"), "mixed");
  assert.equal(detectNotation("p, q"), null);
  assert.equal(detectNotation(""), null);
  assert.equal(detectNotation("p v q"), "mixed");
});
