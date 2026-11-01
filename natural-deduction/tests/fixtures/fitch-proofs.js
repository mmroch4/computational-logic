// Provas da vista de Fitch, também usadas por scripts/check-fitch.mjs no Chrome.

/** Quatro hipóteses encaixadas: `p ⊢ q → (r → (s → (t → p ∧ t)))`. */
export const NESTED = `
1  | p                               premissa
2  |   q                             hipótese
3  |     r                           hipótese
4  |       s                         hipótese
5  |         t                       hipótese
6  |         p ∧ t                   ∧I, 1, 5
7  |       t → p ∧ t                 →I, 5–6
8  |     s → (t → p ∧ t)             →I, 4–7
9  |   r → (s → (t → p ∧ t))         →I, 3–8
10 | q → (r → (s → (t → p ∧ t)))     →I, 2–9
`;

/** Duas subdeduções seguidas e subscritos: `a₁ ∨ a₂, a₁ → b, a₂ → b ⊢ b`. */
export const CASES = `
1 | a1 ∨ a2                  premissa
2 | a1 → b                   premissa
3 | a2 → b                   premissa
4 |   a1                     hipótese
5 |   b                      →E, 2, 4
6 |   a2                     hipótese
7 |   b                      →E, 3, 6
8 | b                        ∨E, 1, 4–5, 6–7
`;

/** Prova por acabar, com uma regra derivada, um erro e duas linhas incompletas. */
export const STATES = `
1 | ¬q                       premissa
2 | p → q                    premissa
3 | r                        premissa
4 | ¬p                       MT, 1, 2
5 | p                        ∧E, 4
6 | ?                        ∧I, 1, 2
7 | q
`;

export const NESTED_GOAL = "p ⊢ q → (r → (s → (t → p ∧ t)))";

/** A mesma prova com variáveis longas: não cabe em 390px e tem de usar o scroll próprio. */
const widen = (text) => text.replace(/\b[pqrst]\b/g, "$&_longo");
export const WIDE = widen(NESTED);
export const WIDE_GOAL = widen(NESTED_GOAL);

export const CASES_GOAL = "a1 ∨ a2, a1 → b, a2 → b ⊢ b";
export const STATES_GOAL = "¬q, p → q ⊢ ¬p";
