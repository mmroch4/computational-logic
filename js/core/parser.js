// Parser: texto do aluno → ClauseSet.
// Contrato:
//   parse(text) → { ok: true, clauses, notation, warnings: [{ code, params }] }
//               | { ok: false, error: { code, params, start, end } }
// As posições start/end são índices no texto original (end exclusivo), para a UI sublinhar o erro.
// Módulo puro (sem DOM).
//
// Notações: "compact" (M1.2), "sets" (M1.3) e "logic" (M1.4), detetadas automaticamente
// por detectNotation (M1.5). Os códigos de erro e de aviso são estáveis (ver ERROR_CODES e
// WARNING_CODES) e a UI traduz cada um (js/ui/parser-messages.js).

import { lit } from "./literals.js";
import { dedupeClauses, dedupeLiterals, formatClause, isTautology, variablesOf } from "./clauses.js";
import { DEFAULT_MAX_STEPS } from "./dll.js";

/** Símbolos de negação aceites como prefixo de um literal. */
const NEGATIONS = "-¬~!";

/** Caracteres que podem aparecer num nome de variável (o 1.º tem de ser letra). */
const NAME_CHAR_RE = /[A-Za-z0-9_]/;

/** Códigos de erro (estáveis: a UI tem uma mensagem para cada um). */
export const ERROR_CODES = [
  "emptyInput", // texto vazio ou só espaços
  "emptyClause", // vírgula sem cláusula antes/depois (`p, , q`); a cláusula vazia escreve-se F
  "unexpectedChar", // { char }: símbolo que não pertence à notação
  "badVariable", // { token }: nome que não começa por letra (`1p`) ou negação sozinha (`-`)
  "reservedF", // F junto de outros literais ou negado: F só pode ser a cláusula vazia
  "unbalanced", // { char }: chaveta ou parêntese por fechar, ou fecho a mais
  "missingSeparator", // { token }: dois literais seguidos sem vírgula/∨
  "missingOperand", // { char }: operador sem literal de um dos lados
  "notCNF", // { char, reason }: a fórmula não está em FNC
  "tooLong", // { length, max }: texto com mais de INPUT_LIMITS.maxChars caracteres
  "tooManyClauses", // { count, max }: mais cláusulas do que INPUT_LIMITS.maxClauses (sem posição)
  "tooManyVariables", // { count, max }: mais variáveis do que INPUT_LIMITS.maxVariables (sem posição)
];

/**
 * Limites do tamanho da entrada. Protegem a página: acima disto o ecrã ficava lento e, com
 * muitas variáveis, a recursão do DLL (uma chamada por ramificação) podia esgotar a pilha.
 * Acima de `manyVariables` variáveis o parse corre bem, mas avisa que a árvore pode crescer muito.
 */
export const INPUT_LIMITS = { maxChars: 20000, maxClauses: 500, maxVariables: 100, manyVariables: 20 };

/** Motivos do erro `notCNF`. */
export const NOT_CNF_REASONS = ["negation", "andInsideOr", "implication", "equivalence"];

/** Códigos de aviso (o parse corre bem, mas o aluno deve saber). */
export const WARNING_CODES = [
  "duplicateLiteral", // { index, literal }: literal repetido numa cláusula
  "duplicateClause", // { index, clause }: cláusula repetida no conjunto
  "tautology", // { index, clause }: cláusula com l e l̃ (o DLL não a remove)
  "manyVariables", // { count, maxSteps }: mais de INPUT_LIMITS.manyVariables variáveis
];

/** Notações aceites. */
export const NOTATIONS = ["compact", "sets", "logic"];

function fail(code, start, end, params = {}) {
  return { ok: false, error: { code, params, start, end } };
}

/**
 * Lê um literal a partir do token `token` que começa na posição `start` do texto.
 * Devolve { literal } ou { error }.
 */
function readLiteral(token, start) {
  const neg = NEGATIONS.includes(token[0]);
  const nameStart = neg ? 1 : 0;
  const name = token.slice(nameStart);

  if (name === "") {
    return fail("badVariable", start, start + token.length, { token });
  }
  for (let i = 0; i < name.length; i++) {
    if (!NAME_CHAR_RE.test(name[i])) {
      const at = start + nameStart + i;
      return fail("unexpectedChar", at, at + 1, { char: name[i] });
    }
  }
  if (!/^[A-Za-z]/.test(name)) {
    return fail("badVariable", start, start + token.length, { token });
  }
  return { literal: lit(name, neg), start, end: start + token.length };
}

/**
 * Junta os literais lidos ({ literal, start, end }) numa cláusula.
 * `F` só pode aparecer sozinho (e não negado) e significa a cláusula vazia.
 * Devolve { clause } ou um erro `reservedF`.
 */
function clauseFromLiterals(items) {
  const f = items.find((t) => t.literal.v === "F");
  if (!f) return { clause: items.map((t) => t.literal) };
  if (items.length > 1 || f.literal.neg) return fail("reservedF", f.start, f.end);
  return { clause: [] };
}

/**
 * Notação compacta: `p1, -p1 -p2, p3 p2`.
 * - Cláusulas separadas por vírgulas (ou mudanças de linha); literais separados por espaços.
 * - Negação: `-`, `¬`, `~` ou `!` colado à variável.
 * - `F` sozinho numa cláusula é a cláusula vazia.
 * Devolve { ok, clauses } com as cláusulas tal como escritas (sem dedupe) ou um erro.
 */
export function parseCompactRaw(text) {
  const clauses = [];
  let current = []; // literais lidos da cláusula atual: { literal, start, end }
  let lastComma = null; // posição da última vírgula (para apontar cláusulas vazias)

  // Fecha a cláusula atual.
  const closeClause = () => {
    const result = clauseFromLiterals(current);
    if (result.error) return result;
    clauses.push(result.clause);
    current = [];
    return null;
  };

  // Tokens: vírgula, mudança de linha ou uma sequência sem espaços nem vírgulas.
  const TOKEN_RE = /,|\n|[^\s,]+/g;
  let match;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const token = match[0];
    const start = match.index;

    if (token === ",") {
      if (current.length === 0) return fail("emptyClause", start, start + 1);
      const error = closeClause();
      if (error) return error;
      lastComma = start;
    } else if (token === "\n") {
      // Uma mudança de linha também separa cláusulas; linhas em branco são ignoradas.
      if (current.length > 0) {
        const error = closeClause();
        if (error) return error;
        lastComma = null;
      }
    } else {
      const read = readLiteral(token, start);
      if (read.error) return read;
      current.push(read);
    }
  }

  if (current.length > 0) {
    const error = closeClause();
    if (error) return error;
  } else if (lastComma !== null) {
    // Vírgula no fim: falta a última cláusula.
    return fail("emptyClause", lastComma, lastComma + 1);
  }

  if (clauses.length === 0) return fail("emptyInput", 0, text.length);
  return { ok: true, clauses };
}

/**
 * Tokens das notações de conjuntos e lógica: { type, text, start, end }.
 * Tipos: "{", "}", ",", "(", ")", "or" (∨ | \/ ou `v` isolado), "and" (∧ & /\ ^),
 * "imp" (→ ⇒ -> =>), "iff" (↔ ⇔ <-> <=>), "neg" (- ¬ ~ !), "name".
 * Espaços e mudanças de linha são ignorados.
 */
const SYMBOLS = [
  // Os de vários caracteres primeiro, para `->` não ser lido como negação.
  ["<->", "iff"], ["<=>", "iff"], ["->", "imp"], ["=>", "imp"], ["\\/", "or"], ["/\\", "and"],
  ["{", "{"], ["}", "}"], [",", ","], ["(", "("], [")", ")"],
  ["∨", "or"], ["|", "or"], ["∧", "and"], ["&", "and"], ["^", "and"],
  ["→", "imp"], ["⇒", "imp"], ["↔", "iff"], ["⇔", "iff"],
  ...[...NEGATIONS].map((ch) => [ch, "neg"]),
];

function tokenize(text) {
  const tokens = [];
  let i = 0;
  scan: while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    for (const [symbol, type] of SYMBOLS) {
      if (text.startsWith(symbol, i)) {
        tokens.push({ type, text: symbol, start: i, end: i + symbol.length });
        i += symbol.length;
        continue scan;
      }
    }
    if (NAME_CHAR_RE.test(ch)) {
      let j = i;
      while (j < text.length && NAME_CHAR_RE.test(text[j])) j++;
      const name = text.slice(i, j);
      // `v` sozinho é a disjunção (estilo ASCII); `v1`, `vx`… continuam a ser variáveis.
      const type = name === "v" ? "or" : "name";
      tokens.push({ type, text: name, start: i, end: j });
      i = j;
    } else {
      return fail("unexpectedChar", i, i + 1, { char: ch });
    }
  }
  return { tokens };
}

/**
 * Notação de conjuntos. Aceita as duas formas habituais (e misturas):
 * - conjunto de conjuntos: `{{p, ¬q}, {q}}` (literais separados por vírgulas);
 * - com disjunções: `{p ∨ ¬q, q}` (cada cláusula é uma disjunção, com parênteses opcionais).
 * `{}` é o conjunto vazio; `{{}}` e `{F}` contêm a cláusula vazia.
 * Devolve { ok, clauses } com as cláusulas tal como escritas (sem dedupe) ou um erro.
 */
export function parseSetsRaw(text) {
  const tokenized = tokenize(text);
  if (tokenized.error) return tokenized;
  const tokens = tokenized.tokens;
  if (tokens.length === 0) return fail("emptyInput", 0, text.length);

  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  // Token inesperado (ou fim do texto quando falta fechar `open`).
  const unexpected = (token, open) => {
    if (!token) return fail("unbalanced", open.start, open.end, { char: open.text });
    if (token.type === "name") return fail("missingSeparator", token.start, token.end, { token: token.text });
    return fail("unexpectedChar", token.start, token.end, { char: token.text });
  };

  // literal := neg? name   (devolve { literal, start, end } ou um erro)
  const readSetLiteral = (open) => {
    const first = peek();
    let neg = false;
    if (first && first.type === "neg") {
      neg = true;
      next();
    }
    const nameToken = peek();
    if (!nameToken || nameToken.type !== "name") return unexpected(nameToken, open);
    next();
    if (!/^[A-Za-z]/.test(nameToken.text)) {
      return fail("badVariable", nameToken.start, nameToken.end, { token: nameToken.text });
    }
    return { literal: lit(nameToken.text, neg), start: (neg ? first : nameToken).start, end: nameToken.end };
  };

  // Cláusula como conjunto: `{p, ¬q}` ou `{}` (o `{` já foi lido).
  const readInnerSet = (open) => {
    const items = [];
    if (peek() && peek().type === "}") {
      next();
      return { clause: [] };
    }
    for (;;) {
      const read = readSetLiteral(open);
      if (read.error) return read;
      items.push(read);
      const token = next();
      if (token && token.type === "}") break;
      if (!token || token.type !== ",") return unexpected(token, open);
    }
    return clauseFromLiterals(items);
  };

  // Cláusula como disjunção: `p ∨ ¬q` ou `(p ∨ ¬q)`.
  const readDisjunction = (open) => {
    let paren = null;
    if (peek() && peek().type === "(") paren = next();
    const items = [];
    for (;;) {
      const read = readSetLiteral(paren || open);
      if (read.error) return read;
      items.push(read);
      if (!peek() || peek().type !== "or") break;
      next();
    }
    if (paren) {
      const close = next();
      if (!close || close.type !== ")") return unexpected(close, paren);
    }
    return clauseFromLiterals(items);
  };

  // conjunto := '{' [elemento (',' elemento)*] '}'
  const open = next();
  if (open.type !== "{") return unexpected(open, open);
  const clauses = [];

  if (peek() && peek().type === "}") {
    next(); // `{}`: conjunto vazio
  } else {
    for (;;) {
      const token = peek();
      if (!token) return unexpected(token, open);
      if (token.type === "," || token.type === "}") {
        // `{p, , q}` ou `{p, }`: falta uma cláusula entre as vírgulas.
        return fail("emptyClause", token.start, token.end);
      }
      const read = token.type === "{" ? readInnerSet(next()) : readDisjunction(open);
      if (read.error) return read;
      clauses.push(read.clause);
      const sep = next();
      if (sep && sep.type === "}") break;
      if (!sep || sep.type !== ",") return unexpected(sep, open);
    }
  }

  // Depois do `}` final não pode haver mais nada.
  const extra = peek();
  if (extra) {
    if (extra.type === "}") return fail("unbalanced", extra.start, extra.end, { char: "}" });
    return fail("unexpectedChar", extra.start, extra.end, { char: extra.text });
  }
  return { ok: true, clauses };
}

/** Operadores binários da notação lógica, do mais fraco para o mais forte. */
const BINARY_LEVELS = ["iff", "imp", "or", "and"];

/**
 * Lê a notação lógica para uma árvore sintática, com a precedência habitual
 * ¬ > ∧ > ∨ > → > ↔ (por isso `p ∨ q ∧ r` é `p ∨ (q ∧ r)`).
 * Nós: { type: "var", name, start, end } | { type: "not", op, arg }
 *    | { type: "and" | "or" | "imp" | "iff", op, left, right }   (op = token do operador)
 * Devolve { tree } ou um erro de sintaxe.
 */
function parseLogicTree(tokens, text) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  // Falta um operando: aponta o operador que ficou sem nada à direita (ou o texto todo).
  const missingOperand = () => {
    const before = tokens[pos - 1];
    if (before) return fail("missingOperand", before.start, before.end, { char: before.text });
    return fail("emptyInput", 0, text.length);
  };

  // operando := neg operando | '(' fórmula ')' | name
  const readOperand = () => {
    const token = peek();
    if (!token) return missingOperand();
    if (token.type === "neg") {
      next();
      const arg = readOperand();
      if (arg.error) return arg;
      return { tree: { type: "not", op: token, arg: arg.tree } };
    }
    if (token.type === "(") {
      next();
      const inner = readLevel(0);
      if (inner.error) return inner;
      const close = next();
      if (!close) return fail("unbalanced", token.start, token.end, { char: "(" });
      if (close.type !== ")") return unexpectedToken(close);
      return inner;
    }
    if (token.type === "name") {
      next();
      if (!/^[A-Za-z]/.test(token.text)) {
        return fail("badVariable", token.start, token.end, { token: token.text });
      }
      return { tree: { type: "var", name: token.text, start: token.start, end: token.end } };
    }
    if (BINARY_LEVELS.includes(token.type)) {
      // `∨ p` ou `p ∧ ∨ q`: o operador aparece onde devia estar um literal.
      return fail("missingOperand", token.start, token.end, { char: token.text });
    }
    if (token.type === ")") return fail("unbalanced", token.start, token.end, { char: ")" });
    return fail("unexpectedChar", token.start, token.end, { char: token.text });
  };

  // Um token que não pode vir depois de um operando completo.
  const unexpectedToken = (token) => {
    if (token.type === "name") return fail("missingSeparator", token.start, token.end, { token: token.text });
    if (token.type === ")") return fail("unbalanced", token.start, token.end, { char: ")" });
    return fail("unexpectedChar", token.start, token.end, { char: token.text });
  };

  // nível k := nível k+1 (op_k nível k+1)*   (associatividade à esquerda; ∧ e ∨ são associativos)
  const readLevel = (level) => {
    if (level === BINARY_LEVELS.length) return readOperand();
    let left = readLevel(level + 1);
    if (left.error) return left;
    while (peek() && peek().type === BINARY_LEVELS[level]) {
      const op = next();
      const right = readLevel(level + 1);
      if (right.error) return right;
      left = { tree: { type: op.type, op, left: left.tree, right: right.tree } };
    }
    return left;
  };

  const result = readLevel(0);
  if (result.error) return result;
  if (peek()) return unexpectedToken(peek());
  return result;
}

/** Erro `notCNF` a apontar o operador `op`, com o motivo (para a mensagem da UI). */
function notCNF(op, reason) {
  return fail("notCNF", op.start, op.end, { char: op.text, reason });
}

/** Árvore → lista de literais de uma cláusula ({ literal, start, end }), ou erro `notCNF`. */
function clauseItemsFromTree(tree) {
  if (tree.type === "or") {
    const left = clauseItemsFromTree(tree.left);
    if (left.error) return left;
    const right = clauseItemsFromTree(tree.right);
    if (right.error) return right;
    return { items: [...left.items, ...right.items] };
  }
  if (tree.type === "var") return { items: [{ literal: lit(tree.name, false), start: tree.start, end: tree.end }] };
  if (tree.type === "not") {
    // Em FNC a negação só se aplica a variáveis: ¬(p ∨ q) e ¬¬p não são literais.
    if (tree.arg.type !== "var") return notCNF(tree.op, "negation");
    return { items: [{ literal: lit(tree.arg.name, true), start: tree.op.start, end: tree.arg.end }] };
  }
  if (tree.type === "and") return notCNF(tree.op, "andInsideOr");
  return notCNF(tree.op, tree.type === "imp" ? "implication" : "equivalence");
}

/**
 * Notação lógica: `(p ∨ ¬q) ∧ q`. A fórmula tem de estar em FNC: uma conjunção de
 * disjunções de literais. Parênteses à volta de uma cláusula de 1 literal são opcionais;
 * `F` sozinho é a cláusula vazia. →, ↔, ¬(…) e ∧ dentro de uma disjunção dão `notCNF`.
 * Devolve { ok, clauses } com as cláusulas tal como escritas (sem dedupe) ou um erro.
 */
export function parseLogicRaw(text) {
  const tokenized = tokenize(text);
  if (tokenized.error) return tokenized;
  if (tokenized.tokens.length === 0) return fail("emptyInput", 0, text.length);

  const parsed = parseLogicTree(tokenized.tokens, text);
  if (parsed.error) return parsed;

  // Os conjuntos de topo (separados por ∧) são as cláusulas, pela ordem em que aparecem.
  const conjuncts = [];
  const collect = (tree) => {
    if (tree.type === "and") {
      collect(tree.left);
      collect(tree.right);
    } else {
      conjuncts.push(tree);
    }
  };
  collect(parsed.tree);

  const clauses = [];
  for (const conjunct of conjuncts) {
    const read = clauseItemsFromTree(conjunct);
    if (read.error) return read;
    const result = clauseFromLiterals(read.items);
    if (result.error) return result;
    clauses.push(result.clause);
  }
  return { ok: true, clauses };
}

/**
 * Um conjunto é um conjunto: colapsa literais e cláusulas repetidos e gera avisos.
 * As tautologias ficam (o DLL não as remove), mas são sinalizadas.
 * Índices dos avisos começam em 0 (a UI mostra +1).
 */
export function normalizeClauses(rawClauses) {
  const warnings = [];

  const withoutDuplicateLiterals = rawClauses.map((clause, index) => {
    const { clause: unique, duplicates } = dedupeLiterals(clause);
    for (const key of duplicates) {
      warnings.push({ code: "duplicateLiteral", params: { index, literal: key } });
    }
    return unique;
  });

  const { clauses, duplicates } = dedupeClauses(withoutDuplicateLiterals);
  for (const index of duplicates) {
    const text = formatClause(withoutDuplicateLiterals[index], "compact");
    warnings.push({ code: "duplicateClause", params: { index, clause: text } });
  }

  // Índice pela posição em que o aluno escreveu a cláusula (como nos outros avisos),
  // não pela posição no conjunto já sem repetidos.
  const removed = new Set(duplicates);
  withoutDuplicateLiterals.forEach((clause, index) => {
    if (!removed.has(index) && isTautology(clause)) {
      warnings.push({ code: "tautology", params: { index, clause: formatClause(clause, "compact") } });
    }
  });

  return { clauses, warnings };
}

/** Parse da notação compacta, já normalizado e com avisos. */
export function parseCompact(text) {
  const raw = parseCompactRaw(text);
  if (!raw.ok) return raw;
  const { clauses, warnings } = normalizeClauses(raw.clauses);
  return { ok: true, clauses, notation: "compact", warnings };
}

/** Parse da notação de conjuntos, já normalizado e com avisos. */
export function parseSets(text) {
  const raw = parseSetsRaw(text);
  if (!raw.ok) return raw;
  const { clauses, warnings } = normalizeClauses(raw.clauses);
  return { ok: true, clauses, notation: "sets", warnings };
}

/** Parse da notação lógica, já normalizado e com avisos. */
export function parseLogic(text) {
  const raw = parseLogicRaw(text);
  if (!raw.ok) return raw;
  const { clauses, warnings } = normalizeClauses(raw.clauses);
  return { ok: true, clauses, notation: "logic", warnings };
}

/** Símbolos que só existem na notação lógica (a compacta não tem operadores nem parênteses). */
const LOGIC_HINT_RE = /[∧∨&|^()→⇒↔⇔]|\\\/|\/\\|->|=>|(^|\s)v(\s|$)/;

/**
 * Deteção automática da notação:
 * - começa por `{` → "sets" (`{{p, ¬q}, {q}}` ou `{p ∨ ¬q, q}`);
 * - tem operadores (∧ ∨ → ↔ e aliases ASCII), parênteses ou `v` isolado → "logic";
 * - senão → "compact" (`p1, -p1 -p2`). Um só literal (`p`) ou `F` dá o mesmo nas três.
 * Ambiguidade conhecida: `p v q` é lógica (o `v` isolado é a disjunção), não a cláusula compacta {p, v, q}.
 */
export function detectNotation(text) {
  const source = String(text ?? "");
  if (source.trimStart().startsWith("{")) return "sets";
  if (LOGIC_HINT_RE.test(source)) return "logic";
  return "compact";
}

const PARSERS = { compact: parseCompact, sets: parseSets, logic: parseLogic };

/**
 * Ponto de entrada da UI. `notation` = "auto" (por omissão) usa detectNotation;
 * "compact" | "sets" | "logic" força uma notação.
 */
export function parse(text, { notation = "auto" } = {}) {
  const source = String(text ?? "");
  const { maxChars, maxClauses, maxVariables, manyVariables } = INPUT_LIMITS;
  // O excesso de texto fica sublinhado a partir do 1.º caractere a mais.
  if (source.length > maxChars) return fail("tooLong", maxChars, source.length, { length: source.length, max: maxChars });

  const chosen = PARSERS[notation] ? notation : detectNotation(source);
  const result = PARSERS[chosen](source);
  if (!result.ok) return result;

  // Os limites contam o conjunto já sem repetidos. Estes erros não têm posição: é o texto todo.
  if (result.clauses.length > maxClauses) {
    return fail("tooManyClauses", undefined, undefined, { count: result.clauses.length, max: maxClauses });
  }
  const count = variablesOf(result.clauses).length;
  if (count > maxVariables) return fail("tooManyVariables", undefined, undefined, { count, max: maxVariables });
  if (count > manyVariables) result.warnings.push({ code: "manyVariables", params: { count, maxSteps: DEFAULT_MAX_STEPS } });
  return result;
}
