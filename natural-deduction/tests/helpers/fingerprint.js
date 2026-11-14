// Impressão digital de um sequente, para comparar enunciados nossos com os materiais da cadeira.
import assert from "node:assert/strict";
import { parseSequent } from "../../js/core/sequent.js";

/** Os nomes dos átomos e dos predicados. */
export const atomsOf = (formula) => (
  formula.kind === "atom" ? [formula.name] : formula.args.flatMap(atomsOf)
);

const SIGNS = { and: "∧", or: "∨" };
const QUANTIFIERS = { forall: "∀", exists: "∃" };

/** Nomes de predicados, de funções e de termos livres, pela ordem em que aparecem. */
function symbolsOf(node, bound = []) {
  if (node.kind === "term") {
    if (node.args.length === 0) return bound.includes(node.name) ? [] : [node.name];
    return [node.name, ...node.args.flatMap((arg) => symbolsOf(arg, bound))];
  }
  if (node.kind === "atom") return [node.name, ...node.args.flatMap((arg) => symbolsOf(arg, bound))];
  if (node.kind in QUANTIFIERS) return symbolsOf(node.args[0], [...bound, node.name]);
  return node.args.flatMap((arg) => symbolsOf(arg, bound));
}

/** Um termo, com as variáveis ligadas trocadas pela profundidade do quantificador que as liga. */
function termShape(term, names, bound) {
  const depth = term.args.length === 0 ? bound.lastIndexOf(term.name) : -1;
  if (depth >= 0) return `#${depth}`;
  const name = names.get(term.name);
  return term.args.length === 0 ? name : `${name}(${term.args.map((arg) => termShape(arg, names, bound)).join(",")})`;
}

/**
 * A fórmula em texto, com os nomes de `names`, as variáveis ligadas pela profundidade e os dois lados
 * de ∧, ∨ e = por ordem fixa.
 */
function shape(formula, names, bound = []) {
  if (formula.kind === "atom") {
    const args = formula.args.map((arg) => termShape(arg, names, bound));
    return args.length === 0 ? names.get(formula.name) : `${names.get(formula.name)}(${args.join(",")})`;
  }
  if (formula.kind === "falsum") return "F";
  if (formula.kind === "eq") return `(${formula.args.map((arg) => termShape(arg, names, bound)).sort().join("=")})`;
  if (formula.kind === "not") return `¬${shape(formula.args[0], names, bound)}`;
  if (formula.kind in QUANTIFIERS) {
    return `${QUANTIFIERS[formula.kind]}(${shape(formula.args[0], names, [...bound, formula.name])})`;
  }
  const [left, right] = formula.args.map((arg) => shape(arg, names, bound));
  if (formula.kind === "implies") return `(${left}→${right})`;
  return `(${[left, right].sort().join(SIGNS[formula.kind])})`;
}

function* orderings(items) {
  if (items.length < 2) yield items;
  for (const [index, item] of items.entries()) {
    if (items.length < 2) break;
    for (const rest of orderings(items.toSpliced(index, 1))) yield [item, ...rest];
  }
}

/**
 * A forma de um sequente a menos de nomes (átomos, predicados, funções e termos livres), de variáveis
 * ligadas, da ordem das premissas, dos lados de ∧, ∨ e = e de passar um antecedente da conclusão para
 * as premissas: A ⊢ B → C e A, B ⊢ C são o mesmo enunciado.
 */
export function fingerprint(text) {
  const parsed = parseSequent(text);
  assert.ok(parsed.ok, text);
  const premises = [...parsed.sequent.premises];
  let { conclusion } = parsed.sequent;
  while (conclusion.kind === "implies") {
    premises.push(conclusion.args[0]);
    [, conclusion] = conclusion.args;
  }
  const symbols = [...new Set([...premises, conclusion].flatMap((formula) => symbolsOf(formula)))];
  let best = null;
  for (const order of orderings(symbols)) {
    const names = new Map(order.map((name, index) => [name, `x${index}`]));
    const text = `${premises.map((premise) => shape(premise, names)).sort().join(",")}⊢${shape(conclusion, names)}`;
    if (best === null || text < best) best = text;
  }
  return best;
}
