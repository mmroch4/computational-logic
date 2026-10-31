// Estados da página Provar que as verificações de browser têm de cobrir: a página vazia não mostra o
// editor. `mixed` tem linhas certas, com erro e por acabar, numa subdedução; `complete` tem a árvore.
// Uso: node scripts/prove-states.mjs <mixed|complete>   (escreve a query do link)
import { pathToFileURL } from "node:url";
import { parseProof } from "../js/core/proof-text.js";
import { parseSequent } from "../js/core/sequent.js";
import { encodeShare } from "../js/core/share.js";

const STATES = {
  mixed: {
    sequent: "p → q, ¬q ⊢ ¬p",
    proof: [
      "1 | p → q   premissa",
      "2 | ¬q      premissa",
      "3 |   p     hipótese",
      "4 |   r     →E, 1, 3",
      "5 |   ?",
    ].join("\n"),
  },
  complete: {
    sequent: "p → q, ¬q ⊢ ¬p",
    proof: [
      "1 | p → q   premissa",
      "2 | ¬q      premissa",
      "3 |   p     hipótese",
      "4 |   q     →E, 1, 3",
      "5 |   F     FI, 2, 4",
      "6 | ¬p      ¬I, 3–5",
    ].join("\n"),
  },
};

/** A query do link que abre o estado `name`. Rebenta se a prova deixar de se ler. */
export function stateQuery(name) {
  const { sequent, proof } = STATES[name];
  const goal = parseSequent(sequent);
  const parsed = parseProof(proof);
  if (!goal.ok || !parsed.ok) throw new Error(`O estado ${name} não se lê`);
  const { query, complete } = encodeShare(goal.sequent, parsed.proof);
  if (!complete) throw new Error(`O estado ${name} não coube no link`);
  return query;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(stateQuery(process.argv[2]));
