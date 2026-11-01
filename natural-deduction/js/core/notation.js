// Conversão de notação de um sequente ou fórmula, símbolo a símbolo. Módulo puro (sem DOM).
// Contrato:
//   convertNotation(text, "symbols" | "ascii") → texto
//   detectNotation(text) → "symbols" | "ascii" | "mixed" | null (texto sem nada a converter)
// Funciona com texto incompleto ou com erros: o que não é símbolo fica como está, espaços incluídos.
// Lê os símbolos como o parser, pelo que o texto convertido significa o mesmo.

import { SYMBOLS } from "./parser.js";

export const NOTATIONS = ["symbols", "ascii"];

/**
 * Na escrita ASCII, ¬ é `~` e nunca `-`: `p ∨¬q` daria `p |-q`, que se lê como ⊢. O F não muda,
 * porque é o que se mostra, e o ⊥ passa a F nas duas notações.
 */
const WRITTEN = {
  symbols: { implies: "→", and: "∧", or: "∨", not: "¬", turnstile: "⊢", falsum: "F" },
  ascii: { implies: "->", and: "&", or: "|", not: "~", turnstile: "|-", falsum: "F" },
};

const TOKENS = [["⊢", "turnstile"], ["|-", "turnstile"], ...SYMBOLS].filter(([, type]) => type in WRITTEN.symbols);

const WORD_RE = /[A-Za-z0-9_₀-₉]+/y;
const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";

/** Sufixo numérico em subscrito (`p12` ↔ `p₁₂`); o `v` isolado é a disjunção. */
function convertWord(word, written, target) {
  if (word === "v") return written.or;
  if (!/^[A-Za-z]/.test(word)) return word;
  if (target === "symbols") return word.replace(/\d+$/, (digits) => [...digits].map((digit) => SUBSCRIPTS[digit]).join(""));
  return word.replace(/[₀-₉]/g, (digit) => SUBSCRIPTS.indexOf(digit));
}

/** Reescreve os símbolos de `text` na notação `target`. */
export function convertNotation(text, target) {
  const written = WRITTEN[target];
  let out = "";
  let pos = 0;
  while (pos < text.length) {
    const token = TOKENS.find(([symbol]) => text.startsWith(symbol, pos));
    if (token) {
      out += written[token[1]];
      pos += token[0].length;
      continue;
    }
    WORD_RE.lastIndex = pos;
    const word = WORD_RE.exec(text)?.[0];
    if (word) {
      out += convertWord(word, written, target);
      pos += word.length;
      continue;
    }
    out += text[pos];
    pos += 1;
  }
  return out;
}

/** Em que notação está o texto; null se as duas o escreverem da mesma maneira. */
export function detectNotation(text) {
  const isSymbols = convertNotation(text, "symbols") === text;
  const isAscii = convertNotation(text, "ascii") === text;
  if (isSymbols && isAscii) return null;
  if (isSymbols) return "symbols";
  return isAscii ? "ascii" : "mixed";
}
