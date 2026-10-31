// Exercícios da página Exercícios: os 10 exemplos base (examples.js sem os extras) e exercícios
// gerados ("Gerar novo"), com a dificuldade e o estado (por fazer / em curso / feito).
//
// Módulo puro: o estado vem de um objeto de progresso { [id]: { status, … } } que a UI lê do storage.
import { EXAMPLES } from "./examples.js";
import { parse } from "./parser.js";
import { solveDLL } from "./dll.js";
import { generateFormula, normalizeSeed } from "./generator.js";
import { shareFormula } from "./share.js";

/** Fontes dos exercícios, pela ordem da lista (os "extras" do menu de exemplos não entram). */
export const EXERCISE_SOURCES = ["propagation", "branching"];


/** Tamanho dos exercícios gerados: como o gerador do Resolver por omissão. */
const GENERATED_OPTIONS = Object.freeze({ vars: 3, clauses: 6 });
const GENERATED_PREFIX = "gen-";

/**
 * Dificuldade pelo nº de escolhas encadeadas que o DLL faz (profundidade da árvore):
 *   0 → "easy" (só propagação), 1 → "medium" (uma escolha), 2 ou mais → "hard".
 */
export function exerciseDifficulty(clauses) {
  const { maxDepth } = solveDLL(clauses).result.stats;
  if (maxDepth === 0) return "easy";
  return maxDepth === 1 ? "medium" : "hard";
}

function fromExample(example) {
  const { clauses } = parse(example.input);
  return {
    id: example.id,
    source: example.source,
    title: example.title,
    input: example.input,
    clauses,
    expected: example.expected,
    difficulty: exerciseDifficulty(clauses),
  };
}

/** Os 10 exercícios base, pela ordem do examples.js. */
export const BASE_EXERCISES = EXAMPLES.filter((example) => EXERCISE_SOURCES.includes(example.source)).map(fromExample);

/** Id de um exercício gerado com esta semente. */
export function generatedExerciseId(seed) {
  return GENERATED_PREFIX + normalizeSeed(seed);
}

/** Exercício gerado a partir da semente (a mesma semente dá sempre o mesmo conjunto). */
export function generatedExercise(seed) {
  const { clauses, seed: normalized } = generateFormula({ seed, ...GENERATED_OPTIONS });
  return {
    id: generatedExerciseId(normalized),
    source: "generated",
    title: null,
    seed: normalized,
    input: shareFormula(clauses),
    clauses,
    expected: solveDLL(clauses).result.sat ? "sat" : "unsat",
    difficulty: exerciseDifficulty(clauses),
  };
}

/** O exercício com este id (base ou "gen-<semente>"), ou null. */
export function getExercise(id) {
  const text = String(id ?? "");
  const base = BASE_EXERCISES.find((exercise) => exercise.id === text);
  if (base) return base;
  const match = text.match(/^gen-(\d+)$/);
  return match ? generatedExercise(Number(match[1])) : null;
}

/**
 * true se a chave do progresso é de um exercício (base ou gerado). O mesmo registo guarda
 * outras coisas (o quiz do Aprender), que "repor progresso" nos Exercícios não deve apagar.
 */
export function isExerciseId(id) {
  return BASE_EXERCISES.some((exercise) => exercise.id === id) || /^gen-\d+$/.test(id);
}

/** true se há progresso de algum exercício (para mostrar o botão "repor progresso"). */
export function hasExerciseProgress(progress = {}) {
  return Object.keys(progress).some(isExerciseId);
}

/** Estado de um exercício a partir do registo de progresso (ou null). */
export function exerciseStatus(entry) {
  if (!entry || typeof entry !== "object") return "todo";
  return entry.status === "done" ? "done" : entry.status === "inProgress" ? "inProgress" : "todo";
}

/** Registo de progresso ao abrir um exercício: passa a "em curso", mas um feito continua feito. */
export function openedRecord(entry, now = Date.now()) {
  return exerciseStatus(entry) === "done" ? entry : { ...(entry ?? {}), status: "inProgress", openedAt: now };
}

/**
 * Registo de progresso ao terminar um exercício: "feito", com o resultado, o modo ("step" = Próximo
 * passo, "sat" = Satisfazível?) e as contas da última vez (jogadas e erros, para o resumo).
 */
export function finishedRecord(entry, { result, moves, errors, hints, mode = "step" }, now = Date.now()) {
  // `hints` (dicas usadas) só existe no modo Próximo passo; as de uma resolução anterior não ficam.
  const { hints: _previousHints, ...previous } = entry ?? {};
  const hintCount = hints === undefined ? {} : { hints };
  return { ...previous, status: "done", result, mode, moves, errors, ...hintCount, finishedAt: now };
}

const countOrZero = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);

/**
 * Resumo da última resolução guardada (para a lista e o cartão do exercício), ou null se o exercício
 * ainda não foi feito: { result: "sat"|"unsat", mode, moves, errors, hints (null no Satisfazível?), finishedAt }.
 * O registo vem do localStorage, por isso cada campo é validado (um valor estranho conta como 0).
 */
export function exerciseSummary(entry) {
  if (exerciseStatus(entry) !== "done" || (entry.result !== "sat" && entry.result !== "unsat")) return null;
  return {
    result: entry.result,
    mode: entry.mode === "sat" ? "sat" : "step",
    moves: countOrZero(entry.moves),
    errors: countOrZero(entry.errors),
    hints: entry.hints === undefined ? null : countOrZero(entry.hints),
    finishedAt: Number.isFinite(entry.finishedAt) ? entry.finishedAt : null,
  };
}

/**
 * Os exercícios base agrupados por fonte, com o estado: [{ source, exercises: [{ …, status }] }].
 * Os gerados que estão no progresso (por fazer ou em curso) entram num grupo "generated" no fim.
 */
export function exerciseGroups(progress = {}) {
  const withStatus = (exercise) => ({
    ...exercise,
    status: exerciseStatus(progress[exercise.id]),
    summary: exerciseSummary(progress[exercise.id]),
  });
  const groups = EXERCISE_SOURCES.map((source) => ({
    source,
    exercises: BASE_EXERCISES.filter((exercise) => exercise.source === source).map(withStatus),
  }));
  const generated = Object.keys(progress)
    .map(getExercise)
    .filter((exercise) => exercise?.source === "generated")
    .map(withStatus);
  if (generated.length) groups.push({ source: "generated", exercises: generated });
  return groups;
}

/** Contagem por estado dos exercícios base: { todo, inProgress, done, total }. */
export function exerciseCounts(progress = {}) {
  const counts = { todo: 0, inProgress: 0, done: 0, total: BASE_EXERCISES.length };
  for (const exercise of BASE_EXERCISES) counts[exerciseStatus(progress[exercise.id])]++;
  return counts;
}

/** O próximo exercício base a fazer: o primeiro em curso, senão o primeiro por fazer; null se fez todos. */
export function nextExercise(progress = {}) {
  const status = (exercise) => exerciseStatus(progress[exercise.id]);
  return (
    BASE_EXERCISES.find((exercise) => status(exercise) === "inProgress") ??
    BASE_EXERCISES.find((exercise) => status(exercise) === "todo") ??
    null
  );
}
