// Verificação independente do DLL: avaliar um conjunto numa valoração e
// decidir a satisfazibilidade pela tabela de verdade (força bruta).
// Não usa nada do dll.js, para poder servir de "oráculo" nos testes.
// Módulo puro (sem DOM).

import { variablesOf } from "./clauses.js";

/**
 * Valor de uma cláusula numa valoração (possivelmente parcial) { variável: true/false }.
 * true  → algum literal é verdadeiro;
 * false → todos os literais são falsos (a cláusula vazia F é sempre false);
 * null  → ainda não se sabe (há literais sem valor e nenhum verdadeiro).
 */
export function evaluateClause(clause, assignment) {
  let undecided = false;
  for (const l of clause) {
    if (!(l.v in assignment)) undecided = true;
    else if (assignment[l.v] === !l.neg) return true;
  }
  return undecided ? null : false;
}

/**
 * Valor do conjunto S (conjunção das cláusulas) na valoração.
 * true → todas as cláusulas são verdadeiras (o conjunto vazio é sempre true);
 * false → alguma cláusula é falsa; null → nenhuma é falsa mas alguma está por decidir.
 */
export function evaluate(S, assignment) {
  let undecided = false;
  for (const clause of S) {
    const value = evaluateClause(clause, assignment);
    if (value === false) return false;
    if (value === null) undecided = true;
  }
  return undecided ? null : true;
}

/**
 * Satisfazibilidade pela tabela de verdade: experimenta as 2ⁿ valorações das
 * variáveis de S (em ordem alfabética natural; cada linha começa por V, como nas
 * tabelas de verdade) e para na primeira que satisfaz S.
 * Devolve { sat, assignment, checked } — checked = nº de linhas avaliadas.
 */
export function bruteForceSat(S) {
  const vars = variablesOf(S);
  const rows = 2 ** vars.length;
  for (let row = 0; row < rows; row++) {
    const assignment = {};
    vars.forEach((v, i) => {
      // A 1.ª variável é o bit mais significativo: bit 0 → V, bit 1 → F.
      const bit = (row >> (vars.length - 1 - i)) & 1;
      assignment[v] = bit === 0;
    });
    if (evaluate(S, assignment) === true) return { sat: true, assignment, checked: row + 1 };
  }
  return { sat: false, assignment: null, checked: rows };
}
