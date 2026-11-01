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
  enclosingSubproofs,
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

test("todos os códigos de erro têm mensagem nos dois idiomas", () => {
  for (const code of PROOF_ERROR_CODES) {
    assert.ok(pt.proof.errors[code].includes("{line}"), `pt: ${code}`);
    assert.ok(en.proof.errors[code].includes("{line}"), `en: ${code}`);
  }
  assert.deepEqual(Object.keys(pt.proof.errors).sort(), [...PROOF_ERROR_CODES].sort());
  assert.deepEqual(Object.keys(en.proof.errors).sort(), [...PROOF_ERROR_CODES].sort());
});
