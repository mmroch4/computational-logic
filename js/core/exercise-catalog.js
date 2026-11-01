// Catálogo de exercícios de prova, todos originais. O formato está em `exercises.js`, e os testes
// passam cada solução pelo verificador e cada sequente pela lista dos materiais da cadeira.

export const EXERCISES = Object.freeze([
  // Nível 1: sem subdeduções.
  {
    id: "ex-pick-and-pair",
    level: 1,
    sequent: "m ∧ n, k ⊢ n ∧ (k ∧ m)",
    rules: { set: "restrito", only: ["∧I", "∧E"] },
    solution: `
1 | m ∧ n         premissa
2 | k             premissa
3 | n             ∧E, 1
4 | m             ∧E, 1
5 | k ∧ m         ∧I, 2, 4
6 | n ∧ (k ∧ m)   ∧I, 3, 5`,
  },
  {
    id: "ex-two-links",
    level: 1,
    sequent: "r → s, s → t, r ⊢ t ∧ r",
    rules: "base",
    solution: `
1 | r → s   premissa
2 | s → t   premissa
3 | r       premissa
4 | s       →E, 3, 1
5 | t       →E, 4, 2
6 | t ∧ r   ∧I, 5, 3`,
  },
  {
    id: "ex-inner-corners",
    level: 1,
    sequent: "a ∧ b ∧ (c ∧ d) ⊢ d ∧ a",
    rules: { set: "restrito", only: ["∧I", "∧E"] },
    solution: `
1 | a ∧ b ∧ (c ∧ d)   premissa
2 | c ∧ d             ∧E, 1
3 | d                 ∧E, 2
4 | a ∧ b             ∧E, 1
5 | a                 ∧E, 4
6 | d ∧ a             ∧I, 3, 5`,
  },
  {
    id: "ex-split-the-consequent",
    level: 1,
    sequent: "h → i ∧ j, h ⊢ j ∧ h",
    rules: { set: "restrito", only: ["∧I", "∧E", "→E"] },
    solution: `
1 | h → i ∧ j   premissa
2 | h           premissa
3 | i ∧ j       →E, 2, 1
4 | j           ∧E, 3
5 | j ∧ h       ∧I, 4, 2`,
  },
  {
    id: "ex-either-side",
    level: 1,
    sequent: "d ⊢ (c ∨ d) ∧ (d ∨ e)",
    rules: { set: "restrito", only: ["∨I", "∧I"] },
    solution: `
1 | d                   premissa
2 | c ∨ d               ∨I, 1
3 | d ∨ e               ∨I, 1
4 | (c ∨ d) ∧ (d ∨ e)   ∧I, 2, 3`,
  },
  {
    id: "ex-peel-the-negations",
    level: 1,
    sequent: "¬¬s ∧ t ⊢ t ∧ s",
    rules: { set: "restrito", only: ["∧I", "∧E", "¬E"] },
    solution: `
1 | ¬¬s ∧ t   premissa
2 | t         ∧E, 1
3 | ¬¬s       ∧E, 1
4 | s         ¬E, 3
5 | t ∧ s     ∧I, 2, 4`,
  },
  {
    id: "ex-anything-goes",
    level: 1,
    sequent: "w, ¬w ⊢ u",
    rules: { set: "restrito", only: ["FI", "FE"] },
    solution: `
1 | w    premissa
2 | ¬w   premissa
3 | F    FI, 1, 2
4 | u    FE, 3`,
  },
  {
    id: "ex-packed-implication",
    level: 1,
    sequent: "(m → n) ∧ m ⊢ n ∨ k",
    rules: { set: "restrito", only: ["∧I", "∧E", "→E", "∨I"] },
    solution: `
1 | (m → n) ∧ m   premissa
2 | m             ∧E, 1
3 | m → n         ∧E, 1
4 | n             →E, 2, 3
5 | n ∨ k         ∨I, 4`,
  },
  {
    id: "ex-three-negations",
    level: 1,
    sequent: "¬¬¬a ⊢ ¬a",
    rules: { set: "restrito", only: ["¬E"] },
    hints: ["innerDoubleNegation"],
    solution: `
1 | ¬¬¬a   premissa
2 | ¬a     ¬E, 1`,
  },
  {
    id: "ex-broken-pair",
    level: 1,
    sequent: "c ∧ ¬c ⊢ d ∨ e",
    rules: "base",
    solution: `
1 | c ∧ ¬c   premissa
2 | c        ∧E, 1
3 | ¬c       ∧E, 1
4 | F        FI, 2, 3
5 | d ∨ e    FE, 4`,
  },
  // Nível 2: →I.
  {
    id: "ex-same-thing",
    level: 2,
    sequent: "⊢ a → a",
    rules: { set: "restrito", only: ["→I", "R"] },
    solution: `
1 |   a     hipótese
2 | a → a   →I, 1–1`,
  },
  {
    id: "ex-unused-hypothesis",
    level: 2,
    sequent: "k ∧ l ⊢ j → l",
    rules: { set: "restrito", only: ["→I", "∧E"] },
    solution: `
1 | k ∧ l   premissa
2 |   j     hipótese
3 |   l     ∧E, 1
4 | j → l   →I, 2–3`,
  },
  {
    id: "ex-pack-the-antecedent",
    level: 2,
    sequent: "a → b → c ⊢ a ∧ b → c",
    rules: "base",
    solution: `
1 | a → b → c   premissa
2 |   a ∧ b     hipótese
3 |   b         ∧E, 2
4 |   a         ∧E, 2
5 |   b → c     →E, 4, 1
6 |   c         →E, 3, 5
7 | a ∧ b → c   →I, 2–6`,
  },
  {
    id: "ex-both-sides",
    level: 2,
    sequent: "(a → b) ∧ (c → d) ⊢ a ∧ c → b ∧ d",
    rules: "base",
    solution: `
 1 | (a → b) ∧ (c → d)   premissa
 2 |   a ∧ c             hipótese
 3 |   a                 ∧E, 2
 4 |   a → b             ∧E, 1
 5 |   b                 →E, 3, 4
 6 |   c                 ∧E, 2
 7 |   c → d             ∧E, 1
 8 |   d                 →E, 6, 7
 9 |   b ∧ d             ∧I, 5, 8
10 | a ∧ c → b ∧ d       →I, 2–9`,
  },
  {
    id: "ex-meet-in-the-middle",
    level: 2,
    sequent: "f → g, f → h, g ∧ h → i ⊢ f → i",
    rules: "base",
    solution: `
1 | f → g       premissa
2 | f → h       premissa
3 | g ∧ h → i   premissa
4 |   f         hipótese
5 |   g         →E, 4, 1
6 |   h         →E, 4, 2
7 |   g ∧ h     ∧I, 5, 6
8 |   i         →E, 7, 3
9 | f → i       →I, 4–8`,
  },
  {
    id: "ex-keep-what-you-have",
    level: 2,
    sequent: "b → c ⊢ a ∧ b → c ∧ a",
    rules: "base",
    solution: `
1 | b → c           premissa
2 |   a ∧ b         hipótese
3 |   b             ∧E, 2
4 |   c             →E, 3, 1
5 |   a             ∧E, 2
6 |   c ∧ a         ∧I, 4, 5
7 | a ∧ b → c ∧ a   →I, 2–6`,
  },
  {
    id: "ex-remember-the-or",
    level: 2,
    sequent: "a ∨ b → c ⊢ b → c ∧ (a ∨ b)",
    rules: "base",
    solution: `
1 | a ∨ b → c         premissa
2 |   b               hipótese
3 |   a ∨ b           ∨I, 2
4 |   c               →E, 3, 1
5 |   c ∧ (a ∨ b)     ∧I, 4, 3
6 | b → c ∧ (a ∨ b)   →I, 2–5`,
  },
  {
    id: "ex-longer-way-round",
    level: 2,
    sequent: "s → t ⊢ (t → u) → s ∧ w → u",
    rules: "base",
    solution: `
1 | s → t                 premissa
2 |   t → u               hipótese
3 |     s ∧ w             hipótese
4 |     s                 ∧E, 3
5 |     t                 →E, 4, 1
6 |     u                 →E, 5, 2
7 |   s ∧ w → u           →I, 3–6
8 | (t → u) → s ∧ w → u   →I, 2–7`,
  },
  {
    id: "ex-answer-the-question",
    level: 2,
    sequent: "(a → b) → c, b ⊢ c",
    rules: "base",
    hints: ["whatThePremiseAsks"],
    solution: `
1 | (a → b) → c   premissa
2 | b             premissa
3 |   a           hipótese
4 |   b           R, 2
5 | a → b         →I, 3–4
6 | c             →E, 5, 1`,
  },
  // Nível 3: ¬I e ∨E, e provar as derivadas mais curtas.
  {
    id: "ex-two-outcomes",
    level: 3,
    sequent: "a ∨ b, a → c, b → d ⊢ c ∨ d",
    rules: "base",
    solution: `
 1 | a ∨ b     premissa
 2 | a → c     premissa
 3 | b → d     premissa
 4 |   a       hipótese
 5 |   c       →E, 4, 2
 6 |   c ∨ d   ∨I, 5
 7 |   b       hipótese
 8 |   d       →E, 7, 3
 9 |   c ∨ d   ∨I, 8
10 | c ∨ d     ∨E, 1, 4–6, 7–9`,
  },
  {
    id: "ex-twice-the-same",
    level: 3,
    sequent: "a ∨ a ⊢ a",
    rules: "base",
    solution: `
1 | a ∨ a   premissa
2 |   a     hipótese
3 |   a     hipótese
4 | a       ∨E, 1, 2–2, 3–3`,
  },
  {
    id: "ex-left-of-the-pair",
    level: 3,
    sequent: "a ∧ b ∨ c ⊢ c ∨ a",
    rules: "base",
    solution: `
1 | a ∧ b ∨ c   premissa
2 |   a ∧ b     hipótese
3 |   a         ∧E, 2
4 |   c ∨ a     ∨I, 3
5 |   c         hipótese
6 |   c ∨ a     ∨I, 5
7 | c ∨ a       ∨E, 1, 2–4, 5–6`,
  },
  {
    id: "ex-carry-it-along",
    level: 3,
    sequent: "a ∨ b, c ⊢ a ∧ c ∨ b ∧ c",
    rules: "base",
    solution: `
1 | a ∨ b             premissa
2 | c                 premissa
3 |   a               hipótese
4 |   a ∧ c           ∧I, 3, 2
5 |   a ∧ c ∨ b ∧ c   ∨I, 4
6 |   b               hipótese
7 |   b ∧ c           ∧I, 6, 2
8 |   a ∧ c ∨ b ∧ c   ∨I, 7
9 | a ∧ c ∨ b ∧ c     ∨E, 1, 3–5, 6–8`,
  },
  {
    id: "ex-impossible-branch",
    level: 3,
    sequent: "a ∨ b, ¬a ∧ c ⊢ b ∧ c",
    rules: "base",
    solution: `
 1 | a ∨ b    premissa
 2 | ¬a ∧ c   premissa
 3 |   a      hipótese
 4 |   ¬a     ∧E, 2
 5 |   F      FI, 3, 4
 6 |   b      FE, 5
 7 |   b      hipótese
 8 | b        ∨E, 1, 3–6, 7–7
 9 | c        ∧E, 2
10 | b ∧ c    ∧I, 8, 9`,
  },
  {
    id: "ex-cannot-be-both",
    level: 3,
    sequent: "a → ¬b ⊢ ¬(a ∧ b)",
    rules: "base",
    solution: `
1 | a → ¬b     premissa
2 |   a ∧ b    hipótese
3 |   b        ∧E, 2
4 |   a        ∧E, 2
5 |   ¬b       →E, 4, 1
6 |   F        FI, 3, 5
7 | ¬(a ∧ b)   ¬I, 2–6`,
  },
  {
    id: "ex-self-defeating",
    level: 3,
    sequent: "a → b, b → ¬a ⊢ ¬a",
    rules: "base",
    solution: `
1 | a → b    premissa
2 | b → ¬a   premissa
3 |   a      hipótese
4 |   b      →E, 3, 1
5 |   ¬a     →E, 4, 2
6 |   F      FI, 3, 5
7 | ¬a       ¬I, 3–6`,
  },
  {
    id: "ex-half-of-nothing",
    level: 3,
    sequent: "¬(a ∨ b) ⊢ ¬a",
    rules: "base",
    solution: `
1 | ¬(a ∨ b)   premissa
2 |   a        hipótese
3 |   a ∨ b    ∨I, 2
4 |   F        FI, 3, 1
5 | ¬a         ¬I, 2–4`,
  },
  {
    id: "ex-prove-mt",
    level: 3,
    sequent: "p → q, ¬q ⊢ ¬p",
    rules: { set: "base", exclude: ["MT"] },
    solution: `
1 | p → q   premissa
2 | ¬q      premissa
3 |   p     hipótese
4 |   q     →E, 3, 1
5 |   F     FI, 4, 2
6 | ¬p      ¬I, 3–5`,
  },
  {
    id: "ex-prove-double-negation",
    level: 3,
    sequent: "p ⊢ ¬¬p",
    rules: { set: "base", exclude: ["¬¬I"] },
    solution: `
1 | p      premissa
2 |   ¬p   hipótese
3 |   F    FI, 1, 2
4 | ¬¬p    ¬I, 2–3`,
  },
  {
    id: "ex-prove-hypothetical-syllogism",
    level: 3,
    sequent: "p → q, q → r ⊢ p → r",
    rules: { set: "base", exclude: ["SH"] },
    solution: `
1 | p → q   premissa
2 | q → r   premissa
3 |   p     hipótese
4 |   q     →E, 3, 1
5 |   r     →E, 4, 2
6 | p → r   →I, 3–5`,
  },
  {
    id: "ex-prove-disjunctive-syllogism-left",
    level: 3,
    sequent: "p ∨ q, ¬p ⊢ q",
    rules: { set: "base", exclude: ["SD"] },
    solution: `
1 | p ∨ q   premissa
2 | ¬p      premissa
3 |   p     hipótese
4 |   F     FI, 3, 2
5 |   q     FE, 4
6 |   q     hipótese
7 |   q     R, 6
8 | q       ∨E, 1, 3–5, 6–7`,
  },
  {
    id: "ex-prove-disjunctive-syllogism-right",
    level: 3,
    sequent: "p ∨ q, ¬q ⊢ p",
    rules: { set: "base", exclude: ["SD"] },
    solution: `
1 | p ∨ q   premissa
2 | ¬q      premissa
3 |   p     hipótese
4 |   p     R, 3
5 |   q     hipótese
6 |   F     FI, 5, 2
7 |   p     FE, 6
8 | p       ∨E, 1, 3–4, 5–7`,
  },
  {
    id: "ex-prove-reductio",
    level: 3,
    sequent: "¬p → F ⊢ p",
    rules: { set: "base", exclude: ["RA"] },
    hints: ["goalThroughDoubleNegation"],
    solution: `
1 | ¬p → F   premissa
2 |   ¬p     hipótese
3 |   F      →E, 2, 1
4 | ¬¬p      ¬I, 2–3
5 | p        ¬E, 4`,
  },
  // Nível 4: usar as derivadas.
  {
    id: "ex-back-along-the-chain",
    level: 4,
    sequent: "x → y, y → z, ¬z ⊢ ¬x",
    rules: { set: "base", plus: ["MT"] },
    hints: ["backAlongTheChain"],
    solution: `
1 | x → y   premissa
2 | y → z   premissa
3 | ¬z      premissa
4 | ¬y      MT, 2, 3
5 | ¬x      MT, 1, 4`,
  },
  {
    id: "ex-rule-out-a-case",
    level: 4,
    sequent: "g ∨ h, ¬g, h → j ⊢ j",
    rules: "completo",
    solution: `
1 | g ∨ h   premissa
2 | ¬g      premissa
3 | h → j   premissa
4 | h       SD, 1, 2
5 | j       →E, 3, 4`,
  },
  {
    id: "ex-three-links",
    level: 4,
    sequent: "a → b, b → c, c → d ⊢ a → d",
    rules: { set: "base", plus: ["SH"] },
    solution: `
1 | a → b   premissa
2 | b → c   premissa
3 | c → d   premissa
4 | a → c   SH, 1, 2
5 | a → d   SH, 4, 3`,
  },
  {
    id: "ex-neither-then",
    level: 4,
    sequent: "¬(a ∨ b), c → a ⊢ ¬c ∧ ¬b",
    rules: { set: "base", plus: ["DM", "MT"] },
    solution: `
1 | ¬(a ∨ b)   premissa
2 | c → a      premissa
3 | ¬a ∧ ¬b    DM, 1
4 | ¬a         ∧E, 3
5 | ¬c         MT, 2, 4
6 | ¬b         ∧E, 3
7 | ¬c ∧ ¬b    ∧I, 5, 6`,
  },
  {
    id: "ex-only-the-other",
    level: 4,
    sequent: "¬(a ∧ b), a ⊢ ¬b",
    rules: "completo",
    hints: ["denyTheOtherSide"],
    solution: `
1 | ¬(a ∧ b)   premissa
2 | a          premissa
3 | ¬a ∨ ¬b    DM, 1
4 | ¬¬a        ¬¬I, 2
5 | ¬b         SD, 3, 4`,
  },
  {
    id: "ex-split-on-a",
    level: 4,
    sequent: "a → b, ¬a → c ⊢ b ∨ c",
    rules: { set: "base", plus: ["TE"] },
    hints: ["splitOnTheAntecedent"],
    solution: `
 1 | a → b     premissa
 2 | ¬a → c    premissa
 3 | a ∨ ¬a    TE
 4 |   a       hipótese
 5 |   b       →E, 4, 1
 6 |   b ∨ c   ∨I, 5
 7 |   ¬a      hipótese
 8 |   c       →E, 7, 2
 9 |   b ∨ c   ∨I, 8
10 | b ∨ c     ∨E, 3, 4–6, 7–9`,
  },
  {
    id: "ex-assume-the-opposite",
    level: 4,
    sequent: "¬a → b, ¬b ⊢ a",
    rules: { set: "base", plus: ["RA"] },
    solution: `
1 | ¬a → b   premissa
2 | ¬b       premissa
3 |   ¬a     hipótese
4 |   b      →E, 3, 1
5 |   F      FI, 4, 2
6 | a        RA, 3–5`,
  },
  {
    id: "ex-or-as-implication",
    level: 4,
    sequent: "a ∨ b, a → c ⊢ ¬c → b",
    rules: "completo",
    solution: `
1 | a ∨ b    premissa
2 | a → c    premissa
3 |   ¬c     hipótese
4 |   ¬a     MT, 2, 3
5 |   b      SD, 1, 4
6 | ¬c → b   →I, 3–5`,
  },
  {
    id: "ex-through-a-denial",
    level: 4,
    sequent: "a ∨ b, ¬a, b → c, ¬c ∨ d ⊢ d",
    rules: "completo",
    hints: ["doubleNegateToCancel"],
    solution: `
1 | a ∨ b    premissa
2 | ¬a       premissa
3 | b → c    premissa
4 | ¬c ∨ d   premissa
5 | b        SD, 1, 2
6 | c        →E, 5, 3
7 | ¬¬c      ¬¬I, 6
8 | d        SD, 4, 7`,
  },
  // Nível 5: De Morgan, terceiro excluído e provas longas só com regras base.
  {
    id: "ex-prove-de-morgan-not-and",
    level: 5,
    sequent: "¬(p ∧ q) ⊢ ¬p ∨ ¬q",
    rules: { set: "base", exclude: ["DM"] },
    hints: ["negateTheWholeGoal", "refuteEachDisjunct"],
    solution: `
 1 | ¬(p ∧ q)       premissa
 2 |   ¬(¬p ∨ ¬q)   hipótese
 3 |     ¬p         hipótese
 4 |     ¬p ∨ ¬q    ∨I, 3
 5 |     F          FI, 4, 2
 6 |   ¬¬p          ¬I, 3–5
 7 |   p            ¬E, 6
 8 |     ¬q         hipótese
 9 |     ¬p ∨ ¬q    ∨I, 8
10 |     F          FI, 9, 2
11 |   ¬¬q          ¬I, 8–10
12 |   q            ¬E, 11
13 |   p ∧ q        ∧I, 7, 12
14 |   F            FI, 13, 1
15 | ¬¬(¬p ∨ ¬q)    ¬I, 2–14
16 | ¬p ∨ ¬q        ¬E, 15`,
  },
  {
    id: "ex-prove-de-morgan-or-of-nots",
    level: 5,
    sequent: "¬p ∨ ¬q ⊢ ¬(p ∧ q)",
    rules: { set: "base", exclude: ["DM"] },
    solution: `
 1 | ¬p ∨ ¬q    premissa
 2 |   p ∧ q    hipótese
 3 |   p        ∧E, 2
 4 |   q        ∧E, 2
 5 |     ¬p     hipótese
 6 |     F      FI, 3, 5
 7 |     ¬q     hipótese
 8 |     F      FI, 4, 7
 9 |   F        ∨E, 1, 5–6, 7–8
10 | ¬(p ∧ q)   ¬I, 2–9`,
  },
  {
    id: "ex-prove-de-morgan-not-or",
    level: 5,
    sequent: "¬(p ∨ q) ⊢ ¬p ∧ ¬q",
    rules: { set: "base", exclude: ["DM"] },
    solution: `
 1 | ¬(p ∨ q)   premissa
 2 |   p        hipótese
 3 |   p ∨ q    ∨I, 2
 4 |   F        FI, 3, 1
 5 | ¬p         ¬I, 2–4
 6 |   q        hipótese
 7 |   p ∨ q    ∨I, 6
 8 |   F        FI, 7, 1
 9 | ¬q         ¬I, 6–8
10 | ¬p ∧ ¬q    ∧I, 5, 9`,
  },
  {
    id: "ex-prove-de-morgan-and-of-nots",
    level: 5,
    sequent: "¬p ∧ ¬q ⊢ ¬(p ∨ q)",
    rules: { set: "base", exclude: ["DM"] },
    solution: `
 1 | ¬p ∧ ¬q    premissa
 2 | ¬p         ∧E, 1
 3 | ¬q         ∧E, 1
 4 |   p ∨ q    hipótese
 5 |     p      hipótese
 6 |     F      FI, 5, 2
 7 |     q      hipótese
 8 |     F      FI, 7, 3
 9 |   F        ∨E, 4, 5–6, 7–8
10 | ¬(p ∨ q)   ¬I, 4–9`,
  },
  {
    id: "ex-prove-excluded-middle",
    level: 5,
    sequent: "⊢ p ∨ ¬p",
    rules: { set: "base", exclude: ["TE"] },
    hints: ["negateTheWholeGoal", "reachTheGoalTwice"],
    solution: `
1 |   ¬(p ∨ ¬p)   hipótese
2 |     p         hipótese
3 |     p ∨ ¬p    ∨I, 2
4 |     F         FI, 3, 1
5 |   ¬p          ¬I, 2–4
6 |   p ∨ ¬p      ∨I, 5
7 |   F           FI, 6, 1
8 | ¬¬(p ∨ ¬p)    ¬I, 1–7
9 | p ∨ ¬p        ¬E, 8`,
  },
  {
    id: "ex-one-way-or-the-other",
    level: 5,
    sequent: "⊢ (a → b) ∨ (b → a)",
    rules: "base",
    hints: ["negateTheWholeGoal", "emptyImplication"],
    solution: `
 1 |   ¬((a → b) ∨ (b → a))   hipótese
 2 |     a                    hipótese
 3 |       b                  hipótese
 4 |       a                  R, 2
 5 |     b → a                →I, 3–4
 6 |     (a → b) ∨ (b → a)    ∨I, 5
 7 |     F                    FI, 6, 1
 8 |     b                    FE, 7
 9 |   a → b                  →I, 2–8
10 |   (a → b) ∨ (b → a)      ∨I, 9
11 |   F                      FI, 10, 1
12 | ¬¬((a → b) ∨ (b → a))    ¬I, 1–11
13 | (a → b) ∨ (b → a)        ¬E, 12`,
  },
  {
    id: "ex-one-is-enough",
    level: 5,
    sequent: "a ∧ b → c ⊢ (a → c) ∨ (b → c)",
    rules: "base",
    hints: ["negateTheWholeGoal"],
    solution: `
 1 | a ∧ b → c                 premissa
 2 |   ¬((a → c) ∨ (b → c))    hipótese
 3 |     b                     hipótese
 4 |       ¬a                  hipótese
 5 |         a                 hipótese
 6 |         F                 FI, 5, 4
 7 |         c                 FE, 6
 8 |       a → c               →I, 5–7
 9 |       (a → c) ∨ (b → c)   ∨I, 8
10 |       F                   FI, 9, 2
11 |     ¬¬a                   ¬I, 4–10
12 |     a                     ¬E, 11
13 |     a ∧ b                 ∧I, 12, 3
14 |     c                     →E, 13, 1
15 |   b → c                   →I, 3–14
16 |   (a → c) ∨ (b → c)       ∨I, 15
17 |   F                       FI, 16, 2
18 | ¬¬((a → c) ∨ (b → c))     ¬I, 2–17
19 | (a → c) ∨ (b → c)         ¬E, 18`,
  },
  {
    id: "ex-exactly-one",
    level: 5,
    sequent: "¬(a ∧ b), a ∨ b ⊢ a ∧ ¬b ∨ b ∧ ¬a",
    rules: "base",
    hints: ["casesFromTheDisjunction"],
    solution: `
 1 | ¬(a ∧ b)            premissa
 2 | a ∨ b               premissa
 3 |   a                 hipótese
 4 |     b               hipótese
 5 |     a ∧ b           ∧I, 3, 4
 6 |     F               FI, 5, 1
 7 |   ¬b                ¬I, 4–6
 8 |   a ∧ ¬b            ∧I, 3, 7
 9 |   a ∧ ¬b ∨ b ∧ ¬a   ∨I, 8
10 |   b                 hipótese
11 |     a               hipótese
12 |     a ∧ b           ∧I, 11, 10
13 |     F               FI, 12, 1
14 |   ¬a                ¬I, 11–13
15 |   b ∧ ¬a            ∧I, 10, 14
16 |   a ∧ ¬b ∨ b ∧ ¬a   ∨I, 15
17 | a ∧ ¬b ∨ b ∧ ¬a     ∨E, 2, 3–9, 10–16`,
  },
  {
    id: "ex-undo-the-implication",
    level: 5,
    sequent: "(a → b) → c ⊢ (¬a → c) ∧ (b → c)",
    rules: "base",
    solution: `
 1 | (a → b) → c          premissa
 2 |   ¬a                 hipótese
 3 |     a                hipótese
 4 |     F                FI, 3, 2
 5 |     b                FE, 4
 6 |   a → b              →I, 3–5
 7 |   c                  →E, 6, 1
 8 | ¬a → c               →I, 2–7
 9 |   b                  hipótese
10 |     a                hipótese
11 |     b                R, 9
12 |   a → b              →I, 10–11
13 |   c                  →E, 12, 1
14 | b → c                →I, 9–13
15 | (¬a → c) ∧ (b → c)   ∧I, 8, 14`,
  },
  {
    id: "ex-share-the-hypothesis",
    level: 5,
    sequent: "a → b ∨ c ⊢ (a → b) ∨ (a → c)",
    rules: "base",
    hints: ["negateTheWholeGoal", "recoverTheAntecedent"],
    solution: `
 1 | a → b ∨ c                premissa
 2 |   ¬((a → b) ∨ (a → c))   hipótese
 3 |     ¬a                   hipótese
 4 |       a                  hipótese
 5 |       F                  FI, 4, 3
 6 |       b                  FE, 5
 7 |     a → b                →I, 4–6
 8 |     (a → b) ∨ (a → c)    ∨I, 7
 9 |     F                    FI, 8, 2
10 |   ¬¬a                    ¬I, 3–9
11 |   a                      ¬E, 10
12 |   b ∨ c                  →E, 11, 1
13 |     b                    hipótese
14 |       a                  hipótese
15 |       b                  R, 13
16 |     a → b                →I, 14–15
17 |     c                    hipótese
18 |       a                  hipótese
19 |       c                  R, 17
20 |     a → c                →I, 18–19
21 |     (a → b) ∨ (a → c)    ∨I, 20
22 |     F                    FI, 21, 2
23 |     a → b                FE, 22
24 |   a → b                  ∨E, 12, 13–16, 17–23
25 |   (a → b) ∨ (a → c)      ∨I, 24
26 |   F                      FI, 25, 2
27 | ¬¬((a → b) ∨ (a → c))    ¬I, 2–26
28 | (a → b) ∨ (a → c)        ¬E, 27`,
  },
]);
