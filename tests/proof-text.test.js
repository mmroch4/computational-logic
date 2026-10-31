import { test } from "node:test";
import assert from "node:assert/strict";
import { formatProof, parseProof, PROOF_TEXT_ERROR_CODES } from "../js/core/proof-text.js";
import { citeLine, citeRange, createProof } from "../js/core/proof.js";
import { parseSequent } from "../js/core/sequent.js";
import { parseFormula } from "../js/core/parser.js";
import { checkSequent } from "../js/core/semantics.js";
import { CONCLUSION_ERROR_CODES, verifyProof } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

function goal(text) {
  const result = parseSequent(text);
  assert.ok(result.ok, text);
  return result.sequent;
}

function read(text) {
  const result = parseProof(text);
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.proof;
}

const f = (text) => parseFormula(text).formula;

const check = (sequent, text) => verifyProof(read(text), goal(sequent));

function failsWith(text, code, params) {
  const result = parseProof(text);
  assert.equal(result.ok, false, text);
  assert.equal(result.error.code, code);
  if (params) assert.deepEqual(result.error.params, params);
  return result.error;
}

const CORRECT = [
  ["comutar a conjunção", "m ∧ n ⊢ n ∧ m", `
    1 | m ∧ n   premissa
    2 | n       ∧E, 1
    3 | m       ∧E, 1
    4 | n ∧ m   ∧I, 2, 3`],
  ["cadeia de implicações", "a → b, b → c ⊢ a → c", `
    1 | a → b   premissa
    2 | b → c   premissa
    3 |   a     hipótese
    4 |   b     →E, 3, 1
    5 |   c     →E, 4, 2
    6 | a → c   →I, 3–5`],
  ["comutar a disjunção", "s ∨ t ⊢ t ∨ s", `
    1 | s ∨ t   premissa
    2 |   s     hipótese
    3 |   t ∨ s ∨I, 2
    4 |   t     hipótese
    5 |   t ∨ s ∨I, 4
    6 | t ∨ s   ∨E, 1, 2–3, 4–5`],
  ["contraposição", "x → y ⊢ ¬y → ¬x", `
    1 | x → y     premissa
    2 |   ¬y      hipótese
    3 |     x     hipótese
    4 |     y     →E, 3, 1
    5 |     F     FI, 4, 2
    6 |   ¬x      ¬I, 3–5
    7 | ¬y → ¬x   →I, 2–6`],
  ["introduzir a dupla negação", "u ⊢ ¬¬u", `
    1 | u     premissa
    2 |   ¬u  hipótese
    3 |   F   FI, 1, 2
    4 | ¬¬u   ¬I, 2–3`],
  ["sem premissas, com R de uma linha exterior", "⊢ k → (j → k)", `
    1 |   k       hipótese
    2 |     j     hipótese
    3 |     k     R, 1
    4 |   j → k   →I, 2–3
    5 | k → (j → k)   →I, 1–4`],
  ["distribuir a conjunção", "g ∧ (h ∨ i) ⊢ (g ∧ h) ∨ (g ∧ i)", `
    1 | g ∧ (h ∨ i)   premissa
    2 | g             ∧E, 1
    3 | h ∨ i         ∧E, 1
    4 |   h           hipótese
    5 |   g ∧ h       ∧I, 2, 4
    6 |   (g ∧ h) ∨ (g ∧ i)   ∨I, 5
    7 |   i           hipótese
    8 |   g ∧ i       ∧I, 2, 7
    9 |   (g ∧ h) ∨ (g ∧ i)   ∨I, 8
   10 | (g ∧ h) ∨ (g ∧ i)     ∨E, 3, 4–6, 7–9`],
  ["silogismo disjuntivo só com regras base", "w ∨ z, ¬w ⊢ z", `
    1 | w ∨ z   premissa
    2 | ¬w      premissa
    3 |   w     hipótese
    4 |   F     FI, 3, 2
    5 |   z     FE, 4
    6 |   z     hipótese
    7 |   z     R, 6
    8 | z       ∨E, 1, 3–5, 6–7`],
  ["de uma contradição sai tudo", "d, ¬d ⊢ e", `
    1 | d    premissa
    2 | ¬d   premissa
    3 | F    FI, 1, 2
    4 | e    FE, 3`],
  ["De Morgan para a disjunção", "¬(l ∨ o) ⊢ ¬l ∧ ¬o", `
    1 | ¬(l ∨ o)   premissa
    2 |   l        hipótese
    3 |   l ∨ o    ∨I, 2
    4 |   F        FI, 3, 1
    5 | ¬l         ¬I, 2–4
    6 |   o        hipótese
    7 |   l ∨ o    ∨I, 6
    8 |   F        FI, 7, 1
    9 | ¬o         ¬I, 6–8
   10 | ¬l ∧ ¬o    ∧I, 5, 9`],
  ["terceiro excluído", "⊢ c ∨ ¬c", `
    1 |   ¬(c ∨ ¬c)   hipótese
    2 |     c         hipótese
    3 |     c ∨ ¬c    ∨I, 2
    4 |     F         FI, 3, 1
    5 |   ¬c          ¬I, 2–4
    6 |   c ∨ ¬c      ∨I, 5
    7 |   F           FI, 6, 1
    8 | ¬¬(c ∨ ¬c)    ¬I, 1–7
    9 | c ∨ ¬c        ¬E, 8`],
  ["a conclusão pode ser uma premissa", "b₁ ⊢ b₁", `
    1 | b₁   premissa`],
];

for (const [name, sequent, text] of CORRECT) {
  test(`prova correta: ${name}`, () => {
    assert.deepEqual(check(sequent, text), {
      ok: true,
      concludes: true,
      extraPremises: [],
      lineErrors: [],
      conclusionError: null,
    });
    assert.equal(checkSequent(goal(sequent)).valid, true);
  });

  test(`volta a ler o que escreve: ${name}`, () => {
    const proof = read(text);
    const printed = formatProof(proof);
    assert.deepEqual(read(printed), proof);
    assert.equal(formatProof(read(printed)), printed);
  });
}

/** [nome, sequente, prova, código do primeiro erro de linha, linha do erro] */
const WRONG_LINES = [
  ["∧E não tira o que lá não está", "a ∧ b ⊢ c", `
    1 | a ∧ b   premissa
    2 | c       ∧E, 1`, "formulaMismatch", 2],
  ["afirmar o consequente", "a → b, b ⊢ a", `
    1 | a → b   premissa
    2 | b       premissa
    3 | a       →E, 2, 1`, "ruleNotApplicable", 3],
  ["→E não dá outra fórmula", "a → b, a ⊢ c", `
    1 | a → b   premissa
    2 | a       premissa
    3 | c       →E, 2, 1`, "formulaMismatch", 3],
  ["citar o interior de uma subdedução fechada", "⊢ a → a", `
    1 |   a     hipótese
    2 | a → a   →I, 1–1
    3 | a       R, 1
    4 | a → a   R, 2`, "inaccessibleLine", 3],
  ["citar uma linha que vem depois", "a ⊢ a ∧ b", `
    1 | a       premissa
    2 | b       R, 3
    3 | a ∧ b   ∧I, 1, 2`, "inaccessibleLine", 2],
  ["o intervalo não é uma subdedução", "a ⊢ b → a", `
    1 | a       premissa
    2 |   b     hipótese
    3 |   a     R, 1
    4 | b → a   →I, 1–3`, "notASubproof", 4],
  ["citar a subdedução de dentro dela", "a ⊢ a", `
    1 | a       premissa
    2 |   b     hipótese
    3 |   a     R, 1
    4 |   b → a →I, 2–3
    5 | a       R, 1`, "openSubproof", 4],
  ["¬E só tira duas negações", "¬a ⊢ a", `
    1 | ¬a   premissa
    2 | a    ¬E, 1`, "ruleNotApplicable", 2],
  ["casos do ∨E com conclusões diferentes", "a ∨ b ⊢ a", `
    1 | a ∨ b   premissa
    2 |   a     hipótese
    3 |   a     R, 2
    4 |   b     hipótese
    5 |   b     R, 4
    6 | a       ∨E, 1, 2–3, 4–5`, "ruleNotApplicable", 6],
  ["FI sem o par contraditório", "a, b ⊢ F", `
    1 | a   premissa
    2 | b   premissa
    3 | F   FI, 1, 2`, "ruleNotApplicable", 3],
  ["faltam citações", "a, b ⊢ a ∧ b", `
    1 | a       premissa
    2 | b       premissa
    3 | a ∧ b   ∧I, 1`, "missingCitation", 3],
  ["falta a regra", "a ⊢ a ∨ b", `
    1 | a       premissa
    2 | a ∨ b`, "missingRule", 2],
  ["regra desconhecida", "a ⊢ a", `
    1 | a   premissa
    2 | a   Magia, 1`, "unknownRule", 2],
  ["citar uma linha que não existe", "⊢ a → b", `
    1 |   a     hipótese
    2 |   b     R, 7
    3 | a → b   →I, 1–2`, "noSuchCitation", 2],
];

for (const [name, sequent, text, code, line] of WRONG_LINES) {
  test(`prova incorreta: ${name}`, () => {
    const result = check(sequent, text);
    assert.equal(result.ok, false);
    assert.equal(result.lineErrors[0].code, code);
    assert.equal(result.lineErrors[0].params.line, line);
  });
}

test("prova incorreta: a linha errada não é citada por ninguém", () => {
  const result = check("a ⊢ a", `
    1 | a   premissa
    2 | b   ∧E, 1
    3 | a   R, 1`);
  assert.equal(result.ok, false);
  assert.equal(result.concludes, true);
  assert.deepEqual(result.lineErrors.map(({ params }) => params.line), [2]);
});

test("prova incorreta: um passo errado dentro de uma subdedução citada", () => {
  const result = check("⊢ a → b", `
    1 |   a     hipótese
    2 |   b     FE, 1
    3 | a → b   →I, 1–2`);
  assert.equal(result.ok, false);
  assert.deepEqual(result.lineErrors.map(({ code, params }) => [code, params.line]), [["ruleNotApplicable", 2]]);
});

test("prova incorreta: acaba noutra fórmula", () => {
  const result = check("a ∧ b ⊢ b", `
    1 | a ∧ b   premissa
    2 | a       ∧E, 1`);
  assert.equal(result.ok, false);
  assert.equal(result.concludes, false);
  assert.deepEqual(result.lineErrors, []);
  assert.deepEqual(result.conclusionError, { code: "wrongConclusion", params: { line: 2 } });
});

test("prova incorreta: a conclusão só aparece a meio", () => {
  const result = check("a ∧ b ⊢ a", `
    1 | a ∧ b   premissa
    2 | a       ∧E, 1
    3 | b       ∧E, 1`);
  assert.equal(result.conclusionError.code, "wrongConclusion");
});

test("prova incorreta: a conclusão está dentro de uma subdedução por fechar", () => {
  const result = check("⊢ a", `
    1 |   a   hipótese
    2 |   a   R, 1`);
  assert.equal(result.ok, false);
  assert.deepEqual(result.lineErrors, []);
  assert.deepEqual(result.conclusionError, { code: "unfinishedProof", params: { line: 2 } });
});

test("prova incorreta: premissa que o sequente não tem", () => {
  const result = check("a ⊢ a ∧ b", `
    1 | a       premissa
    2 | b       premissa
    3 | a ∧ b   ∧I, 1, 2`);
  assert.equal(result.ok, false);
  assert.equal(result.concludes, true);
  assert.deepEqual(result.lineErrors, []);
  assert.deepEqual(result.extraPremises, [2]);
});

test("várias premissas extra indicam todas as linhas", () => {
  const result = check("c ⊢ c", `
    1 | a   premissa
    2 | c   premissa
    3 | b   premissa
    4 | c   R, 2`);
  assert.deepEqual(result.extraPremises, [1, 3]);
});

test("premissas: não usar uma do sequente nem repeti-la é aceite", () => {
  assert.equal(check("a, b ⊢ a", `
    1 | a   premissa
    2 | a   R, 1`).ok, true);
  assert.equal(check("a ⊢ a", `
    1 | a   premissa
    2 | a   premissa
    3 | a   R, 2`).ok, true);
});

test("prova vazia e linhas por preencher não concluem", () => {
  const empty = verifyProof(read(""), goal("⊢ a"));
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.conclusionError, { code: "emptyProof", params: {} });

  const blank = check("a ⊢ a", `
    1 | a   premissa
    2 | ?`);
  assert.equal(blank.ok, false);
  assert.equal(blank.lineErrors[0].code, "emptyFormula");
  assert.equal(blank.conclusionError.code, "wrongConclusion");
});

test("verifyProof usa o catálogo indicado", () => {
  const proof = read(`
    1 | a   premissa
    2 | a   R, 1`);
  assert.equal(verifyProof(proof, goal("a ⊢ a"), []).lineErrors[0].code, "unknownRule");
});

// Leitura

test("lê a linha do formato", () => {
  const { lines } = read("1 | r\n2 | q\n3 | r\n4 | r ∧ q   ∧I, 3, 2");
  assert.deepEqual(lines[3], {
    kind: "step",
    depth: 0,
    formula: f("r ∧ q"),
    rule: "∧I",
    citations: [citeLine(3), citeLine(2)],
  });
});

test("a profundidade vem da indentação depois da barra", () => {
  const { lines } = read(`
    1 | a       premissa
    2 |   b     hipótese
    3 |     c   hipótese
    4 |     a   R, 1
    5 |   c → a →I, 3–4`);
  assert.deepEqual(lines.map(({ depth }) => depth), [0, 1, 2, 2, 1]);
  assert.deepEqual(lines.map(({ kind }) => kind), ["premise", "hypothesis", "hypothesis", "step", "step"]);
  assert.deepEqual(lines[4].citations, [citeRange(3, 4)]);
});

test("a barra pode vir sem espaço, e o número com espaços antes", () => {
  assert.equal(read("  1 |a   premissa").lines[0].depth, 0);
});

test("lê intervalos com hífen, meia-risca e travessão", () => {
  for (const dash of ["-", "–", "—", " - "]) {
    const { lines } = read(`1 |   a   hipótese\n2 | a → a   →I, 1${dash}1`);
    assert.deepEqual(lines[1].citations, [citeRange(1, 1)]);
  }
});

test("aceita fórmulas e regras em ASCII", () => {
  const { lines } = read(`
    1 | (a -> b) & c   prem
    2 | c              &E, 1
    3 | a -> b         /\\E, 1
    4 | c | d          |I, 2
    5 | c v d          vI, 2
    6 | c \\/ d         \\/I, 2
    7 |   a            hyp
    8 |   b            ->E, 7, 3
    9 |   ~b           assumption
   10 |   ~~b          ~~I, 8`);
  assert.deepEqual(
    lines.map(({ rule }) => rule),
    [null, "∧E", "∧E", "∨I", "∨I", "∨I", null, "→E", null, "¬¬I"],
  );
});

test("⊥ vale F, nas fórmulas e nas regras", () => {
  const { lines } = read(`
    1 | a    premissa
    2 | ¬a   premissa
    3 | ⊥    ⊥I, 1, 2
    4 | b    ⊥E, 3`);
  assert.equal(lines[2].rule, "FI");
  assert.equal(lines[3].rule, "FE");
  assert.deepEqual(lines[2].formula, f("F"));
});

test("as palavras de premissa e hipótese não dependem de maiúsculas nem de acentos", () => {
  for (const word of ["premissa", "Premissa", "PREM", "premise"]) {
    assert.equal(read(`1 | a ${word}`).lines[0].kind, "premise", word);
  }
  for (const word of ["hipótese", "hipotese", "Hip", "hypothesis", "hyp", "assumption"]) {
    assert.equal(read(`1 |   a ${word}`).lines[0].kind, "hypothesis", word);
  }
});

test("a regra separa-se da fórmula mesmo que também pudesse ler-se como fim da fórmula", () => {
  const [line] = read("1 | r ∧ q   ∧I").lines;
  assert.deepEqual(line.formula, f("r ∧ q"));
  assert.equal(line.rule, "∧I");
  assert.deepEqual(read("1 | r  ∧  q").lines[0].formula, f("r ∧ q"));
  assert.equal(read("1 | r  ∧  q").lines[0].rule, null);
  assert.equal(read("1 | r ∧ q ∧I, 1, 2").lines[0].rule, "∧I");
});

test("uma regra sem citações lê-se (TE virá a ser assim)", () => {
  const [line] = read("1 | a ∨ ¬a TE").lines;
  assert.deepEqual(line.formula, f("a ∨ ¬a"));
  assert.equal(line.rule, "TE");
  assert.deepEqual(line.citations, []);
});

test("átomos com o nome das palavras reservadas continuam a ser átomos", () => {
  const [line] = read("1 | prem").lines;
  assert.equal(line.kind, "step");
  assert.deepEqual(line.formula, f("prem"));
});

test("ignora linhas em branco e CRLF", () => {
  const { lines } = read("\r\n1 | a   premissa\r\n\r\n2 | a   R, 1\r\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1].citations, [citeLine(1)]);
});

test("a citação fora da prova chega ao verificador, para ele a recusar", () => {
  assert.deepEqual(read("1 | a   R, 9").lines[0].citations, [citeLine(9)]);
});

test("`?` é uma fórmula por preencher, com ou sem justificação", () => {
  const { lines } = read(`
    1 | ?   premissa
    2 |   ? hipótese
    3 |   ? R, 2
    4 | ?`);
  assert.deepEqual(lines.map(({ formula }) => formula), [null, null, null, null]);
  assert.equal(lines[2].rule, "R");
  assert.equal(lines[3].rule, null);
});

// Erros de leitura

test("erros: linha sem número ou sem barra", () => {
  failsWith("a ∧ b", "badLine", { line: 1 });
  failsWith("1 a ∧ b", "badLine", { line: 1 });
  failsWith("1 | a premissa\nnada", "badLine", { line: 2 });
});

test("erros: números fora de ordem", () => {
  const text = "1 | a premissa\n3 | a R, 1";
  const error = failsWith(text, "badLineNumber", { line: 2, expected: 2, found: "3" });
  assert.equal(text.slice(error.start, error.end), "3");
  failsWith("0 | a premissa", "badLineNumber");
});

test("erros: indentação inválida", () => {
  failsWith("1 |  a premissa", "badIndent", { line: 1 });
  failsWith("1 |\ta premissa", "badIndent", { line: 1 });
});

test("erros: citações sem regra", () => {
  failsWith("1 | a ∧ b, 1", "missingRuleName", { line: 1 });
  failsWith("1 | a, 1", "missingRuleName", { line: 1 });
});

test("erros: citações mal escritas", () => {
  const text = "1 | a   R, x";
  const error = failsWith(text, "badCitation", { line: 1, token: "x" });
  assert.equal(text.slice(error.start, error.end).trim(), "x");
  failsWith("1 | a   R, 1,", "badCitation", { line: 1, token: "" });
  failsWith("1 | a   R, 4–2", "badCitation", { line: 1, token: "4–2" });
  failsWith("1 | a   R, 0", "badCitation", { line: 1, token: "0" });
  failsWith("1 | a   R, 99999999999999999999", "badCitation");
});

test("erros: premissas e hipóteses não citam", () => {
  failsWith("1 | a   premissa, 1", "unexpectedCitation", { line: 1 });
  failsWith("1 |   a   hipótese, 1", "unexpectedCitation", { line: 1 });
});

test("erros: fórmula inválida, com a posição no texto inteiro", () => {
  const text = "1 | a   premissa\n2 | a ∧ )   R, 1";
  const error = failsWith(text, "unbalanced", { line: 2, char: ")" });
  assert.equal(text.slice(error.start, error.end), ")");
  failsWith("1 |", "emptyInput", { line: 1 });
  failsWith("1 | ∧I, 1", "emptyInput", { line: 1 });
});

test("erros: a estrutura da prova é validada, com a linha toda assinalada", () => {
  const text = "1 | a   premissa\n2 |   a   R, 1";
  const error = failsWith(text, "invalidDepth", { line: 2 });
  assert.equal(text.slice(error.start, error.end), "2 |   a   R, 1");
  failsWith("1 | a   R, 1\n2 | b   premissa", "misplacedPremise", { line: 2 });
  failsWith("1 |   a   premissa", "misplacedPremise", { line: 1 });
  failsWith("1 | a   hipótese", "invalidDepth", { line: 1 });
});

// Escrita

test("escreve com a justificação em coluna e os números alinhados", () => {
  const proof = read(CORRECT[6][2]);
  assert.equal(formatProof(proof), [
    " 1 | g ∧ (h ∨ i)       premissa",
    " 2 | g                 ∧E, 1",
    " 3 | h ∨ i             ∧E, 1",
    " 4 |   h               hipótese",
    " 5 |   g ∧ h           ∧I, 2, 4",
    " 6 |   g ∧ h ∨ g ∧ i   ∨I, 5",
    " 7 |   i               hipótese",
    " 8 |   g ∧ i           ∧I, 2, 7",
    " 9 |   g ∧ h ∨ g ∧ i   ∨I, 8",
    "10 | g ∧ h ∨ g ∧ i     ∨E, 3, 4–6, 7–9",
  ].join("\n"));
});

test("escreve o exemplo do formato", () => {
  const proof = read("1 | r premissa\n2 | q premissa\n3 | r R, 1\n4 | r ∧ q ∧I, 3, 2");
  assert.equal(formatProof(proof).split("\n")[3], "4 | r ∧ q   ∧I, 3, 2");
});

test("as palavras do idioma também se leem de volta", () => {
  const proof = read(CORRECT[1][2]);
  const printed = formatProof(proof, en.proofText);
  assert.ok(printed.includes("premise") && printed.includes("hypothesis"));
  assert.deepEqual(read(printed), proof);
  assert.deepEqual(read(formatProof(proof, pt.proofText)), proof);
});

test("linhas incompletas sobrevivem à ida e volta", () => {
  const { proof } = createProof([
    { kind: "premise", depth: 0, formula: f("a") },
    { kind: "hypothesis", depth: 1, formula: null },
    { kind: "step", depth: 1, formula: null, rule: "→E", citations: [citeLine(1)] },
    { kind: "step", depth: 1, formula: f("p₁") },
    { kind: "step", depth: 0 },
  ]);
  assert.deepEqual(read(formatProof(proof)), proof);
});

test("uma prova vazia escreve-se e lê-se", () => {
  assert.equal(formatProof(read("")), "");
  assert.deepEqual(read("   \n\n").lines, []);
});

// Locales

test("todos os códigos têm mensagem nos dois idiomas", () => {
  for (const locale of [pt, en]) {
    assert.deepEqual(Object.keys(locale.proofText.errors).sort(), [...PROOF_TEXT_ERROR_CODES].sort());
    assert.deepEqual(Object.keys(locale.verify.conclusion).sort(), [...CONCLUSION_ERROR_CODES].sort());
    assert.ok(locale.verify.extraPremise.includes("{line}"));
  }
});
