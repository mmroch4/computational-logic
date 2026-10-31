// Resolução e eliminação de uma variável (a regra do Davis-Putnam original, de 1960).
// De p ∨ C e ¬p ∨ D tira-se o resolvente C ∨ D. Eliminar p de S é trocar todas as cláusulas
// com p ou com ¬p por todos os resolventes desses pares: o conjunto novo já não tem p e é
// satisfazível se e só se S o for. Os resolventes tautológicos não fazem falta.
// Módulo puro (sem DOM); serve a §6 do Aprender e, mais tarde, o dp.js.
import { clauseKey, dedupeClauses, dedupeLiterals, isTautology } from "./clauses.js";

/** Resolvente de `positive` (contém v) e `negative` (contém ¬v) sobre a variável v. */
export function resolvent(positive, negative, v) {
  const rest = [
    ...positive.filter((l) => !(l.v === v && !l.neg)),
    ...negative.filter((l) => !(l.v === v && l.neg)),
  ];
  return dedupeLiterals(rest).clause;
}

/**
 * Elimina a variável v de S por resolução.
 * Devolve { variable, positive, negative, dropped, kept, pairs, after }:
 *   positive / negative = índices (em S) das cláusulas com v / com ¬v;
 *   dropped = índices das cláusulas com v e ¬v ao mesmo tempo: são sempre verdadeiras, saem
 *             sem dar resolventes (senão o resolvente ainda teria v e a eliminação não acabava);
 *   kept  = cláusulas sem v nem ¬v (passam iguais);
 *   pairs = [{ positive, negative, resolvent, tautology }] por cada par (índices em S);
 *   after = kept + resolventes não tautológicos, sem repetidos.
 */
export function eliminateVariable(S, v) {
  const positive = [];
  const negative = [];
  const dropped = [];
  const kept = [];
  S.forEach((clause, index) => {
    const hasPos = clause.some((l) => l.v === v && !l.neg);
    const hasNeg = clause.some((l) => l.v === v && l.neg);
    if (hasPos) positive.push(index);
    if (hasNeg) negative.push(index);
    if (hasPos && hasNeg) dropped.push(index);
    if (!hasPos && !hasNeg) kept.push(clause);
  });
  const pairs = [];
  for (const i of positive) {
    if (dropped.includes(i)) continue;
    for (const j of negative) {
      if (dropped.includes(j)) continue;
      const clause = resolvent(S[i], S[j], v);
      pairs.push({ positive: i, negative: j, resolvent: clause, tautology: isTautology(clause) });
    }
  }
  const resolvents = pairs.filter((pair) => !pair.tautology).map((pair) => pair.resolvent);
  return { variable: v, positive, negative, dropped, kept, pairs, after: dedupeClauses([...kept, ...resolvents]).clauses };
}

/**
 * Índices dos pares cujo resolvente não acrescenta nada: é igual a uma cláusula que fica (`kept`) ou
 * ao resolvente de um par anterior. As tautologias não contam: já saem por serem tautologias.
 */
export function repeatedPairs(pairs, kept) {
  const seen = new Set(kept.map(clauseKey));
  const repeated = new Set();
  pairs.forEach((pair, index) => {
    if (pair.tautology) return;
    const key = clauseKey(pair.resolvent);
    if (seen.has(key)) repeated.add(index);
    seen.add(key);
  });
  return repeated;
}
