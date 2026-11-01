// Exercícios de prova e progresso. Módulo puro (sem DOM): a página guarda o progresso com `storage`.
// A lista está em `exercise-catalog.js`, e sai daqui como `EXERCISES`.
//
// Um exercício tem:
//   id        `ex-…`, em minúsculas: é a chave no progresso, por isso não muda depois de publicado
//   level     nível, inteiro a partir de 1
//   sequent   o sequente, escrito como o site o imprime
//   rules     conjunto de regras, no formato de `ruleSet`; `exclude` marca «prova esta regra»
//   userRules opcional, ativo por omissão; `false` desliga-o. Ver `userRulesEnabled`
//   solution  prova no formato de `proof-text.js`, aceite pelo verificador com o conjunto `rules`
//   hints     opcional, chaves de `exercises.hints.*` nos locales, da mais vaga à mais concreta
//
// Contrato:
//   exerciseGoal(exercise)         → o sequente
//   exerciseSolution(exercise)     → a prova guardada
//   checkAttempt(exercise, proof, userRules) → { result, mark }, com `mark` de `progressMark`
//   validateExercise(exercise)     → códigos dos problemas, [] se estiver bom
//   validateExercises(exercises)   → { [id]: códigos }, só dos exercícios com problemas
//   progressStatus(entry)          → null | "solved" | "solvedWithUserRules"
//   recordMark(entry, mark)        → a nova entrada, a guardar com `storage.setProgress(id, entrada)`
//   progressSummary(exercises, progress) → { total, solved, solvedWithUserRules, pending }
//   isExerciseId(id)               → serve de filtro a `storage.resetProgress`, que partilha a chave
//                                    com outras páginas

import { EXERCISES } from "./exercise-catalog.js";
import { parseProof } from "./proof-text.js";
import { RULES, ruleSet } from "./rules.js";
import { formatSequent, parseSequent } from "./sequent.js";
import { activeRules, progressMark, userRulesEnabled } from "./user-rules.js";
import { verifyProof } from "./verify.js";

export { EXERCISES };

const ID_PREFIX = "ex-";
const ID_PATTERN = /^ex-[a-z0-9]+(-[a-z0-9]+)*$/;

/** O exercício com este id, ou null. */
export function findExercise(id) {
  return EXERCISES.find((exercise) => exercise.id === id) ?? null;
}

/** O sequente do exercício. Os testes garantem que todos se leem. */
export function exerciseGoal({ sequent }) {
  return parseSequent(sequent).sequent;
}

/** A prova guardada. Os testes garantem que todas se leem. */
export function exerciseSolution({ solution }) {
  return parseProof(solution.trim()).proof;
}

/** Verifica uma tentativa com as regras do exercício e diz o que conta para o progresso. */
export function checkAttempt(exercise, proof, userRules = []) {
  const { rules, known } = activeRules(exercise, userRules);
  const result = verifyProof(proof, exerciseGoal(exercise), rules, known);
  return { result, mark: progressMark(result) };
}

export function ruleSetProblems(exercise) {
  try {
    ruleSet(exercise.rules);
  } catch {
    return ["badRules"];
  }
  return exercise.userRules === true && !userRulesEnabled(exercise) ? ["userRulesConflict"] : [];
}

export function sequentProblems({ sequent }) {
  const parsed = typeof sequent === "string" ? parseSequent(sequent) : { ok: false };
  if (!parsed.ok) return ["badSequent"];
  return formatSequent(parsed.sequent) === sequent ? [] : ["sequentNotCanonical"];
}

function solutionProblems(exercise) {
  if (typeof exercise.solution !== "string") return ["badSolution"];
  if (!parseProof(exercise.solution.trim()).ok) return ["badSolution"];
  return verifyProof(exerciseSolution(exercise), exerciseGoal(exercise), ruleSet(exercise.rules), RULES).ok
    ? []
    : ["solutionRejected"];
}

function hintProblems({ hints = [] }) {
  const isKey = (hint) => typeof hint === "string" && hint !== "";
  return Array.isArray(hints) && hints.every(isKey) ? [] : ["badHints"];
}

/** Os problemas de um exercício. A solução só se verifica se o sequente e o conjunto estiverem bons. */
export function validateExercise(exercise) {
  const problems = [
    ...(typeof exercise.id === "string" && ID_PATTERN.test(exercise.id) ? [] : ["badId"]),
    ...(Number.isInteger(exercise.level) && exercise.level >= 1 ? [] : ["badLevel"]),
    ...ruleSetProblems(exercise),
    ...sequentProblems(exercise),
    ...hintProblems(exercise),
  ];
  const canCheckSolution = !problems.includes("badSequent") && !problems.includes("badRules");
  return canCheckSolution ? [...problems, ...solutionProblems(exercise)] : problems;
}

/** Os problemas de cada exercício, mais `duplicateId`. Sem problemas, devolve um objeto vazio. */
export function validateExercises(exercises) {
  const found = new Map();
  const seen = new Set();
  for (const exercise of exercises) {
    const problems = validateExercise(exercise);
    if (seen.has(exercise.id)) problems.push("duplicateId");
    seen.add(exercise.id);
    if (problems.length > 0) found.set(exercise.id, [...(found.get(exercise.id) ?? []), ...problems]);
  }
  return Object.fromEntries(found);
}

const STATUSES = ["solved", "solvedWithUserRules"];

/** O estado guardado numa entrada do progresso. O que não se reconhece conta como por resolver. */
export function progressStatus(entry) {
  return STATUSES.includes(entry?.status) ? entry.status : null;
}

/**
 * A entrada depois de uma tentativa, com `mark` de `checkAttempt`. O progresso nunca desce: uma prova
 * com regras próprias não apaga «resolvido», e uma prova só com regras do conjunto substitui
 * «resolvido com regras próprias». Uma tentativa falhada não muda nada.
 */
export function recordMark(entry, mark) {
  if (!mark || progressStatus(entry) === "solved") return entry ?? null;
  const isRecord = typeof entry === "object" && !Array.isArray(entry);
  return { ...(isRecord ? entry : {}), status: mark };
}

/** A contagem de `exercises`, por exemplo os de um nível, a partir de `storage.getAllProgress()`. */
export function progressSummary(exercises, progress) {
  const count = (status) => exercises
    .filter(({ id }) => Object.hasOwn(progress, id) && progressStatus(progress[id]) === status)
    .length;
  const solved = count("solved");
  const solvedWithUserRules = count("solvedWithUserRules");
  return { total: exercises.length, solved, solvedWithUserRules, pending: exercises.length - solved - solvedWithUserRules };
}

/** Se uma chave do progresso é de um exercício, mesmo de um que já não exista. */
export function isExerciseId(id) {
  return id.startsWith(ID_PREFIX);
}
