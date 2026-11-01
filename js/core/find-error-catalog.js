// Catálogo de «encontra o passo errado», tudo original. O formato está em `find-error.js`, e os testes
// confirmam no verificador que cada prova tem um único erro, na linha e com o código indicados.

export const FIND_ERROR_PUZZLES = Object.freeze([
  {
    id: "ex-err-backwards-implication",
    level: 1,
    sequent: "g → h, h ⊢ g ∧ h",
    rules: "base",
    proof: `
1 | g → h   premissa
2 | h       premissa
3 | g       →E, 2, 1
4 | g ∧ h   ∧I, 3, 2`,
    line: 3,
    answer: "affirmedConsequent",
    distractors: ["laterLine", "missingCase", "ruleNotInSet"],
    explanation: "backwardsImplication",
  },
  {
    id: "ex-err-buried-double-negation",
    level: 1,
    sequent: "¬¬c ∧ d ⊢ c",
    rules: "base",
    proof: `
1 | ¬¬c ∧ d   premissa
2 | c         ¬E, 1`,
    line: 2,
    answer: "onlyOuterDoubleNegation",
    distractors: ["assumedPremise", "laterLine", "negationIntroResult"],
    explanation: "buriedDoubleNegation",
    solution: `
1 | ¬¬c ∧ d   premissa
2 | ¬¬c       ∧E, 1
3 | c         ¬E, 2`,
  },
  {
    id: "ex-err-invented-premise",
    level: 1,
    sequent: "q ∧ r ⊢ r ∧ x",
    rules: "base",
    proof: `
1 | q ∧ r   premissa
2 | x       premissa
3 | r       ∧E, 1
4 | r ∧ x   ∧I, 3, 2`,
    line: 2,
    answer: "assumedPremise",
    distractors: ["affirmedConsequent", "citesOpenSubproof", "deMorganShape"],
    explanation: "inventedPremise",
  },
  {
    id: "ex-err-forbidden-shortcut",
    level: 1,
    sequent: "e → f, ¬f ⊢ ¬e ∧ ¬f",
    rules: "base",
    proof: `
1 | e → f     premissa
2 | ¬f        premissa
3 | ¬e        MT, 1, 2
4 | ¬e ∧ ¬f   ∧I, 3, 2`,
    line: 3,
    answer: "ruleNotInSet",
    distractors: ["affirmedConsequent", "laterLine", "noSubproofCited"],
    explanation: "forbiddenShortcut",
    solution: `
1 | e → f     premissa
2 | ¬f        premissa
3 |   e       hipótese
4 |   f       →E, 3, 1
5 |   F       FI, 4, 2
6 | ¬e        ¬I, 3–5
7 | ¬e ∧ ¬f   ∧I, 6, 2`,
  },
  {
    id: "ex-err-escaped-line",
    level: 2,
    sequent: "b → c ⊢ (b → b ∧ c) ∧ c",
    rules: "base",
    proof: `
1 | b → c             premissa
2 |   b               hipótese
3 |   c               →E, 2, 1
4 |   b ∧ c           ∧I, 2, 3
5 | b → b ∧ c         →I, 2–4
6 | (b → b ∧ c) ∧ c   ∧I, 5, 3`,
    line: 6,
    answer: "closedSubproofLine",
    distractors: ["citesOpenSubproof", "missingCase", "onlyOuterDoubleNegation"],
    explanation: "escapedLine",
  },
  {
    id: "ex-err-premature-discharge",
    level: 2,
    sequent: "d ∧ e ⊢ e → e → d",
    rules: "base",
    proof: `
1 | d ∧ e         premissa
2 |   e           hipótese
3 |   d           ∧E, 1
4 |   e → d       →I, 2–3
5 | e → (e → d)   →I, 2–4`,
    line: 4,
    answer: "citesOpenSubproof",
    distractors: ["closedSubproofLine", "rangeStartsAtHypothesis", "noSubproofCited"],
    explanation: "prematureDischarge",
    solution: `
1 | d ∧ e         premissa
2 |   e           hipótese
3 |     e         hipótese
4 |     d         ∧E, 1
5 |   e → d       →I, 3–4
6 | e → (e → d)   →I, 2–5`,
  },
  {
    id: "ex-err-short-range",
    level: 2,
    sequent: "f → k, f ⊢ g → k ∧ g",
    rules: "base",
    proof: `
1 | f → k       premissa
2 | f           premissa
3 |   g         hipótese
4 |   k         →E, 2, 1
5 |   k ∧ g     ∧I, 4, 3
6 | g → k ∧ g   →I, 4–5`,
    line: 6,
    answer: "rangeStartsAtHypothesis",
    distractors: ["closedSubproofLine", "citesOpenSubproof", "noSubproofCited"],
    explanation: "shortRange",
    solution: `
1 | f → k       premissa
2 | f           premissa
3 |   g         hipótese
4 |   k         →E, 2, 1
5 |   k ∧ g     ∧I, 4, 3
6 | g → k ∧ g   →I, 3–5`,
  },
  {
    id: "ex-err-no-assumption",
    level: 2,
    sequent: "t ∧ u ⊢ u → t",
    rules: "base",
    proof: `
1 | t ∧ u   premissa
2 | t       ∧E, 1
3 | u → t   →I, 2`,
    line: 3,
    answer: "noSubproofCited",
    distractors: ["affirmedConsequent", "rangeStartsAtHypothesis", "ruleNotInSet"],
    explanation: "noAssumption",
    solution: `
1 | t ∧ u   premissa
2 |   u     hipótese
3 |   t     ∧E, 1
4 | u → t   →I, 2–3`,
  },
  {
    id: "ex-err-forgotten-case",
    level: 3,
    sequent: "i ∨ j, i → k ⊢ k ∨ i",
    rules: "base",
    proof: `
1 | i ∨ j   premissa
2 | i → k   premissa
3 |   i     hipótese
4 |   k     →E, 3, 2
5 | k       ∨E, 1, 3–4
6 | k ∨ i   ∨I, 5`,
    line: 5,
    answer: "missingCase",
    distractors: ["casesDisagree", "closedSubproofLine", "noSubproofCited"],
    explanation: "forgottenCase",
  },
  {
    id: "ex-err-mismatched-cases",
    level: 3,
    sequent: "y ∨ z, y → r, z → s ⊢ r",
    rules: "base",
    proof: `
1 | y ∨ z   premissa
2 | y → r   premissa
3 | z → s   premissa
4 |   y     hipótese
5 |   r     →E, 4, 2
6 |   z     hipótese
7 |   s     →E, 6, 3
8 | r       ∨E, 1, 4–5, 6–7`,
    line: 8,
    answer: "casesDisagree",
    distractors: ["missingCase", "closedSubproofLine", "rangeStartsAtHypothesis"],
    explanation: "mismatchedCases",
  },
  {
    id: "ex-err-negation-gained",
    level: 3,
    sequent: "¬n → o, ¬o ⊢ n",
    rules: "base",
    proof: `
1 | ¬n → o   premissa
2 | ¬o       premissa
3 |   ¬n     hipótese
4 |   o      →E, 3, 1
5 |   F      FI, 4, 2
6 | n        ¬I, 3–5`,
    line: 6,
    answer: "negationIntroResult",
    distractors: ["onlyOuterDoubleNegation", "closedSubproofLine", "ruleNotInSet"],
    explanation: "negationGained",
    solution: `
1 | ¬n → o   premissa
2 | ¬o       premissa
3 |   ¬n     hipótese
4 |   o      →E, 3, 1
5 |   F      FI, 4, 2
6 | ¬¬n      ¬I, 3–5
7 | n        ¬E, 6`,
  },
  {
    id: "ex-err-de-morgan-split",
    level: 3,
    sequent: "¬(l ∧ m), l ⊢ ¬m",
    rules: "completo",
    proof: `
1 | ¬(l ∧ m)   premissa
2 | l          premissa
3 | ¬l ∧ ¬m    DM, 1
4 | ¬m         ∧E, 3`,
    line: 3,
    answer: "deMorganShape",
    distractors: ["affirmedConsequent", "ruleNotInSet", "assumedPremise"],
    explanation: "deMorganSplit",
    solution: `
1 | ¬(l ∧ m)   premissa
2 | l          premissa
3 | ¬l ∨ ¬m    DM, 1
4 | ¬¬l        ¬¬I, 2
5 | ¬m         SD, 3, 4`,
  },
]);
