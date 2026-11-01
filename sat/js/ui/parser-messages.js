// Mensagens do parser: transforma { code, params } (erros e avisos de js/core/parser.js)
// em texto no idioma atual. O core só devolve códigos; o texto vive em locales/{pt,en}.js.
import { t } from "./i18n.js";
import { formatLiteral, literalFromKey } from "../core/literals.js";
import { formatClause } from "../core/clauses.js";

/**
 * Mensagem de um erro de parse. Com `withPosition` acrescenta "(posição N)", contada a partir de 1.
 * O erro `notCNF` tem uma mensagem por motivo (params.reason).
 */
export function parserErrorMessage(error, { withPosition = true } = {}) {
  const params = error.params ?? {};
  const key = error.code === "notCNF" ? `parser.errors.notCNF.${params.reason}` : `parser.errors.${error.code}`;
  const message = t(key, params);
  if (!withPosition || typeof error.start !== "number") return message;
  return t("parser.atPosition", { message, pos: error.start + 1 });
}

/**
 * Mensagem de um aviso. Os índices vêm a partir de 0 e são mostrados a partir de 1; literais e
 * cláusulas (em texto compacto no core) são mostrados com ¬, ∨ e subscritos (¬p₁ ∨ q).
 */
export function parserWarningMessage(warning) {
  const params = warning.params ?? {};
  const shown = { ...params, n: (params.index ?? 0) + 1 };
  if (params.literal !== undefined) shown.literal = formatLiteral(literalFromKey(params.literal));
  if (params.clause !== undefined) shown.clause = formatClause(clauseFromCompact(params.clause));
  // Nº máximo de ramos da árvore, 2 elevado ao nº de variáveis, com o expoente em sobrescrito (2²⁵).
  if (warning.code === "manyVariables") shown.branches = `2${superscript(params.count)}`;
  return t(`parser.warnings.${warning.code}`, shown);
}

// "-p1 q" → [¬p1, q]. A cláusula vazia vem como "F".
function clauseFromCompact(text) {
  if (text === "F") return [];
  return text.split(/\s+/).filter(Boolean).map(literalFromKey);
}

const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

// 25 → "²⁵"
function superscript(number) {
  return String(number).replace(/\d/g, (digit) => SUPERSCRIPT_DIGITS[digit]);
}
