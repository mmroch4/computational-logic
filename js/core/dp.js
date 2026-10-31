// Algoritmo de Davis-Putnam original (1960), por resolução, para comparar com o DLL (1962):
//
//   DP(S)
//     repetir
//       if S vazio then return satisfazível
//       if S contém F then return insatisfazível
//       if S tem uma cláusula unitária {l} then S := propagate(S, l)
//       else x := primeira variável de S;  S := elimina(S, x)
//
// Eliminar x é trocar todas as cláusulas com x ou com ¬x por todos os resolventes
// (de x ∨ C e ¬x ∨ D tira-se C ∨ D); os resolventes tautológicos são descartados.
// O conjunto novo já não tem x e é satisfazível se e só se S o for, por isso o DP
// nunca ramifica nem volta atrás. O preço é que o conjunto pode crescer muito
// (k cláusulas com x e m com ¬x dão até k·m resolventes): foi por isso que o DLL
// trocou a eliminação pela ramificação.
//
// Usa os mesmos passos puros do DLL (propagação, ordem alfabética natural) e a
// eliminação de resolution.js. Módulo puro (sem DOM).

import { hasEmptyClause, propagateOne, units } from "./dll.js";
import { variablesOf } from "./clauses.js";
import { eliminateVariable } from "./resolution.js";

/** Limite por omissão do tamanho do conjunto: acima disto a resolução "explodiu". */
export const DEFAULT_MAX_CLAUSES = 400;

/** Limite por omissão do nº de passos (eventos unit/resolve). */
export const DEFAULT_MAX_STEPS = 5000;

/**
 * Corre o DP sobre S e devolve { trace, result }. Eventos do trace:
 *   { type: "start", S }
 *   { type: "unit", step, literal, clauseIndex, before, after, removed, shortened, merged }   (igual ao DLL)
 *   { type: "resolve", step, variable, before, after, positive, negative, dropped, kept, pairs }
 *        positive/negative/dropped/kept = índices em `before`;
 *        pairs = [{ positive, negative, resolvent, tautology }] (as cláusulas-pai → resolvente)
 *   { type: "conflict", S }  |  { type: "sat", S, assignment }
 *   { type: "limit", reason: "clauses" | "steps", variable?, size?, max, code }
 *        code = chave do aviso didático nos locales ("dp.limit.clauses" / "dp.limit.steps")
 *   { type: "result", sat, assignment, stats, limited? }
 * stats = { units, eliminations, resolvents, tautologies, steps, maxSize }
 *   resolvents = resolventes novos (não tautológicos), tautologies = resolventes descartados,
 *   maxSize = maior nº de cláusulas que o conjunto chegou a ter.
 *
 * options.maxClauses: se uma eliminação der um conjunto maior do que isto, o DP para
 *   (evento limit com reason "clauses") e o result tem sat: null e limited: true.
 * options.maxSteps: nº máximo de passos (unit + resolve).
 */
export function solveDP(S, options = {}) {
  const maxClauses = options.maxClauses ?? DEFAULT_MAX_CLAUSES;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const trace = [{ type: "start", S }];
  const stats = { units: 0, eliminations: 0, resolvents: 0, tautologies: 0, steps: 0, maxSize: S.length };

  function stop(limit) {
    trace.push({ type: "limit", ...limit });
    const result = { type: "result", sat: null, assignment: null, stats, limited: true };
    trace.push(result);
    return { trace, result };
  }

  for (;;) {
    // if S vazio then return satisfazível
    if (S.length === 0) {
      trace.push({ type: "sat", S, assignment: rebuildAssignment(trace) });
      break;
    }

    // if S contém F then return insatisfazível
    if (hasEmptyClause(S)) {
      trace.push({ type: "conflict", S });
      break;
    }

    if (stats.steps >= maxSteps) return stop({ reason: "steps", max: maxSteps, code: "dp.limit.steps" });

    // Propagação unitária: a primeira cláusula unitária pela ordem do conjunto.
    const [unit] = units(S);
    if (unit) {
      const step = propagateOne(S, unit.literal);
      stats.steps++;
      stats.units++;
      trace.push({
        type: "unit",
        step: stats.steps,
        literal: unit.literal,
        clauseIndex: unit.index,
        before: S,
        after: step.after,
        removed: step.removed,
        shortened: step.shortened,
        merged: step.merged,
      });
      S = step.after;
      continue;
    }

    // Sem unitárias: elimina a primeira variável (ordem alfabética natural) por resolução.
    const [variable] = variablesOf(S);
    const elimination = eliminateVariable(S, variable);
    if (elimination.after.length > maxClauses) {
      return stop({ reason: "clauses", variable, size: elimination.after.length, max: maxClauses, code: "dp.limit.clauses" });
    }
    const touched = new Set([...elimination.positive, ...elimination.negative]);
    const kept = S.map((_, index) => index).filter((index) => !touched.has(index));
    stats.steps++;
    stats.eliminations++;
    stats.tautologies += elimination.pairs.filter((pair) => pair.tautology).length;
    stats.resolvents += elimination.after.length - kept.length;
    stats.maxSize = Math.max(stats.maxSize, elimination.after.length);
    trace.push({
      type: "resolve",
      step: stats.steps,
      variable,
      before: S,
      after: elimination.after,
      positive: elimination.positive,
      negative: elimination.negative,
      dropped: elimination.dropped,
      kept,
      pairs: elimination.pairs,
    });
    S = elimination.after;
  }

  const sat = trace[trace.length - 1].type === "sat";
  const result = { type: "result", sat, assignment: sat ? trace[trace.length - 1].assignment : null, stats };
  trace.push(result);
  return { trace, result };
}

/** O literal l é verdadeiro na valoração? (variáveis sem valor contam como falsas) */
const isTrue = (l, assignment) => (assignment[l.v] ?? false) === !l.neg;

/**
 * Valoração que satisfaz o S inicial, quando o DP chega a S vazio.
 * O DP de 1960 só decide; a valoração reconstrói-se percorrendo os passos de trás para a frente:
 *   - num passo unit com l, l fica verdadeiro;
 *   - numa eliminação de x, as outras variáveis que ainda não têm valor recebem F (podem ter
 *     qualquer valor) e x fica V se todas as cláusulas ¬x ∨ D já forem verdadeiras, senão F.
 *     Como todos os resolventes C ∨ D são verdadeiros, ou todos os C são verdadeiros ou todos
 *     os D o são, e a escolha satisfaz todas as cláusulas com x e com ¬x.
 */
function rebuildAssignment(trace) {
  const assignment = {};
  for (let i = trace.length - 1; i >= 0; i--) {
    const event = trace[i];
    if (event.type === "unit") {
      assignment[event.literal.v] = !event.literal.neg;
    } else if (event.type === "resolve") {
      const x = event.variable;
      for (const v of variablesOf(event.before)) if (v !== x && !(v in assignment)) assignment[v] = false;
      // As cláusulas com x e ¬x (dropped) são sempre verdadeiras e não contam.
      const negativesTrue = event.negative
        .filter((index) => !event.dropped.includes(index))
        .every((index) => event.before[index].some((l) => l.v !== x && isTrue(l, assignment)));
      assignment[x] = negativesTrue;
    }
  }
  return assignment;
}
