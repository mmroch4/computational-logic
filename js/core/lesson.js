// Dados da lição (página Aprender): as secções, as provas das figuras e as perguntas curtas.
// O texto está no `aprender.html` e nos locales; aqui fica só o que os testes têm de poder verificar.
//
// Uma secção é `{ id, key }`: `id` é a âncora, igual nos dois idiomas, porque a troca de idioma leva o
// hash; `key` é o nome em `learn.sections.*` e `learn.<key>.*`.
// Uma prova é `{ sequent, text }`, com `text` no formato de `proof-text.js`, e o título em
// `learn.figures.<id>`. Uma pergunta é `{ options, answer }`, com o texto em `learn.checks.<id>.*`.
import { format } from "./formula.js";
import { parseProof } from "./proof-text.js";
import { DERIVED_RULES, RULES, ruleGoal, ruleSet } from "./rules.js";
import { parseSequent } from "./sequent.js";
import { verifyProof } from "./verify.js";

export const LESSON_SECTIONS = Object.freeze([
  { id: "prova", key: "proof" },
  { id: "conjuncao", key: "and" },
  { id: "implicacao", key: "implies" },
  { id: "subdeducoes", key: "scope" },
  { id: "disjuncao", key: "or" },
  { id: "negacao", key: "not" },
  { id: "derivadas", key: "derived" },
  { id: "estrategias", key: "strategy" },
  { id: "solidez", key: "meta" },
]);

export const LESSON_PROOFS = Object.freeze({
  firstProof: {
    sequent: "a ∧ b, a → c ⊢ c ∧ b",
    text: `
1 | a ∧ b   premissa
2 | a → c   premissa
3 | a       ∧E, 1
4 | c       →E, 2, 3
5 | b       ∧E, 1
6 | c ∧ b   ∧I, 4, 5`,
  },
  andIntro: {
    sequent: "a, b, c ⊢ (a ∧ b) ∧ c",
    text: `
1 | a             premissa
2 | b             premissa
3 | c             premissa
4 | a ∧ b         ∧I, 1, 2
5 | (a ∧ b) ∧ c   ∧I, 4, 3`,
  },
  andElim: {
    sequent: "(a ∧ b) ∧ c ⊢ b",
    text: `
1 | (a ∧ b) ∧ c   premissa
2 | a ∧ b         ∧E, 1
3 | b             ∧E, 2`,
  },
  implElim: {
    sequent: "a → b, b → c, a ⊢ c",
    text: `
1 | a → b   premissa
2 | b → c   premissa
3 | a       premissa
4 | b       →E, 3, 1
5 | c       →E, 4, 2`,
  },
  implIntro: {
    sequent: "a → b, a → c ⊢ a → (b ∧ c)",
    text: `
1 | a → b         premissa
2 | a → c         premissa
3 |   a           hipótese
4 |   b           →E, 3, 1
5 |   c           →E, 3, 2
6 |   b ∧ c       ∧I, 4, 5
7 | a → (b ∧ c)   →I, 3–6`,
  },
  nestedScopes: {
    sequent: "c ⊢ a → (b → (a ∧ b) ∧ c)",
    text: `
1 | c                       premissa
2 |   a                     hipótese
3 |     b                   hipótese
4 |     a ∧ b               ∧I, 2, 3
5 |     (a ∧ b) ∧ c         ∧I, 4, 1
6 |   b → (a ∧ b) ∧ c       →I, 3–5
7 | a → (b → (a ∧ b) ∧ c)   →I, 2–6`,
  },
  repeat: {
    sequent: "a ∧ b ⊢ c → (a ∧ b)",
    text: `
1 | a ∧ b         premissa
2 |   c           hipótese
3 |   a ∧ b       R, 1
4 | c → (a ∧ b)   →I, 2–3`,
  },
  orIntro: {
    sequent: "a ⊢ (a ∨ b) ∧ (c ∨ a)",
    text: `
1 | a                   premissa
2 | a ∨ b               ∨I, 1
3 | c ∨ a               ∨I, 1
4 | (a ∨ b) ∧ (c ∨ a)   ∧I, 2, 3`,
  },
  orElim: {
    sequent: "a ∨ b, a → c, b → d ⊢ c ∨ d",
    text: `
 1 | a ∨ b     premissa
 2 | a → c     premissa
 3 | b → d     premissa
 4 |   a       hipótese
 5 |   c       →E, 4, 2
 6 |   c ∨ d   ∨I, 5
 7 |   b       hipótese
 8 |   d       →E, 7, 3
 9 |   c ∨ d   ∨I, 8
10 | c ∨ d     ∨E, 1, 4–6, 7–9`,
  },
  falseIntro: {
    sequent: "a, ¬(a ∨ b) ⊢ F",
    text: `
1 | a          premissa
2 | ¬(a ∨ b)   premissa
3 | a ∨ b      ∨I, 1
4 | F          FI, 3, 2`,
  },
  notIntro: {
    sequent: "¬a ⊢ ¬(a ∧ b)",
    text: `
1 | ¬a         premissa
2 |   a ∧ b    hipótese
3 |   a        ∧E, 2
4 |   F        FI, 3, 1
5 | ¬(a ∧ b)   ¬I, 2–4`,
  },
  notElim: {
    sequent: "¬¬a ∧ b ⊢ a ∧ b",
    text: `
1 | ¬¬a ∧ b   premissa
2 | ¬¬a       ∧E, 1
3 | a         ¬E, 2
4 | b         ∧E, 1
5 | a ∧ b     ∧I, 3, 4`,
  },
  falseElim: {
    sequent: "a, ¬a ⊢ b ∧ c",
    text: `
1 | a       premissa
2 | ¬a      premissa
3 | F       FI, 1, 2
4 | b ∧ c   FE, 3`,
  },
  derivedUse: {
    sequent: "c → a, a → b, ¬b ⊢ ¬c",
    text: `
1 | c → a   premissa
2 | a → b   premissa
3 | ¬b      premissa
4 | ¬a      MT, 2, 3
5 | ¬c      MT, 1, 4`,
  },
});

/**
 * Provas com um erro, para o leitor ver o que recusar. `line` e `code` dizem o que o verificador tem de
 * apontar, e só isso: os testes exigem esse único achado. A explicação está em `learn.mistakes.<id>`.
 */
export const LESSON_MISTAKES = Object.freeze({
  andIntroOneSide: {
    sequent: "a ⊢ a ∧ b",
    text: `
1 | a       premissa
2 | a ∧ b   ∧I, 1`,
    line: 2,
    code: "missingCitation",
  },
  andElimInside: {
    sequent: "(a ∧ b) → c ⊢ a",
    text: `
1 | (a ∧ b) → c   premissa
2 | a             ∧E, 1`,
    line: 2,
    code: "ruleNotApplicable",
  },
  implElimBackwards: {
    sequent: "a → b, b ⊢ a",
    text: `
1 | a → b   premissa
2 | b       premissa
3 | a       →E, 1, 2`,
    line: 3,
    code: "ruleNotApplicable",
  },
  implIntroSwapped: {
    sequent: "b ⊢ b → a",
    text: `
1 | b       premissa
2 |   a     hipótese
3 |   b     R, 1
4 | b → a   →I, 2–3`,
    line: 4,
    code: "formulaMismatch",
  },
  closedLine: {
    sequent: "a → b ⊢ b",
    text: `
1 | a → b   premissa
2 |   a     hipótese
3 |   b     →E, 2, 1
4 | a → b   →I, 2–3
5 | b       R, 3`,
    line: 5,
    code: "inaccessibleLine",
  },
  repeatReordered: {
    sequent: "(a ∧ b) → c ⊢ (b ∧ a) → c",
    text: `
1 | (a ∧ b) → c   premissa
2 | (b ∧ a) → c   R, 1`,
    line: 2,
    code: "formulaMismatch",
  },
  orIntroNoSide: {
    sequent: "a ⊢ b ∨ c",
    text: `
1 | a       premissa
2 | b ∨ c   ∨I, 1`,
    line: 2,
    code: "formulaMismatch",
  },
  orElimDifferentEnds: {
    sequent: "a ∨ b, a → c, b → d ⊢ c",
    text: `
1 | a ∨ b   premissa
2 | a → c   premissa
3 | b → d   premissa
4 |   a     hipótese
5 |   c     →E, 4, 2
6 |   b     hipótese
7 |   d     →E, 6, 3
8 | c       ∨E, 1, 4–5, 6–7`,
    line: 8,
    code: "ruleNotApplicable",
  },
  falseIntroNotOpposite: {
    sequent: "a ∧ b, ¬a ⊢ F",
    text: `
1 | a ∧ b   premissa
2 | ¬a      premissa
3 | F       FI, 1, 2`,
    line: 3,
    code: "ruleNotApplicable",
  },
  notIntroNoFalse: {
    sequent: "¬b ⊢ ¬a",
    text: `
1 | ¬b     premissa
2 |   a    hipótese
3 |   ¬b   R, 1
4 | ¬a     ¬I, 2–3`,
    line: 4,
    code: "ruleNotApplicable",
  },
  notElimOneNegation: {
    sequent: "¬(¬a ∧ b) ⊢ a ∧ b",
    text: `
1 | ¬(¬a ∧ b)   premissa
2 | a ∧ b       ¬E, 1`,
    line: 2,
    code: "ruleNotApplicable",
  },
  falseElimNoFalse: {
    sequent: "¬a ⊢ a → b",
    text: `
1 | ¬a      premissa
2 | a → b   FE, 1`,
    line: 2,
    code: "ruleNotApplicable",
  },
});

/**
 * As regras apresentadas na lição: `rule` é o id no catálogo, `example` uma prova de `LESSON_PROOFS` que a
 * usa e `mistake` uma entrada de `LESSON_MISTAKES`. Nome e descrição em `learn.rules.<id>`.
 */
export const LESSON_RULES = Object.freeze({
  andIntro: { rule: "∧I", example: "andIntro", mistake: "andIntroOneSide" },
  andElim: { rule: "∧E", example: "andElim", mistake: "andElimInside" },
  implElim: { rule: "→E", example: "implElim", mistake: "implElimBackwards" },
  implIntro: { rule: "→I", example: "implIntro", mistake: "implIntroSwapped" },
  repeat: { rule: "R", example: "repeat", mistake: "repeatReordered" },
  orIntro: { rule: "∨I", example: "orIntro", mistake: "orIntroNoSide" },
  orElim: { rule: "∨E", example: "orElim", mistake: "orElimDifferentEnds" },
  falseIntro: { rule: "FI", example: "falseIntro", mistake: "falseIntroNotOpposite" },
  notIntro: { rule: "¬I", example: "notIntro", mistake: "notIntroNoFalse" },
  notElim: { rule: "¬E", example: "notElim", mistake: "notElimOneNegation" },
  falseElim: { rule: "FE", example: "falseElim", mistake: "falseElimNoFalse" },
});

/**
 * As regras derivadas apresentadas na lição: `rule` é o id no catálogo. A prova de cada forma não fica
 * aqui: lê-se de `rule.proof` em `lessonDerivedForms`. Nome e descrição em `learn.derivedRules.<id>`.
 */
export const LESSON_DERIVED = Object.freeze({
  modusTollens: { rule: "MT" },
  doubleNegationIntro: { rule: "¬¬I" },
  reductio: { rule: "RA" },
  excludedMiddle: { rule: "TE" },
  deMorgan: { rule: "DM" },
  hypotheticalSyllogism: { rule: "SH" },
  disjunctiveSyllogism: { rule: "SD" },
});

export const LESSON_CHECKS = Object.freeze({
  firstRule: { options: ["andE", "implE", "andI"], answer: "implE" },
  andDepth: { options: ["one", "two", "none"], answer: "two" },
  citeOrder: { options: ["first", "second", "both"], answer: "both" },
  scopeLines: { options: ["outer", "reachable", "all"], answer: "reachable" },
  orCases: { options: ["oneCase", "bothCases", "bothSides"], answer: "bothCases" },
  closeNegated: { options: ["plain", "doubled", "contradiction"], answer: "doubled" },
  rewriteDerived: { options: ["always", "sometimes", "never"], answer: "always" },
});

/** A prova `id` já lida: `{ goal, proof }`. Os testes garantem que todas se leem. */
export function lessonProof(id) {
  const { sequent, text } = LESSON_PROOFS[id];
  return { goal: parseSequent(sequent).sequent, proof: parseProof(text.trim()).proof };
}

/** Veredicto do verificador para a prova `id`, com todas as regras do site. */
export function verifyLessonProof(id) {
  const { goal, proof } = lessonProof(id);
  return verifyProof(proof, goal, ruleSet("completo"));
}

/** A prova errada `id` já lida: `{ goal, proof, line }`. */
export function lessonMistake(id) {
  const { sequent, text, line } = LESSON_MISTAKES[id];
  return { goal: parseSequent(sequent).sequent, proof: parseProof(text.trim()).proof, line };
}

/** O que o verificador aponta à prova errada `id`: `[{ line, code }]`. */
export function mistakeFindings(id) {
  const { goal, proof } = lessonMistake(id);
  const { lineErrors, extraPremises, conclusionError } = verifyProof(proof, goal, ruleSet("completo"));
  return [
    ...lineErrors.map(({ code, params }) => ({ line: params.line, code })),
    ...extraPremises.map((line) => ({ line, code: "extraPremise" })),
    ...(conclusionError ? [{ line: conclusionError.params.line ?? null, code: conclusionError.code }] : []),
  ];
}

/** As formas da derivada `id`, tal como o catálogo as guarda: `[{ goal, proof }]`, uma por entrada em `RULES`. */
export function lessonDerivedForms(id) {
  return DERIVED_RULES
    .filter((rule) => rule.id === LESSON_DERIVED[id].rule)
    .map((rule) => ({ goal: ruleGoal(rule), proof: parseProof(rule.proof).proof }));
}

const premiseText = (premise) => (
  premise.kind === "subproof" ? `[${format(premise.hypothesis)}] … ${format(premise.conclusion)}` : format(premise.schema)
);

/** O esquema de uma regra, a partir do catálogo: uma linha por forma e conclusão, como `φ ∧ ψ ⊢ φ`. */
export function ruleSchemaLines(ruleId) {
  return RULES.filter(({ id }) => id === ruleId).flatMap(({ premises, conclusions }) => {
    const left = premises.map(premiseText).join(", ");
    return conclusions.map((conclusion) => `${left} ⊢ ${format(conclusion)}`.trimStart());
  });
}

/** Quantas linhas uma prova mostra antes de se avançar: as premissas, ou a primeira linha se não as houver. */
export const firstRevealed = ({ lines }) => Math.max(1, lines.filter((line) => line.kind === "premise").length);

/**
 * Marcas de `fitchHtml` com `shown` linhas à vista: a última revelada é a atual, exceto nas premissas de
 * partida, e as seguintes ficam `future`, ocupando o lugar, para os botões não fugirem do dedo.
 */
export function revealMarks(proof, shown) {
  const marks = new Map();
  if (shown > firstRevealed(proof)) marks.set(shown, "current");
  for (let line = shown + 1; line <= proof.lines.length; line += 1) marks.set(line, "future");
  return marks;
}
