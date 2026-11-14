// Como se resolve cada laboratório no modo guiado. Cada passo é `{ pick, rule }`: tocar nas linhas `pick` e
// carregar na regra. Os testes correm isto no núcleo e o scripts/check-learn.mjs repete-o no Chrome, com
// toques. `ask: true` marca um passo em que a ferramenta escolhe um termo ou a variável de uma caixa: no
// Chrome, o passo fica à espera e confirma-se com um toque na escolha.
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
  labForall: [
    { rule: "∀I", ask: true },
    { rule: "→I" },
    { pick: [1], rule: "∀E", ask: true },
    { pick: [2, 3], rule: "→E" },
    { pick: [4], rule: "∧E" },
  ],
  labExists: [
    { pick: [1], rule: "∃E", ask: true },
    { rule: "∃I", ask: true },
    { pick: [2], rule: "∀E", ask: true },
    { pick: [4], rule: "→E" },
    { pick: [3], rule: "∧E" },
  ],
};
