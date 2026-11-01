// Algoritmo de Davis-Putnam (DLL):
//
//   DLL(S)
//     S := propagate(S)
//     if S vazio then return satisfazível
//     if S contém F then return insatisfazível
//     l := select_literal(S)
//     if DLL(S ∪ {l}) = satisfazível then return satisfazível
//     else return DLL(S ∪ {l̃})
//
// Este ficheiro tem primeiro os passos puros (um passo de cada vez), que o modo
// exercício usa para validar as jogadas do aluno a partir de qualquer estado.
// Módulo puro (sem DOM).

import { clauseKey, isEmptyClause, isUnitClause, variablesOf } from "./clauses.js";
import { complement, lit, sameLiteral } from "./literals.js";

// Chaves das cláusulas já calculadas. As cláusulas nunca são alteradas depois de criadas
// (a propagação cria cláusulas novas), por isso a chave de cada array pode ser guardada.
// Sem isto, uma fórmula com 100 variáveis passava ~1 s a recalcular chaves (M8.5).
const keyCache = new WeakMap();

/** clauseKey com memória: a mesma cláusula (o mesmo array) só é ordenada uma vez. */
function cachedClauseKey(clause) {
  let key = keyCache.get(clause);
  if (key === undefined) {
    key = clauseKey(clause);
    keyCache.set(clause, key);
  }
  return key;
}

/**
 * Cláusulas unitárias de S, pela ordem do conjunto.
 * Devolve [{ index, literal }]; a propagação usa sempre a primeira.
 */
export function units(S) {
  const result = [];
  S.forEach((clause, index) => {
    if (isUnitClause(clause)) result.push({ index, literal: clause[0] });
  });
  return result;
}

/** A cláusula contém o literal l? */
function containsLiteral(clause, l) {
  for (const x of clause) if (x.v === l.v && x.neg === l.neg) return true;
  return false;
}

/**
 * Um passo de propagação unitária com o literal l:
 *   1. remove de S todas as cláusulas da forma l ∨ C′ (incluindo a própria {l});
 *   2. substitui cada cláusula da forma l̃ ∨ C′ pela cláusula C′.
 * As restantes cláusulas ficam iguais e tudo mantém a ordem original.
 *
 * Devolve { after, removed, shortened, merged }, com índices relativos a S:
 *   removed:   [idx] das cláusulas apagadas (continham l);
 *   shortened: [{ idx, from, to }] das cláusulas que perderam l̃;
 *   merged:    [idx] das cláusulas encurtadas que ficaram iguais a outra já
 *              presente e por isso colapsaram (um conjunto não tem repetidos).
 */
export function propagateOne(S, l) {
  const opposite = complement(l);
  const removed = [];
  const shortened = [];
  const merged = [];
  const after = [];
  const seen = new Set();

  // Ciclos simples (e não forEach/some com funções) porque isto corre uma vez por passo sobre
  // o conjunto inteiro: em fórmulas grandes é o que mais pesa no DLL (M8.5).
  for (let idx = 0; idx < S.length; idx++) {
    const clause = S[idx];
    if (containsLiteral(clause, l)) {
      removed.push(idx);
      continue;
    }
    let next = clause;
    if (containsLiteral(clause, opposite)) {
      next = clause.filter((x) => !sameLiteral(x, opposite));
      shortened.push({ idx, from: clause, to: next });
    }
    const key = cachedClauseKey(next);
    if (seen.has(key)) {
      merged.push(idx);
      continue;
    }
    seen.add(key);
    after.push(next);
  }

  return { after, removed, shortened, merged };
}

/** S contém F (a cláusula vazia)? */
export function hasEmptyClause(S) {
  return S.some(isEmptyClause);
}

/**
 * select_literal: a primeira variável em ordem alfabética natural (p2 < p11),
 * no ramo positivo. null se S não tiver variáveis.
 */
export function selectLiteral(S) {
  const [first] = variablesOf(S);
  return first === undefined ? null : lit(first, false);
}

/**
 * S ∪ {l}: acrescenta a cláusula unitária {l} no fim do conjunto.
 * Se {l} já estiver em S, o conjunto fica igual.
 */
export function branch(S, l) {
  const unit = [l];
  const key = clauseKey(unit);
  if (S.some((clause) => cachedClauseKey(clause) === key)) return S.slice();
  return [...S, unit];
}

// ---------------------------------------------------------------------------
// Solver completo: corre o DLL e regista cada passo num trace (lista plana de
// eventos). Cada evento traz o conjunto antes e
// depois, para a UI poder saltar para qualquer passo sem recalcular.
//
// Os nós da árvore de decisão são numerados por ordem de criação (0 = raiz),
// por isso os ids são estáveis: a mesma entrada dá sempre o mesmo trace.

/** Limite de passos por omissão (eventos unit/branch/conflict/sat/backtrack). */
export const DEFAULT_MAX_STEPS = 5000;

/** Sinal interno para parar a recursão quando se atinge o limite de passos. */
class StepLimitReached extends Error {}

/** Converte os literais do caminho numa valoração { variável: true/false }. */
function toAssignment(literals) {
  const assignment = {};
  for (const l of literals) assignment[l.v] = !l.neg;
  return assignment;
}

/**
 * Corre o DLL sobre S e devolve { trace, result }.
 *   options.maxSteps: nº máximo de passos; ao passar o limite o trace acaba com
 *   { type: "limit", steps } seguido de um result com sat: null e limited: true.
 *   options.selectLiteral: função S → literal que substitui o select_literal por omissão
 *   (pode ver-se como um parâmetro do algoritmo; ver heuristics.js).
 * result = { type: "result", sat, assignment, stats: { units, branches, conflicts, nodes, maxDepth } }
 * A valoração só tem as variáveis que o algoritmo fixou; as outras podem ter qualquer valor.
 */
export function solveDLL(S, options = {}) {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const select = options.selectLiteral ?? selectLiteral;
  const trace = [];
  const stats = { units: 0, branches: 0, conflicts: 0, nodes: 1, maxDepth: 0 };
  let steps = 0;
  let nextNode = 1;

  function emit(event) {
    if (steps >= maxSteps) throw new StepLimitReached();
    steps++;
    trace.push(event);
  }

  // DLL(S) para o nó `node`; `path` = literais já fixados (propagados ou escolhidos).
  // Devolve a valoração se for satisfazível, ou null se for insatisfazível.
  function dll(S, node, depth, path) {
    // S := propagate(S) — uma cláusula unitária de cada vez, sempre a primeira.
    while (!hasEmptyClause(S)) {
      const [unit] = units(S);
      if (!unit) break;
      const step = propagateOne(S, unit.literal);
      emit({
        type: "unit",
        node,
        literal: unit.literal,
        clauseIndex: unit.index,
        before: S,
        after: step.after,
        removed: step.removed,
        shortened: step.shortened,
        merged: step.merged,
      });
      stats.units++;
      path = [...path, unit.literal];
      S = step.after;
    }

    // if S vazio then return satisfazível
    if (S.length === 0) {
      const assignment = toAssignment(path);
      emit({ type: "sat", node, S, assignment });
      return assignment;
    }

    // if S contém F then return insatisfazível
    if (hasEmptyClause(S)) {
      emit({ type: "conflict", node, S });
      stats.conflicts++;
      return null;
    }

    // l := select_literal(S)
    // if DLL(S ∪ {l}) = satisfazível then return satisfazível
    const l = select(S);
    const firstChild = nextNode++;
    const first = dllBranch(S, node, firstChild, depth, path, l);
    if (first) return first;

    // else return DLL(S ∪ {l̃}): volta ao nó atual e tenta o complemento.
    const opposite = complement(l);
    emit({ type: "backtrack", node: firstChild, to: node, literal: opposite });
    return dllBranch(S, node, nextNode++, depth, path, opposite);
  }

  // Nó `child` com S ∪ {l}, filho de `parent`.
  function dllBranch(S, parent, child, depth, path, l) {
    const after = branch(S, l);
    emit({ type: "branch", node: child, parent, literal: l, depth: depth + 1, before: S, after });
    stats.branches++;
    stats.nodes++;
    stats.maxDepth = Math.max(stats.maxDepth, depth + 1);
    return dll(after, child, depth + 1, path);
  }

  trace.push({ type: "start", node: 0, S });
  let result;
  try {
    const assignment = dll(S, 0, 0, []);
    result = { type: "result", sat: assignment !== null, assignment, stats };
  } catch (error) {
    if (!(error instanceof StepLimitReached)) throw error;
    trace.push({ type: "limit", steps });
    result = { type: "result", sat: null, assignment: null, stats, limited: true };
  }
  trace.push(result);
  return { trace, result };
}
