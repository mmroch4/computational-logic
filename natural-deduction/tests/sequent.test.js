import { test } from "node:test";
import assert from "node:assert/strict";
import { and, atom, equals, format, implies, not, or } from "../js/core/formula.js";
import { INPUT_LIMITS } from "../js/core/parser.js";
import { SEQUENT_ERROR_CODES, formatSequent, parseSequent, sequent } from "../js/core/sequent.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

const [p, q, r] = ["p", "q", "r"].map((name) => atom(name));

function read(text) {
  const result = parseSequent(text);
  assert.ok(result.ok, `${text}: ${JSON.stringify(result.error)}`);
  return result.sequent;
}

function assertReads(text, premises, conclusion) {
  const result = read(text);
  assert.equal(result.premises.length, premises.length, text);
  premises.forEach((premise, i) => assert.ok(equals(result.premises[i], premise), `${text}: premissa ${i}`));
  assert.ok(equals(result.conclusion, conclusion), `${text}: conclusão`);
}

test("lê premissas e conclusão", () => {
  assertReads("p ∧ q, r ⊢ q ∧ r", [and(p, q), r], and(q, r));
  assertReads("p ⊢ p", [p], p);
  assertReads("p→q,p⊢q", [implies(p, q), p], q);
});

test("lê sequentes sem premissas", () => {
  assertReads("⊢ p → p", [], implies(p, p));
  assertReads("  ⊢p", [], p);
});

test("aceita |- como ⊢ e as notações das fórmulas", () => {
  assertReads("p & q |- q", [and(p, q)], q);
  assertReads("|- p -> p", [], implies(p, p));
  assertReads("p |- -q", [p], not(q));
  assertReads("p | -q ⊢ r", [or(p, not(q))], r);
});

test("premissas repetidas ficam todas, por ordem", () => {
  assertReads("q, p, q ⊢ p", [q, p, q], p);
});

test("o sequente lido é imutável", () => {
  const result = read("p ⊢ q");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.premises));
  assert.throws(() => result.premises.push(q));
});

test("sequent copia a lista de premissas", () => {
  const premises = [p];
  const built = sequent(premises, q);
  premises.push(r);
  assert.equal(built.premises.length, 1);
});

const ERROR_EXAMPLES = [
  { text: "", code: "emptyInput", start: 0, end: 0, params: {} },
  { text: "   ", code: "emptyInput", start: 0, end: 3, params: {} },
  { text: "p ∧ q", code: "missingTurnstile", start: 0, end: 5, params: {} },
  { text: "p, q", code: "missingTurnstile", start: 0, end: 4, params: {} },
  { text: "p ⊢ q ⊢ r", code: "multipleTurnstiles", start: 6, end: 7, params: { token: "⊢" } },
  { text: "p |- q |- r", code: "multipleTurnstiles", start: 7, end: 9, params: { token: "|-" } },
  { text: "p |-q |- r", code: "multipleTurnstiles", start: 6, end: 8, params: { token: "|-" } },
  { text: "p ⊢ q, r", code: "multipleConclusions", start: 5, end: 6, params: {} },
  { text: "p, ⊢ q", code: "emptyPremise", start: 1, end: 2, params: {} },
  { text: ", p ⊢ q", code: "emptyPremise", start: 0, end: 1, params: {} },
  { text: "p, , q ⊢ r", code: "emptyPremise", start: 3, end: 4, params: {} },
  { text: ", ⊢ q", code: "emptyPremise", start: 0, end: 1, params: {} },
  { text: "p ⊢", code: "missingConclusion", start: 2, end: 3, params: { token: "⊢" } },
  { text: "⊢", code: "missingConclusion", start: 0, end: 1, params: { token: "⊢" } },
  { text: "p |-  ", code: "missingConclusion", start: 2, end: 4, params: { token: "|-" } },
];

test("erros próprios dos sequentes, com posição", () => {
  for (const { text, code, start, end, params } of ERROR_EXAMPLES) {
    assert.deepEqual(parseSequent(text), { ok: false, error: { code, params, start, end } }, text);
  }
});

test("os erros das fórmulas apontam para o sítio certo do sequente", () => {
  const cases = [
    { text: "p ∧ ⊢ q", code: "missingOperand", start: 2, end: 3 },
    { text: "p, (q ⊢ r", code: "unbalanced", start: 3, end: 4 },
    { text: "p, q # r ⊢ s", code: "unexpectedChar", start: 5, end: 6 },
    { text: "p ⊢ q r", code: "missingOperator", start: 6, end: 7 },
    { text: "p ⊢ 1q", code: "badVariable", start: 4, end: 6 },
    { text: "p, (q, r) ⊢ s", code: "unbalanced", start: 3, end: 4 },
  ];
  for (const { text, code, start, end } of cases) {
    const { error } = parseSequent(text);
    assert.equal(error?.code, code, text);
    assert.deepEqual([error.start, error.end], [start, end], text);
  }
});

test("não aceita metavariáveis", () => {
  assert.equal(parseSequent("⊢ φ").error?.code, "unexpectedChar");
});

test("o limite de tamanho aplica-se a cada fórmula", () => {
  const { maxChars } = INPUT_LIMITS;
  const big = "p".repeat(maxChars);
  assert.ok(parseSequent(`${big}, ${big} ⊢ ${big}`).ok);

  const tooBig = "p".repeat(maxChars + 1);
  const { error } = parseSequent(`q, ${tooBig} ⊢ r`);
  assert.equal(error?.code, "tooLong");
  assert.equal(error.start, 2);
});

test("imprime sequentes", () => {
  assert.equal(formatSequent(read("p&q,r|-q&r")), "p ∧ q, r ⊢ q ∧ r");
  assert.equal(formatSequent(read("|-p->p")), "⊢ p → p");
});

test("imprimir e voltar a ler dá o mesmo sequente", () => {
  for (const text of ["(p ∨ q) ∧ r, ¬p ⊢ q → r", "⊢ F → p", "p1, x_2 ⊢ p1 ∧ x_2"]) {
    const once = read(text);
    const twice = read(formatSequent(once));
    assert.equal(format(twice.conclusion), format(once.conclusion));
    assert.ok(equals(twice.conclusion, once.conclusion));
    assert.equal(twice.premises.length, once.premises.length);
    once.premises.forEach((premise, i) => assert.ok(equals(twice.premises[i], premise)));
  }
});

test("todos os códigos têm mensagem nos dois idiomas", () => {
  assert.deepEqual(
    [...new Set(ERROR_EXAMPLES.map(({ code }) => code).filter((code) => code !== "emptyInput"))].sort(),
    [...SEQUENT_ERROR_CODES].sort(),
  );
  for (const code of SEQUENT_ERROR_CODES) {
    assert.equal(typeof pt.parser.errors[code], "string", `pt: ${code}`);
    assert.equal(typeof en.parser.errors[code], "string", `en: ${code}`);
  }
});
