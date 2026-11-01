// Gerador de conjuntos de cláusulas aleatórios, reprodutíveis a partir de uma seed.
// Variáveis p1, p2, …, pn. As cláusulas não têm literais
// repetidos nem tautologias (nunca p e ¬p na mesma cláusula), e o conjunto não tem cláusulas repetidas.

import { clauseKey } from "./clauses.js";
import { compareLiterals, lit } from "./literals.js";
import { solveDLL } from "./dll.js";

/**
 * Gerador pseudo-aleatório mulberry32: a mesma seed dá sempre a mesma sequência.
 * Devolve uma função que dá números em [0, 1).
 */
export function mulberry32(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seed como inteiro sem sinal de 32 bits. Números são truncados; texto que seja um número
 * (ex.: "42", vindo da URL) vale esse número; outro texto é convertido por hash (FNV-1a).
 */
export function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
  const text = String(seed ?? "").trim();
  if (/^\d+$/.test(text)) return Number(text) >>> 0;
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Seed nova ao acaso (para o botão "gerar"); depois vai para a URL para se poder reproduzir. */
export function randomSeed() {
  return Math.floor(Math.random() * 4294967296);
}

function binomial(n, k) {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/**
 * Quantas cláusulas diferentes existem com n variáveis e tamanho entre minSize e maxSize
 * (sem tautologias): para cada tamanho k, escolher k variáveis e um sinal para cada uma.
 */
export function maxDistinctClauses(vars, minSize, maxSize) {
  let total = 0;
  for (let k = minSize; k <= Math.min(maxSize, vars); k++) total += binomial(vars, k) * 2 ** k;
  return total;
}

export const GENERATOR_LIMITS = { minVars: 1, maxVars: 8, maxClauses: 60 };

/** Literais por cláusula: tamanho fixo ou mistura (a mistura é o que generateFormula faz por omissão). */
export const CLAUSE_SIZES = {
  2: { minSize: 2, maxSize: 2 },
  3: { minSize: 3, maxSize: 3 },
  mix: { minSize: 1, maxSize: 3 },
};

/**
 * Gera um conjunto de cláusulas.
 * Opções: seed, vars (nº de variáveis, 1–8), clauses (nº de cláusulas), minSize/maxSize (1–3).
 * Devolve { clauses, seed } (seed já normalizada). Se forem pedidas mais cláusulas do que as que
 * existem (ex.: 2 variáveis só dão 8), o conjunto fica com todas as possíveis.
 */
export function generateFormula({ seed = 0, vars = 3, clauses = 5, minSize = 1, maxSize = 3 } = {}) {
  const n = Math.min(Math.max(Math.trunc(vars) || 1, GENERATOR_LIMITS.minVars), GENERATOR_LIMITS.maxVars);
  const lo = Math.min(Math.max(Math.trunc(minSize) || 1, 1), 3, n);
  const hi = Math.min(Math.max(Math.trunc(maxSize) || 3, lo), 3, n);
  const wanted = Math.min(Math.max(Math.trunc(clauses) || 1, 1), GENERATOR_LIMITS.maxClauses, maxDistinctClauses(n, lo, hi));

  const normalized = normalizeSeed(seed);
  const random = mulberry32(normalized);
  const randInt = (a, b) => a + Math.floor(random() * (b - a + 1));
  const names = Array.from({ length: n }, (_, i) => `p${i + 1}`);

  const result = [];
  const seen = new Set();
  // Tentativas limitadas: com poucas cláusulas livres, sortear pode repetir muitas vezes.
  for (let attempt = 0; result.length < wanted && attempt < wanted * 200; attempt++) {
    const size = randInt(lo, hi);
    // k variáveis distintas (embaralhamento parcial de Fisher-Yates) → sem repetidos nem tautologias.
    const pool = [...names];
    for (let i = 0; i < size; i++) {
      const j = randInt(i, pool.length - 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const clause = pool.slice(0, size).map((v) => lit(v, random() < 0.5)).sort(compareLiterals);
    const key = clauseKey(clause);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clause);
  }
  return { clauses: result, seed: normalized };
}

// --- Gerar até acertar no pedido (UI do gerador) ---

/** O que o aluno pode pedir ao gerador: qualquer conjunto, só satisfazíveis ou só insatisfazíveis. */
export const GENERATOR_WANTS = ["any", "sat", "unsat"];

/** Quantas seeds seguidas se experimentam antes de desistir (cada uma corre o DLL uma vez). */
const GENERATOR_MAX_TRIES = 300;

/**
 * Gera conjuntos a partir de `seed`, `seed + 1`, … até o DLL dar o resultado pedido em `want`.
 * Devolve { clauses, seed, sat, tries, found }: `seed` é a que deu o conjunto, por isso
 * generateFormula({ seed, vars, clauses }) volta a dar o mesmo (é essa que vai para a URL).
 * Se nenhuma servir em `maxTries` (ex.: insatisfazível com 8 variáveis e 2 cláusulas é impossível),
 * devolve found: false com o último conjunto gerado.
 */
export function generateWanted({ want = "any", maxTries = GENERATOR_MAX_TRIES, ...options } = {}) {
  const goal = GENERATOR_WANTS.includes(want) ? want : "any";
  let seed = normalizeSeed(options.seed);
  let last = null;
  for (let tries = 1; tries <= maxTries; tries++) {
    const { clauses } = generateFormula({ ...options, seed });
    const { result } = solveDLL(clauses);
    last = { clauses, seed, sat: result.sat, tries };
    // sat === null: o DLL atingiu o limite de passos (não acontece com ≤ 8 variáveis, mas não conta).
    const ok = result.sat !== null && (goal === "any" || result.sat === (goal === "sat"));
    if (ok) return { ...last, found: true };
    seed = (seed + 1) >>> 0;
  }
  return { ...last, found: false };
}
