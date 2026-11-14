import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FALSUM, RESERVED_NAMES, RESERVED_TERM_NAMES, alphaEquals, and, atom, displayName, eq, equals, exists, forall,
  format, freeVariables, implies, isAtomName, isFree, isSubstitutable, isTermName, not, or, substitute, term,
} from "../js/core/formula.js";

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

// ---- 1.ª ordem ----

const [a, b, x, y, z, v] = ["a", "b", "x", "y", "z", "v"].map((name) => term(name));
const f = (...args) => term("f", args);
const P = (...args) => atom("P", args);
const Q = (...args) => atom("Q", args);
const R = (...args) => atom("R", args);
const names = (formula) => [...freeVariables(formula)].sort();

test("construtores de 1.ª ordem: forma dos nós e imutabilidade", () => {
  assert.deepEqual(term("x"), { kind: "term", name: "x", args: [] });
  assert.equal(f(x).args[0], x);
  assert.deepEqual(eq(a, b), { kind: "eq", args: [a, b] });
  const formula = forall("x", P(x));
  assert.equal(formula.kind, "forall");
  assert.equal(formula.name, "x");
  assert.equal(exists("y", P(y)).kind, "exists");
  assert.throws(() => { formula.name = "y"; }, TypeError);
  assert.throws(() => { formula.args.push(p); }, TypeError);
  assert.throws(() => { f(x).args.push(y); }, TypeError);
});

test("nomes de termos e validação dos argumentos", () => {
  for (const name of ["x", "v", "u1", "a_2", "f"]) assert.ok(isTermName(name), name);
  for (const name of ["", "1x", "x y", ...RESERVED_TERM_NAMES]) {
    assert.ok(!isTermName(name), name);
    assert.throws(() => term(name), Error);
    assert.throws(() => forall(name, p), Error);
  }
  assert.throws(() => term("f", [p]), Error);
  assert.throws(() => eq(p, a), Error);
});

test("igualdade estrutural com termos e quantificadores", () => {
  assert.ok(equals(forall("x", P(f(x))), forall("x", P(term("f", [term("x")])))));
  assert.ok(!equals(forall("x", P(x)), exists("x", P(x))));
  assert.ok(!equals(forall("x", P(x)), forall("y", P(y))), "equals não ignora o nome das ligadas");
  assert.ok(!equals(eq(a, b), eq(b, a)));
  assert.ok(!equals(P(a), Q(a)));
  assert.ok(!equals(f(a), term("g", [a])));
});

test("impressão de 1.ª ordem com a precedência nova", () => {
  const cases = [
    [P(x), "P(x)"],
    [R(x, f(a, term("b1"))), "R(x, f(a, b₁))"],
    [eq(f(a), b), "f(a) = b"],
    [forall("x", P(x)), "∀x P(x)"],
    [forall("x1", P(term("x1"))), "∀x₁ P(x₁)"],
    [forall("x", implies(P(x), Q(x))), "∀x(P(x) → Q(x))"],
    [forall("x", forall("y", R(x, y))), "∀x∀y R(x, y)"],
    [exists("x", not(P(x))), "∃x ¬P(x)"],
    [not(forall("x", P(x))), "¬∀x P(x)"],
    [or(exists("x", P(x)), not(P(x))), "∃x P(x) ∨ ¬P(x)"],
    [exists("x", or(P(x), not(P(x)))), "∃x(P(x) ∨ ¬P(x))"],
    [implies(forall("x", P(x)), exists("y", P(y))), "∀x P(x) → ∃y P(y)"],
    [forall("x", eq(x, x)), "∀x x = x"],
    [not(eq(a, b)), "¬a = b"],
    [and(eq(a, b), P(a)), "a = b ∧ P(a)"],
    [forall("v", P(v)), "∀v P(v)"],
  ];
  for (const [formula, text] of cases) assert.equal(format(formula), text);
});

test("variáveis livres", () => {
  assert.deepEqual(names(P(x)), ["x"]);
  assert.deepEqual(names(forall("x", P(x))), []);
  assert.deepEqual(names(forall("x", R(x, y))), ["y"]);
  assert.deepEqual(names(and(P(x), forall("x", Q(x)))), ["x"], "livre de um lado, ligada do outro");
  assert.deepEqual(names(R(f(x, a), term("g", [z]))), ["a", "x", "z"], "os nomes de função não contam");
  assert.deepEqual(names(eq(f(y), b)), ["b", "y"]);
  assert.deepEqual(names(forall("x", exists("y", R(x, f(y, z))))), ["z"]);
  assert.deepEqual(names(and(p, FALSUM)), []);
  assert.deepEqual(names(f(x, y)), ["x", "y"], "também funciona com termos");
  assert.ok(isFree(R(x, y), "x"));
  assert.ok(!isFree(exists("x", R(x, y)), "x"));
});

test("substituição só nas ocorrências livres", () => {
  assert.ok(equals(substitute(P(x), "x", a), P(a)));
  assert.ok(equals(substitute(R(x, f(x)), "x", f(a)), R(f(a), f(f(a)))));
  assert.ok(equals(substitute(eq(x, y), "x", b), eq(b, y)));
  assert.ok(equals(substitute(and(P(x), forall("x", Q(x))), "x", a), and(P(a), forall("x", Q(x)))));
  assert.ok(equals(substitute(forall("y", R(x, y)), "x", a), forall("y", R(a, y))));
  const closed = forall("x", P(x));
  assert.equal(substitute(closed, "x", a), closed, "sem ocorrências livres devolve o mesmo nó");
  assert.equal(substitute(p, "x", a), p);
  assert.ok(equals(substitute(f(x, y), "y", z), f(x, z)), "também funciona com termos");
  // φ[t/x] é literal e pode capturar: quem a usa confirma antes com isSubstitutable.
  assert.ok(equals(substitute(forall("y", R(x, y)), "x", f(y)), forall("y", R(f(y), y))));
});

test("substituição com quantificadores encaixados com o mesmo nome", () => {
  const nested = forall("x", and(P(x), forall("x", Q(x))));
  assert.equal(substitute(nested, "x", a), nested);
  assert.ok(equals(substitute(nested.args[0], "x", a), and(P(a), forall("x", Q(x)))));
  assert.ok(equals(substitute(exists("y", and(R(x, y), exists("x", P(x)))), "x", b),
    exists("y", and(R(b, y), exists("x", P(x))))));
});

test("x substituível por t em φ", () => {
  // Captura: em ∀y P(x, y), trocar x por f(y) prende o y de t.
  assert.ok(!isSubstitutable(forall("y", P(x, y)), "x", f(y)));
  assert.ok(!isSubstitutable(forall("y", P(x, y)), "x", y));
  assert.ok(isSubstitutable(forall("y", P(x, y)), "x", f(a)));
  assert.ok(isSubstitutable(forall("y", P(x, y)), "x", f(z)));
  assert.ok(isSubstitutable(forall("y", P(x, y)), "x", x));
  // Sem ocorrências livres de x no alcance não há captura.
  assert.ok(isSubstitutable(forall("y", P(y)), "x", f(y)));
  assert.ok(isSubstitutable(forall("x", P(x, y)), "x", y), "x ligado: nada a substituir");
  assert.ok(isSubstitutable(and(P(x), forall("y", Q(y))), "x", y));
  // Captura funda e em igualdades.
  assert.ok(!isSubstitutable(exists("z", forall("y", eq(x, a))), "x", f(z)));
  assert.ok(!isSubstitutable(and(p, exists("y", eq(x, y))), "x", y));
  // Sem quantificadores: sempre.
  assert.ok(isSubstitutable(R(x, y), "x", y));
  assert.ok(isSubstitutable(p, "x", y));
});

test("x substituível por t com quantificadores encaixados com o mesmo nome", () => {
  // Em ∀x∀y P(x, y) o x já está ligado: qualquer t serve.
  assert.ok(isSubstitutable(forall("x", forall("y", P(x, y))), "x", y));
  // Em ∀y(P(x) ∧ ∀y Q(y)), x está livre sob o ∀y exterior: y é capturado.
  assert.ok(!isSubstitutable(forall("y", and(P(x), forall("y", Q(y)))), "x", y));
  // Em ∀y∀x P(x, y) o x interior religa: sem captura.
  assert.ok(isSubstitutable(forall("y", forall("x", P(x, y))), "x", y));
});

test("igualdade a menos de α", () => {
  assert.ok(alphaEquals(forall("x", P(x)), forall("y", P(y))));
  const u = term("u");
  const w = term("w");
  assert.ok(alphaEquals(exists("x", forall("y", R(x, y))), exists("u", forall("w", R(u, w)))));
  assert.ok(!alphaEquals(exists("x", forall("y", R(x, y))), exists("y", forall("x", R(x, y)))));
  assert.ok(!alphaEquals(forall("x", P(x)), exists("x", P(x))));
  assert.ok(!alphaEquals(forall("x", P(x)), forall("x", Q(x))));
  // As livres comparam-se pelo nome.
  assert.ok(alphaEquals(forall("x", R(x, a)), forall("y", R(y, a))));
  assert.ok(!alphaEquals(forall("x", R(x, a)), forall("y", R(y, b))));
  assert.ok(!alphaEquals(P(x), P(y)));
  // Uma ligada nunca é igual a uma livre.
  assert.ok(!alphaEquals(forall("x", R(x, y)), forall("y", R(y, y))));
  assert.ok(!alphaEquals(forall("y", R(x, y)), forall("x", R(x, x))));
  // Funções e igualdade.
  assert.ok(alphaEquals(forall("x", eq(f(x), a)), forall("z", eq(f(z), a))));
  assert.ok(!alphaEquals(forall("x", eq(f(x), a)), forall("z", eq(term("g", [z]), a))));
  // Proposicional: como o equals.
  assert.ok(alphaEquals(and(p, not(q)), and(p, not(q))));
  assert.ok(!alphaEquals(and(p, q), or(p, q)));
});

test("igualdade a menos de α com quantificadores encaixados com o mesmo nome", () => {
  // Em ∀x∃x P(x), o x de P é o do ∃.
  assert.ok(alphaEquals(forall("x", exists("x", P(x))), forall("y", exists("z", P(z)))));
  assert.ok(!alphaEquals(forall("x", exists("x", P(x))), forall("y", exists("z", P(y)))));
  assert.ok(alphaEquals(forall("x", and(P(x), forall("x", Q(x)))), forall("y", and(P(y), forall("z", Q(z))))));
  assert.ok(!alphaEquals(forall("x", and(P(x), forall("x", Q(x)))), forall("y", and(P(y), forall("z", Q(y))))));
});
