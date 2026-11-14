// Sequentes: `p ∧ q, r ⊢ q ∧ r` e, sem premissas, `⊢ p → p`. Módulo puro (sem DOM).
// Contrato:
//   parseSequent(text) → { ok: true, sequent: { premises, conclusion } }
//                      | { ok: false, error: { code, params, start, end } }
//   isPropositionalSequent(sequent) → boolean: sem quantificadores, termos nem `=`
// As posições são índices em `text`, mesmo nos erros que vêm de `parseFormula`. As mensagens estão
// em `parser.errors.*`, junto das do parser. O limite de tamanho aplica-se a cada fórmula.

import { format, isPropositional } from "./formula.js";
import { parseFormula } from "./parser.js";

/** Códigos de erro próprios dos sequentes; os outros são os `ERROR_CODES` do parser. */
export const SEQUENT_ERROR_CODES = [
  "missingTurnstile", // o texto não tem ⊢
  "multipleTurnstiles", // { token }: segundo ⊢
  "multipleConclusions", // vírgula depois do ⊢
  "emptyPremise", // vírgula sem premissa de um dos lados
  "missingConclusion", // { token }: nada depois do ⊢
];

/**
 * `|-` é sempre o ⊢, mesmo que pudesse ler-se como `| -`. Para escrever p ∨ ¬q com estes símbolos,
 * usa-se um espaço: `p | -q`. As vírgulas entre os argumentos de `P(a, b)` não separam premissas: são
 * as que estão dentro de um parêntese aberto logo a seguir a um nome. Nos outros parênteses separam,
 * para `p, (q, r) ⊢ s` dar o mesmo erro que antes da 1.ª ordem.
 */
const SEPARATOR_RE = /⊢|\|-|,|\(|\)/g;
const WORD_END_RE = /([A-Za-z0-9_₀-₉]+)\s*$/;

/** Indica se o texto acaba num nome, que não `v` nem `F`: um `(` a seguir abre argumentos. */
const endsInName = (text) => !["v", "F", undefined].includes(WORD_END_RE.exec(text)?.[1]);

/** Os ⊢ e as vírgulas que separam, com a posição de cada um. */
function separatorsOf(text) {
  const separators = [];
  const open = []; // true para os parênteses de argumentos
  for (const { 0: written, index } of text.matchAll(SEPARATOR_RE)) {
    if (written === "(") open.push(endsInName(text.slice(0, index)));
    else if (written === ")") open.pop();
    else {
      if (written !== ",") open.length = 0;
      else if (open[open.length - 1]) continue;
      separators.push({ written, start: index, end: index + written.length });
    }
  }
  return separators;
}

const failure = (code, start, end, params = {}) => ({ ok: false, error: { code, params, start, end } });

/** Sequente imutável. */
export function sequent(premises, conclusion) {
  return Object.freeze({ premises: Object.freeze([...premises]), conclusion });
}

/** Lê `text[start..end)` como fórmula, com as posições dos erros relativas a `text`. */
function parseSlice(text, start, end) {
  const result = parseFormula(text.slice(start, end));
  if (result.ok) return result;
  const { start: from, end: to } = result.error;
  return { ok: false, error: { ...result.error, start: from + start, end: to + start } };
}

/** Lê um sequente em qualquer uma das notações aceites. */
export function parseSequent(text) {
  if (text.trim() === "") return failure("emptyInput", 0, text.length);

  const separators = separatorsOf(text);
  const [turnstile, secondTurnstile] = separators.filter(({ written }) => written !== ",");
  if (!turnstile) return failure("missingTurnstile", 0, text.length);
  if (secondTurnstile) {
    const { written, start, end } = secondTurnstile;
    return failure("multipleTurnstiles", start, end, { token: written });
  }

  const commas = separators.filter(({ written }) => written === ",");
  const extraComma = commas.find(({ start }) => start > turnstile.start);
  if (extraComma) return failure("multipleConclusions", extraComma.start, extraComma.end);

  const premises = [];
  if (text.slice(0, turnstile.start).trim() !== "") {
    let start = 0;
    for (const end of [...commas, turnstile]) {
      if (text.slice(start, end.start).trim() === "") {
        // Em `p, ⊢ q` falta a premissa depois da vírgula, e em `, p ⊢ q` antes dela.
        const comma = end === turnstile ? commas[commas.length - 1] : end;
        return failure("emptyPremise", comma.start, comma.end);
      }
      const premise = parseSlice(text, start, end.start);
      if (!premise.ok) return premise;
      premises.push(premise.formula);
      start = end.end;
    }
  } else if (commas.length > 0) {
    return failure("emptyPremise", commas[0].start, commas[0].end);
  }

  if (text.slice(turnstile.end).trim() === "") {
    return failure("missingConclusion", turnstile.start, turnstile.end, { token: turnstile.written });
  }
  const conclusion = parseSlice(text, turnstile.end, text.length);
  if (!conclusion.ok) return conclusion;
  return { ok: true, sequent: sequent(premises, conclusion.formula) };
}

/** Se o sequente é proposicional: todas as premissas e a conclusão o são. */
export function isPropositionalSequent({ premises, conclusion }) {
  return premises.every(isPropositional) && isPropositional(conclusion);
}

/** Imprime o sequente; `parseSequent` volta a lê-lo. */
export function formatSequent({ premises, conclusion }) {
  const left = premises.map(format).join(", ");
  return left ? `${left} ⊢ ${format(conclusion)}` : `⊢ ${format(conclusion)}`;
}
