// Fórmulas: AST imutável, igualdade estrutural e impressão com o mínimo de parênteses.
// Módulo puro (sem DOM).
//
// Todos os nós têm a mesma forma: { kind, args } e, nos átomos, { name }. `args` são sempre os
// filhos, por isso `equals` e quem percorre a árvore não mudam com novos tipos de nó.
//
// 1.ª ordem: um termo é { kind: "term", name, args: [termos] } (um nome, se não tiver argumentos);
// um átomo leva termos em `args`; t₁ = t₂ é { kind: "eq", args: [t1, t2] }; ∀x φ é
// { kind: "forall", name: "x", args: [φ] } e ∃x φ, { kind: "exists", ... }. Os nomes não têm tipo:
// um termo sem argumentos é variável se um quantificador o liga e, livre, funciona como parâmetro.

/** Nome de variável: letra seguida de letras, dígitos ou `_`. */
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Palavras que o parser lê como símbolos: `F` é o absurdo e `v` a disjunção. */
export const RESERVED_NAMES = ["F", "v"];

/** Força de ligação de cada conectivo: quanto maior, mais liga. */
// Os quantificadores ligam como o ¬; `=` só junta termos e conta como atómica.
const PRECEDENCE = {
  implies: 1, or: 2, and: 3, not: 4, forall: 4, exists: 4, atom: 5, eq: 5, falsum: 5, meta: 5, subst: 5,
};

const SYMBOLS = { and: "∧", or: "∨", implies: "→" };

const QUANTIFIERS = { forall: "∀", exists: "∃" };

/** Nomes que não podem ser termos nem variáveis: `F` é o absurdo; `forall` e `exists`, quantificadores. */
export const RESERVED_TERM_NAMES = ["F", "forall", "exists"];

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";

const node = (kind, args) => Object.freeze({ kind, args: Object.freeze(args) });

/** Indica se `name` pode ser o nome de um átomo. */
export function isAtomName(name) {
  return NAME_RE.test(name) && !RESERVED_NAMES.includes(name);
}

/** Átomo. Rejeita nomes que o parser não leria de volta como este átomo. */
export function atom(name, args = []) {
  if (!isAtomName(name)) throw new Error(`Nome de átomo inválido: ${name}`);
  return Object.freeze({ kind: "atom", name, args: Object.freeze([...args]) });
}

/** Metavariáveis dos esquemas. Só existem em esquemas: o parser só as lê quando lhe é pedido. */
export const METAVARIABLES = ["φ", "ψ", "θ"];

/** Metavariável: { kind: "meta", name, args: [] }. */
export function meta(name) {
  if (!METAVARIABLES.includes(name)) throw new Error(`Metavariável inválida: ${name}`);
  return Object.freeze({ kind: "meta", name, args: Object.freeze([]) });
}

/**
 * Metavariáveis de 1.ª ordem dos esquemas: de termo (qualquer termo) e de variável (só um nome).
 * Num esquema, a variável de um quantificador é sempre uma metavariável de variável (`∀x φ`).
 */
export const TERM_METAVARIABLES = ["t", "t1", "t2"];
export const VARIABLE_METAVARIABLES = ["x", "y", "v"];

/** Metavariável de termo: { kind: "metaTerm", name, args: [] }. */
export function metaTerm(name) {
  if (!TERM_METAVARIABLES.includes(name)) throw new Error(`Metavariável de termo inválida: ${name}`);
  return Object.freeze({ kind: "metaTerm", name, args: Object.freeze([]) });
}

/** Metavariável de variável: { kind: "metaVariable", name, args: [] }. */
export function metaVariable(name) {
  if (!VARIABLE_METAVARIABLES.includes(name)) throw new Error(`Metavariável de variável inválida: ${name}`);
  return Object.freeze({ kind: "metaVariable", name, args: Object.freeze([]) });
}

/** φ[t/x] num esquema: { kind: "subst", args: [φ, t, x] }, com φ e x metavariáveis. */
export function substituted(formula, t, x) {
  const termOk = t?.kind === "metaTerm" || t?.kind === "metaVariable";
  if (formula?.kind !== "meta" || x?.kind !== "metaVariable" || !termOk) {
    throw new Error("φ[t/x] leva uma metavariável de fórmula, uma de termo e uma de variável");
  }
  return node("subst", [formula, t, x]);
}

export const FALSUM = node("falsum", []);

/** Indica se `name` pode ser o nome de um termo (variável, constante ou função). O `v` pode. */
export function isTermName(name) {
  return NAME_RE.test(name) && !RESERVED_TERM_NAMES.includes(name);
}

const isTerm = (node) => node?.kind === "term";
/** Num esquema, uma metavariável de termo ou de variável ocupa o lugar de um termo. */
const TERM_KINDS = new Set(["term", "metaTerm", "metaVariable"]);
const isTermLike = (node) => TERM_KINDS.has(node?.kind);

/** Termo: nome sem argumentos, ou função aplicada a termos. */
export function term(name, args = []) {
  if (!isTermName(name)) throw new Error(`Nome de termo inválido: ${name}`);
  if (!args.every(isTermLike)) throw new Error(`Os argumentos de ${name} têm de ser termos`);
  return Object.freeze({ kind: "term", name, args: Object.freeze([...args]) });
}

/** Igualdade t₁ = t₂. */
export function eq(left, right) {
  if (!isTermLike(left) || !isTermLike(right)) throw new Error("A igualdade só junta termos");
  return node("eq", [left, right]);
}

const quantifier = (kind) => (name, body) => {
  if (!isTermName(name)) throw new Error(`Variável de quantificador inválida: ${name}`);
  return Object.freeze({ kind, name, args: Object.freeze([body]) });
};

/** ∀x φ. */
export const forall = quantifier("forall");
/** ∃x φ. */
export const exists = quantifier("exists");

const isQuantifier = (formula) => formula.kind in QUANTIFIERS;
const isVariable = (node) => isTerm(node) && node.args.length === 0;

export const not = (arg) => node("not", [arg]);
export const and = (left, right) => node("and", [left, right]);
export const or = (left, right) => node("or", [left, right]);
export const implies = (left, right) => node("implies", [left, right]);

/** Igualdade estrutural. */
export function equals(a, b) {
  if (a === b) return true;
  return (
    a.kind === b.kind &&
    a.name === b.name &&
    a.args.length === b.args.length &&
    a.args.every((arg, i) => equals(arg, b.args[i]))
  );
}

/** Nome com o sufixo numérico em subscrito: `p11` → `p₁₁`. */
export function displayName(name) {
  return name.replace(/\d+$/, (digits) => [...digits].map((digit) => SUBSCRIPTS[digit]).join(""));
}

/** Imprime `formula` com parênteses só onde mudariam a leitura. */
export function format(formula) {
  const { kind, name, args } = formula;
  if (kind === "term" || kind === "atom") {
    if (args.length === 0) return displayName(name);
    return `${displayName(name)}(${args.map(format).join(", ")})`;
  }
  if (kind === "eq") return `${format(args[0])} = ${format(args[1])}`;
  if (kind === "meta") return name;
  if (kind === "metaTerm" || kind === "metaVariable") return displayName(name);
  if (kind === "subst") return `${format(args[0])}[${format(args[1])}/${format(args[2])}]`;
  if (kind === "falsum") return "F";

  const strength = PRECEDENCE[kind];
  const wrap = (child, minimum) => {
    const text = format(child);
    return PRECEDENCE[child.kind] < minimum ? `(${text})` : text;
  };

  if (kind === "not") return `¬${wrap(args[0], strength)}`;
  if (isQuantifier(formula)) {
    // `∀x P(x)` e `∀x ¬P(x)`, mas `∀x(P(x) → Q(x))` e `∀x∀y R(x, y)`.
    const body = wrap(args[0], strength);
    const glued = body.startsWith("(") || isQuantifier(args[0]);
    return `${QUANTIFIERS[kind]}${displayName(name)}${glued ? "" : " "}${body}`;
  }

  // → associa à direita; ∧ e ∨ associam à esquerda.
  const [leftMinimum, rightMinimum] = kind === "implies" ? [strength + 1, strength] : [strength, strength + 1];
  return `${wrap(args[0], leftMinimum)} ${SYMBOLS[kind]} ${wrap(args[1], rightMinimum)}`;
}

const PROPOSITIONAL_KINDS = new Set(["atom", "meta", "falsum", "not", "and", "or", "implies"]);

/**
 * Se `formula` é proposicional: só conectivos, F, metavariáveis e átomos sem argumentos. Um
 * quantificador, uma igualdade ou um predicado com termos tiram-na da lógica proposicional.
 */
export function isPropositional(formula) {
  if (!PROPOSITIONAL_KINDS.has(formula.kind)) return false;
  if (formula.kind === "atom") return formula.args.length === 0;
  return formula.args.every(isPropositional);
}

/** Variáveis livres de uma fórmula ou termo: os termos sem argumentos que nenhum quantificador liga. */
export function freeVariables(formula) {
  const free = new Set();
  const visit = (node, bound) => {
    if (isVariable(node)) {
      if (!bound.has(node.name)) free.add(node.name);
      return;
    }
    const inner = isQuantifier(node) ? new Set([...bound, node.name]) : bound;
    for (const arg of node.args) visit(arg, inner);
  };
  visit(formula, new Set());
  return free;
}

/** Indica se o nome `x` ocorre em `formula`, livre ou ligado: num termo, numa função ou num quantificador. */
export function occurs(formula, x) {
  if ((isTerm(formula) || isQuantifier(formula)) && formula.name === x) return true;
  return formula.args.some((arg) => occurs(arg, x));
}

/** Indica se a variável `x` está livre em `formula`. */
export function isFree(formula, x) {
  return freeVariables(formula).has(x);
}

/**
 * φ[t/x]: troca as ocorrências livres da variável `x` pelo termo `t`. Não renomeia as ligadas, por
 * isso pode capturar variáveis de t: quem a usa confirma antes com `isSubstitutable`.
 */
export function substitute(formula, x, t) {
  if (isVariable(formula)) return formula.name === x ? t : formula;
  if (isQuantifier(formula) && formula.name === x) return formula;
  if (formula.args.length === 0) return formula;
  const args = formula.args.map((arg) => substitute(arg, x, t));
  if (args.every((arg, i) => arg === formula.args[i])) return formula;
  return Object.freeze({ ...formula, args: Object.freeze(args) });
}

/**
 * «x substituível por t em φ» (t livre para x em φ): nenhuma ocorrência livre de x em φ fica no
 * alcance de um quantificador que ligue uma variável de t.
 */
export function isSubstitutable(formula, x, t) {
  const termVariables = freeVariables(t);
  const visit = (node) => {
    if (isTerm(node) || node.kind === "atom" || node.kind === "eq") return true;
    if (isQuantifier(node)) {
      if (node.name === x || !isFree(node.args[0], x)) return true;
      if (termVariables.has(node.name)) return false;
    }
    return node.args.every(visit);
  };
  return visit(formula);
}

/** Igualdade a menos do nome das variáveis ligadas: `∀x P(x)` e `∀y P(y)` são iguais. */
export function alphaEquals(a, b) {
  // Cada lado guarda a pilha dos nomes ligados; uma variável ligada compara-se pelo seu quantificador.
  const visit = (left, right, leftBound, rightBound) => {
    if (left.kind !== right.kind || left.args.length !== right.args.length) return false;
    if (isVariable(left)) {
      const i = leftBound.lastIndexOf(left.name);
      const j = rightBound.lastIndexOf(right.name);
      return i === -1 && j === -1 ? left.name === right.name : i === j;
    }
    if (isQuantifier(left)) {
      return visit(left.args[0], right.args[0], [...leftBound, left.name], [...rightBound, right.name]);
    }
    if (left.name !== right.name) return false;
    return left.args.every((arg, k) => visit(arg, right.args[k], leftBound, rightBound));
  };
  return visit(a, b, [], []);
}
