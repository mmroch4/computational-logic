// O que o painel de ajuda mostra. Módulo puro (sem DOM), e sem o solver, que só corre no Worker.
// Um painel é um destes estados:
//   { view: "idle" }                                  ainda nada pedido
//   { view: "searching", task }                       task: "hint" | "solve"
//   { view: "hint", target, levels, revealed }        `revealed` níveis à vista, de 1 a 3
//   { view: "solution", proof, start, reason }        de `completeProof`
//   { view: "invalid", valuation, freeVariables, hasPremises }   valuation: [[nome, valor]]
//   { view: "done" } | { view: "noProof" } | { view: "cancelled" }
//   { view: "failed", error }
//
// Contrato:
//   panelFromResult(result, goal) → o estado para um resultado de `hint` ou de `completeProof`
//   canRevealMore(panel), revealMore(panel)
//   errorKey(error) → a chave do texto de um erro da procura

import { variablesOf } from "./semantics.js";

export const IDLE = Object.freeze({ view: "idle" });

export const searching = (task) => ({ view: "searching", task });

/** Quantos níveis tem uma dica. */
export const HINT_LEVELS = 3;

const unknownPanel = (error) => (error.code === "cancelled" ? { view: "cancelled" } : { view: "failed", error });

function invalidPanel(counterexample, goal) {
  const formulas = [...goal.premises, goal.conclusion];
  return {
    view: "invalid",
    valuation: [...counterexample],
    freeVariables: variablesOf(formulas).some((name) => !counterexample.has(name)),
    hasPremises: goal.premises.length > 0,
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
      return invalidPanel(result.counterexample, goal);
    case "unknown":
      return unknownPanel(result.error);
    default:
      return { view: result.status };
  }
}

export const canRevealMore = ({ view, revealed }) => view === "hint" && revealed < HINT_LEVELS;

export const revealMore = (panel) => (canRevealMore(panel) ? { ...panel, revealed: panel.revealed + 1 } : panel);

/** `tooManyVariables` vem da semântica; os outros, do solver e do Worker. */
export const errorKey = ({ code }) => (
  code === "tooManyVariables" ? `semantics.errors.${code}` : `solver.errors.${code}`
);
