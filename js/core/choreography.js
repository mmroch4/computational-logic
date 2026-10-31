// Coreografia de um passo do DLL: que mudanças mostrar, e por que ordem, para o passo se ler sem
// o texto. Só diz o que muda; o como (durações, elementos) é do js/ui/step-motion.js.
//
//   stepChoreography(trace, index) → [etapa], por ordem; os passos sem uma etapa saltam-na:
//     { stage: "unit", clause }        a cláusula unitária destaca-se;
//     { stage: "add", clause }         a cláusula {l} de S ∪ {l} entra no conjunto;
//     { stage: "strike", literals }    os l̃ são riscados, [{ clause, literal }], da esquerda para a direita;
//     { stage: "leave", clauses }      as cláusulas que saem do conjunto (a unitária, as satisfeitas e as
//                                      que ficaram repetidas);
//     { stage: "value", variable }     o literal novo entra na valoração;
//     { stage: "node", kind }          nó e aresta novos na árvore ("unit" ou "call");
//     { stage: "empty", clause }       a cláusula F destaca-se;
//     { stage: "deadEnd" }             o ramo que acabou em F esbate-se;
//     { stage: "path" }                o caminho até «satisfazível» fica realçado.
// Os índices `clause` são posições no conjunto que a vista mostra: e.before na propagação e e.after
// na ramificação (os mesmos cartões do clauseSetModel); `literal` é a posição dentro da cláusula.
import { isEmptyClause } from "./clauses.js";
import { complement, sameLiteral } from "./literals.js";

function unitStages(e) {
  const opposite = complement(e.literal);
  const struck = e.shortened.flatMap(({ idx, from }) =>
    from.flatMap((l, literal) => (sameLiteral(l, opposite) ? [{ clause: idx, literal }] : [])),
  );
  const leaving = [...e.removed, ...e.merged].sort((a, b) => a - b);
  return [
    { stage: "unit", clause: e.clauseIndex },
    ...(struck.length ? [{ stage: "strike", literals: struck }] : []),
    { stage: "leave", clauses: leaving },
    { stage: "value", variable: e.literal.v },
    { stage: "node", kind: "unit" },
  ];
}

function branchStages(e) {
  const added = e.after.length > e.before.length;
  return [
    ...(added ? [{ stage: "add", clause: e.after.length - 1 }] : []),
    { stage: "value", variable: e.literal.v },
    { stage: "node", kind: "call" },
  ];
}

export function stepChoreography(trace, index) {
  const e = trace[index];
  switch (e?.type) {
    case "unit":
      return unitStages(e);
    case "branch":
      return branchStages(e);
    case "conflict":
      return [{ stage: "empty", clause: e.S.findIndex(isEmptyClause) }, { stage: "deadEnd" }];
    case "sat":
      return [{ stage: "path" }];
    default:
      return []; // início, retrocesso, limite e resultado mostram-se de uma vez
  }
}
