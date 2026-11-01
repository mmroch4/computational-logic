// «Encontra o passo errado»: uma prova com um único erro, em que se aponta a linha e depois se escolhe
// a explicação. Módulo puro (sem DOM). A lista está em `find-error-catalog.js`.
//
// Um desafio tem:
//   id          `ex-err-…`: é a chave no progresso, partilhado com os exercícios de prova
//   level       nível, inteiro a partir de 1
//   sequent     o sequente, escrito como o site o imprime
//   rules       conjunto de regras, no formato de `ruleSet`
//   proof       prova com o erro, no formato de `proof-text.js`
//   line        número da linha errada
//   answer      chave de `REASONS`: a explicação certa, em `exercises.findError.reasons.*`
//   distractors chaves de `REASONS`, com outro código do verificador: por isso são mesmo falsas
//   explanation chave de `exercises.findError.explanations.*`: o erro desta prova, em concreto
//   solution    prova correta do mesmo sequente. Sem ela, o sequente tem de ser inválido
//
// Contrato:
//   puzzleGoal(puzzle), puzzleProof(puzzle), puzzleSolution(puzzle) → sequente, prova, prova ou null
//   puzzleFindings(puzzle)     → [{ line, code }], tudo o que o verificador aponta à prova
//   allowedRuleIds(puzzle)     → ids das regras permitidas, sem repetir as formas alternativas
//   validatePuzzle(puzzle)     → códigos dos problemas, [] se estiver bom
//   validatePuzzles(puzzles)   → { [id]: códigos }, só dos desafios com problemas
//   reasonOptions(puzzle)      → as chaves das explicações, pela ordem a mostrar
//   startPuzzle()              → o estado inicial
//   chooseLine(puzzle, state, n), chooseReason(puzzle, state, key) → o estado seguinte
//   puzzleMark(state)          → null | "solved", para `recordMark`
//
// Estado: { phase: "line" | "reason" | "done", wrongLines, wrongReasons, feedback }, com `feedback`
// null, { kind: "lineFine", line } ou { kind: "reasonWrong" }. Uma resposta errada fica assinalada e
// não conta contra ti: o desafio resolve-se quando se chega à explicação certa.

import { ruleSetProblems, sequentProblems } from "./exercises.js";
import { FIND_ERROR_PUZZLES } from "./find-error-catalog.js";
import { parseProof } from "./proof-text.js";
import { RULES, ruleSet } from "./rules.js";
import { checkSequent } from "./semantics.js";
import { parseSequent } from "./sequent.js";
import { verifyProof } from "./verify.js";

export { FIND_ERROR_PUZZLES };

/** Cada explicação e o código do verificador que ela descreve. `extraPremise` vem de `extraPremises`. */
export const REASONS = Object.freeze({
  affirmedConsequent: "ruleNotApplicable",
  onlyOuterDoubleNegation: "ruleNotApplicable",
  casesDisagree: "ruleNotApplicable",
  negationIntroResult: "formulaMismatch",
  deMorganShape: "formulaMismatch",
  closedSubproofLine: "inaccessibleLine",
  laterLine: "inaccessibleLine",
  citesOpenSubproof: "openSubproof",
  rangeStartsAtHypothesis: "notASubproof",
  noSubproofCited: "wrongCitationKind",
  missingCase: "missingCitation",
  ruleNotInSet: "ruleNotAllowed",
  assumedPremise: "extraPremise",
});

const ID_PATTERN = /^ex-err-[a-z0-9]+(-[a-z0-9]+)*$/;
const DISTRACTORS = 3;

export const puzzleGoal = ({ sequent }) => parseSequent(sequent).sequent;
export const puzzleProof = ({ proof }) => parseProof(proof.trim()).proof;
export const puzzleSolution = ({ solution }) => (solution ? parseProof(solution.trim()).proof : null);

const verifyWith = (puzzle, proof) => verifyProof(proof, puzzleGoal(puzzle), ruleSet(puzzle.rules), RULES);

/** O que o verificador aponta à prova: erros de linha, premissas a mais e a conclusão. */
export function puzzleFindings(puzzle) {
  const { lineErrors, extraPremises, conclusionError } = verifyWith(puzzle, puzzleProof(puzzle));
  return [
    ...lineErrors.map(({ code, params }) => ({ line: params.line, code })),
    ...extraPremises.map((line) => ({ line, code: "extraPremise" })),
    ...(conclusionError ? [{ line: conclusionError.params.line ?? null, code: conclusionError.code }] : []),
  ];
}

/** Os ids das regras permitidas, pela ordem do catálogo. */
export const allowedRuleIds = ({ rules }) => [...new Set(ruleSet(rules).map(({ id }) => id))];

function proofProblems(puzzle) {
  if (typeof puzzle.proof !== "string" || !parseProof(puzzle.proof.trim()).ok) return ["badProof"];
  const findings = puzzleFindings(puzzle);
  if (findings.length !== 1) return ["notOneError"];
  const [{ line, code }] = findings;
  return [
    ...(line === puzzle.line ? [] : ["wrongLine"]),
    ...(code === REASONS[puzzle.answer] ? [] : ["wrongAnswer"]),
  ];
}

function solutionProblems(puzzle) {
  if (puzzle.solution === undefined) return checkSequent(puzzleGoal(puzzle)).valid ? ["missingSolution"] : [];
  if (typeof puzzle.solution !== "string" || !parseProof(puzzle.solution.trim()).ok) return ["badSolution"];
  return verifyWith(puzzle, puzzleSolution(puzzle)).ok ? [] : ["solutionRejected"];
}

function reasonProblems({ answer, distractors, explanation }) {
  const isReason = (key) => Object.hasOwn(REASONS, key);
  const fair = Array.isArray(distractors)
    && distractors.length === DISTRACTORS
    && new Set(distractors).size === DISTRACTORS
    && distractors.every((key) => isReason(key) && REASONS[key] !== REASONS[answer]);
  return [
    ...(isReason(answer) ? [] : ["badAnswer"]),
    ...(fair ? [] : ["badDistractors"]),
    ...(typeof explanation === "string" && explanation !== "" ? [] : ["badExplanation"]),
  ];
}

/** Os problemas de um desafio. A prova só se verifica se o sequente e o conjunto estiverem bons. */
export function validatePuzzle(puzzle) {
  const problems = [
    ...(typeof puzzle.id === "string" && ID_PATTERN.test(puzzle.id) ? [] : ["badId"]),
    ...(Number.isInteger(puzzle.level) && puzzle.level >= 1 ? [] : ["badLevel"]),
    ...ruleSetProblems(puzzle),
    ...sequentProblems(puzzle),
    ...reasonProblems(puzzle),
  ];
  const canVerify = !problems.includes("badSequent") && !problems.includes("badRules");
  return canVerify ? [...problems, ...proofProblems(puzzle), ...solutionProblems(puzzle)] : problems;
}

/** Os problemas de cada desafio, mais `duplicateId`. Sem problemas, devolve um objeto vazio. */
export function validatePuzzles(puzzles) {
  const found = new Map();
  const seen = new Set();
  for (const puzzle of puzzles) {
    const problems = validatePuzzle(puzzle);
    if (seen.has(puzzle.id)) problems.push("duplicateId");
    seen.add(puzzle.id);
    if (problems.length > 0) found.set(puzzle.id, [...(found.get(puzzle.id) ?? []), ...problems]);
  }
  return Object.fromEntries(found);
}

/** As explicações a mostrar. A posição da certa depende só do id, para o texto não mudar entre visitas. */
export function reasonOptions({ id, answer, distractors }) {
  const position = [...id].reduce((sum, char) => sum + char.codePointAt(0), 0) % (distractors.length + 1);
  return [...distractors.slice(0, position), answer, ...distractors.slice(position)];
}

export const startPuzzle = () => ({ phase: "line", wrongLines: [], wrongReasons: [], feedback: null });

/** Aponta a linha n. Fora da fase de escolher, ou numa linha já recusada, não muda nada. */
export function chooseLine(puzzle, state, n) {
  if (state.phase !== "line" || state.wrongLines.includes(n)) return state;
  if (n === puzzle.line) return { ...state, phase: "reason", feedback: null };
  return { ...state, wrongLines: [...state.wrongLines, n], feedback: { kind: "lineFine", line: n } };
}

/** Escolhe a explicação `key`. Fora da fase de explicar, ou numa já recusada, não muda nada. */
export function chooseReason(puzzle, state, key) {
  if (state.phase !== "reason" || state.wrongReasons.includes(key)) return state;
  if (key === puzzle.answer) return { ...state, phase: "done", feedback: null };
  return { ...state, wrongReasons: [...state.wrongReasons, key], feedback: { kind: "reasonWrong" } };
}

/** O que conta para o progresso, no formato de `recordMark`. */
export const puzzleMark = ({ phase }) => (phase === "done" ? "solved" : null);
