// Fórmulas: AST imutável, igualdade estrutural e impressão com o mínimo de parênteses.
// Módulo puro (sem DOM).
//
// Todos os nós têm a mesma forma: { kind, args } e, nos átomos, { name }. `args` são sempre os
// filhos, por isso `equals` e quem percorre a árvore não mudam com novos tipos de nó. Na 1.ª ordem,
// um átomo passa a ter termos em `args`, e ∀x φ será { kind: "forall", name: "x", args: [φ] }.

/** Nome de variável: letra seguida de letras, dígitos ou `_`. */
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Palavras que o parser lê como símbolos: `F` é o absurdo e `v` a disjunção. */
export const RESERVED_NAMES = ["F", "v"];

/** Força de ligação de cada conectivo: quanto maior, mais liga. */
const PRECEDENCE = { implies: 1, or: 2, and: 3, not: 4, atom: 5, falsum: 5, meta: 5 };

const SYMBOLS = { and: "∧", or: "∨", implies: "→" };

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

export const FALSUM = node("falsum", []);

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
  if (kind === "atom") return displayName(name);
  if (kind === "meta") return name;
  if (kind === "falsum") return "F";

  const strength = PRECEDENCE[kind];
  const wrap = (child, minimum) => {
    const text = format(child);
    return PRECEDENCE[child.kind] < minimum ? `(${text})` : text;
  };

  if (kind === "not") return `¬${wrap(args[0], strength)}`;

  // → associa à direita; ∧ e ∨ associam à esquerda.
  const [leftMinimum, rightMinimum] = kind === "implies" ? [strength + 1, strength] : [strength, strength + 1];
  return `${wrap(args[0], leftMinimum)} ${SYMBOLS[kind]} ${wrap(args[1], rightMinimum)}`;
}
