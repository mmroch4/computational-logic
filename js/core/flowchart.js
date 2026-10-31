// Fluxograma do DLL (§4 do Aprender): que caixa e que setas correspondem a cada evento do trace.
//
//   DLL(S) → S := propagate(S) → S vazio? ─sim→ satisfazível
//                                  │não
//                                S contém F? ─sim→ insatisfazível
//                                  │não
//                                l := select_literal(S)
//                                  │
//                                DLL(S ∪ {l}) satisfazível? ─sim→ satisfazível
//                                  │não
//                                return DLL(S ∪ {l̃})
//   As duas chamadas DLL(S ∪ {…}) voltam ao topo (setas a tracejado = recursão).
//
// O trace não tem eventos para os testes que falham ("S vazio?" → não), por isso uma ramificação
// acende o caminho todo desde a propagação até DLL(S ∪ {l}). Módulo puro (sem DOM).

/** Caixas do fluxograma: id e forma ("terminal" | "process" | "decision"). */
export const FLOW_NODES = [
  { id: "call", shape: "terminal" },
  { id: "propagate", shape: "process" },
  { id: "isEmpty", shape: "decision" },
  { id: "sat", shape: "terminal" },
  { id: "hasF", shape: "decision" },
  { id: "unsat", shape: "terminal" },
  { id: "select", shape: "process" },
  { id: "tryL", shape: "decision" },
  { id: "thenSat", shape: "terminal" },
  { id: "tryNotL", shape: "process" },
];

/** Setas: id = "origem-destino"; label = "yes" | "no" | null; recursive = chamada recursiva. */
export const FLOW_EDGES = [
  { id: "call-propagate", from: "call", to: "propagate", label: null },
  { id: "propagate-isEmpty", from: "propagate", to: "isEmpty", label: null },
  { id: "isEmpty-sat", from: "isEmpty", to: "sat", label: "yes" },
  { id: "isEmpty-hasF", from: "isEmpty", to: "hasF", label: "no" },
  { id: "hasF-unsat", from: "hasF", to: "unsat", label: "yes" },
  { id: "hasF-select", from: "hasF", to: "select", label: "no" },
  { id: "select-tryL", from: "select", to: "tryL", label: null },
  { id: "tryL-thenSat", from: "tryL", to: "thenSat", label: "yes" },
  { id: "tryL-tryNotL", from: "tryL", to: "tryNotL", label: "no" },
  { id: "tryL-call", from: "tryL", to: "call", label: null, recursive: true },
  { id: "tryNotL-call", from: "tryNotL", to: "call", label: null, recursive: true },
];

// Caminho comum quando a propagação para sem S vazio e sem F.
const TO_SELECT = {
  nodes: ["isEmpty", "hasF", "select"],
  edges: ["propagate-isEmpty", "isEmpty-hasF", "hasF-select"],
};

/** Por onde a chamada inicial devolve o resultado (evento "result"). */
function rootReturn(trace) {
  const rootEnd = trace.find((e) => e.node === 0 && (e.type === "sat" || e.type === "conflict"));
  if (rootEnd) return rootEnd.type === "sat" ? "sat" : "unsat";
  // A raiz ramificou: devolve pelo then (o 1.º ramo deu sat) ou pelo else (o resultado do 2.º ramo).
  const backtrackedAtRoot = trace.some((e) => e.type === "backtrack" && e.to === 0);
  return backtrackedAtRoot ? "tryNotL" : "thenSat";
}

/**
 * O que o fluxograma realça no passo `index`:
 *   { current: id da caixa atual | null, nodes: [ids no caminho], edges: [ids das setas], rule }
 * rule = cor do passo (unit, branch, conflict, sat, backtrack), como no resto da ferramenta.
 */
export function flowchartModel(trace, index) {
  const e = trace[index];
  const none = { current: null, nodes: [], edges: [], rule: null };
  if (!e) return none;

  switch (e.type) {
    case "start":
      return { current: "call", nodes: ["call"], edges: [], rule: null };
    case "unit":
      return { current: "propagate", nodes: ["propagate"], edges: ["call-propagate"], rule: "unit" };
    case "sat":
      return { current: "sat", nodes: ["isEmpty", "sat"], edges: ["propagate-isEmpty", "isEmpty-sat"], rule: "sat" };
    case "conflict":
      return {
        current: "unsat",
        nodes: ["isEmpty", "hasF", "unsat"],
        edges: ["propagate-isEmpty", "isEmpty-hasF", "hasF-unsat"],
        rule: "conflict",
      };
    case "branch":
      // Depois de um backtrack é o else (DLL(S ∪ {l̃})); senão é o select + DLL(S ∪ {l}).
      if (trace[index - 1]?.type === "backtrack") {
        return { current: "tryNotL", nodes: ["tryNotL"], edges: ["tryNotL-call"], rule: "branch" };
      }
      return {
        current: "tryL",
        nodes: [...TO_SELECT.nodes, "tryL"],
        edges: [...TO_SELECT.edges, "select-tryL", "tryL-call"],
        rule: "branch",
      };
    case "backtrack":
      // DLL(S ∪ {l}) deu insatisfazível: a condição falha e segue-se o else.
      return { current: "tryL", nodes: ["tryL", "tryNotL"], edges: ["tryL-tryNotL"], rule: "backtrack" };
    case "result": {
      if (e.sat === null) return none;
      const end = rootReturn(trace);
      return { current: end, nodes: [end], edges: [], rule: e.sat ? "sat" : "conflict" };
    }
    default:
      return none;
  }
}

/**
 * Em que chamada DLL(…) está o passo `index`: { node, depth, literals }.
 * literals = os literais escolhidos desde a raiz até essa chamada (vazio na chamada inicial).
 */
export function callOf(trace, index) {
  const parent = { 0: null };
  const literal = { 0: null };
  let node = 0;
  for (let i = 0; i <= index && i < trace.length; i++) {
    const e = trace[i];
    if (e.type === "branch") {
      parent[e.node] = e.parent;
      literal[e.node] = e.literal;
    }
    if (e.type === "backtrack") node = e.to;
    else if (e.type === "result") node = 0;
    else if (e.node !== undefined) node = e.node;
  }
  const literals = [];
  for (let n = node; n !== null && n !== 0; n = parent[n]) literals.unshift(literal[n]);
  return { node, depth: literals.length, literals };
}
