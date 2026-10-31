import { test } from "node:test";
import assert from "node:assert/strict";
import { citeLine, citeRange, createProof } from "../js/core/proof.js";
import { parseFormula } from "../js/core/parser.js";
import { BASE_RULES, defineRule, subproof } from "../js/core/rules.js";
import { VERIFY_ERROR_CODES, verifyLine } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

function f(text) {
  const result = parseFormula(text);
  assert.ok(result.ok, text);
  return result.formula;
}

const premise = (text) => ({ kind: "premise", depth: 0, formula: f(text) });
const hyp = (depth, text) => ({ kind: "hypothesis", depth, formula: f(text) });
const step = (depth, text, rule, ...cites) => ({
  kind: "step",
  depth,
  formula: f(text),
  rule,
  citations: cites.map((cite) => (Array.isArray(cite) ? citeRange(cite[0], cite[1]) : citeLine(cite))),
});

function build(lines) {
  const result = createProof(lines);
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.proof;
}

/** Verifica a última linha. */
const verifyLast = (lines) => verifyLine(build(lines), lines.length);

const accepts = (lines) => assert.deepEqual(verifyLast(lines), { ok: true });

function rejects(lines, code, params = {}) {
  const result = verifyLast(lines);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  assert.deepEqual(result.error.params, { line: lines.length, ...params });
}

test("o catálogo tem as regras base e está congelado", () => {
  assert.deepEqual(
    BASE_RULES.map(({ id }) => id),
    ["∧I", "∧E", "∨I", "∨E", "¬I", "¬E", "FI", "FE", "→I", "→E", "R"],
  );
  assert.ok(Object.isFrozen(BASE_RULES));
  assert.ok(BASE_RULES.every(Object.isFrozen));
  assert.ok(BASE_RULES.every(({ conclusions }) => conclusions.length >= 1));
});

test("defineRule recusa esquemas mal escritos", () => {
  assert.throws(() => defineRule("X", ["φ ∧"], "φ"));
});

// ∧I

test("∧I: uso correto, por qualquer ordem", () => {
  const lines = [premise("a"), premise("b")];
  accepts([...lines, step(0, "a ∧ b", "∧I", 1, 2)]);
  accepts([...lines, step(0, "a ∧ b", "∧I", 2, 1)]);
  accepts([...lines, step(0, "b ∧ a", "∧I", 1, 2)]);
});

test("∧I: a mesma linha pode ser os dois lados", () => {
  accepts([premise("a"), step(0, "a ∧ a", "∧I", 1, 1)]);
});

test("∧I: erros", () => {
  const lines = [premise("a"), premise("b")];
  rejects([...lines, step(0, "a ∧ b", "∧I", 1)], "missingCitation", { rule: "∧I", expected: 2, found: 1 });
  rejects([...lines, step(0, "a ∧ b", "∧I", 1, 2, 1)], "extraCitation", { rule: "∧I", expected: 2, found: 3 });
  rejects([...lines, step(0, "a ∧ c", "∧I", 1, 2)], "formulaMismatch", { rule: "∧I" });
  rejects([...lines, step(0, "a ∨ b", "∧I", 1, 2)], "formulaMismatch", { rule: "∧I" });
});

// ∧E

test("∧E: dá qualquer um dos lados", () => {
  const lines = [premise("a ∧ b")];
  accepts([...lines, step(0, "a", "∧E", 1)]);
  accepts([...lines, step(0, "b", "∧E", 1)]);
});

test("∧E: erros", () => {
  rejects([premise("a ∧ b"), step(0, "a", "∧E")], "missingCitation", { rule: "∧E", expected: 1, found: 0 });
  rejects([premise("a ∧ b"), step(0, "c", "∧E", 1)], "formulaMismatch", { rule: "∧E" });
  rejects([premise("a ∨ b"), step(0, "a", "∧E", 1)], "ruleNotApplicable", { rule: "∧E" });
});

// ∨I

test("∨I: o lado citado pode ser qualquer um, e o outro é livre", () => {
  const lines = [premise("a")];
  accepts([...lines, step(0, "a ∨ b", "∨I", 1)]);
  accepts([...lines, step(0, "(b → c) ∨ a", "∨I", 1)]);
});

test("∨I: erros", () => {
  rejects([premise("a"), step(0, "b ∨ c", "∨I", 1)], "formulaMismatch", { rule: "∨I" });
  rejects([premise("a"), step(0, "a ∧ b", "∨I", 1)], "formulaMismatch", { rule: "∨I" });
  rejects([premise("a"), step(0, "a ∨ b", "∨I")], "missingCitation", { rule: "∨I", expected: 1, found: 0 });
});

// ∨E

const cases = [
  premise("a ∨ b"),
  hyp(1, "a"),
  step(1, "c", "R", 2),
  hyp(1, "b"),
  step(1, "c", "R", 4),
];

test("∨E: uso correto, por qualquer ordem", () => {
  accepts([...cases, step(0, "c", "∨E", 1, [2, 3], [4, 5])]);
  accepts([...cases, step(0, "c", "∨E", [4, 5], 1, [2, 3])]);
  accepts([...cases, step(0, "c", "∨E", [4, 5], [2, 3], 1)]);
});

test("∨E: erros", () => {
  rejects([...cases, step(0, "c", "∨E", 1, [2, 3])], "missingCitation", { rule: "∨E", expected: 3, found: 2 });
  rejects([...cases, step(0, "d", "∨E", 1, [2, 3], [4, 5])], "formulaMismatch", { rule: "∨E" });
  rejects([...cases, step(0, "c", "∨E", 1, 2, [4, 5])], "inaccessibleLine", { cited: "2" });
  rejects([...cases, step(0, "c", "∨E", 1, 1, [4, 5])], "wrongCitationKind", { rule: "∨E" });
});

test("∨E: as duas subdeduções têm de ser os dois casos e chegar à mesma fórmula", () => {
  const differentCase = [premise("a ∨ c"), hyp(1, "a"), step(1, "a", "R", 2), hyp(1, "b"), step(1, "a", "FE", 4)];
  rejects([...differentCase, step(0, "a", "∨E", 1, [2, 3], [4, 5])], "ruleNotApplicable", { rule: "∨E" });

  const differentEnds = [premise("a ∨ b"), hyp(1, "a"), step(1, "c", "FE", 2), hyp(1, "b"), step(1, "d", "FE", 4)];
  rejects([...differentEnds, step(0, "c", "∨E", 1, [2, 3], [4, 5])], "ruleNotApplicable", { rule: "∨E" });
});

// ¬I

const refutation = [premise("¬a"), hyp(1, "a"), step(1, "F", "FI", 1, 2)];

test("¬I: uso correto", () => {
  accepts([...refutation, step(0, "¬a", "¬I", [2, 3])]);
});

test("¬I: uma subdedução de uma só linha cita-se como intervalo", () => {
  accepts([hyp(1, "F"), step(0, "¬F", "¬I", [1, 1])]);
});

test("¬I: erros", () => {
  rejects([...refutation, step(0, "¬a", "¬I")], "missingCitation", { rule: "¬I", expected: 1, found: 0 });
  rejects([...refutation, step(0, "¬b", "¬I", [2, 3])], "formulaMismatch", { rule: "¬I" });
  rejects([...refutation, step(0, "¬a", "¬I", 1)], "wrongCitationKind", { rule: "¬I" });
  rejects([premise("b"), hyp(1, "a"), step(1, "b", "R", 1), step(0, "¬a", "¬I", [2, 3])], "ruleNotApplicable", { rule: "¬I" });
});

test("¬I: uma subdedução aberta não se pode citar", () => {
  rejects([...refutation, step(1, "¬a", "¬I", [2, 3])], "openSubproof", { cited: "2–3" });
});

// ¬E

test("¬E: uso correto", () => {
  accepts([premise("¬¬a"), step(0, "a", "¬E", 1)]);
  accepts([premise("¬¬¬a"), step(0, "¬a", "¬E", 1)]);
});

test("¬E: é só ¬¬φ ⊢ φ", () => {
  rejects([premise("¬a"), step(0, "a", "¬E", 1)], "ruleNotApplicable", { rule: "¬E" });
  rejects([premise("a"), step(0, "¬¬a", "¬E", 1)], "ruleNotApplicable", { rule: "¬E" });
  rejects([premise("¬¬a"), step(0, "b", "¬E", 1)], "formulaMismatch", { rule: "¬E" });
  rejects([...refutation, step(0, "a", "¬E", [2, 3])], "wrongCitationKind", { rule: "¬E" });
  rejects([premise("¬¬a"), step(0, "a", "¬E")], "missingCitation", { rule: "¬E", expected: 1, found: 0 });
});

// FI

test("FI: uso correto, por qualquer ordem", () => {
  const lines = [premise("a → b"), premise("¬(a → b)")];
  accepts([...lines, step(0, "F", "FI", 1, 2)]);
  accepts([...lines, step(0, "F", "FI", 2, 1)]);
});

test("FI: erros", () => {
  rejects([premise("a"), premise("¬b"), step(0, "F", "FI", 1, 2)], "ruleNotApplicable", { rule: "FI" });
  rejects([premise("a"), premise("¬a"), step(0, "a", "FI", 1, 2)], "formulaMismatch", { rule: "FI" });
  rejects([premise("a"), premise("¬a"), step(0, "F", "FI", 1)], "missingCitation", { rule: "FI", expected: 2, found: 1 });
});

// FE

test("FE: de F sai qualquer fórmula", () => {
  accepts([premise("F"), step(0, "a → (b ∧ c)", "FE", 1)]);
});

test("FE: erros", () => {
  rejects([premise("a"), step(0, "b", "FE", 1)], "ruleNotApplicable", { rule: "FE" });
  rejects([premise("F"), step(0, "b", "FE")], "missingCitation", { rule: "FE", expected: 1, found: 0 });
});

// →I

test("→I: uso correto", () => {
  const lines = [premise("b"), hyp(1, "a"), step(1, "b", "R", 1)];
  accepts([...lines, step(0, "a → b", "→I", [2, 3])]);
});

test("→I: a hipótese pode ser a última linha", () => {
  accepts([hyp(1, "a"), step(0, "a → a", "→I", [1, 1])]);
});

test("→I: erros", () => {
  const lines = [premise("b"), hyp(1, "a"), step(1, "b", "R", 1)];
  rejects([...lines, step(0, "a → c", "→I", [2, 3])], "formulaMismatch", { rule: "→I" });
  rejects([...lines, step(0, "b → a", "→I", [2, 3])], "formulaMismatch", { rule: "→I" });
  rejects([...lines, step(0, "a → b", "→I", 3)], "inaccessibleLine", { cited: "3" });
  rejects([...lines, step(0, "a → b", "→I", 1)], "wrongCitationKind", { rule: "→I" });
  rejects([...lines, step(1, "a → b", "→I", [2, 3])], "openSubproof", { cited: "2–3" });
  rejects([...lines, step(0, "a → b", "→I")], "missingCitation", { rule: "→I", expected: 1, found: 0 });
});

// →E

test("→E: uso correto, por qualquer ordem", () => {
  const lines = [premise("a"), premise("a → b")];
  accepts([...lines, step(0, "b", "→E", 1, 2)]);
  accepts([...lines, step(0, "b", "→E", 2, 1)]);
});

test("→E: as metavariáveis não se confundem quando φ é uma implicação", () => {
  const lines = [premise("a → b"), premise("(a → b) → c")];
  accepts([...lines, step(0, "c", "→E", 2, 1)]);
});

test("→E: erros", () => {
  rejects([premise("c"), premise("a → b"), step(0, "b", "→E", 1, 2)], "ruleNotApplicable", { rule: "→E" });
  rejects([premise("b"), premise("a → b"), step(0, "a", "→E", 1, 2)], "ruleNotApplicable", { rule: "→E" });
  rejects([premise("a"), premise("a → b"), step(0, "c", "→E", 1, 2)], "formulaMismatch", { rule: "→E" });
  rejects([premise("a"), premise("a → b"), step(0, "b", "→E", 2)], "missingCitation", { rule: "→E", expected: 2, found: 1 });
});

// R

test("R: repete uma fórmula acessível", () => {
  accepts([premise("a"), step(0, "a", "R", 1)]);
  accepts([premise("a"), hyp(1, "b"), step(1, "a", "R", 1)]);
});

test("R: erros", () => {
  rejects([premise("a"), step(0, "b", "R", 1)], "formulaMismatch", { rule: "R" });
  rejects([premise("a"), step(0, "a", "R")], "missingCitation", { rule: "R", expected: 1, found: 0 });
  rejects([premise("a"), premise("a"), step(0, "a", "R", 1, 2)], "extraCitation", { rule: "R", expected: 1, found: 2 });
  rejects([...refutation, step(0, "F", "R", [2, 3])], "wrongCitationKind", { rule: "R" });
});

// Convenções de citação

test("uma linha exterior acessível cita-se sem R, em qualquer profundidade", () => {
  accepts([premise("a"), premise("a → b"), hyp(1, "c"), hyp(2, "d"), step(2, "b", "→E", 1, 2)]);
});

test("uma subdedução aninhada e fechada cita-se dentro da subdedução-mãe", () => {
  accepts([hyp(1, "a"), hyp(2, "b"), step(2, "a", "R", 1), step(1, "b → a", "→I", [2, 3])]);
});

test("uma linha não pode citar-se a si própria nem linhas seguintes", () => {
  rejects([premise("a"), step(0, "a", "R", 2)], "inaccessibleLine", { cited: "2" });
  const proof = build([step(0, "a", "R", 2), step(0, "a", "R", 1)]);
  assert.equal(verifyLine(proof, 1).error.code, "inaccessibleLine");
});

test("um intervalo que começa depois da linha está inacessível", () => {
  const proof = build([premise("a"), step(0, "a → a", "→I", [3, 3]), hyp(1, "a"), step(0, "a", "R", 1)]);
  const result = verifyLine(proof, 2);
  assert.equal(result.error.code, "inaccessibleLine");
  assert.equal(result.error.params.cited, "3–3");
});

test("as linhas de uma subdedução fechada ficam inacessíveis", () => {
  rejects([hyp(1, "a"), step(0, "a", "R", 1)], "inaccessibleLine", { cited: "1" });
});

test("as linhas de uma subdedução irmã estão inacessíveis", () => {
  rejects([hyp(1, "a"), hyp(1, "b"), step(1, "a", "R", 1)], "inaccessibleLine", { cited: "1" });
});

test("uma subdedução dentro de outra já fechada só se alcança pela de fora", () => {
  rejects(
    [hyp(1, "a"), hyp(2, "b"), step(2, "a", "R", 1), step(1, "b → a", "→I", [2, 3]), step(0, "b → a", "→I", [2, 3])],
    "inaccessibleLine",
    { cited: "2–3" },
  );
});

test("um intervalo que acaba antes do fim da subdedução aberta continua a ser subdedução aberta", () => {
  rejects([hyp(1, "a"), step(1, "a", "R", 1), step(1, "a → a", "→I", [1, 2])], "openSubproof", { cited: "1–2" });
});

test("um intervalo tem de ser exatamente uma subdedução", () => {
  const lines = [premise("a"), hyp(1, "a"), step(1, "a", "R", 2), step(1, "a", "R", 3)];
  rejects([...lines, step(0, "a → a", "→I", [2, 3])], "notASubproof", { cited: "2–3" });
  rejects([...lines, step(0, "a → a", "→I", [1, 4])], "notASubproof", { cited: "1–4" });
  rejects([...lines, step(0, "a → a", "→I", [3, 4])], "notASubproof", { cited: "3–4" });
});

test("a citação de um número que não existe é recusada, seja linha ou intervalo", () => {
  rejects([premise("a"), step(0, "a", "R", 9)], "noSuchCitation", { cited: "9" });
  rejects([hyp(1, "a"), step(0, "a → a", "→I", [1, 9])], "noSuchCitation", { cited: "1–9" });
});

// Outras linhas e casos limite

test("premissas e hipóteses não precisam de regra", () => {
  const proof = build([premise("a"), hyp(1, "b")]);
  assert.deepEqual(verifyLine(proof, 1), { ok: true });
  assert.deepEqual(verifyLine(proof, 2), { ok: true });
});

test("uma linha por preencher é recusada", () => {
  const proof = build([
    { kind: "premise", depth: 0, formula: null },
    { kind: "hypothesis", depth: 1, formula: null },
    { kind: "step", depth: 1, formula: null, rule: "R", citations: [citeLine(1)] },
  ]);
  for (const line of [1, 2, 3]) assert.equal(verifyLine(proof, line).error.code, "emptyFormula");
});

test("citar uma linha por preencher é recusado", () => {
  const empty = { kind: "step", depth: 0, formula: null, rule: null, citations: [] };
  rejects([empty, step(0, "a", "R", 1)], "emptyCitation", { cited: "1" });

  const emptyEnd = { kind: "step", depth: 1, formula: null, rule: null, citations: [] };
  rejects([hyp(1, "a"), emptyEnd, step(0, "a → a", "→I", [1, 2])], "emptyCitation", { cited: "1–2" });
});

test("um passo sem regra ou com uma regra desconhecida é recusado", () => {
  rejects([premise("a"), step(0, "a", null, 1)], "missingRule");
  rejects([premise("a"), step(0, "a", "XYZ", 1)], "unknownRule", { rule: "XYZ" });
  rejects([premise("a"), step(0, "a", "constructor", 1)], "unknownRule", { rule: "constructor" });
});

test("a citação errada tem prioridade sobre a contagem", () => {
  rejects([premise("a"), step(0, "a ∧ a", "∧I", 9)], "noSuchCitation", { cited: "9" });
});

test("uma linha que não existe é recusada", () => {
  const proof = build([premise("a")]);
  for (const n of [0, 2, -1, 1.5]) {
    assert.deepEqual(verifyLine(proof, n), { ok: false, error: { code: "noSuchLine", params: { line: n } } });
  }
});

test("só conta o catálogo indicado", () => {
  const proof = build([premise("a"), step(0, "a", "R", 1)]);
  assert.equal(verifyLine(proof, 2, []).error.code, "unknownRule");
});

test("o verificador aceita regras novas definidas com o mesmo formato", () => {
  const custom = defineRule("X", ["φ → ψ", subproof("ψ", "θ")], "φ → θ");
  const lines = [premise("a → b"), hyp(1, "b"), step(1, "c", "FE", 2), step(0, "a → c", "X", [2, 3], 1)];
  const proof = build(lines);
  assert.deepEqual(verifyLine(proof, 4, [...BASE_RULES, custom]), { ok: true });
});

// Mensagens

test("cada código de erro é distinto e tem mensagem nas duas línguas", () => {
  assert.equal(new Set(VERIFY_ERROR_CODES).size, VERIFY_ERROR_CODES.length);
  for (const code of VERIFY_ERROR_CODES) {
    assert.ok(pt.verify.errors[code].includes("{line}"), `pt: ${code}`);
    assert.ok(en.verify.errors[code].includes("{line}"), `en: ${code}`);
  }
  assert.deepEqual(Object.keys(pt.verify.errors).sort(), [...VERIFY_ERROR_CODES].sort());
  assert.deepEqual(Object.keys(en.verify.errors).sort(), [...VERIFY_ERROR_CODES].sort());
});
