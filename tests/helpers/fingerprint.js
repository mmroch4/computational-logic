// Impressão digital de um sequente, para comparar enunciados nossos com os materiais da cadeira.
import assert from "node:assert/strict";
import { parseSequent } from "../../js/core/sequent.js";

export const atomsOf = (formula) => (
  formula.kind === "atom" ? [formula.name] : formula.args.flatMap(atomsOf)
);

const SIGNS = { and: "∧", or: "∨" };

/** A fórmula em texto, com os nomes de `names` e os dois lados de ∧ e ∨ por ordem fixa. */
function shape(formula, names) {
  if (formula.kind === "atom") return names.get(formula.name);
  if (formula.kind === "falsum") return "F";
  if (formula.kind === "not") return `¬${shape(formula.args[0], names)}`;
  const [left, right] = formula.args.map((arg) => shape(arg, names));
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
 * A forma de um sequente a menos de letras, da ordem das premissas, dos lados de ∧ e ∨ e de passar um
 * antecedente da conclusão para as premissas: A ⊢ B → C e A, B ⊢ C são o mesmo enunciado.
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
  const atoms = [...new Set([...premises, conclusion].flatMap(atomsOf))];
  let best = null;
  for (const order of orderings(atoms)) {
    const names = new Map(order.map((name, index) => [name, `x${index}`]));
    const text = `${premises.map((premise) => shape(premise, names)).sort().join(",")}⊢${shape(conclusion, names)}`;
    if (best === null || text < best) best = text;
  }
  return best;
}
