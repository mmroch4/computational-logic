// Como se resolve cada laboratório no modo guiado. Cada passo é `{ pick, rule }`: tocar nas linhas `pick` e
// carregar na regra. Os testes correm isto no núcleo e o scripts/check-learn.mjs repete-o no Chrome, com
// toques.
export const LAB_GUIDED = {
  labBackward: [
    { rule: "→I" },
    { pick: [1, 2], rule: "→E" },
    { rule: "∧I" },
    { pick: [3], rule: "∧E" },
    { pick: [3], rule: "∧E" },
  ],
  labCases: [
    { pick: [1], rule: "∨E" },
    { pick: [3], rule: "R" },
    { pick: [2, 5], rule: "→E" },
  ],
  labAbsurd: [
    { rule: "RA" },
    { pick: [1, 3], rule: "→E" },
    { pick: [2, 4], rule: "FI" },
  ],
};
