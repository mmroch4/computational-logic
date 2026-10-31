// O trabalho que corre fora da página. Módulo puro (sem DOM).
// Contrato:
//   runSolverTask({ type: "solve", goal, options })        → resultado de `solve`
//   runSolverTask({ type: "hint", proof, goal, options })  → resultado de `hint`
// A tarefa e o resultado atravessam o `postMessage`, por isso são só dados: fórmulas, regras, provas,
// `Map`s de valorações e as testemunhas de `countermodel.js`.

import { hint } from "./hints.js";
import { solve } from "./solver.js";

export function runSolverTask({ type, goal, proof, options }) {
  if (type === "solve") return solve(goal, options);
  if (type === "hint") return hint(proof, goal, options);
  throw new Error(`Tarefa desconhecida: ${type}`);
}
