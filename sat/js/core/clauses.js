// Cláusulas e conjuntos de cláusulas.
// Clause:    Literal[]  (disjunção; sem literais repetidos; ordem de entrada preservada)
// ClauseSet: Clause[]   (conjunção; sem cláusulas repetidas; ordem de entrada preservada)
// A cláusula vazia [] é a cláusula F (falsa); o conjunto vazio [] é satisfazível.

import { compareVariables, formatLiteral, isComplement, literalKey } from "./literals.js";

/**
 * Remove literais repetidos de uma cláusula (fica a 1.ª ocorrência).
 * Devolve { clause, duplicates } com as chaves dos literais que colapsaram.
 */
export function dedupeLiterals(literals) {
  const seen = new Set();
  const clause = [];
  const duplicates = [];
  for (const l of literals) {
    const key = literalKey(l);
    if (seen.has(key)) {
      duplicates.push(key);
    } else {
      seen.add(key);
      clause.push(l);
    }
  }
  return { clause, duplicates };
}

/**
 * Chave de uma cláusula que ignora a ordem: {p, ¬q} e {¬q, p} têm a mesma chave.
 * (Uma cláusula é um conjunto de literais.)
 */
export function clauseKey(clause) {
  return clause.map(literalKey).sort().join(" ");
}

export function sameClause(a, b) {
  return clauseKey(a) === clauseKey(b);
}

/**
 * Remove cláusulas repetidas de um conjunto (fica a 1.ª ocorrência).
 * Devolve { clauses, duplicates } com os índices (no original) das cláusulas removidas.
 */
export function dedupeClauses(clauses) {
  const seen = new Set();
  const result = [];
  const duplicates = [];
  clauses.forEach((clause, index) => {
    const key = clauseKey(clause);
    if (seen.has(key)) {
      duplicates.push(index);
    } else {
      seen.add(key);
      result.push(clause);
    }
  });
  return { clauses: result, duplicates };
}

/** Tautologia: a cláusula contém um literal e o seu complemento (ex.: p ∨ ¬p). */
export function isTautology(clause) {
  return clause.some((a) => clause.some((b) => isComplement(a, b)));
}

/** Cláusula vazia = F. */
export function isEmptyClause(clause) {
  return clause.length === 0;
}

/** Cláusula unitária: tem exatamente um literal. */
export function isUnitClause(clause) {
  return clause.length === 1;
}

/** Conjunto vazio de cláusulas (satisfazível). */
export function isEmptySet(clauses) {
  return clauses.length === 0;
}

/** Variáveis do conjunto, sem repetidos, em ordem alfabética natural (p2 < p11). */
export function variablesOf(clauses) {
  const vars = new Set();
  for (const clause of clauses) for (const l of clause) vars.add(l.v);
  return [...vars].sort(compareVariables);
}

const CLAUSE_JOINERS = { unicode: " ∨ ", compact: " ", latex: " \\lor " };

/**
 * Cláusula formatada. A cláusula vazia é sempre "F".
 * unicode: "¬p₁ ∨ q" · compact: "-p1 q" · latex: "\neg p_{1} \lor q"
 */
export function formatClause(clause, mode = "unicode") {
  if (clause.length === 0) return "F";
  return clause.map((l) => formatLiteral(l, mode)).join(CLAUSE_JOINERS[mode]);
}

/**
 * Conjunto formatado.
 * unicode: "{¬p₁ ∨ q, q}" (com disjunções) · compact: "-p1 q, q"
 * latex: "\{\neg p_{1} \lor q, q\}". O conjunto vazio é "{}" (compact: "").
 */
export function formatSet(clauses, mode = "unicode") {
  const body = clauses.map((c) => formatClause(c, mode)).join(", ");
  if (mode === "compact") return body;
  if (mode === "latex") return `\\{${body}\\}`;
  return `{${body}}`;
}
