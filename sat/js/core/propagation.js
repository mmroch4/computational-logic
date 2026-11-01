// Propagação unitária passo a passo, escolhida pelo aluno (interativo da §3 do Aprender).
// O DLL da ferramenta propaga sempre a primeira cláusula unitária pela ordem do conjunto;
// aqui o aluno pode clicar em qualquer uma, e o passo é o mesmo propagateOne() do solver.
// Módulo puro (sem DOM).
import { isUnitClause } from "./clauses.js";
import { hasEmptyClause, propagateOne } from "./dll.js";

/**
 * Propaga a cláusula unitária S[index] (as duas regras da propagação unitária).
 * Devolve null se S[index] não for unitária; senão o mesmo formato de um evento "unit" do trace:
 *   { type: "unit", literal, clauseIndex, before, after, removed, shortened, merged }
 */
export function propagateClause(S, index) {
  const clause = S[index];
  if (!clause || !isUnitClause(clause)) return null;
  const literal = clause[0];
  return { type: "unit", literal, clauseIndex: index, before: S, ...propagateOne(S, literal) };
}

/**
 * Em que ponto está a propagação de S:
 *   "sat"   → S vazio (satisfazível);
 *   "unsat" → S contém F (insatisfazível);
 *   "units" → ainda há cláusulas unitárias para propagar;
 *   "stuck" → não há unitárias: o DLL tem de escolher um literal (select_literal).
 */
export function propagationStatus(S) {
  if (S.length === 0) return "sat";
  if (hasEmptyClause(S)) return "unsat";
  return S.some(isUnitClause) ? "units" : "stuck";
}
