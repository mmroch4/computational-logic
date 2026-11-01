// Parser: texto → fórmula.
// Contrato:
//   parseFormula(text, { metavariables }) → { ok: true, formula }
//                                         | { ok: false, error: { code, params, start, end } }
// As posições são índices no texto original (end exclusivo), para a UI sublinhar o erro. Os códigos
// são estáveis e têm mensagem em `parser.errors.*` nos locales. Módulo puro (sem DOM).
//
// Gramática, do que liga menos para o que liga mais:
//   implicação := disjunção [ → implicação ]
//   disjunção  := conjunção { ∨ conjunção }
//   conjunção  := negação { ∧ negação }
//   negação    := ¬ negação | átomo | F | ( implicação )
// Com `metavariables`, φ, ψ e θ também são operandos.

import { FALSUM, METAVARIABLES, and, atom, implies, meta, not, or } from "./formula.js";

/** Códigos de erro. */
export const ERROR_CODES = [
  "emptyInput", // texto vazio ou só espaços
  "tooLong", // { length, max }: mais de INPUT_LIMITS.maxChars caracteres, sem contar espaços
  "unexpectedChar", // { char }: símbolo que não pertence à notação
  "badVariable", // { token }: nome que não começa por letra (`1p`)
  "unbalanced", // { char }: parêntese por fechar ou fecho a mais
  "missingOperand", // { char }: operador sem fórmula de um dos lados, ou `()`
  "missingOperator", // { token }: duas fórmulas seguidas sem conectivo
];

/**
 * Limita a profundidade da fórmula e, com ela, a recursão do parser e de quem a percorre. Não conta
 * espaços, porque `format` os acrescenta e tudo o que se lê tem de se poder reler depois de impresso.
 */
export const INPUT_LIMITS = { maxChars: 1000 };

/** Símbolos por ordem de tentativa: os de dois caracteres antes de `-`. */
export const SYMBOLS = [
  ["->", "implies"],
  ["=>", "implies"],
  ["/\\", "and"],
  ["\\/", "or"],
  ["→", "implies"],
  ["∧", "and"],
  ["&", "and"],
  ["^", "and"],
  ["∨", "or"],
  ["|", "or"],
  ["¬", "not"],
  ["~", "not"],
  ["-", "not"],
  ["!", "not"],
  ["(", "open"],
  [")", "close"],
  ["⊥", "falsum"],
];

const WORD_RE = /[A-Za-z0-9_₀-₉]+/y;
const SUBSCRIPT_RE = /[₀-₉]/g;

const plainDigits = (word) => word.replace(SUBSCRIPT_RE, (digit) => digit.charCodeAt(0) - 0x2080);

class ParseFailure extends Error {
  constructor(code, start, end, params = {}) {
    super(code);
    this.details = { code, params, start, end };
  }
}

/** Palavra na posição `start`: `F`, `v`, ou o nome de um átomo. */
function readWord(word, start) {
  const end = start + word.length;
  if (!/^[A-Za-z]/.test(word)) throw new ParseFailure("badVariable", start, end, { token: word });
  if (word === "F") return { type: "falsum", text: word, start, end };
  if (word === "v") return { type: "or", text: word, start, end };
  return { type: "name", name: plainDigits(word), text: word, start, end };
}

function tokenize(text, metavariables) {
  const tokens = [];
  let pos = 0;
  while (pos < text.length) {
    if (/\s/.test(text[pos])) {
      pos += 1;
      continue;
    }
    const symbol = SYMBOLS.find(([written]) => text.startsWith(written, pos));
    if (symbol) {
      const [written, type] = symbol;
      tokens.push({ type, text: written, start: pos, end: pos + written.length });
      pos += written.length;
      continue;
    }
    if (metavariables && METAVARIABLES.includes(text[pos])) {
      tokens.push({ type: "meta", name: text[pos], text: text[pos], start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }
    WORD_RE.lastIndex = pos;
    const word = WORD_RE.exec(text)?.[0];
    if (word) {
      tokens.push(readWord(word, pos));
      pos += word.length;
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(pos));
    throw new ParseFailure("unexpectedChar", pos, pos + char.length, { char });
  }
  return tokens;
}

function parseTokens(tokens) {
  let pos = 0;
  const open = [];
  const peek = () => tokens[pos];
  const accept = (type) => (peek()?.type === type ? tokens[pos++] : null);

  const missingOperator = ({ text, start, end }) =>
    new ParseFailure("missingOperator", start, end, { token: text });
  const unbalanced = ({ text, start, end }) => new ParseFailure("unbalanced", start, end, { char: text });
  const missingOperand = ({ text, start, end }) =>
    new ParseFailure("missingOperand", start, end, { char: text });

  function parseOperand() {
    const token = tokens[pos++];
    if (!token) {
      const last = tokens[tokens.length - 1];
      throw last.type === "open" ? unbalanced(last) : missingOperand(last);
    }
    switch (token.type) {
      case "name":
        return atom(token.name);
      case "meta":
        return meta(token.name);
      case "falsum":
        return FALSUM;
      case "not":
        return not(parseOperand());
      case "open": {
        open.push(token);
        const inner = parseImplication();
        if (peek() && peek().type !== "close") throw missingOperator(peek());
        if (!accept("close")) throw unbalanced(token);
        open.pop();
        return inner;
      }
      case "close":
        throw open.length > 0 ? missingOperand(token) : unbalanced(token);
      default:
        throw missingOperand(token);
    }
  }

  function parseChain(type, build, parseNext) {
    let left = parseNext();
    while (accept(type)) left = build(left, parseNext());
    return left;
  }

  const parseConjunction = () => parseChain("and", and, parseOperand);
  const parseDisjunction = () => parseChain("or", or, parseConjunction);

  function parseImplication() {
    const left = parseDisjunction();
    return accept("implies") ? implies(left, parseImplication()) : left;
  }

  const formula = parseImplication();
  if (peek()) throw peek().type === "close" ? unbalanced(peek()) : missingOperator(peek());
  return formula;
}

/** Lê uma fórmula em qualquer uma das notações aceites. */
export function parseFormula(text, { metavariables = false } = {}) {
  try {
    const { maxChars } = INPUT_LIMITS;
    const length = text.replace(/\s/g, "").length;
    if (length > maxChars) throw new ParseFailure("tooLong", 0, text.length, { length, max: maxChars });
    const tokens = tokenize(text, metavariables);
    if (tokens.length === 0) throw new ParseFailure("emptyInput", 0, text.length);
    return { ok: true, formula: parseTokens(tokens) };
  } catch (failure) {
    if (failure instanceof ParseFailure) return { ok: false, error: failure.details };
    throw failure;
  }
}
