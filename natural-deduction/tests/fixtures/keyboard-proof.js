// Prova com subdeduções encaixadas e seguidas, feita só com o teclado. Usada em tests/editor.test.js,
// sobre o estado puro, e em scripts/check-editor.mjs, com teclas a sério no Chrome.

export const KEYBOARD_GOAL = "p ∨ q ⊢ (p → r) → ((q → r) → r)";

const OPEN = { key: "Enter", ctrl: true };
const CLOSE = { key: "Enter", shift: true };
const ENTER = { key: "Enter" };

/** Cada entrada é um texto a escrever no campo do cursor, ou uma tecla. */
export const KEYBOARD_STEPS = [
  OPEN, "p -> r",
  OPEN, "q -> r",
  OPEN, "p",
  ENTER, "r", ENTER, "->E, 2, 4",
  CLOSE, OPEN, "q",
  ENTER, "r", ENTER, "->E 3 6",
  CLOSE, "r", ENTER, "vE, 1, 4-5, 6-7",
  CLOSE, "(q -> r) -> r", ENTER, "->I, 3-8",
  CLOSE, "(p -> r) -> ((q -> r) -> r)", ENTER, "->I, 2-9",
];

/** Número de linhas da prova acabada. */
export const KEYBOARD_LINES = 10;
