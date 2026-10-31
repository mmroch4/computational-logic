// As 3 notações de entrada para o mesmo conjunto de cláusulas (usado no conversor da §2 do Aprender).
// compact: "-p q, q"            (uma cláusula por vírgula)
// sets:    "{{¬p, q}, {q}}"     (cada cláusula como conjunto de literais)
// logic:   "(¬p ∨ q) ∧ q"       (fórmula em FNC)
// Os nomes das variáveis ficam como foram escritos (p1, não p₁), para o texto voltar a ser lido pelo parser.
// O conjunto vazio não tem escrita compacta nem lógica (texto vazio é um erro): aí devolve null.

import { formatLiteral } from "./literals.js";
import { isEmptyClause, isTautology, isUnitClause, formatClause } from "./clauses.js";

function literalText(l) {
  return formatLiteral(l, "compact").replace(/^-/, "¬");
}

/** Cláusula como conjunto de literais: "{¬p, q}"; a cláusula vazia é F. */
function clauseAsSet(clause) {
  if (isEmptyClause(clause)) return "F";
  return `{${clause.map(literalText).join(", ")}}`;
}

/** Cláusula como disjunção; com mais de um literal leva parênteses se houver outras cláusulas. */
function clauseAsLogic(clause, alone) {
  if (isEmptyClause(clause)) return "F";
  const text = clause.map(literalText).join(" ∨ ");
  return clause.length > 1 && !alone ? `(${text})` : text;
}

/** O mesmo conjunto nas 3 notações: { compact, sets, logic } (compact e logic são null no conjunto vazio). */
export function formatNotations(clauses) {
  if (clauses.length === 0) return { compact: null, sets: "{}", logic: null };
  return {
    compact: clauses.map((c) => formatClause(c, "compact")).join(", "),
    sets: `{${clauses.map(clauseAsSet).join(", ")}}`,
    logic: clauses.map((c) => clauseAsLogic(c, clauses.length === 1)).join(" ∧ "),
  };
}

/**
 * Tipo de cada cláusula, pela ordem em que se verifica: "empty" (F), "unit", "tautology" ou "clause".
 * (Uma cláusula unitária nunca é tautologia: precisa de dois literais.)
 */
export function clauseKind(clause) {
  if (isEmptyClause(clause)) return "empty";
  if (isUnitClause(clause)) return "unit";
  if (isTautology(clause)) return "tautology";
  return "clause";
}

/** Contagens do conjunto para o resumo do conversor. */
export function clauseSetSummary(clauses) {
  const kinds = clauses.map(clauseKind);
  const count = (kind) => kinds.filter((k) => k === kind).length;
  return {
    clauses: clauses.length,
    empty: count("empty"),
    unit: count("unit"),
    tautology: count("tautology"),
    kinds,
  };
}
