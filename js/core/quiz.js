// O quiz final do Aprender, uma pergunta de cada vez. O texto está nos locales, em `learn.quiz.*`; aqui
// ficam os sequentes, as provas, as opções e a resposta certa. Sempre que dá, a resposta é calculada pelo
// verificador, pelas dicas ou pela semântica, para o quiz nunca contradizer o resto do site.
//
// Pergunta: { id, kind, sequent, proof, options, answer }
//   kind     "line" (que linha se pode escrever), "find" (onde está o erro), "next" (próximo passo),
//            "choice" (escolha múltipla)
//   sequent  texto do sequente mostrado, ou null
//   proof    prova mostrada no enunciado, ou null
//   answer   id da única opção certa
// Opção: { id, kind, ... }
//   "text"  rótulo em `learn.quiz.questions.<pergunta>.options.<id>`
//   "line"  { line, proof }: a linha candidata e a prova com ela no fim
//   "find"  { line }: número da linha com o erro, ou null para «não há erro»
//   "step"  { step: { kind, formula } }: "hypothesis" para supor, "derived" para escrever
//
// Módulo puro (sem DOM).
import { equals } from "./formula.js";
import { hint } from "./hints.js";
import { parseFormula } from "./parser.js";
import { parseProof } from "./proof-text.js";
import { ruleSet } from "./rules.js";
import { checkSequent } from "./semantics.js";
import { parseSequent } from "./sequent.js";
import { verifyProof } from "./verify.js";

/** Id do quiz no progresso, ao lado dos exercícios; não começa por `ex-`, por isso repor não o apaga. */
export const QUIZ_PROGRESS_ID = "learn-quiz";

const RULES = ruleSet("completo");

const goalOf = (text) => parseSequent(text).sequent;

function proofOf(text) {
  const parsed = parseProof(text);
  if (!parsed.ok) throw new Error(`Prova inválida no quiz: ${text}`);
  return parsed.proof;
}

function formulaOf(text) {
  const parsed = parseFormula(text);
  if (!parsed.ok) throw new Error(`Fórmula inválida no quiz: ${text}`);
  return parsed.formula;
}

const textOption = (id) => ({ id, kind: "text" });
const findOption = (id, line) => ({ id, kind: "find", line });
const stepOption = (id, kind, formula) => ({ id, kind: "step", step: { kind, formula: formulaOf(formula) } });

function lineOption(id, shown, text) {
  const proof = proofOf(`${shown}\n${text}`);
  return { id, kind: "line", line: proof.lines.at(-1), proof };
}

function onlyOption(options) {
  if (options.length !== 1) throw new Error("O quiz tem de ter exatamente uma opção certa.");
  return options[0].id;
}

/** A única candidata que o verificador aceita. */
const answerByVerifier = (options, sequent) => onlyOption(
  options.filter(({ proof }) => verifyProof(proof, goalOf(sequent), RULES).lineErrors.length === 0),
);

/** A opção com a linha que o verificador aponta, ou a de «não há erro». */
function answerByFinding(options, proof, sequent) {
  const { lineErrors, extraPremises } = verifyProof(proof, goalOf(sequent), RULES);
  const lines = [...lineErrors.map(({ params }) => params.line), ...extraPremises];
  if (lines.length > 1) throw new Error("O quiz só pergunta por um erro de cada vez.");
  return onlyOption(options.filter(({ line }) => line === (lines[0] ?? null)));
}

/** O passo que a dica do site daria. */
function answerByHint(options, proof, sequent) {
  const { step } = hint(proof, goalOf(sequent), { rules: RULES });
  return onlyOption(options.filter((option) => option.step.kind === step.kind && equals(option.step.formula, step.formula)));
}

function lineQuestion(id, sequent, shown, candidates) {
  const options = candidates.map(([optionId, text]) => lineOption(optionId, shown, text));
  return { id, kind: "line", sequent, proof: proofOf(shown), options, answer: answerByVerifier(options, sequent) };
}

function nextQuestion(id, sequent, shown, options) {
  const proof = proofOf(shown);
  return { id, kind: "next", sequent, proof, options, answer: answerByHint(options, proof, sequent) };
}

const COMBINE_SHOWN = `
1 | q ∧ r   premissa
2 | q → s   premissa
3 | q       ∧E, 1`.trim();

const SCOPE_SEQUENT = "r ⊢ (s → r) ∧ s";
const SCOPE_PROOF = proofOf(`
1 | r             premissa
2 |   s           hipótese
3 |   r           R, 1
4 | s → r         →I, 2–3
5 | (s → r) ∧ s   ∧I, 4, 2`.trim());

const INVALID_SEQUENT = "s → t, t ⊢ s";

/** As perguntas, pela ordem do quiz: seguem a ordem da lição. */
export function quizQuestions() {
  const scopeOptions = [findOption("line3", 3), findOption("line4", 4), findOption("line5", 5), findOption("none", null)];
  return [
    lineQuestion("combine", "q ∧ r, q → s ⊢ s", COMBINE_SHOWN, [
      ["right", "4 | s   →E, 2, 3"],
      ["wrongRule", "4 | s   ∧E, 2"],
      ["sameFormula", "4 | q   →E, 2, 3"],
      ["wrongLines", "4 | r   →E, 1, 3"],
    ]),
    {
      id: "scope",
      kind: "find",
      sequent: SCOPE_SEQUENT,
      proof: SCOPE_PROOF,
      options: scopeOptions,
      answer: answerByFinding(scopeOptions, SCOPE_PROOF, SCOPE_SEQUENT),
    },
    nextQuestion("implication", "s ∧ u ⊢ t → u ∨ t", "1 | s ∧ u   premissa", [
      stepOption("assumeLeft", "hypothesis", "t"),
      stepOption("assumeRight", "hypothesis", "u ∨ t"),
      stepOption("writeLeft", "derived", "t"),
      stepOption("writeGoal", "derived", "t → u ∨ t"),
    ]),
    nextQuestion("cases", "s ∨ t, s → u, t → u ⊢ u ∨ s", "1 | s ∨ t   premissa\n2 | s → u   premissa\n3 | t → u   premissa", [
      stepOption("assumeCase", "hypothesis", "s"),
      stepOption("assumeResult", "hypothesis", "u"),
      stepOption("writeCase", "derived", "s"),
      stepOption("writeResult", "derived", "u"),
    ]),
    lineQuestion("doubleNegation", "¬¬(s ∨ t) ⊢ s ∨ t", "1 | ¬¬(s ∨ t)   premissa", [
      ["right", "2 | s ∨ t   ¬E, 1"],
      ["oneSide", "2 | s   ¬E, 1"],
      ["oneNegation", "2 | ¬(s ∨ t)   ¬E, 1"],
    ]),
    {
      id: "derived",
      kind: "choice",
      sequent: null,
      proof: null,
      options: [textOption("nothing"), textOption("negations"), textOption("excludedMiddle")],
      answer: "nothing",
    },
    {
      id: "invalid",
      kind: "choice",
      sequent: INVALID_SEQUENT,
      proof: null,
      options: [textOption("noProof"), textOption("withDerived"), textOption("longProof")],
      answer: checkSequent(goalOf(INVALID_SEQUENT)).valid ? "longProof" : "noProof",
    },
    {
      id: "both",
      kind: "choice",
      sequent: null,
      proof: null,
      options: [textOption("oneIsWrong"), textOption("bothFine"), textOption("rulesFail")],
      answer: "oneIsWrong",
    },
  ];
}

/** Primeira pergunta, sem respostas. */
export const initialQuizState = () => ({ index: 0, answers: {}, finished: false });

/** A opção escolhida está certa? */
export const isCorrect = (question, optionId) => question.answer === optionId;

/** Contagem: `answers` é `{ [idDaPergunta]: idDaOpção }`. */
export function quizScore(questions, answers) {
  const correct = questions.filter((question) => isCorrect(question, answers[question.id])).length;
  return { correct, total: questions.length };
}

/** O registo a guardar no fim: o último resultado e o melhor. `previous` pode ser `null` ou lixo. */
export function quizRecord(previous, { correct, total }, now = Date.now()) {
  const oldBest = typeof previous?.best === "number" ? previous.best : -1;
  return { last: correct, best: Math.max(oldBest, correct), total, completedAt: now };
}
