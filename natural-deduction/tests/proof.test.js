import { test } from "node:test";
import assert from "node:assert/strict";
import { atom } from "../js/core/formula.js";
import {
  PROOF_ERROR_CODES,
  accessibleFrom,
  citeLine,
  citeRange,
  closeSubproof,
  createProof,
  deleteLine,
  editLine,
  enclosingSubproofs,
  insertAtBoxStart,
  insertLine,
  openSubproof,
  subproofs,
} from "../js/core/proof.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

const [a, b, c] = ["a", "b", "c"].map((name) => atom(name));

const premise = (formula = a) => ({ kind: "premise", depth: 0, formula });
const hyp = (depth, formula = a) => ({ kind: "hypothesis", depth, formula });
const step = (depth, citations = [], formula = a) => ({ kind: "step", depth, formula, rule: "R", citations });

function build(lines) {
  const result = createProof(lines);
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.proof;
}

function done(result) {
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.proof;
}

function assertFails(result, code, line) {
  assert.equal(result.ok, false);
  assert.deepEqual(result.error, { code, params: { line } });
}

const depths = ({ lines }) => lines.map(({ depth }) => depth);
const ranges = (proof) => subproofs(proof).map(({ from, to }) => `${from}-${to}`);

// 1 premissa
// 2 | hipótese
// 3 | | hipótese
// 4 | | passo
// 5 | passo
// 6 | | hipótese
// 7 | | passo
// 8 | passo
// 9 passo
const nested = () => build([
  premise(), hyp(1), hyp(2), step(2), step(1), hyp(2), step(2), step(1), step(0),
]);

test("uma prova pode estar vazia e fica imutável", () => {
  const proof = build([]);
  assert.deepEqual(proof.lines, []);
  assert.deepEqual(subproofs(proof), []);

  const filled = build([premise(), step(0, [citeLine(1)])]);
  assert.ok(Object.isFrozen(filled));
  assert.ok(Object.isFrozen(filled.lines));
  assert.ok(Object.isFrozen(filled.lines[1]));
  assert.ok(Object.isFrozen(filled.lines[1].citations));
});

test("recusa estruturas inválidas", () => {
  assertFails(createProof([step(1)]), "invalidDepth", 1);
  assertFails(createProof([premise(), step(1)]), "invalidDepth", 2);
  assertFails(createProof([hyp(0)]), "invalidDepth", 1);
  assertFails(createProof([hyp(2)]), "invalidDepth", 1);
  assertFails(createProof([hyp(1), step(1), hyp(3)]), "invalidDepth", 3);
  assertFails(createProof([step(0), premise()]), "misplacedPremise", 2);
  assertFails(createProof([hyp(1), { ...premise(), depth: 1 }]), "misplacedPremise", 2);
  assertFails(createProof([{ kind: "goal", depth: 0 }]), "invalidLine", 1);
  assertFails(createProof([{ ...step(0), depth: -1 }]), "invalidLine", 1);
  assertFails(createProof([step(0, [citeRange(4, 2)])]), "invalidLine", 1);
  assertFails(createProof([step(0, [citeLine(0)])]), "invalidLine", 1);
  assertFails(createProof([{ ...premise(), rule: "R" }]), "invalidLine", 1);
  assertFails(createProof([{ ...hyp(1), citations: [citeLine(1)] }]), "invalidLine", 1);
});

test("deteta subdeduções aninhadas e seguidas", () => {
  assert.deepEqual(ranges(nested()), ["2-8", "3-4", "6-7"]);
  assert.deepEqual(subproofs(nested()).map(({ depth }) => depth), [1, 2, 2]);
  assert.deepEqual(ranges(build([hyp(1), step(1), hyp(1), step(1), step(0)])), ["1-2", "3-4"]);
  assert.deepEqual(ranges(build([hyp(1), hyp(2), hyp(3), hyp(1)])), ["1-3", "2-3", "3-3", "4-4"]);
});

test("uma subdedução só está fechada se houver linhas depois dela", () => {
  const open = build([hyp(1), hyp(2), step(2)]);
  assert.deepEqual(subproofs(open).map(({ closed }) => closed), [false, false]);
  const inner = build([hyp(1), hyp(2), step(2), step(1)]);
  assert.deepEqual(subproofs(inner).map(({ closed }) => closed), [false, true]);
  assert.ok(subproofs(nested()).every(({ closed }) => closed));
});

test("enclosingSubproofs vai do escopo exterior para o interior", () => {
  const proof = nested();
  const chain = (n) => enclosingSubproofs(proof, n).map(({ from, to }) => `${from}-${to}`);
  assert.deepEqual(chain(1), []);
  assert.deepEqual(chain(4), ["2-8", "3-4"]);
  assert.deepEqual(chain(5), ["2-8"]);
  assert.deepEqual(chain(7), ["2-8", "6-7"]);
  assert.deepEqual(chain(9), []);
  assert.deepEqual(chain(10), []);
});

test("em escopos aninhados, as linhas dos escopos abertos estão acessíveis", () => {
  const proof = nested();
  assert.deepEqual(accessibleFrom(proof, 1), { lines: [], ranges: [] });
  assert.deepEqual(accessibleFrom(proof, 2), { lines: [1], ranges: [] });
  assert.deepEqual(accessibleFrom(proof, 3), { lines: [1, 2], ranges: [] });
  assert.deepEqual(accessibleFrom(proof, 4), { lines: [1, 2, 3], ranges: [] });
});

test("as linhas de uma subdedução fechada só se alcançam pelo intervalo", () => {
  const proof = nested();
  assert.deepEqual(accessibleFrom(proof, 5), { lines: [1, 2], ranges: [{ from: 3, to: 4 }] });
  assert.deepEqual(accessibleFrom(proof, 7), { lines: [1, 2, 5, 6], ranges: [{ from: 3, to: 4 }] });
  assert.deepEqual(accessibleFrom(proof, 8), {
    lines: [1, 2, 5],
    ranges: [{ from: 3, to: 4 }, { from: 6, to: 7 }],
  });
});

test("fora de uma subdedução, as interiores deixam de estar acessíveis", () => {
  assert.deepEqual(accessibleFrom(nested(), 9), { lines: [1], ranges: [{ from: 2, to: 8 }] });
});

test("uma subdedução ainda aberta não é citável de dentro dela", () => {
  const proof = build([hyp(1), step(1), step(1)]);
  assert.deepEqual(accessibleFrom(proof, 3), { lines: [1, 2], ranges: [] });
});

test("subdeduções seguidas: a primeira é citável a partir da segunda", () => {
  const proof = build([premise(), hyp(1), step(1), hyp(1), step(1), step(0)]);
  assert.deepEqual(accessibleFrom(proof, 5), { lines: [1, 4], ranges: [{ from: 2, to: 3 }] });
  assert.deepEqual(accessibleFrom(proof, 6), {
    lines: [1],
    ranges: [{ from: 2, to: 3 }, { from: 4, to: 5 }],
  });
});

test("uma subdedução de uma só linha cita-se como intervalo", () => {
  const proof = build([hyp(1), step(0)]);
  assert.deepEqual(accessibleFrom(proof, 2), { lines: [], ranges: [{ from: 1, to: 1 }] });
});

test("uma subdedução que acaba dentro de outra não é citável", () => {
  const proof = build([hyp(1), hyp(2), step(0)]);
  assert.deepEqual(accessibleFrom(proof, 3), { lines: [], ranges: [] });
});

test("linha inexistente não tem nada acessível", () => {
  for (const n of [0, 10, 1.5, "2"]) assert.deepEqual(accessibleFrom(nested(), n), { lines: [], ranges: [] });
});

test("inserir renumera as citações seguintes e mantém a ordem delas", () => {
  const proof = build([premise(), premise(), step(0, [citeLine(2), citeLine(1)]), step(0, [citeLine(3)])]);
  const after = done(insertLine(proof, 1, { kind: "premise", depth: 0, formula: b }));
  assert.equal(after.lines.length, 5);
  assert.deepEqual(after.lines[3].citations, [citeLine(3), citeLine(1)]);
  assert.deepEqual(after.lines[4].citations, [citeLine(4)]);
  assert.deepEqual(proof.lines[3].citations, [citeLine(3)], "a prova original não muda");
});

test("as citações da linha inserida já vêm na numeração nova", () => {
  const proof = build([premise(), step(0)]);
  const after = done(insertLine(proof, 1, { formula: b, rule: "R", citations: [citeLine(1)] }));
  assert.deepEqual(after.lines[1].citations, [citeLine(1)]);
  assert.equal(after.lines[1].rule, "R");
  assert.equal(after.lines[1].kind, "step");
});

test("inserir no início, no fim e numa prova vazia", () => {
  const first = done(insertLine(build([]), 0, { formula: a }));
  assert.equal(first.lines.length, 1);
  assert.equal(first.lines[0].depth, 0);

  const proof = build([step(0, [citeLine(1)])]);
  assert.deepEqual(done(insertLine(proof, 0, {})).lines[1].citations, [citeLine(2)]);
  assert.equal(done(insertLine(proof, 1, {})).lines.length, 2);
});

test("uma linha nova herda a profundidade, ou fecha subdeduções se indicar outra menor", () => {
  const proof = build([hyp(1), hyp(2), step(2)]);
  assert.deepEqual(depths(done(insertLine(proof, 3, {}))), [1, 2, 2, 2]);
  assert.deepEqual(depths(done(insertLine(proof, 3, { depth: 1 }))), [1, 2, 2, 1]);
  assert.deepEqual(depths(done(insertLine(proof, 3, { depth: 0 }))), [1, 2, 2, 0]);
});

test("recusa inserções fora do sítio", () => {
  const proof = build([premise(), hyp(1), step(1), step(0)]);
  assertFails(insertLine(proof, 9, {}), "noSuchLine", 9);
  assertFails(insertLine(proof, -1, {}), "noSuchLine", -1);
  assertFails(insertLine(proof, 3, { depth: 2 }), "invalidDepth", 4);
  assertFails(insertLine(proof, 2, { depth: 0 }), "invalidDepth", 4);
  assertFails(insertLine(proof, 2, { kind: "premise", depth: 0 }), "misplacedPremise", 3);
  assertFails(insertLine(proof, 0, { citations: [{ kind: "line", line: 0 }] }), "invalidLine", 1);
});

test("um intervalo que é uma subdedução cresce quando ela cresce", () => {
  const proof = build([hyp(1), step(1), step(0, [citeRange(1, 2)])]);
  const inside = done(insertLine(proof, 2, { formula: b }));
  assert.deepEqual(inside.lines[3].citations, [citeRange(1, 3)]);
  const before = done(insertLine(proof, 0, { kind: "premise", depth: 0 }));
  assert.deepEqual(before.lines[3].citations, [citeRange(2, 3)]);
});

test("um intervalo que não é subdedução acompanha só as extremidades", () => {
  const proof = build([step(0), step(0), step(0), step(0, [citeRange(1, 2)])]);
  assert.deepEqual(done(insertLine(proof, 2, {})).lines[4].citations, [citeRange(1, 2)]);
  assert.deepEqual(done(insertLine(proof, 1, {})).lines[4].citations, [citeRange(1, 3)]);
});

test("citações de linhas que não existem não mudam", () => {
  const citations = [citeLine(99), citeRange(50, 60)];
  const proof = build([step(0), step(0, citations), step(0)]);
  assert.deepEqual(done(insertLine(proof, 0, {})).lines[2].citations, citations);
  assert.deepEqual(done(deleteLine(proof, 1)).lines[0].citations, citations);
});

test("apagar renumera e tira as citações da linha apagada", () => {
  const proof = build([premise(), premise(), step(0, [citeLine(2), citeLine(1)]), step(0, [citeLine(3)])]);
  const after = done(deleteLine(proof, 2));
  assert.equal(after.lines.length, 3);
  assert.deepEqual(after.lines[1].citations, [citeLine(1)]);
  assert.deepEqual(after.lines[2].citations, [citeLine(2)]);
  assertFails(deleteLine(proof, 5), "noSuchLine", 5);
  assertFails(deleteLine(proof, 0), "noSuchLine", 0);
});

test("apagar um passo mantém o intervalo da subdedução, mais curto", () => {
  const proof = build([hyp(1), step(1), step(1), step(0, [citeRange(1, 3)])]);
  const after = done(deleteLine(proof, 2));
  assert.deepEqual(after.lines[2].citations, [citeRange(1, 2)]);
});

test("apagar a última linha de uma subdedução encurta o intervalo", () => {
  const proof = build([hyp(1), step(1), step(0, [citeRange(1, 2)])]);
  assert.deepEqual(done(deleteLine(proof, 2)).lines[1].citations, [citeRange(1, 1)]);
});

test("apagar uma hipótese apaga a subdedução, com o que estiver aninhado", () => {
  const after = done(deleteLine(nested(), 2));
  assert.equal(after.lines.length, 2);
  assert.deepEqual(depths(after), [0, 0]);

  const proof = build([
    premise(), hyp(1), hyp(2), step(2), step(1, [citeRange(3, 4)]), step(0, [citeRange(2, 5), citeLine(1)]),
  ]);
  const inner = done(deleteLine(proof, 3));
  assert.deepEqual(depths(inner), [0, 1, 1, 0]);
  assert.deepEqual(inner.lines[2].citations, []);
  assert.deepEqual(inner.lines[3].citations, [citeRange(2, 3), citeLine(1)]);

  const outer = done(deleteLine(proof, 2));
  assert.deepEqual(outer.lines[1].citations, [citeLine(1)]);
});

test("um intervalo que não é subdedução encolhe e desaparece com as suas linhas", () => {
  const proof = build([step(0), step(0), step(0), step(0, [citeRange(1, 2)])]);
  const once = done(deleteLine(proof, 1));
  assert.deepEqual(once.lines[2].citations, [citeRange(1, 1)]);
  assert.deepEqual(done(deleteLine(once, 1)).lines[1].citations, []);
});

test("apagar o passo entre duas subdeduções deixa-as seguidas", () => {
  const proof = build([hyp(1), step(1), step(0), hyp(1), step(0, [citeRange(4, 4), citeRange(1, 2)])]);
  const after = done(deleteLine(proof, 3));
  assert.deepEqual(ranges(after), ["1-2", "3-3"]);
  assert.deepEqual(after.lines[3].citations, [citeRange(3, 3), citeRange(1, 2)]);
});

test("abrir uma subdedução entra no escopo da linha", () => {
  const proof = build([premise(), step(0, [citeLine(1)])]);
  const after = done(openSubproof(proof, 1, b));
  assert.equal(after.lines[1].kind, "hypothesis");
  assert.equal(after.lines[1].formula, b);
  assert.deepEqual(depths(after), [0, 1, 0]);
  assert.deepEqual(ranges(after), ["2-2"]);
  assert.deepEqual(after.lines[2].citations, [citeLine(1)]);

  assert.deepEqual(depths(done(openSubproof(after, 2, c))), [0, 1, 2, 0]);
  assert.deepEqual(depths(done(openSubproof(build([]), 0, a))), [1]);
});

test("abre o segundo caso de uma subdedução seguida da outra", () => {
  const proof = build([premise(), hyp(1), step(1)]);
  const after = done(openSubproof(proof, 3, b, 1));
  assert.deepEqual(ranges(after), ["2-3", "4-4"]);
});

test("recusa abrir uma subdedução no sítio errado", () => {
  assertFails(openSubproof(build([premise()]), 0, a), "misplacedPremise", 2);
  assertFails(openSubproof(build([premise()]), 5, a), "noSuchLine", 5);
  assertFails(openSubproof(build([premise()]), 1, a, 0), "invalidDepth", 2);
  assertFails(openSubproof(build([premise()]), 1, a, 3), "invalidDepth", 2);
});

test("uma hipótese nunca apanha as linhas seguintes", () => {
  const proof = build([premise(), hyp(1), step(1), step(1), step(0)]);
  assertFails(openSubproof(proof, 3, b, 1), "capturesLines", 4);
  assertFails(openSubproof(proof, 2, b, 1), "capturesLines", 3);

  const beforeNested = build([step(0), hyp(1), step(1), step(0)]);
  assertFails(insertLine(beforeNested, 1, { kind: "hypothesis", depth: 0 }), "capturesLines", 2);
  assert.deepEqual(depths(done(openSubproof(beforeNested, 1, b))), [0, 1, 1, 1, 0]);
});

test("fechar passa as linhas seguintes para o escopo de fora", () => {
  const proof = build([premise(), hyp(1), step(1), step(1), step(1, [citeLine(4)])]);
  const after = done(closeSubproof(proof, 3));
  assert.deepEqual(depths(after), [0, 1, 1, 0, 0]);
  assert.deepEqual(ranges(after), ["2-3"]);
  assert.deepEqual(after.lines[4].citations, [citeLine(4)]);
  assert.deepEqual(accessibleFrom(after, 4), { lines: [1], ranges: [{ from: 2, to: 3 }] });
});

test("fechar na hipótese deixa uma subdedução de uma linha", () => {
  const proof = build([hyp(1), step(1), step(1)]);
  assert.deepEqual(depths(done(closeSubproof(proof, 1))), [1, 0, 0]);
});

test("fechar arrasta as subdeduções interiores e mantém os intervalos", () => {
  const proof = build([
    hyp(1), step(1), hyp(2), step(2), step(1, [citeRange(3, 4)]), step(0, [citeRange(1, 5)]),
  ]);
  const after = done(closeSubproof(proof, 2));
  assert.deepEqual(depths(after), [1, 1, 1, 1, 0, 0]);
  assert.deepEqual(ranges(after), ["1-2", "3-4"]);
  assert.deepEqual(after.lines[4].citations, [citeRange(3, 4)]);
  assert.deepEqual(after.lines[5].citations, [citeRange(1, 2)]);
});

test("fechar a subdedução interior não mexe na exterior", () => {
  const proof = build([hyp(1), hyp(2), step(2), step(2), step(1)]);
  const after = done(closeSubproof(proof, 3));
  assert.deepEqual(depths(after), [1, 2, 2, 1, 1]);
  assert.deepEqual(ranges(after), ["1-5", "2-3"]);
});

test("fechar na última linha da prova junta uma linha por preencher lá fora", () => {
  const proof = build([hyp(1), hyp(2), step(2)]);
  const after = done(closeSubproof(proof, 3));
  assert.deepEqual(depths(after), [1, 2, 2, 1]);
  assert.deepEqual(after.lines[3], { kind: "step", depth: 1, formula: null, rule: null, citations: [] });
  assert.deepEqual(subproofs(after).map(({ closed }) => closed), [false, true]);
  assert.deepEqual(depths(done(closeSubproof(after, 4))), [1, 2, 2, 1, 0]);
});

test("recusa fechar o que não está aberto", () => {
  const proof = build([premise(), hyp(1), step(1), step(0)]);
  assertFails(closeSubproof(proof, 1), "notInSubproof", 1);
  assertFails(closeSubproof(proof, 4), "notInSubproof", 4);
  assertFails(closeSubproof(proof, 3), "alreadyClosed", 3);
  assertFails(closeSubproof(proof, 9), "noSuchLine", 9);
});

test("uma sequência de edições mantém prova e citações coerentes", () => {
  let proof = build([premise(a)]);
  proof = done(openSubproof(proof, 1, b));
  proof = done(insertLine(proof, 2, { formula: c, rule: "R", citations: [citeLine(1)] }));
  proof = done(closeSubproof(proof, 3));
  proof = done(insertLine(proof, 0, { kind: "premise", depth: 0, formula: c }));
  const last = proof.lines.length;
  assert.deepEqual(accessibleFrom(proof, last), { lines: [1, 2], ranges: [{ from: 3, to: 4 }] });
  assert.deepEqual(proof.lines[3].citations, [citeLine(2)]);
});

// Caixas com variável (1.ª ordem)

const forallStep = (depth, fresh = "v", citations = []) => ({ ...step(depth, citations), fresh });
const labelHyp = (depth, label = "v", extra = {}) => ({ ...hyp(depth), label, ...extra });
const boxes = (proof) => subproofs(proof).map(({ from, to, depth, fresh, label }) => [`${from}-${to}`, depth, fresh, label]);

// 1 premissa
//   [v]
// 2 | | hipótese
// 3 | | passo
// 4 | passo, 2–3
// 5 passo, 2–4
const labelled = () => build([
  premise(), labelHyp(2), step(2), step(1, [citeRange(2, 3)]), step(0, [citeRange(2, 4)]),
]);

test("um passo com fresh abre a caixa do ∀I, que se cita como uma subdedução", () => {
  const proof = build([premise(), forallStep(1), step(1), step(0, [citeRange(2, 3)])]);
  assert.deepEqual(boxes(proof), [["2-3", 1, "v", false]]);
  assert.equal(subproofs(proof)[0].closed, true);
  assert.deepEqual(accessibleFrom(proof, 3), { lines: [1, 2], ranges: [] });
  assert.deepEqual(accessibleFrom(proof, 4), { lines: [1], ranges: [{ from: 2, to: 3 }] });
  assert.deepEqual(enclosingSubproofs(proof, 3).map(({ from, to }) => `${from}-${to}`), ["2-3"]);
});

test("a linha de etiqueta abre a caixa do ∀I por fora da hipótese, na mesma linha", () => {
  const proof = labelled();
  assert.deepEqual(boxes(proof), [["2-4", 1, "v", true], ["2-3", 2, null, false]]);
  assert.deepEqual(enclosingSubproofs(proof, 3).map(({ from, to }) => `${from}-${to}`), ["2-4", "2-3"]);
  assert.deepEqual(accessibleFrom(proof, 3), { lines: [1, 2], ranges: [] });
  assert.deepEqual(accessibleFrom(proof, 4), { lines: [1], ranges: [{ from: 2, to: 3 }] });
  assert.deepEqual(accessibleFrom(proof, 5), { lines: [1], ranges: [{ from: 2, to: 4 }] });
});

test("caixas com variável seguidas, a hipótese do ∃E e as linhas sem variável", () => {
  const siblings = build([forallStep(1), step(1), forallStep(1, "u"), step(0)]);
  assert.deepEqual(boxes(siblings), [["1-2", 1, "v", false], ["3-3", 1, "u", false]]);
  assert.deepEqual(accessibleFrom(siblings, 3), { lines: [], ranges: [{ from: 1, to: 2 }] });

  const exists = build([premise(), { ...hyp(1), fresh: "u" }, step(1), step(0)]);
  assert.deepEqual(boxes(exists), [["2-3", 1, "u", false]]);
  assert.equal(exists.lines[1].fresh, "u");

  const both = build([premise(), labelHyp(2, "v", { fresh: "u" }), step(2), step(1), step(0)]);
  assert.deepEqual(boxes(both), [["2-4", 1, "v", true], ["2-3", 2, "u", false]]);

  const plainLines = nested();
  assert.ok(plainLines.lines.every((line) => !("fresh" in line) && !("label" in line)));
  assert.ok(subproofs(plainLines).every(({ fresh, label }) => fresh === null && label === false));
});

test("recusa caixas com variável mal postas", () => {
  assertFails(createProof([premise(), forallStep(0)]), "invalidDepth", 2);
  assertFails(createProof([premise(), forallStep(2)]), "invalidDepth", 2);
  assertFails(createProof([premise(), labelHyp(1)]), "invalidDepth", 2);
  assertFails(createProof([premise(), labelHyp(3)]), "invalidDepth", 2);
  assertFails(createProof([{ ...premise(), fresh: "v" }]), "invalidLine", 1);
  assertFails(createProof([premise(), { ...step(0), label: "v" }]), "invalidLine", 2);
  for (const fresh of ["F", "forall", "", "1a", 3]) {
    assertFails(createProof([premise(), forallStep(1, fresh)]), "invalidLine", 2);
    assertFails(createProof([premise(), labelHyp(2, fresh)]), "invalidLine", 2);
  }
});

test("inserir antes de uma linha de etiqueta mantém cada intervalo na sua caixa", () => {
  const proof = done(insertLine(labelled(), 1, { formula: b }));
  assert.deepEqual(boxes(proof), [["3-5", 1, "v", true], ["3-4", 2, null, false]]);
  assert.equal(proof.lines[2].label, "v");
  assert.deepEqual(proof.lines[4].citations, [citeRange(3, 4)]);
  assert.deepEqual(proof.lines[5].citations, [citeRange(3, 5)]);
});

test("uma linha que abre caixa com variável nunca apanha as linhas seguintes", () => {
  const proof = build([premise(), hyp(1), step(1), step(0)]);
  assertFails(insertLine(proof, 2, { kind: "step", depth: 1, fresh: "v" }), "capturesLines", 3);
  assertFails(insertLine(proof, 2, labelHyp(2)), "capturesLines", 3);
  assert.deepEqual(depths(done(insertLine(proof, 2, { kind: "step", depth: 2, fresh: "v" }))), [0, 1, 2, 1, 0]);
  assert.deepEqual(depths(done(insertLine(proof, 2, labelHyp(3)))), [0, 1, 3, 1, 0]);
  assert.deepEqual(depths(done(insertLine(proof, 3, { kind: "step", depth: 1, fresh: "v" }))), [0, 1, 1, 1, 0]);
});

test("apagar a linha que abre uma caixa com variável apaga a caixa", () => {
  const forall = build([premise(), forallStep(1), step(1), step(0, [citeRange(2, 3), citeLine(1)])]);
  const afterForall = done(deleteLine(forall, 2));
  assert.deepEqual(depths(afterForall), [0, 0]);
  assert.deepEqual(afterForall.lines[1].citations, [citeLine(1)]);

  const afterLabel = done(deleteLine(labelled(), 2));
  assert.deepEqual(depths(afterLabel), [0, 0]);
  assert.deepEqual(afterLabel.lines[1].citations, []);
});

test("apagar dentro da caixa da etiqueta encurta cada intervalo pela sua caixa", () => {
  const proof = done(deleteLine(labelled(), 3));
  assert.deepEqual(boxes(proof), [["2-3", 1, "v", true], ["2-2", 2, null, false]]);
  assert.deepEqual(proof.lines[2].citations, [citeRange(2, 2)]);
  assert.deepEqual(proof.lines[3].citations, [citeRange(2, 3)]);
});

test("editar muda o nome da variável, mas não abre nem fecha caixas", () => {
  const forall = build([premise(), forallStep(1), step(1), step(0)]);
  assert.equal(done(editLine(forall, 2, { fresh: "u" })).lines[1].fresh, "u");
  const reformulated = done(editLine(forall, 2, { formula: b }));
  assert.equal(reformulated.lines[1].fresh, "v");
  assert.deepEqual(reformulated.lines[1].formula, b);
  assertFails(editLine(forall, 2, { fresh: null }), "invalidLine", 2);
  assertFails(editLine(forall, 2, { fresh: "F" }), "invalidLine", 2);
  assertFails(editLine(forall, 3, { fresh: "u" }), "invalidLine", 3);
  assertFails(editLine(forall, 3, { label: "u" }), "invalidLine", 3);

  const proof = labelled();
  assert.equal(done(editLine(proof, 2, { label: "w" })).lines[1].label, "w");
  assert.equal(done(editLine(proof, 2, { fresh: "u" })).lines[1].fresh, "u");
  assert.deepEqual(boxes(done(editLine(proof, 2, { fresh: "u" }))), [["2-4", 1, "v", true], ["2-3", 2, "u", false]]);
  assertFails(editLine(proof, 2, { label: null }), "invalidLine", 2);
  assertFails(editLine(nested(), 2, { label: "v" }), "invalidLine", 2);
  const exists = done(editLine(nested(), 2, { fresh: "u" }));
  assert.equal(exists.lines[1].fresh, "u");
  assert.equal("fresh" in done(editLine(exists, 2, { fresh: null })).lines[1], false);
});

test("abrir uma caixa com variável: hipótese do ∃E, passo do ∀I ou linha de etiqueta", () => {
  const proof = build([premise()]);
  const exists = done(openSubproof(proof, 1, a, undefined, { fresh: "u" }));
  assert.deepEqual(boxes(exists), [["2-2", 1, "u", false]]);
  assert.equal(exists.lines[1].kind, "hypothesis");

  const forall = done(openSubproof(proof, 1, a, undefined, { step: true, fresh: "v" }));
  assert.deepEqual(forall.lines[1], { kind: "step", depth: 1, formula: a, rule: null, citations: [], fresh: "v" });
  assert.deepEqual(boxes(forall), [["2-2", 1, "v", false]]);

  const label = done(openSubproof(proof, 1, null, undefined, { label: "v" }));
  assert.deepEqual(label.lines[1], { kind: "hypothesis", depth: 2, formula: null, rule: null, citations: [], label: "v" });
  assert.deepEqual(boxes(label), [["2-2", 1, "v", true], ["2-2", 2, null, false]]);

  const deeper = done(openSubproof(forall, 2, b, undefined, { label: "w", fresh: "u" }));
  assert.deepEqual(depths(deeper), [0, 1, 3]);
  assert.deepEqual(boxes(deeper), [["2-3", 1, "v", false], ["3-3", 2, "w", true], ["3-3", 3, "u", false]]);

  assertFails(openSubproof(proof, 1, a, undefined, { step: true }), "invalidLine", 2);
  assertFails(openSubproof(proof, 1, a, undefined, { step: true, fresh: "v", label: "u" }), "invalidLine", 2);
  assertFails(openSubproof(proof, 1, a, undefined, { fresh: "F" }), "invalidLine", 2);
});

test("fechar caixas com variável, a de dentro e depois a da etiqueta", () => {
  const forall = build([premise(), forallStep(1), step(1), step(1)]);
  assert.deepEqual(depths(done(closeSubproof(forall, 3))), [0, 1, 1, 0]);

  let proof = build([premise(), labelHyp(2), step(2), step(2), step(1, [citeRange(2, 4)])]);
  proof = done(closeSubproof(proof, 3));
  assert.deepEqual(depths(proof), [0, 2, 2, 1, 1]);
  assert.deepEqual(boxes(proof), [["2-5", 1, "v", true], ["2-3", 2, null, false]]);
  assert.deepEqual(proof.lines[4].citations, [citeRange(2, 3)]);
  proof = done(closeSubproof(proof, 5));
  assert.deepEqual(depths(proof), [0, 2, 2, 1, 1, 0]);
  assert.deepEqual(boxes(proof), [["2-5", 1, "v", true], ["2-3", 2, null, false]]);
});

test("todos os códigos de erro têm mensagem nos dois idiomas", () => {
  for (const code of PROOF_ERROR_CODES) {
    assert.ok(pt.proof.errors[code].includes("{line}"), `pt: ${code}`);
    assert.ok(en.proof.errors[code].includes("{line}"), `en: ${code}`);
  }
  assert.deepEqual(Object.keys(pt.proof.errors).sort(), [...PROOF_ERROR_CODES].sort());
  assert.deepEqual(Object.keys(en.proof.errors).sort(), [...PROOF_ERROR_CODES].sort());
});

test("inserir no início da caixa do ∀I passa a marca para a linha nova e mantém os intervalos", () => {
  const boxed = build([
    premise(),
    { kind: "step", depth: 1, formula: b, rule: null, citations: [], fresh: "v" },
    step(1, [citeLine(1)]),
    { ...step(0, [citeRange(2, 3)], c), rule: "∀I" },
  ]);
  const withStep = insertAtBoxStart(boxed, 2, { kind: "step", formula: a, rule: "R", citations: [citeLine(1)] });
  assert.ok(withStep.ok);
  assert.equal(withStep.proof.lines[1].fresh, "v");
  assert.equal(withStep.proof.lines[1].depth, 1);
  assert.equal(withStep.proof.lines[2].fresh ?? null, null);
  assert.deepEqual(withStep.proof.lines[4].citations, [citeRange(2, 4)]);
  assert.deepEqual(subproofs(withStep.proof).map(({ from, to, fresh }) => [from, to, fresh]), [[2, 4, "v"]]);

  const withHypothesis = insertAtBoxStart(boxed, 2, { kind: "hypothesis", formula: a, fresh: "u" });
  assert.ok(withHypothesis.ok);
  const [line] = withHypothesis.proof.lines.slice(1);
  assert.deepEqual([line.depth, line.label, line.fresh], [2, "v", "u"]);
  assert.deepEqual(withHypothesis.proof.lines[4].citations, [citeRange(2, 4)]);

  // Outra caixa [v] na mesma linha, ou uma linha que não abre a caixa do ∀I, não servem.
  assert.equal(insertAtBoxStart(boxed, 2, { kind: "step", formula: a, fresh: "u" }).ok, false);
  assert.equal(insertAtBoxStart(boxed, 3, { kind: "step", formula: a }).ok, false);
});
