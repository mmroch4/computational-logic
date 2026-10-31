// Literais: uma variável proposicional, possivelmente negada.
// Representação: { v: "p1", neg: false }. Texto canónico: "p1" / "-p1".
// Módulo puro (sem DOM), usado pelo parser, pelo solver e pela UI.

/** Nomes de variáveis válidos (iguais ao CLAUDE.md). */
export const VARIABLE_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Cria um literal. */
export function lit(v, neg = false) {
  return { v, neg: Boolean(neg) };
}

/** Complemento l̃: p ↦ ¬p e ¬p ↦ p. */
export function complement(l) {
  return { v: l.v, neg: !l.neg };
}

/** Chave canónica (texto compacto) — serve para comparar e para usar em Set/Map. */
export function literalKey(l) {
  return l.neg ? `-${l.v}` : l.v;
}

/** Inverso de literalKey: "-p1" → { v: "p1", neg: true }. */
export function literalFromKey(key) {
  return key.startsWith("-") ? lit(key.slice(1), true) : lit(key, false);
}

export function sameLiteral(a, b) {
  return a.v === b.v && a.neg === b.neg;
}

/** a e b são complementares (mesma variável, sinais opostos)? */
export function isComplement(a, b) {
  return a.v === b.v && a.neg !== b.neg;
}

/**
 * Ordem alfabética natural de variáveis: os números são comparados pelo valor,
 * por isso p2 < p11 (e não "p11" < "p2" como na ordem de texto).
 */
export function compareVariables(a, b) {
  const pa = a.match(/\d+|\D+/g) || [];
  const pb = b.match(/\d+|\D+/g) || [];
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === y) continue;
    const xNum = /^\d/.test(x);
    const yNum = /^\d/.test(y);
    if (xNum && yNum) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
      return x.length - y.length; // "p01" depois de "p1"
    }
    return x < y ? -1 : 1;
  }
  return pa.length - pb.length;
}

/** Ordem de literais: pela variável; para a mesma variável, o positivo primeiro. */
export function compareLiterals(a, b) {
  return compareVariables(a.v, b.v) || Number(a.neg) - Number(b.neg);
}

/**
 * Separa o sufixo numérico para o mostrar em subscrito: "p11" → { base: "p", index: "11" }.
 * Sem sufixo numérico: index = "".
 */
export function splitVariable(v) {
  const m = v.match(/^(.*\D)(\d+)$/);
  return m ? { base: m[1], index: m[2] } : { base: v, index: "" };
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toSubscript(digits) {
  return [...digits].map((d) => SUBSCRIPT_DIGITS[Number(d)]).join("");
}

function escapeLatexName(text) {
  return text.replace(/_/g, "\\_");
}

/** Variável formatada: unicode "p₁₁", compact "p11", latex "p_{11}". */
export function formatVariable(v, mode = "unicode") {
  if (mode === "compact") return v;
  const { base, index } = splitVariable(v);
  if (mode === "latex") return escapeLatexName(base) + (index ? `_{${index}}` : "");
  return base + toSubscript(index);
}

/** Literal formatado: unicode "¬p₁", compact "-p1", latex "\neg p_{1}". */
export function formatLiteral(l, mode = "unicode") {
  const name = formatVariable(l.v, mode);
  if (!l.neg) return name;
  if (mode === "compact") return `-${name}`;
  if (mode === "latex") return `\\neg ${name}`;
  return `¬${name}`;
}
