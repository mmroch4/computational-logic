// O que a página Exercícios mostra: os dois modos, a lista por níveis, o que fazer a seguir e o resumo
// das regras. Módulo puro (sem DOM): `progress` vem de `storage.getAllProgress()`.
//
// Contrato:
//   findEntry(id)                    → { mode, exercise } | null
//   listMode(search)                 → o modo pedido em `?mode=`, `proof` por omissão
//   entryStatus(entry)               → "todo" | "solved" | "solvedWithUserRules"
//   levelGroups(mode, progress, filter) → [{ level, items: [{ exercise, status }] }], só os níveis com itens
//   overallSummary(progress)         → `progressSummary` dos dois modos juntos
//   hasProgress(progress)            → se há alguma coisa para repor
//   nextExercise(mode, progress, after) → o primeiro por fazer depois de `after`, às voltas, ou null
//   ruleSummary(exercise)            → { kind, rules }, para `exercises.ruleSets.*`; `rules` são ids
//   ruleDetails(exercise)            → { allowed, proves, userRules }, com ids de regras
import { EXERCISES, isExerciseId, progressStatus, progressSummary } from "./exercises.js";
import { FIND_ERROR_PUZZLES, allowedRuleIds } from "./find-error.js";
import { userRulesEnabled } from "./user-rules.js";

/** Os modos da página, com o catálogo de cada um. */
const CATALOGS = { proof: EXERCISES, findError: FIND_ERROR_PUZZLES };

export const EXERCISE_MODES = Object.freeze(Object.keys(CATALOGS));
export const EXERCISE_FILTERS = Object.freeze(["all", "todo", "done"]);

/** O exercício com este id, de qualquer modo, e o modo a que pertence. */
export function findEntry(id) {
  for (const mode of EXERCISE_MODES) {
    const exercise = CATALOGS[mode].find((item) => item.id === id);
    if (exercise) return { mode, exercise };
  }
  return null;
}

export function listMode(search = "") {
  const mode = new URLSearchParams(search).get("mode");
  return EXERCISE_MODES.includes(mode) ? mode : "proof";
}

/** O estado para mostrar: ao contrário de `progressStatus`, «por fazer» também tem nome. */
export const entryStatus = (entry) => progressStatus(entry) ?? "todo";

const statusOf = ({ id }, progress) => entryStatus(Object.hasOwn(progress, id) ? progress[id] : null);

function passesFilter(status, filter) {
  if (filter === "todo") return status === "todo";
  return filter === "done" ? status !== "todo" : true;
}

/** A lista de um modo por níveis, do mais fácil ao mais difícil. */
export function levelGroups(mode, progress = {}, filter = "all") {
  const levels = [...new Set(CATALOGS[mode].map(({ level }) => level))].sort((a, b) => a - b);
  return levels
    .map((level) => ({
      level,
      items: CATALOGS[mode]
        .filter((exercise) => exercise.level === level)
        .map((exercise) => ({ exercise, status: statusOf(exercise, progress) }))
        .filter(({ status }) => passesFilter(status, filter)),
    }))
    .filter(({ items }) => items.length > 0);
}

export const overallSummary = (progress = {}) => progressSummary([...EXERCISES, ...FIND_ERROR_PUZZLES], progress);

/** Conta também entradas de exercícios que já não existam: repor serve para as limpar. */
export const hasProgress = (progress = {}) => Object.keys(progress).some(isExerciseId);

/** Pela ordem da lista: os níveis mandam, e dentro de cada um a ordem do catálogo. */
const inListOrder = (mode) => levelGroups(mode).flatMap(({ items }) => items.map(({ exercise }) => exercise));

/**
 * O exercício a sugerir. Sem `after`, o primeiro por fazer; com ele, o primeiro por fazer depois desse,
 * voltando ao início da lista. `after` nunca é sugerido: quem acabou de o resolver quer outro.
 */
export function nextExercise(mode, progress = {}, after = null) {
  const list = inListOrder(mode);
  const start = list.findIndex(({ id }) => id === after) + 1;
  const rotated = [...list.slice(start), ...list.slice(0, start)];
  return rotated.find((exercise) => exercise.id !== after && statusOf(exercise, progress) === "todo") ?? null;
}

/** Uma linha sobre o conjunto de regras, para a lista. */
export function ruleSummary({ rules: spec }) {
  if (spec === "base") return { kind: "base", rules: [] };
  if (spec === "completo") return { kind: "all", rules: [] };
  const { set, plus = [], only = [], exclude = [] } = spec;
  if (exclude.length > 0) return { kind: "prove", rules: exclude };
  if (set === "restrito") return { kind: "only", rules: only };
  return plus.length > 0 ? { kind: "plus", rules: plus } : { kind: set === "base" ? "base" : "all", rules: [] };
}

/** O detalhe que o exercício aberto mostra. */
export function ruleDetails(exercise) {
  const { exclude = [] } = typeof exercise.rules === "string" ? {} : exercise.rules;
  return { allowed: allowedRuleIds(exercise), proves: exclude, userRules: userRulesEnabled(exercise) };
}
