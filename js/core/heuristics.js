// Critérios para o select_literal.
//
// O select_literal pode ver-se como um parâmetro do algoritmo: uma boa escolha do literal pode
// tornar o DLL mais eficiente. Estes critérios escolhem uma VARIÁVEL que:
//   • ocorre mais vezes;
//   • tem o produto das ocorrências de l e de l̃ máximo;
//   • ocorre mais vezes nas cláusulas de tamanho mínimo.
// Depois de escolhida a variável, falta o sinal: qual dos dois ramos se tenta primeiro.
// A ferramenta usa a primeira variável por ordem alfabética e o ramo positivo primeiro;
// também se pode começar por ¬p.
// Em caso de empate fica a primeira variável por ordem alfabética natural (p2 < p11).
// Módulo puro (sem DOM).

import { variablesOf } from "./clauses.js";
import { lit } from "./literals.js";
import { solveDLL } from "./dll.js";

/** Critérios disponíveis, pela ordem em que aparecem na lição. */
export const HEURISTICS = ["alphabetical", "occurrences", "product", "shortest"];

/** Ramo tentado primeiro: o literal positivo (p) ou o negativo (¬p). */
export const POLARITIES = ["positive", "negative"];

/**
 * Nº de ocorrências de cada variável em S: { v: { pos, neg } }.
 * Com onlySize, conta só as cláusulas com esse nº de literais.
 */
export function occurrences(S, onlySize = null) {
  const counts = {};
  for (const v of variablesOf(S)) counts[v] = { pos: 0, neg: 0 };
  for (const clause of S) {
    if (onlySize !== null && clause.length !== onlySize) continue;
    for (const l of clause) counts[l.v][l.neg ? "neg" : "pos"]++;
  }
  return counts;
}

/**
 * Pontuação de cada variável segundo o critério (maior = melhor):
 *   alphabetical → 0 para todas (ganha a primeira por ordem alfabética);
 *   occurrences  → ocorrências de p mais as de ¬p;
 *   product      → ocorrências de p vezes as de ¬p;
 *   shortest     → ocorrências (p e ¬p) nas cláusulas de tamanho mínimo (sem contar F).
 * Devolve [{ v, score }] por ordem alfabética.
 */
export function scores(S, heuristic) {
  let counts;
  if (heuristic === "shortest") {
    const sizes = S.map((clause) => clause.length).filter((n) => n > 0);
    counts = occurrences(S, sizes.length ? Math.min(...sizes) : null);
  } else {
    counts = occurrences(S);
  }
  return Object.entries(counts).map(([v, { pos, neg }]) => {
    if (heuristic === "occurrences" || heuristic === "shortest") return { v, score: pos + neg };
    if (heuristic === "product") return { v, score: pos * neg };
    return { v, score: 0 };
  });
}

/** Variável escolhida pelo critério (a de pontuação máxima; empate → a primeira). null se S não tiver variáveis. */
export function chooseVariable(S, heuristic = "alphabetical") {
  let best = null;
  for (const entry of scores(S, heuristic)) {
    if (best === null || entry.score > best.score) best = entry;
  }
  return best ? best.v : null;
}

/**
 * Função select_literal para passar ao solveDLL (options.selectLiteral):
 * a variável do critério com o sinal do ramo que se tenta primeiro.
 */
export function makeSelectLiteral(heuristic = "alphabetical", polarity = "positive") {
  return (S) => {
    const v = chooseVariable(S, heuristic);
    return v === null ? null : lit(v, polarity === "negative");
  };
}

/**
 * Corre o DLL duas vezes sobre S com o mesmo critério: ramo ¬ primeiro
 * e ramo positivo primeiro (como a ferramenta). Devolve
 *   { negative: { trace, result }, positive: { trace, result }, smaller }
 * com smaller = "negative" | "positive" | "same" (pelo nº de nós da árvore).
 * Num conjunto insatisfazível os dois ramos são sempre percorridos até ao fim, por isso o sinal
 * só troca a ordem e o tamanho é o mesmo; num satisfazível, o ramo certo primeiro poupa trabalho.
 */
export function compareBranchOrder(S, heuristic = "alphabetical", options = {}) {
  const run = (polarity) =>
    solveDLL(S, { ...options, selectLiteral: makeSelectLiteral(heuristic, polarity) });
  const negative = run("negative");
  const positive = run("positive");
  const n = negative.result.stats.nodes;
  const p = positive.result.stats.nodes;
  const smaller = n === p ? "same" : n < p ? "negative" : "positive";
  return { negative, positive, smaller };
}
