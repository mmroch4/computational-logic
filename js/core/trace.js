// Leitura do trace do DLL para a UI:
//   buildTree(trace)  → árvore de decisão (um nó por chamada DLL(S))
//   proofSteps(trace) → lista numerada de conjuntos:
//                       "(1) S", "(2) aplicando p₁: S′", …
//   valuationAt(trace, index) → valoração parcial do ramo no passo `index`
// Nada aqui formata texto: a UI traduz e formata (PT/EN, unicode/LaTeX).
import { variablesOf } from "./clauses.js";

/**
 * Constrói a árvore de decisão a partir do trace.
 *   upTo (opcional): índice do último evento a considerar, para mostrar a árvore
 *   "até ao passo N" no modo passo a passo. Por omissão usa o trace todo.
 *
 * Devolve { root, nodes }, com nodes[id] = {
 *   id, parent (null na raiz), literal (o l de S ∪ {l}; null na raiz), depth,
 *   children: [id],          // por ordem: ramo l e depois ramo l̃
 *   units: [literal],        // literais propagados neste nó, por ordem
 *   unitSets: [S],           // conjunto depois de cada propagação (unitSets[j] depois de units[j])
 *   unitEvents: [índice],    // evento do trace de cada propagação
 *   S,                       // conjunto à entrada do nó (S ∪ {l})
 *   final,                   // conjunto depois da propagação (o último visto)
 *   status,                  // "sat" | "conflict" | "open"
 *   events: [índice no trace]
 * }
 * status de um nó interno: "sat" se um filho é sat; "conflict" se tem dois filhos
 * e ambos falharam (a subárvore é insatisfazível); "open" se ainda não se sabe.
 */
export function buildTree(trace, upTo = trace.length - 1) {
  const nodes = [];

  function addNode(id, parent, literal, depth, S) {
    nodes[id] = { id, parent, literal, depth, children: [], units: [], unitSets: [], unitEvents: [], S, final: S, status: "open", events: [] };
    if (parent !== null) nodes[parent].children.push(id);
  }

  for (let i = 0; i <= upTo && i < trace.length; i++) {
    const e = trace[i];
    switch (e.type) {
      case "start":
        addNode(0, null, null, 0, e.S);
        break;
      case "branch":
        addNode(e.node, e.parent, e.literal, e.depth, e.after);
        break;
      case "unit":
        nodes[e.node].units.push(e.literal);
        nodes[e.node].unitSets.push(e.after);
        nodes[e.node].unitEvents.push(i);
        nodes[e.node].final = e.after;
        break;
      case "conflict":
      case "sat":
        nodes[e.node].status = e.type;
        break;
      default:
        continue; // backtrack, limit e result não mudam a árvore
    }
    nodes[e.node ?? 0].events.push(i);
  }

  // Estado das subárvores, das folhas para a raiz (os filhos têm ids maiores).
  for (let id = nodes.length - 1; id >= 0; id--) {
    const node = nodes[id];
    if (!node || node.children.length === 0) continue;
    const childStatus = node.children.map((c) => nodes[c].status);
    if (childStatus.includes("sat")) node.status = "sat";
    else if (childStatus.length === 2 && childStatus.every((s) => s === "conflict")) node.status = "conflict";
  }

  return { root: nodes[0] ?? null, nodes };
}

/**
 * Lista de passos da "vista de prova".
 * Os passos que mostram um conjunto são numerados (1), (2), …:
 *   { n, kind: "start",  index, node, depth, S }
 *   { n, kind: "unit",   index, node, depth, literal, S }  // S depois de aplicar o literal
 *   { n, kind: "branch", index, node, depth, literal, S }  // S ∪ {l}
 * As conclusões e os retrocessos não têm número (n = null), porque não mostram um conjunto novo:
 *   { kind: "conflict", index, node, depth, S }            // S contém F ⇒ insatisfazível
 *   { kind: "sat",      index, node, depth, S, assignment } // S vazio ⇒ satisfazível
 *   { kind: "backtrack", index, node, depth, to, literal } // o ramo falhou; tenta-se l̃
 *   { kind: "limit",    index, steps }
 * index = posição do evento no trace (para a UI saltar para esse passo).
 */
export function proofSteps(trace) {
  const depthOf = [0];
  const steps = [];
  let n = 0;

  trace.forEach((e, index) => {
    switch (e.type) {
      case "start":
        steps.push({ n: ++n, kind: "start", index, node: 0, depth: 0, S: e.S });
        break;
      case "unit":
        steps.push({ n: ++n, kind: "unit", index, node: e.node, depth: depthOf[e.node], literal: e.literal, S: e.after });
        break;
      case "branch":
        depthOf[e.node] = e.depth;
        steps.push({ n: ++n, kind: "branch", index, node: e.node, depth: e.depth, literal: e.literal, S: e.after });
        break;
      case "conflict":
        steps.push({ n: null, kind: "conflict", index, node: e.node, depth: depthOf[e.node], S: e.S });
        break;
      case "sat":
        steps.push({ n: null, kind: "sat", index, node: e.node, depth: depthOf[e.node], S: e.S, assignment: e.assignment });
        break;
      case "backtrack":
        steps.push({ n: null, kind: "backtrack", index, node: e.node, depth: depthOf[e.to], to: e.to, literal: e.literal });
        break;
      case "limit":
        steps.push({ n: null, kind: "limit", index, steps: e.steps });
        break;
      default:
        break; // result: a UI mostra-o à parte
    }
  });

  return steps;
}

/**
 * A valoração parcial no passo `index` do trace do DLL: uma entrada por variável de S, por ordem
 * alfabética natural, { variable, value, isNew }.
 *   value: true | false | null (ainda sem valor);
 *   isNew: é o último literal atribuído no ramo (o valor que este passo trouxe). Num retrocesso e no
 *          passo 0 não há nenhum novo; numa conclusão continua a ser o da propagação que a causou.
 * Cada nó guarda os literais do seu caminho desde a raiz, por isso voltar atrás é só ler o do nó pai.
 * Depois de todos os ramos falharem (result insatisfazível) sobra o caminho da raiz.
 */
export function valuationAt(trace, index) {
  const path = [[]];
  let node = 0;
  let hasNew = false;

  for (let i = 0; i <= index && i < trace.length; i++) {
    const e = trace[i];
    if (e.type === "branch") {
      path[e.node] = [...path[e.parent], e.literal];
      node = e.node;
      hasNew = true;
    } else if (e.type === "unit") {
      path[e.node].push(e.literal);
      node = e.node;
      hasNew = true;
    } else if (e.type === "backtrack" || (e.type === "result" && e.sat === false)) {
      node = e.to ?? 0;
      hasNew = false;
    }
  }

  const literals = path[node];
  const latest = hasNew ? literals.at(-1) : null;
  return variablesOf(trace[0]?.S ?? []).map((variable) => {
    const literal = literals.find((l) => l.v === variable);
    return { variable, value: literal ? !literal.neg : null, isNew: literal !== undefined && literal === latest };
  });
}
