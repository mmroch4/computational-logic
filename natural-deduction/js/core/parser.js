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
//   negação    := ¬ negação | Qx negação | atómica | F | ( implicação )
//   atómica    := nome [ ( termos ) ] | termo = termo
//   termo      := nome [ ( termos ) ]           termos := termo { , termo }
// Q é ∀, ∃, `forall` ou `exists`, e a variável x é uma letra com dígitos opcionais, por isso
// `∀xP(x)` lê-se. Os nomes não têm tipo: `P(a)` é predicado, ou função se vier um `=` a seguir.
// O `v` é disjunção entre fórmulas e nome em posição de termo: argumento, lado de `=` ou variável de
// um quantificador. Com `metavariables`, φ, ψ e θ também são operandos; em posição de termo, t, t1 e
// t2 são metavariáveis de termo e x, y e v de variável; e `φ[t/x]` é a substituição de um esquema.

import {
  FALSUM, METAVARIABLES, TERM_METAVARIABLES, VARIABLE_METAVARIABLES, and, atom, eq, exists, forall, implies, meta,
  metaTerm, metaVariable, not, or, substituted, term,
} from "./formula.js";

/** Códigos de erro. */
export const ERROR_CODES = [
  "emptyInput", // texto vazio ou só espaços
  "tooLong", // { length, max }: mais de INPUT_LIMITS.maxChars caracteres, sem contar espaços
  "unexpectedChar", // { char }: símbolo que não pertence à notação, ou vírgula fora de argumentos
  "badVariable", // { token }: nome que não começa por letra (`1p`)
  "unbalanced", // { char }: parêntese por fechar ou fecho a mais
  "missingOperand", // { char }: operador sem fórmula de um dos lados, ou `()`
  "missingOperator", // { token }: duas fórmulas seguidas sem conectivo
  "missingVariable", // { token }: quantificador sem variável, ou com F (`∀(`, `∀F`)
  "missingTerm", // { char }: falta um termo junto de `=`, `(` ou `,` (`a =`, `P()`, `P(a,)`)
  "notATerm", // { token }: símbolo de fórmula onde vai um termo (`P(¬a)`, `a = F`)
  "badArgument", // { token }: depois de um argumento não vem `,` nem `)` (`P(a b)`, `P(a ∧ b)`)
  "badEquality", // { char }: `=` depois de algo que não é termo (`a = b = c`, `(a) = b`)
];

/**
 * Limita a profundidade da fórmula e, com ela, a recursão do parser e de quem a percorre. Não conta
 * espaços, porque `format` os acrescenta e tudo o que se lê tem de se poder reler depois de impresso.
 */
export const INPUT_LIMITS = { maxChars: 1000 };

/** Símbolos por ordem de tentativa: os de dois caracteres antes de `-` e de `=`. */
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
  ["∀", "forall"],
  ["∃", "exists"],
  ["=", "eq"],
  [",", "comma"],
];

/** Palavras que se escrevem em vez de ∀ e ∃. */
export const QUANTIFIER_WORDS = new Map([["forall", "forall"], ["exists", "exists"]]);

const WORD_RE = /[A-Za-z0-9_₀-₉]+/y;
/** Variável de um quantificador: uma letra e dígitos opcionais, depois de espaços opcionais. */
const VARIABLE_RE = /\s*([A-Za-z][0-9₀-₉]*)/y;
const SUBSCRIPT_RE = /[₀-₉]/g;

const plainDigits = (word) => word.replace(SUBSCRIPT_RE, (digit) => digit.charCodeAt(0) - 0x2080);

class ParseFailure extends Error {
  constructor(code, start, end, params = {}) {
    super(code);
    this.details = { code, params, start, end };
  }
}

/** Palavra na posição `start`: `F`, `v`, um quantificador ou um nome. */
function readWord(word, start) {
  const end = start + word.length;
  if (!/^[A-Za-z]/.test(word)) throw new ParseFailure("badVariable", start, end, { token: word });
  if (word === "F") return { type: "falsum", text: word, start, end };
  if (word === "v") return { type: "or", text: word, start, end };
  if (QUANTIFIER_WORDS.has(word)) return { type: QUANTIFIER_WORDS.get(word), text: word, start, end };
  return { type: "name", name: plainDigits(word), text: word, start, end };
}

/** Junta ao quantificador a variável que vem a seguir: o token passa a ser `∀x`, com { name }. */
function readQuantifier(text, token) {
  VARIABLE_RE.lastIndex = token.end;
  const match = VARIABLE_RE.exec(text);
  if (!match || match[1] === "F") {
    throw new ParseFailure("missingVariable", token.start, token.end, { token: token.text });
  }
  const end = VARIABLE_RE.lastIndex;
  return { ...token, name: plainDigits(match[1]), text: text.slice(token.start, end), end };
}

/** `[t/x]` logo a seguir a uma metavariável de fórmula, só nos esquemas: junta-se ao token. */
const SUBSTITUTION_RE = /\s*\[\s*([A-Za-z][0-9₀-₉]*)\s*\/\s*([A-Za-z][0-9₀-₉]*)\s*\]/y;

function readSubstitution(text, token) {
  if (!text.slice(token.end).trimStart().startsWith("[")) return token;
  SUBSTITUTION_RE.lastIndex = token.end;
  const match = SUBSTITUTION_RE.exec(text);
  const [replacement, variable] = match ? [plainDigits(match[1]), plainDigits(match[2])] : [];
  const termOk = TERM_METAVARIABLES.includes(replacement) || VARIABLE_METAVARIABLES.includes(replacement);
  if (!termOk || !VARIABLE_METAVARIABLES.includes(variable)) {
    const at = text.indexOf("[", token.end);
    throw new ParseFailure("unexpectedChar", at, at + 1, { char: "[" });
  }
  const end = SUBSTITUTION_RE.lastIndex;
  return { ...token, substitution: { replacement, variable }, text: text.slice(token.start, end), end };
}

function tokenize(text, metavariables) {
  const tokens = [];
  let pos = 0;
  const push = (token) => {
    const read = token.type === "forall" || token.type === "exists" ? readQuantifier(text, token) : token;
    tokens.push(read);
    pos = read.end;
  };
  while (pos < text.length) {
    if (/\s/.test(text[pos])) {
      pos += 1;
      continue;
    }
    const symbol = SYMBOLS.find(([written]) => text.startsWith(written, pos));
    if (symbol) {
      const [written, type] = symbol;
      push({ type, text: written, start: pos, end: pos + written.length });
      continue;
    }
    if (metavariables && METAVARIABLES.includes(text[pos])) {
      push(readSubstitution(text, { type: "meta", name: text[pos], text: text[pos], start: pos, end: pos + 1 }));
      continue;
    }
    WORD_RE.lastIndex = pos;
    const word = WORD_RE.exec(text)?.[0];
    if (word) {
      push(readWord(word, pos));
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(pos));
    throw new ParseFailure("unexpectedChar", pos, pos + char.length, { char });
  }
  return tokens;
}

/** O `v` escrito como palavra, que em posição de termo é um nome. */
const isNameV = (token) => token?.type === "or" && token.text === "v";

/** Nos esquemas, um nome sem argumentos pode ser uma metavariável de termo ou de variável. */
function schemaTerm(name, args) {
  if (args.length === 0 && TERM_METAVARIABLES.includes(name)) return metaTerm(name);
  if (args.length === 0 && VARIABLE_METAVARIABLES.includes(name)) return metaVariable(name);
  return term(name, args);
}

/** O nó de uma metavariável de fórmula, com a substituição `[t/x]` se a tiver. */
function metaOf(token) {
  if (!token.substitution) return meta(token.name);
  const { replacement, variable } = token.substitution;
  return substituted(meta(token.name), schemaTerm(replacement, []), metaVariable(variable));
}

function parseTokens(tokens, metavariables) {
  const termOf = metavariables ? schemaTerm : term;
  let pos = 0;
  const open = [];
  const peek = () => tokens[pos];
  const accept = (type) => (peek()?.type === type ? tokens[pos++] : null);

  const failAt = (code, key) => ({ text, start, end }) => new ParseFailure(code, start, end, { [key]: text });
  const unbalanced = failAt("unbalanced", "char");
  const missingOperand = failAt("missingOperand", "char");
  const missingTerm = failAt("missingTerm", "char");
  const notATerm = failAt("notATerm", "token");
  const badArgument = failAt("badArgument", "token");
  const badEquality = failAt("badEquality", "char");
  const unexpectedChar = failAt("unexpectedChar", "char");

  /** Token a mais depois de uma fórmula. A vírgula fora de argumentos é um símbolo desconhecido. */
  function stray(token) {
    if (token.type === "comma") return unexpectedChar(token);
    if (token.type === "eq") return badEquality(token);
    return failAt("missingOperator", "token")(token);
  }

  /** Fim do texto onde faltava alguma coisa: o erro fica no último token. */
  function missingAtEnd(whenOperand) {
    const last = tokens[tokens.length - 1];
    return last.type === "open" ? unbalanced(last) : whenOperand(last);
  }

  /** Argumentos `( t, … )`, com o `(` já lido. */
  function parseArguments(openToken) {
    open.push(openToken);
    const args = [];
    for (;;) {
      args.push(parseTerm());
      if (accept("comma")) continue;
      if (accept("close")) break;
      throw peek() ? badArgument(peek()) : unbalanced(openToken);
    }
    open.pop();
    return args;
  }

  /** Nome com argumentos opcionais; `token` é o nome, já lido. */
  function parseApplication(token) {
    const opened = accept("open");
    return { name: isNameV(token) ? "v" : token.name, args: opened ? parseArguments(opened) : [] };
  }

  function parseTerm() {
    const token = tokens[pos++];
    if (!token) throw missingAtEnd(missingTerm);
    if (token.type === "name" || isNameV(token)) {
      const { name, args } = parseApplication(token);
      return termOf(name, args);
    }
    if (["close", "comma", "eq"].includes(token.type)) throw missingTerm(token);
    throw notATerm(token);
  }

  /** Átomo, ou igualdade se vier um `=`; `token` é o nome, já lido. */
  function parseAtomic(token) {
    const { name, args } = parseApplication(token);
    if (!accept("eq")) {
      if (isNameV(token)) throw missingOperand(token);
      return atom(name, args);
    }
    return eq(termOf(name, args), parseTerm());
  }

  function parseOperand() {
    const token = tokens[pos++];
    if (!token) throw missingAtEnd(missingOperand);
    switch (token.type) {
      case "name":
        return parseAtomic(token);
      case "meta":
        return metaOf(token);
      case "falsum":
        return FALSUM;
      case "not":
        return not(parseOperand());
      case "forall":
        return forall(token.name, parseOperand());
      case "exists":
        return exists(token.name, parseOperand());
      case "open": {
        open.push(token);
        const inner = parseImplication();
        if (peek() && peek().type !== "close") throw stray(peek());
        if (!accept("close")) throw unbalanced(token);
        open.pop();
        return inner;
      }
      case "close":
        throw open.length > 0 ? missingOperand(token) : unbalanced(token);
      case "or":
        // `v = a` e `v(a) = b`: em posição de termo, o `v` é um nome.
        if (isNameV(token) && ["eq", "open"].includes(peek()?.type)) return parseAtomic(token);
        throw missingOperand(token);
      case "eq":
        throw missingTerm(token);
      case "comma":
        throw unexpectedChar(token);
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
  if (peek()) throw peek().type === "close" ? unbalanced(peek()) : stray(peek());
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
    return { ok: true, formula: parseTokens(tokens, metavariables) };
  } catch (failure) {
    if (failure instanceof ParseFailure) return { ok: false, error: failure.details };
    throw failure;
  }
}
