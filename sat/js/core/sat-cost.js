// Custo da tabela de verdade (2ⁿ linhas) comparado com os passos do DLL (§1 da página Aprender).
//
// Os "passos" contam como no Passo a passo: cada evento do trace depois do início
// (propagação, escolha, conflito, retrocesso, satisfazível) mais o resultado final,
// ou seja, trace.length - 1. Assim o número bate com o contador "Passo i de n".

import { parse } from "./parser.js";
import { variablesOf } from "./clauses.js";
import { solveDLL } from "./dll.js";
import { getExample } from "./examples.js";

/** Limites do slider de variáveis. 2³⁰ ≈ mil milhões de linhas: já chega para se ver a explosão. */
export const MIN_VARS = 1;
export const MAX_VARS = 30;

/** Exemplos mostrados na tabela, do mais pequeno ao maior. */
export const COST_EXAMPLE_IDS = ["two-branches", "three-vars-a", "unit-then-branch", "pigeons-3-2", "extra-8-vars", "propagation-chain"];

/** Número de linhas da tabela de verdade com n variáveis: 2ⁿ. */
export function truthTableRows(n) {
  return 2 ** n;
}

/** Garante um inteiro entre MIN_VARS e MAX_VARS (valores inválidos dão MIN_VARS). */
export function clampVars(n) {
  const value = Number.parseInt(n, 10);
  if (!Number.isFinite(value)) return MIN_VARS;
  return Math.min(Math.max(value, MIN_VARS), MAX_VARS);
}

/** Custo de um conjunto de cláusulas: { vars, rows, steps, nodes, sat }. */
export function dllCost(clauses) {
  const { trace, result } = solveDLL(clauses);
  const vars = variablesOf(clauses).length;
  return {
    vars,
    rows: truthTableRows(vars),
    steps: trace.length - 1,
    nodes: result.stats.nodes,
    sat: result.sat,
  };
}

/** Custos dos exemplos (por omissão os de COST_EXAMPLE_IDS), com o exemplo e as cláusulas. */
export function exampleCosts(ids = COST_EXAMPLE_IDS) {
  return ids.map((id) => {
    const example = getExample(id);
    const { clauses } = parse(example.input);
    return { example, clauses, ...dllCost(clauses) };
  });
}
