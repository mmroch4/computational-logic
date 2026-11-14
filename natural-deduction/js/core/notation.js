// Conversão de notação de um sequente ou fórmula, símbolo a símbolo. Módulo puro (sem DOM).
// Contrato:
//   convertNotation(text, "symbols" | "ascii") → texto
//   detectNotation(text) → "symbols" | "ascii" | "mixed" | null (texto sem nada a converter)
// Funciona com texto incompleto ou com erros: o que não é símbolo fica como está, espaços incluídos.
// Lê os símbolos como o parser, pelo que o texto convertido significa o mesmo.

import { QUANTIFIER_WORDS, SYMBOLS } from "./parser.js";

export const NOTATIONS = ["symbols", "ascii"];

/**
 * Na escrita ASCII, ¬ é `~` e nunca `-`: `p ∨¬q` daria `p |-q`, que se lê como ⊢. O F não muda,
 * porque é o que se mostra, e o ⊥ passa a F nas duas notações. `=` e `,` são iguais nas duas.
 */
const WRITTEN = {
  symbols: { implies: "→", and: "∧", or: "∨", not: "¬", turnstile: "⊢", falsum: "F", forall: "∀", exists: "∃" },
  ascii: { implies: "->", and: "&", or: "|", not: "~", turnstile: "|-", falsum: "F", forall: "forall", exists: "exists" },
};

const TOKENS = [["⊢", "turnstile"], ["|-", "turnstile"], ...SYMBOLS].filter(([, type]) => type in WRITTEN.symbols);

const WORD_RE = /[A-Za-z0-9_₀-₉]+/y;
const WORD_END_RE = /[A-Za-z0-9_₀-₉]$/;
const SPACE_RE = /\s*/y;
/** A variável de um quantificador, como o parser a lê. */
const VARIABLE_RE = /^[A-Za-z][0-9₀-₉]*$/;
const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";

/** Sufixo numérico em subscrito (`p12` ↔ `p₁₂`). */
function convertWord(word, target) {
  if (!/^[A-Za-z]/.test(word)) return word;
  if (target === "symbols") return word.replace(/\d+$/, (digits) => [...digits].map((digit) => SUBSCRIPTS[digit]).join(""));
  return word.replace(/[₀-₉]/g, (digit) => SUBSCRIPTS.indexOf(digit));
}

/**
 * Reescreve os símbolos de `text` na notação `target`. Segue onde se espera um operando, como o
 * parser: aí o `v` é um nome (`P(v)`, `∀v`, `a = v`); depois de um nome ou de `)`, é a disjunção.
 */
export function convertNotation(text, target) {
  const written = WRITTEN[target];
  let out = "";
  let pos = 0;
  // O que se espera a seguir: "operand", "operator" (depois de um nome ou de `)`), "variable" (logo
  // depois de um quantificador) ou "body" (depois da variável de um quantificador, também operando).
  let state = "operand";

  const quantifier = (type) => {
    // Em ASCII, `forall` precisa de espaços à volta para não se colar aos nomes.
    const word = written[type];
    const glued = /^[a-z]/.test(word);
    if (glued && WORD_END_RE.test(out)) out += " ";
    out += word;
    if (glued && pos < text.length && !/\s/.test(text[pos])) out += " ";
    state = "variable";
  };

  while (pos < text.length) {
    if (/\s/.test(text[pos])) {
      out += text[pos];
      pos += 1;
      continue;
    }
    const token = TOKENS.find(([symbol]) => text.startsWith(symbol, pos));
    if (token) {
      const [symbol, type] = token;
      pos += symbol.length;
      if (type === "forall" || type === "exists") {
        quantifier(type);
        continue;
      }
      out += written[type];
      state = type === "falsum" ? "operator" : "operand";
      continue;
    }
    WORD_RE.lastIndex = pos;
    const word = WORD_RE.exec(text)?.[0];
    if (word) {
      pos += word.length;
      if (QUANTIFIER_WORDS.has(word)) {
        if (target === "symbols") {
          // `forall x forall y` dá `∀x∀y`, como se imprime.
          if (state === "body") out = out.trimEnd();
          SPACE_RE.lastIndex = pos;
          SPACE_RE.exec(text);
          pos = SPACE_RE.lastIndex;
        }
        quantifier(QUANTIFIER_WORDS.get(word));
        continue;
      }
      if (word === "v" && state === "operator") {
        out += written.or;
        state = "operand";
        continue;
      }
      out += convertWord(word, target);
      state = state === "variable" && VARIABLE_RE.test(word) ? "body" : "operator";
      continue;
    }
    out += text[pos];
    state = text[pos] === ")" ? "operator" : "operand";
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
