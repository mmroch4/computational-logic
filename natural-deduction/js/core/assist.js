// O que o painel de ajuda mostra. Módulo puro (sem DOM), e sem o solver, que só corre no Worker.
// Um painel é um destes estados:
//   { view: "idle" }                                  ainda nada pedido
//   { view: "searching", task }                       task: "hint" | "solve"
//   { view: "hint", target, levels, revealed }        `revealed` níveis à vista, de 1 a 3
//   { view: "solution", proof, start, reason }        de `completeProof`
//   { view: "invalid", valuation, freeVariables, hasPremises }   valuation: [[nome, valor]]
//   { view: "invalid", structure, hasPremises }       1.ª ordem: contramodelo finito (structures.js)
//   { view: "done" } | { view: "noProof" } | { view: "cancelled" }
//   { view: "failed", error }                         em 1.ª ordem, `undecided`: nem prova nem contramodelo
//
// Contrato:
//   panelFromResult(result, goal) → o estado para um resultado de `hint` ou de `completeProof`
//   canRevealMore(panel), revealMore(panel)
//   errorKey(error) → a chave do texto de um erro da procura

import { SEMANTICS_ERROR_CODES, variablesOf } from "./semantics.js";

export const IDLE = Object.freeze({ view: "idle" });

export const searching = (task) => ({ view: "searching", task });

/** Quantos níveis tem uma dica. */
export const HINT_LEVELS = 3;

function unknownPanel(error) {
  return error.code === "cancelled" ? { view: "cancelled" } : { view: "failed", error };
}

function invalidPanel({ counterexample, structure }, goal) {
  const hasPremises = goal.premises.length > 0;
  if (structure) return { view: "invalid", structure, hasPremises };
  const formulas = [...goal.premises, goal.conclusion];
  return {
    view: "invalid",
    valuation: [...counterexample],
    freeVariables: variablesOf(formulas).some((name) => !counterexample.has(name)),
    hasPremises,
  };
}

export function panelFromResult(result, goal) {
  switch (result.status) {
    case "step":
    case "fixLine":
    case "deadEnd":
      return { view: "hint", target: result.target ?? null, levels: result.levels, revealed: 1 };
    case "solved":
      return { view: "solution", proof: result.proof, start: result.start, reason: result.reason };
    case "invalid":
      return invalidPanel(result, goal);
    case "unknown":
      return unknownPanel(result.error);
    default:
      return { view: result.status };
  }
}

export const canRevealMore = ({ view, revealed }) => view === "hint" && revealed < HINT_LEVELS;

export const revealMore = (panel) => (canRevealMore(panel) ? { ...panel, revealed: panel.revealed + 1 } : panel);

/** Os erros da semântica têm o texto em `semantics.errors`; os outros, do solver e do Worker. */
export const errorKey = ({ code }) => (
  SEMANTICS_ERROR_CODES.includes(code) ? `semantics.errors.${code}` : `solver.errors.${code}`
);
