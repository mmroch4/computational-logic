// A prova de tests/fixtures/keyboard-proof.js, agora sem escrever fórmulas. Usada em tests/guided.test.js,
// sobre o estado puro, e em scripts/check-guided.mjs, com toques no Chrome a 390px.

/** Cada entrada: as linhas a selecionar e a regra a aplicar. */
export const GUIDED_STEPS = [
  { select: [], rule: "→I" },
  { select: [], rule: "→I" },
  { select: [1], rule: "∨E" },
  { select: [2], rule: "→E" },
  { select: [3], rule: "→E" },
];
