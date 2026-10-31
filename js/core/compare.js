// Comparação DP (1960) × DLL (1962) sobre o mesmo conjunto S, para a página Passo a passo:
// nº de passos, tamanho máximo do conjunto, tempo e o tamanho de S ao longo dos passos.
//
// Um "passo" é uma operação que transforma o conjunto, nos dois algoritmos:
//   DLL: propagação unitária (unit) ou ramificação S ∪ {l} (branch);
//   DP:  propagação unitária (unit) ou eliminação de uma variável por resolução (resolve).
// O DLL pode voltar atrás (o conjunto volta a ser o do nó pai antes do ramo l̃); o DP nunca volta,
// mas o conjunto pode crescer muito. É essa diferença que o mini-gráfico mostra.
//
// Módulo puro (sem DOM); o relógio é injetado para os testes.

import { solveDLL } from "./dll.js";
import { solveDP } from "./dp.js";

/** Eventos que transformam o conjunto, por algoritmo. */
const STEP_EVENTS = { dll: ["unit", "branch"], dp: ["unit", "resolve"] };

/** Tempo mínimo de medição: fórmulas pequenas correm várias vezes para o tempo médio ser estável. */
const MIN_TIMING_MS = 20;
const MAX_TIMING_RUNS = 200;

/**
 * Tamanho do conjunto no início e depois de cada passo: [|S₀|, |S₁|, …].
 * O nº de passos é sizes.length - 1.
 */
export function setSizes(trace, algorithm) {
  const steps = STEP_EVENTS[algorithm];
  const sizes = [trace[0].S.length];
  for (const event of trace) {
    if (steps.includes(event.type)) sizes.push(event.after.length);
  }
  return sizes;
}

/** Nº do passo em que está o evento `index` do trace (0 = conjunto inicial), para marcar no gráfico. */
export function stepNumberAt(trace, algorithm, index) {
  const steps = STEP_EVENTS[algorithm];
  let n = 0;
  for (let i = 1; i <= index && i < trace.length; i++) {
    if (steps.includes(trace[i].type)) n++;
  }
  return n;
}

/**
 * Resumo de uma resolução: { result, steps, maxSize, sizes, limitSize }.
 * limitSize = tamanho que o conjunto teria tido na eliminação que o DP recusou (limite de cláusulas),
 * ou null.
 */
export function runSummary(trace, result, algorithm) {
  const sizes = setSizes(trace, algorithm);
  const limit = trace.find((event) => event.type === "limit");
  return { result, steps: sizes.length - 1, maxSize: Math.max(...sizes), sizes, limitSize: limit?.size ?? null };
}

const SOLVERS = { dll: solveDLL, dp: solveDP };

/**
 * Tempo médio (ms) de uma resolução: repete até somar MIN_TIMING_MS ou MAX_TIMING_RUNS vezes.
 * Se a primeira execução já demorar MIN_TIMING_MS, fica essa: num conjunto grande o JIT pesa
 * pouco e repetir só bloquearia a página mais tempo (M8.5).
 */
function timeRun(solve, S, now) {
  const first = now();
  solve(S); // aquecimento (a primeira execução inclui a compilação do JIT)
  const warmup = now() - first;
  if (warmup >= MIN_TIMING_MS) return warmup;
  let runs = 0;
  const start = now();
  let elapsed = 0;
  do {
    solve(S);
    runs++;
    elapsed = now() - start;
  } while (elapsed < MIN_TIMING_MS && runs < MAX_TIMING_RUNS);
  return elapsed / runs;
}

/**
 * Corre o DLL e o DP sobre S e devolve { dll, dp }, cada um com
 *   { result, steps, maxSize, sizes, ms }
 * ms = tempo médio de uma resolução em milissegundos (null se options.timing === false).
 * options.now: relógio em ms (por omissão performance.now).
 */
export function compareAlgorithms(S, options = {}) {
  const now = options.now ?? (() => globalThis.performance.now());
  const out = {};
  for (const algorithm of ["dll", "dp"]) {
    const solve = SOLVERS[algorithm];
    const { trace, result } = solve(S);
    out[algorithm] = {
      ...runSummary(trace, result, algorithm),
      ms: options.timing === false ? null : timeRun(solve, S, now),
    };
  }
  return out;
}
