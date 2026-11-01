// Link partilhável: fórmula e algoritmo ↔ query string (`?f=<compacta>&a=dll`).
// Módulo puro: recebe e devolve texto; a UI é que lê/escreve `location.search`.

import { formatSet } from "./clauses.js";

/** Algoritmos conhecidos: o DLL e o DP original de 1960 (por resolução). */
export const ALGORITHMS = ["dll", "dp"];
export const DEFAULT_ALGORITHM = "dll";

/**
 * Texto da fórmula para o link, na notação compacta ("p1, -p1 -p2").
 * O conjunto vazio não tem forma compacta (o parser recusa o texto vazio), por isso vai como "{}".
 */
export function shareFormula(clauses) {
  return clauses.length === 0 ? "{}" : formatSet(clauses, "compact");
}

/**
 * Codifica um valor para a query string mantendo-o legível:
 * vírgulas ficam vírgulas e espaços passam a "+" (URLSearchParams lê "+" como espaço).
 */
function encodeValue(text) {
  return encodeURIComponent(text).replace(/%2C/gi, ",").replace(/%20/g, "+");
}

/**
 * Query string (sem "?") para partilhar um conjunto de cláusulas.
 * `params` junta outros parâmetros (ex.: { step: 3, view: "tree", seed: 42 }); null/undefined são ignorados.
 * Ex.: encodeShare(S) → "f=p1,+-p1+-p2,+p3+p2&a=dll"
 */
export function encodeShare(clauses, { algorithm = DEFAULT_ALGORITHM, params = {} } = {}) {
  const pairs = [["f", shareFormula(clauses)], ["a", algorithm]];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || key === "f" || key === "a") continue;
    pairs.push([key, String(value)]);
  }
  return pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeValue(value)}`).join("&");
}

/**
 * Lê uma query string (com ou sem "?"). Devolve
 * { formula: texto ou null (sem `f` ou só espaços), algorithm, params: os restantes parâmetros }.
 * A fórmula volta como texto: quem chama faz `parse(formula)` (deteção automática da notação).
 * Um algoritmo desconhecido passa a DEFAULT_ALGORITHM.
 */
export function decodeShare(search) {
  const query = new URLSearchParams(String(search ?? ""));
  const raw = query.get("f");
  const formula = raw === null || raw.trim() === "" ? null : raw;
  const a = query.get("a");
  const algorithm = ALGORITHMS.includes(a) ? a : DEFAULT_ALGORITHM;
  const params = {};
  for (const [key, value] of query) {
    if (key !== "f" && key !== "a") params[key] = value;
  }
  return { formula, algorithm, params };
}
