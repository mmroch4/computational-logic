// Conversão de uma prova de Fitch numa árvore de Gentzen. Módulo puro (sem DOM).
// Contrato:
//   treeAt(proof, n, known = RULES) → { ok: true, tree, size } | { ok: false, error: { code, params } }
//     a árvore da linha n, para quem mostra uma prova a meio; uma hipótese ainda aberta fica por descarregar.
//   proofTree(proof, goal, { rules, known }) → { status: "unfinished" }
//     | { status: "ready", tree, size } | { status: "tooLarge", limit }
//     a árvore de uma prova acabada, da última linha.
//   Nó: { kind: "assumption", formula, line, source: "premise" | "hypothesis", label }
//       { kind: "inference", formula, line, rule, discharges, premises }
//     line: a linha de Fitch de onde o nó veio.
//     label: número da regra que descarrega a hipótese, ou null se ninguém a descarrega.
//     discharges: os números das hipóteses que a regra descarrega, um por subdedução citada.
//     premises: os nós de cima, pela ordem das premissas da regra, e não pela das citações. Com TE
//       fica vazio. Uma subdedução citada dá a árvore da última linha dela.
// Cada subdedução citada tem um número próprio, de baixo para cima e da esquerda para a direita.
// R não dá nó, porque na árvore a fórmula repetida já é a própria. Uma linha citada duas vezes aparece
// duas vezes, e a árvore pode crescer exponencialmente com a prova: daí MAX_TREE_NODES.

import { RULES } from "./rules.js";
import { citationsInRuleOrder, verifyLine, verifyProof } from "./verify.js";

/** Códigos de erro de `treeAt`. */
export const TREE_ERROR_CODES = [
  "invalidLine", // { line }: a linha, ou uma de que ela depende, não passa no verificador
  "tooLarge", // { limit }: a árvore teria mais nós do que o limite
];

/** Máximo de nós de uma árvore. A pior prova gerada no benchmark do solver fica muito abaixo disto. */
export const MAX_TREE_NODES = 1000;

/** A linha da citação `citation`: a própria, ou a última da subdedução. */
const citedLine = (citation) => (citation.kind === "line" ? citation.line : citation.to);

/**
 * Verifica as linhas de que n depende e mede a árvore, sem a construir, com cada linha vista uma só
 * vez. As linhas verificadas só citam linhas anteriores, por isso a recursão acaba.
 * Devolve { orders, size }, com size = null e `invalid` se alguma linha falhar.
 */
function survey(proof, root, known) {
  const orders = new Map();
  const sizes = new Map();
  let invalid = null;

  function measure(n) {
    if (invalid !== null) return 0;
    if (sizes.has(n)) return sizes.get(n);
    if (!verifyLine(proof, n, known).ok) {
      invalid = n;
      return 0;
    }
    const line = proof.lines[n - 1];
    const order = line.kind === "step" ? citationsInRuleOrder(proof, n, known) : [];
    orders.set(n, order);
    const above = order.reduce((total, citation) => total + measure(citedLine(citation)), 0);
    const size = line.kind === "step" && line.rule === "R" ? above : above + 1;
    sizes.set(n, size);
    return size;
  }

  const size = measure(root);
  return { orders, size, invalid };
}

/** Constrói a árvore da linha `root`; `orders` vem de `survey`. */
function build({ lines }, root, orders) {
  let nextLabel = 1;

  function node(n, scope) {
    const line = lines[n - 1];
    if (line.kind !== "step") {
      return Object.freeze({
        kind: "assumption",
        formula: line.formula,
        line: n,
        source: line.kind,
        label: scope.get(n) ?? null,
      });
    }
    const order = orders.get(n);
    if (line.rule === "R") return node(citedLine(order[0]), scope);

    const discharges = [];
    const premises = order.map((citation) => {
      if (citation.kind === "line") return node(citation.line, scope);
      const label = nextLabel;
      nextLabel += 1;
      discharges.push(label);
      return node(citation.to, new Map(scope).set(citation.from, label));
    });
    return Object.freeze({
      kind: "inference",
      formula: line.formula,
      line: n,
      rule: line.rule,
      discharges: Object.freeze(discharges),
      premises: Object.freeze(premises),
    });
  }

  return node(root, new Map());
}

/** A árvore da linha n. `known` são as regras que a prova pode citar, com as do utilizador. */
export function treeAt(proof, n, known = RULES) {
  const { orders, size, invalid } = survey(proof, n, known);
  if (invalid !== null) return { ok: false, error: { code: "invalidLine", params: { line: invalid } } };
  if (size > MAX_TREE_NODES) return { ok: false, error: { code: "tooLarge", params: { limit: MAX_TREE_NODES } } };
  return { ok: true, tree: build(proof, n, orders), size };
}

/** A árvore de uma prova, se ela demonstrar `goal`. */
export function proofTree(proof, goal, { rules, known }) {
  if (!verifyProof(proof, goal, rules, known).ok) return { status: "unfinished" };
  const result = treeAt(proof, proof.lines.length, known);
  if (!result.ok) return { status: "tooLarge", limit: MAX_TREE_NODES };
  return { status: "ready", tree: result.tree, size: result.size };
}
