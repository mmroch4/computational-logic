// Solidez do verificador: um corpo de provas e mutações automáticas com semente fixa.
// Invariante: cada linha aceite segue, pela tabela de verdade, das premissas e das hipóteses abertas
// nessa linha. É mais forte do que olhar só para o sequente final, que também se verifica: uma
// mutação que estrague o fim da prova continua a pôr à prova as linhas anteriores.
// Na 1.ª ordem, «segue» quer dizer que não há contramodelo com domínio de 1 a 3 elementos, com os
// nomes livres (as variáveis das caixas incluídas) como constantes: ver `helpers/finite-models.js`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { and, atom, eq, exists, FALSUM, forall, implies, not, or, term } from "../js/core/formula.js";
import {
  citeLine,
  citeRange,
  closeSubproof,
  createProof,
  deleteLine,
  enclosingSubproofs,
} from "../js/core/proof.js";
import { formatProof, parseProof } from "../js/core/proof-text.js";
import { defineRule, FIRST_ORDER_RULES, RULES, subproof } from "../js/core/rules.js";
import { checkSequent } from "../js/core/semantics.js";
import { formatSequent, isPropositionalSequent, parseSequent, sequent } from "../js/core/sequent.js";
import { createUserRule } from "../js/core/user-rules.js";
import { verifyLine, verifyProof } from "../js/core/verify.js";
import { finiteCountermodel } from "./helpers/finite-models.js";

const SEEDS = [0x4e44, 7919, 104729, 1299709];
const MUTANTS_PER_PROOF = 300;
const MAX_CHAIN = 3;

const userRule = (draft) => {
  const result = createUserRule(draft);
  assert.ok(result.ok, draft.name);
  return result.rule;
};

const USER_RULES = [
  userRule({ name: "Troca", premises: ["φ ∨ ψ"], conclusion: "ψ ∨ φ" }),
  userRule({ name: "Refuta", premises: [{ hypothesis: "φ", conclusion: "ψ" }, "¬ψ"], conclusion: "¬φ" }),
];

const POOL = [...RULES, ...USER_RULES];

const CORPUS = [
  ["a ∧ b ⊢ b ∧ a", `
    1 | a ∧ b   premissa
    2 | a       ∧E, 1
    3 | b       ∧E, 1
    4 | b ∧ a   ∧I, 3, 2`],
  ["(a ∧ b) ∧ c ⊢ a ∧ (b ∧ c)", `
    1 | (a ∧ b) ∧ c   premissa
    2 | a ∧ b         ∧E, 1
    3 | c             ∧E, 1
    4 | a             ∧E, 2
    5 | b             ∧E, 2
    6 | b ∧ c         ∧I, 5, 3
    7 | a ∧ (b ∧ c)   ∧I, 4, 6`],
  ["a ∨ b ⊢ b ∨ a", `
    1 | a ∨ b     premissa
    2 |   a       hipótese
    3 |   b ∨ a   ∨I, 2
    4 |   b       hipótese
    5 |   b ∨ a   ∨I, 4
    6 | b ∨ a     ∨E, 1, 2–3, 4–5`],
  ["(a ∨ b) ∨ c ⊢ a ∨ (b ∨ c)", `
     1 | (a ∨ b) ∨ c       premissa
     2 |   a ∨ b           hipótese
     3 |     a             hipótese
     4 |     a ∨ (b ∨ c)   ∨I, 3
     5 |     b             hipótese
     6 |     b ∨ c         ∨I, 5
     7 |     a ∨ (b ∨ c)   ∨I, 6
     8 |   a ∨ (b ∨ c)     ∨E, 2, 3–4, 5–7
     9 |   c               hipótese
    10 |   b ∨ c           ∨I, 9
    11 |   a ∨ (b ∨ c)     ∨I, 10
    12 | a ∨ (b ∨ c)       ∨E, 1, 2–8, 9–11`],
  ["a ∧ b → c ⊢ a → (b → c)", `
    1 | a ∧ b → c       premissa
    2 |   a             hipótese
    3 |     b           hipótese
    4 |     a ∧ b       ∧I, 2, 3
    5 |     c           →E, 4, 1
    6 |   b → c         →I, 3–5
    7 | a → (b → c)     →I, 2–6`],
  ["a → (b → c) ⊢ a ∧ b → c", `
    1 | a → (b → c)   premissa
    2 |   a ∧ b       hipótese
    3 |   a           ∧E, 2
    4 |   b           ∧E, 2
    5 |   b → c       →E, 3, 1
    6 |   c           →E, 4, 5
    7 | a ∧ b → c     →I, 2–6`],
  ["a → b ⊢ ¬b → ¬a", `
    1 | a → b       premissa
    2 |   ¬b        hipótese
    3 |     a       hipótese
    4 |     b       →E, 3, 1
    5 |     F       FI, 4, 2
    6 |   ¬a        ¬I, 3–5
    7 | ¬b → ¬a     →I, 2–6`],
  ["a ∧ (b ∨ c) ⊢ (a ∧ b) ∨ (a ∧ c)", `
     1 | a ∧ (b ∨ c)         premissa
     2 | a                   ∧E, 1
     3 | b ∨ c               ∧E, 1
     4 |   b                 hipótese
     5 |   a ∧ b             ∧I, 2, 4
     6 |   (a ∧ b) ∨ (a ∧ c) ∨I, 5
     7 |   c                 hipótese
     8 |   a ∧ c             ∧I, 2, 7
     9 |   (a ∧ b) ∨ (a ∧ c) ∨I, 8
    10 | (a ∧ b) ∨ (a ∧ c)   ∨E, 3, 4–6, 7–9`],
  ["(a ∧ b) ∨ (a ∧ c) ⊢ a ∧ (b ∨ c)", `
     1 | (a ∧ b) ∨ (a ∧ c)   premissa
     2 |   a ∧ b             hipótese
     3 |   a                 ∧E, 2
     4 |   b                 ∧E, 2
     5 |   b ∨ c             ∨I, 4
     6 |   a ∧ (b ∨ c)       ∧I, 3, 5
     7 |   a ∧ c             hipótese
     8 |   a                 ∧E, 7
     9 |   c                 ∧E, 7
    10 |   b ∨ c             ∨I, 9
    11 |   a ∧ (b ∨ c)       ∧I, 8, 10
    12 | a ∧ (b ∨ c)         ∨E, 1, 2–6, 7–11`],
  ["⊢ a → a", `
    1 |   a     hipótese
    2 | a → a   →I, 1–1`],
  ["⊢ a → (b → a)", `
    1 |   a           hipótese
    2 |     b         hipótese
    3 |     a         R, 1
    4 |   b → a       →I, 2–3
    5 | a → (b → a)   →I, 1–4`],
  ["⊢ (a → (b → c)) → ((a → b) → (a → c))", `
     1 |   a → (b → c)                       hipótese
     2 |     a → b                           hipótese
     3 |       a                             hipótese
     4 |       b                             →E, 3, 2
     5 |       b → c                         →E, 3, 1
     6 |       c                             →E, 4, 5
     7 |     a → c                           →I, 3–6
     8 |   (a → b) → (a → c)                 →I, 2–7
     9 | (a → (b → c)) → ((a → b) → (a → c)) →I, 1–8`],
  ["⊢ ((a → b) → a) → a", `
     1 |   (a → b) → a         hipótese
     2 |     ¬a                hipótese
     3 |       a               hipótese
     4 |       F               FI, 3, 2
     5 |       b               FE, 4
     6 |     a → b             →I, 3–5
     7 |     a                 →E, 6, 1
     8 |     F                 FI, 7, 2
     9 |   ¬¬a                 ¬I, 2–8
    10 |   a                   ¬E, 9
    11 | ((a → b) → a) → a     →I, 1–10`],
  ["a, ¬a ⊢ b", `
    1 | a    premissa
    2 | ¬a   premissa
    3 | F    FI, 1, 2
    4 | b    FE, 3`],
  ["⊢ ¬(a ∧ ¬a)", `
    1 |   a ∧ ¬a     hipótese
    2 |   a          ∧E, 1
    3 |   ¬a         ∧E, 1
    4 |   F          FI, 2, 3
    5 | ¬(a ∧ ¬a)    ¬I, 1–4`],
  ["a → b ⊢ ¬a ∨ b", `
    1 | a → b     premissa
    2 | a ∨ ¬a    TE
    3 |   a       hipótese
    4 |   b       →E, 3, 1
    5 |   ¬a ∨ b  ∨I, 4
    6 |   ¬a      hipótese
    7 |   ¬a ∨ b  ∨I, 6
    8 | ¬a ∨ b    ∨E, 2, 3–5, 6–7`],
  ["¬a ∨ b ⊢ a → b", `
    1 | ¬a ∨ b   premissa
    2 |   a      hipótese
    3 |   ¬¬a    ¬¬I, 2
    4 |   b      SD, 1, 3
    5 | a → b    →I, 2–4`],
  ["c → a, a → b, ¬b ⊢ ¬c", `
    1 | c → a   premissa
    2 | a → b   premissa
    3 | ¬b      premissa
    4 | ¬a      MT, 2, 3
    5 | ¬c      MT, 1, 4`],
  ["a ⊢ ¬¬¬¬a", `
    1 | a      premissa
    2 | ¬¬a    ¬¬I, 1
    3 | ¬¬¬¬a  ¬¬I, 2`],
  ["¬a → a ⊢ a", `
    1 | ¬a → a  premissa
    2 |   ¬a    hipótese
    3 |   a     →E, 2, 1
    4 |   F     FI, 3, 2
    5 | a       RA, 2–4`],
  ["a → b, b → c, c → d ⊢ a → d", `
    1 | a → b   premissa
    2 | b → c   premissa
    3 | c → d   premissa
    4 | a → c   SH, 1, 2
    5 | a → d   SH, 4, 3`],
  ["a ∨ b, ¬a, b → c ⊢ c", `
    1 | a ∨ b   premissa
    2 | ¬a      premissa
    3 | b → c   premissa
    4 | b       SD, 2, 1
    5 | c       →E, 4, 3`],
  ["¬(a ∧ b), a ⊢ ¬b", `
    1 | ¬(a ∧ b)  premissa
    2 | a         premissa
    3 | ¬a ∨ ¬b   DM, 1
    4 | ¬¬a       ¬¬I, 2
    5 | ¬b        SD, 3, 4`],
  ["¬(a ∨ b) ⊢ ¬b", `
    1 | ¬(a ∨ b)  premissa
    2 | ¬a ∧ ¬b   DM, 1
    3 | ¬b        ∧E, 2`],
  ["¬a, ¬b ⊢ ¬(a ∨ b) ∧ ¬(a ∧ b)", `
    1 | ¬a                   premissa
    2 | ¬b                   premissa
    3 | ¬a ∧ ¬b              ∧I, 1, 2
    4 | ¬(a ∨ b)             DM, 3
    5 | ¬a ∨ ¬b              ∨I, 1
    6 | ¬(a ∧ b)             DM, 5
    7 | ¬(a ∨ b) ∧ ¬(a ∧ b)  ∧I, 4, 6`],
  ["(a → c) ∧ (b → c) ⊢ a ∨ b → c", `
     1 | (a → c) ∧ (b → c)   premissa
     2 | a → c               ∧E, 1
     3 | b → c               ∧E, 1
     4 |   a ∨ b             hipótese
     5 |     a               hipótese
     6 |     c               →E, 5, 2
     7 |     b               hipótese
     8 |     c               →E, 7, 3
     9 |   c                 ∨E, 4, 5–6, 7–8
    10 | a ∨ b → c           →I, 4–9`],
  ["a ∨ b → c ⊢ (a → c) ∧ (b → c)", `
     1 | a ∨ b → c           premissa
     2 |   a                 hipótese
     3 |   a ∨ b             ∨I, 2
     4 |   c                 →E, 3, 1
     5 | a → c               →I, 2–4
     6 |   b                 hipótese
     7 |   a ∨ b             ∨I, 6
     8 |   c                 →E, 7, 1
     9 | b → c               →I, 6–8
    10 | (a → c) ∧ (b → c)   ∧I, 5, 9`],
  ["a → c, b → d, a ∨ b ⊢ c ∨ d", `
     1 | a → c    premissa
     2 | b → d    premissa
     3 | a ∨ b    premissa
     4 |   a      hipótese
     5 |   c      →E, 4, 1
     6 |   c ∨ d  ∨I, 5
     7 |   b      hipótese
     8 |   d      →E, 7, 2
     9 |   c ∨ d  ∨I, 8
    10 | c ∨ d    ∨E, 3, 4–6, 7–9`],
  ["F ⊢ a ∧ ¬a", `
    1 | F        premissa
    2 | a ∧ ¬a   FE, 1`],
  ["a → F ⊢ ¬a", `
    1 | a → F   premissa
    2 |   a     hipótese
    3 |   F     →E, 2, 1
    4 | ¬a      ¬I, 2–3`],
  ["¬a ⊢ a → F", `
    1 | ¬a      premissa
    2 |   a     hipótese
    3 |   F     FI, 2, 1
    4 | a → F   →I, 2–3`],
  ["a → b, a → ¬b ⊢ ¬a", `
    1 | a → b    premissa
    2 | a → ¬b   premissa
    3 |   a      hipótese
    4 |   b      →E, 3, 1
    5 |   ¬b     →E, 3, 2
    6 |   F      FI, 4, 5
    7 | ¬a       ¬I, 3–6`],
  ["¬(a → b) ⊢ a ∧ ¬b", `
     1 | ¬(a → b)  premissa
     2 |   ¬a      hipótese
     3 |     a     hipótese
     4 |     F     FI, 3, 2
     5 |     b     FE, 4
     6 |   a → b   →I, 3–5
     7 |   F       FI, 6, 1
     8 | a         RA, 2–7
     9 |   b       hipótese
    10 |     a     hipótese
    11 |     b     R, 9
    12 |   a → b   →I, 10–11
    13 |   F       FI, 12, 1
    14 | ¬b        ¬I, 9–13
    15 | a ∧ ¬b    ∧I, 8, 14`],
  ["a ∨ (b ∧ c) ⊢ (a ∨ b) ∧ (a ∨ c)", `
     1 | a ∨ (b ∧ c)         premissa
     2 |   a                 hipótese
     3 |   a ∨ b             ∨I, 2
     4 |   a ∨ c             ∨I, 2
     5 |   (a ∨ b) ∧ (a ∨ c) ∧I, 3, 4
     6 |   b ∧ c             hipótese
     7 |   b                 ∧E, 6
     8 |   c                 ∧E, 6
     9 |   a ∨ b             ∨I, 7
    10 |   a ∨ c             ∨I, 8
    11 |   (a ∨ b) ∧ (a ∨ c) ∧I, 9, 10
    12 | (a ∨ b) ∧ (a ∨ c)   ∨E, 1, 2–5, 6–11`],
  ["a ∨ b, ¬b ⊢ a", `
    1 | a ∨ b   premissa
    2 | ¬b      premissa
    3 | b ∨ a   Troca, 1
    4 | a       SD, 3, 2`],
  ["a → b, ¬b ⊢ ¬a", `
    1 | a → b   premissa
    2 | ¬b      premissa
    3 |   a     hipótese
    4 |   b     →E, 3, 1
    5 | ¬a      Refuta, 3–4, 2`],
  // 1.ª ordem: as seis regras, as caixas [v] (num passo, numa hipótese e com linha de etiqueta) e NQ1–NQ4.
  ["∀x(P(x) → Q(x)), ∀x P(x) ⊢ ∀x Q(x)", `
    1 | ∀x(P(x) → Q(x))   premissa
    2 | ∀x P(x)           premissa
    3 |  [v] P(v) → Q(v)  ∀E, 1
    4 |   P(v)            ∀E, 2
    5 |   Q(v)            →E, 4, 3
    6 | ∀x Q(x)           ∀I, 3–5`],
  ["∀x(P(x) ∧ Q(x)) ⊢ ∀x P(x) ∧ ∀x Q(x)", `
    1 | ∀x(P(x) ∧ Q(x))     premissa
    2 |  [a] P(a) ∧ Q(a)    ∀E, 1
    3 |   P(a)              ∧E, 2
    4 | ∀x P(x)             ∀I, 2–3
    5 |  [a] P(a) ∧ Q(a)    ∀E, 1
    6 |   Q(a)              ∧E, 5
    7 | ∀x Q(x)             ∀I, 5–6
    8 | ∀x P(x) ∧ ∀x Q(x)   ∧I, 4, 7`],
  ["⊢ ∀x(P(x) → P(x))", `
      |  [v]
    1 |     P(v)          hipótese
    2 |   P(v) → P(v)     →I, 1–1
    3 | ∀x(P(x) → P(x))   ∀I, 1–2`],
  ["∀x∀y R(x, y) ⊢ ∀x R(x, x)", `
    1 | ∀x∀y R(x, y)      premissa
    2 |  [a] ∀y R(a, y)   ∀E, 1
    3 |   R(a, a)         ∀E, 2
    4 | ∀x R(x, x)        ∀I, 2–3`],
  ["∀x P(x) ⊢ ∃x P(x)", `
    1 | ∀x P(x)   premissa
    2 | P(a)      ∀E, 1
    3 | ∃x P(x)   ∃I, 2`],
  ["∀x P(x) ⊢ P(f(a))", `
    1 | ∀x P(x)   premissa
    2 | P(f(a))   ∀E, 1`],
  ["∃x(P(x) ∧ Q(x)) ⊢ ∃x P(x)", `
    1 | ∃x(P(x) ∧ Q(x))    premissa
    2 |  [a] P(a) ∧ Q(a)   hipótese
    3 |   P(a)             ∧E, 2
    4 |   ∃x P(x)          ∃I, 3
    5 | ∃x P(x)            ∃E, 1, 2–4`],
  ["∀x(P(x) → Q(x)), ∃x P(x) ⊢ ∃x Q(x)", `
    1 | ∀x(P(x) → Q(x))   premissa
    2 | ∃x P(x)           premissa
    3 |  [b] P(b)         hipótese
    4 |   P(b) → Q(b)     ∀E, 1
    5 |   Q(b)            →E, 3, 4
    6 |   ∃x Q(x)         ∃I, 5
    7 | ∃x Q(x)           ∃E, 2, 3–6`],
  ["∃x∀y R(x, y) ⊢ ∀y∃x R(x, y)", `
    1 | ∃x∀y R(x, y)       premissa
    2 |  [a] ∀y R(a, y)    hipótese
    3 |    [b] R(a, b)     ∀E, 2
    4 |     ∃x R(x, b)     ∃I, 3
    5 |   ∀y∃x R(x, y)     ∀I, 3–4
    6 | ∀y∃x R(x, y)       ∃E, 1, 2–5`],
  ["⊢ ∀x(x = x)", `
    1 |  [a] a = a   =I
    2 | ∀x(x = x)    ∀I, 1–1`],
  ["a = b ⊢ b = a", `
    1 | a = b   premissa
    2 | a = a   =I
    3 | b = a   =E, 1, 2`],
  ["a = b, b = c ⊢ a = c", `
    1 | a = b   premissa
    2 | b = c   premissa
    3 | a = c   =E, 2, 1`],
  ["a = b, P(f(a)) ⊢ P(f(b))", `
    1 | a = b     premissa
    2 | P(f(a))   premissa
    3 | P(f(b))   =E, 2, 1`],
  ["∀x ¬P(x), ¬∀x Q(x) ⊢ ¬∃x P(x) ∧ ∃x ¬Q(x)", `
    1 | ∀x ¬P(x)                 premissa
    2 | ¬∀x Q(x)                 premissa
    3 | ¬∃x P(x)                 NQ4, 1
    4 | ∃x ¬Q(x)                 NQ1, 2
    5 | ¬∃x P(x) ∧ ∃x ¬Q(x)      ∧I, 3, 4`],
  ["∃x ¬P(x), ∀x P(x) ⊢ F", `
    1 | ∃x ¬P(x)    premissa
    2 | ∀x P(x)     premissa
    3 | ¬∀x P(x)    NQ2, 1
    4 | F           FI, 2, 3`],
  ["¬∃x P(x) ⊢ ∀y ¬P(y)", `
    1 | ¬∃x P(x)   premissa
    2 | ∀y ¬P(y)   NQ3, 1`],
];

function read([text, written]) {
  const goal = parseSequent(text);
  assert.ok(goal.ok, text);
  const proof = parseProof(written.replace(/^\n/, ""));
  assert.ok(proof.ok, `${text}: ${JSON.stringify(proof.error)}`);
  return { text, goal: goal.sequent, proof: proof.proof, firstOrder: !isPropositionalSequent(goal.sequent) };
}

const ENTRIES = CORPUS.map(read);

/** Gerador mulberry32: a mesma semente dá sempre as mesmas mutações. */
function randomFrom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const below = (limit) => Math.floor(next() * limit);
  return { below, pick: (items) => items[below(items.length)], chance: (p) => next() < p };
}

const ATOMS = ["a", "b", "c", "d"].map((name) => atom(name));
const RULE_IDS = [...new Set(POOL.map(({ id }) => id))];

// Vocabulário das mutações de 1.ª ordem: os nomes das caixas do corpo, para as mutações os apanharem.
const NAMES = ["a", "b", "v", "x"];
const TERMS = [...NAMES.map((name) => term(name)), term("f", [term("a")])];
const FIRST_ORDER_ATOMS = [
  atom("P", [term("a")]),
  atom("P", [term("v")]),
  atom("Q", [term("x")]),
  atom("R", [term("a"), term("b")]),
  eq(term("a"), term("v")),
];

const CONNECTIVES = { not, and, or, implies };
const QUANTIFIERS = { forall, exists };
const isCompound = ({ kind }) => kind in CONNECTIVES || kind in QUANTIFIERS;

const rebuilt = (node, args) => {
  if (node.kind in QUANTIFIERS) return QUANTIFIERS[node.kind](node.name, args[0]);
  return CONNECTIVES[node.kind](...args);
};

/** Troca um termo de um átomo ou de uma igualdade. */
function mutateTerm(formula, random) {
  const position = random.below(formula.args.length);
  const args = formula.args.map((arg, index) => (index === position ? random.pick(TERMS) : arg));
  return formula.kind === "eq" ? eq(...args) : atom(formula.name, args);
}

/**
 * Substitui uma subfórmula ao acaso. Numa prova de 1.ª ordem, também quantifica, troca o quantificador
 * ou a variável ligada e muda termos. Numa proposicional, as escolhas são as de sempre.
 */
function mutateFormula(formula, random, firstOrder = false) {
  if (isCompound(formula) && random.chance(0.6)) {
    const position = random.below(formula.args.length);
    const args = formula.args.map((arg, index) => (
      index === position ? mutateFormula(arg, random, firstOrder) : arg
    ));
    return rebuilt(formula, args);
  }
  const atoms = firstOrder ? FIRST_ORDER_ATOMS : ATOMS;
  const [left, right = left] = isCompound(formula) ? formula.args : [];
  const options = [
    () => not(formula),
    () => random.pick(atoms),
    () => FALSUM,
    () => and(formula, random.pick(atoms)),
    () => or(random.pick(atoms), formula),
    () => implies(formula, random.pick(atoms)),
  ];
  if (left) options.push(() => left, () => right, () => rebuilt(formula, [right, left].slice(0, formula.args.length)));
  if (isCompound(formula) && formula.args.length === 2) {
    options.push(() => random.pick([and, or, implies])(left, right));
  }
  if (firstOrder) {
    options.push(() => random.pick([forall, exists])(random.pick(NAMES), formula));
    if (formula.kind in QUANTIFIERS) {
      options.push(
        () => (formula.kind === "forall" ? exists : forall)(formula.name, left),
        () => QUANTIFIERS[formula.kind](random.pick(NAMES), left),
      );
    }
    if ((formula.kind === "atom" || formula.kind === "eq") && formula.args.length > 0) {
      options.push(() => mutateTerm(formula, random), () => mutateTerm(formula, random));
    }
  }
  return random.pick(options)();
}

const indexesWhere = (lines, test_) => lines.flatMap((line, index) => (test_(line) ? [index] : []));

const replaceLine = (lines, index, change) => lines.map((line, i) => (i === index ? { ...line, ...change } : line));

function randomCitation(lines, random) {
  const a = 1 + random.below(lines.length + 1);
  if (random.chance(0.5)) return citeLine(a);
  const b = 1 + random.below(lines.length + 1);
  return citeRange(Math.min(a, b), Math.max(a, b));
}

/** Pequeno desvio de uma citação: mudar de linha, de extremo do intervalo ou de tipo. */
function nudgeCitation(citation, lines, random) {
  const shift = random.pick([-2, -1, 1, 2]);
  const fix = (value) => Math.max(1, value + shift);
  if (citation.kind === "line") {
    return random.chance(0.3) ? citeRange(citation.line, citation.line) : citeLine(fix(citation.line));
  }
  const { from, to } = citation;
  const options = [
    () => citeRange(Math.min(fix(from), to), to),
    () => citeRange(from, Math.max(fix(to), from)),
    () => citeLine(from),
    () => citeLine(to),
    () => randomCitation(lines, random),
  ];
  return random.pick(options)();
}

function changeCitation(lines, random) {
  const candidates = indexesWhere(lines, ({ kind }) => kind === "step");
  if (candidates.length === 0) return null;
  const index = random.pick(candidates);
  const { citations } = lines[index];
  const position = random.below(Math.max(citations.length, 1));
  const edited = [...citations];
  const action = citations.length === 0 ? "add" : random.pick(["nudge", "nudge", "random", "remove", "add"]);
  if (action === "nudge") edited[position] = nudgeCitation(citations[position], lines, random);
  if (action === "random") edited[position] = randomCitation(lines, random);
  if (action === "remove") edited.splice(position, 1);
  if (action === "add") edited.push(randomCitation(lines, random));
  return replaceLine(lines, index, { citations: edited });
}

function changeRule(lines, random) {
  const candidates = indexesWhere(lines, ({ kind }) => kind === "step");
  if (candidates.length === 0) return null;
  return replaceLine(lines, random.pick(candidates), { rule: random.pick(RULE_IDS) });
}

function changeFormula(lines, random, proof, firstOrder) {
  const candidates = indexesWhere(lines, ({ formula }) => formula);
  if (candidates.length === 0) return null;
  const index = random.pick(candidates);
  return replaceLine(lines, index, { formula: mutateFormula(lines[index].formula, random, firstOrder) });
}

/**
 * Muda a variável de uma caixa [v] (a marca de um passo ou de uma hipótese, ou a linha de etiqueta),
 * tira-a, ou põe uma marca numa linha que não a tinha.
 */
function changeFresh(lines, random) {
  const candidates = indexesWhere(lines, ({ kind }) => kind !== "premise");
  if (candidates.length === 0) return null;
  const index = random.pick(candidates);
  const line = lines[index];
  const field = line.label === undefined ? "fresh" : "label";
  const current = line[field] ?? null;
  const next = current === null || random.chance(0.7) ? random.pick(NAMES) : null;
  return replaceLine(lines, index, { [field]: next });
}

/** Copia a fórmula de outra linha: estes mutantes passam nas regras mais vezes. */
function copyFormula(lines, random) {
  const index = random.below(lines.length);
  return replaceLine(lines, index, { formula: random.pick(lines).formula });
}

/** Tira um troço de linhas de uma subdedução, ou mete-o mais para dentro. */
function shiftDepth(lines, random) {
  const start = random.below(lines.length);
  const length = 1 + random.below(3);
  const delta = random.pick([-1, -1, 1]);
  return lines.map((line, index) => {
    if (index < start || index >= start + length || line.kind === "premise") return line;
    return { ...line, depth: line.depth + delta };
  });
}

/** Fecha mais cedo a subdedução de uma linha: as seguintes passam para fora, com as citações certas. */
function closeEarly(lines, random, proof) {
  const candidates = indexesWhere(lines, ({ depth }) => depth > 0);
  if (candidates.length === 0) return null;
  const result = closeSubproof(proof, random.pick(candidates) + 1);
  return result.ok ? result.proof.lines : null;
}

function removeLine(lines, random, proof) {
  const result = deleteLine(proof, 1 + random.below(lines.length));
  return result.ok ? result.proof.lines : null;
}

/** Move uma linha, sem corrigir as citações de ninguém. */
function moveLine(lines, random) {
  const from = random.below(lines.length);
  const to = random.below(lines.length);
  const moved = lines.filter((_, index) => index !== from);
  moved.splice(to, 0, { ...lines[from], depth: lines[Math.max(to - 1, 0)].depth });
  return moved;
}

/** Tira a linha para depois da subdedução dela, um escopo acima, a manter o que ela cita e quem a cita. */
function moveOutOfScope(lines, random, proof) {
  const candidates = indexesWhere(lines, ({ kind, depth }) => kind === "step" && depth > 0);
  if (candidates.length === 0) return null;
  const index = random.pick(candidates);
  const from = index + 1;
  const { to, depth } = enclosingSubproofs(proof, from).at(-1);
  const position = (old) => {
    if (old === from) return to;
    return old > from && old <= to ? old - 1 : old;
  };
  const renumbered = lines.map((line) => ({
    ...line,
    citations: line.citations.map((citation) => (
      citation.kind === "line"
        ? citeLine(position(citation.line))
        : citeRange(position(citation.from), position(citation.to))
    )),
  }));
  const moved = renumbered.filter((_, i) => i !== index);
  moved.splice(to - 1, 0, { ...renumbered[index], depth: depth - 1 });
  return moved;
}

/** Transforma um passo numa hipótese, ou uma hipótese num passo. */
function swapKind(lines, random) {
  const index = random.below(lines.length);
  const line = lines[index];
  if (line.kind === "premise") return null;
  if (line.kind === "step") {
    const depth = line.depth + random.below(2);
    return replaceLine(lines, index, { kind: "hypothesis", depth: Math.max(depth, 1), rule: null, citations: [] });
  }
  const rule = random.pick(["R", "TE", "FE"]);
  return replaceLine(lines, index, { kind: "step", rule, citations: [randomCitation(lines, random)] });
}

const MUTATORS = {
  changeRule,
  changeCitation,
  changeFormula,
  changeFresh,
  copyFormula,
  shiftDepth,
  closeEarly,
  moveOutOfScope,
  moveLine,
  removeLine,
  swapKind,
};

const VALID_CACHE = new Map();

/**
 * Indica se o sequente é válido: pela tabela de verdade, ou, na 1.ª ordem, se não tem contramodelo
 * finito pequeno. Os mutantes repetem-se muito, por isso guarda os resultados.
 */
function isValid(goal) {
  const key = formatSequent(goal);
  if (!VALID_CACHE.has(key)) {
    if (isPropositionalSequent(goal)) {
      const result = checkSequent(goal);
      assert.ok(result.ok, key);
      VALID_CACHE.set(key, result.valid);
    } else {
      VALID_CACHE.set(key, finiteCountermodel(goal) === null);
    }
  }
  return VALID_CACHE.get(key);
}

/**
 * As hipóteses abertas na linha n. A caixa do ∀I não tem hipótese: abre num passo, ou numa linha de
 * etiqueta, cuja hipótese (a mesma linha `from`) é a da caixa de dentro e só conta se esta estiver aberta.
 */
const openHypotheses = (proof, n) => enclosingSubproofs(proof, n)
  .filter(({ from, label }) => !label && proof.lines[from - 1].kind === "hypothesis")
  .map(({ from }) => proof.lines[from - 1].formula);

const premisesOf = ({ lines }) => lines.filter(({ kind }) => kind === "premise").map(({ formula }) => formula);

/**
 * O primeiro falso positivo da prova, { line, sequent }. Vai linha a linha até à primeira recusada,
 * porque uma linha aceite só depende das anteriores. Sem falso positivo, devolve { accepted, rejection }:
 * se a prova inteira passou, e o código de erro da primeira linha recusada (ou null).
 */
function audit(proof, rules) {
  const premises = premisesOf(proof);
  let verified = 0;
  let rejection = null;
  for (let n = 1; n <= proof.lines.length; n += 1) {
    const result = verifyLine(proof, n, rules);
    if (!result.ok) {
      rejection = result.error.code;
      break;
    }
    verified = n;
    const hypotheses = openHypotheses(proof, n);
    const context = sequent([...premises.filter(Boolean), ...hypotheses], proof.lines[n - 1].formula);
    if (!isValid(context)) return { line: n, sequent: formatSequent(context) };
  }

  const last = proof.lines.at(-1);
  if (!last?.formula || premises.some((premise) => !premise)) return { accepted: false, rejection };
  const goal = sequent(premises, last.formula);
  const accepted = verifyProof(proof, goal, rules).ok;
  assert.equal(accepted, verified === proof.lines.length && last.depth === 0);
  return accepted && !isValid(goal) ? { line: 0, sequent: formatSequent(goal) } : { accepted, rejection };
}

/**
 * Aplica cadeias de mutações ao corpo e devolve as contagens, os falsos positivos e quantas vezes cada
 * código de erro recusou um mutante (`rejections`).
 */
function fuzz(entries, rules, seed = SEEDS[0]) {
  const stats = Object.fromEntries(Object.keys(MUTATORS).map((name) => [name, { tried: 0, rejected: 0, accepted: 0 }]));
  const falsePositives = [];
  const rejections = {};
  const names = Object.keys(MUTATORS);
  entries.forEach(({ text, proof, firstOrder }, entry) => {
    const random = randomFrom(seed + entry);
    for (let i = 0; i < MUTANTS_PER_PROOF; i += 1) {
      let current = proof;
      const chain = [];
      const steps = 1 + random.below(MAX_CHAIN);
      for (let step = 0; step < steps; step += 1) {
        const name = random.pick(names);
        const lines = MUTATORS[name](current.lines, random, current, firstOrder);
        const built = lines && lines.length > 0 ? createProof(lines) : { ok: false };
        if (!built.ok) continue; // a estrutura nem sequer se constrói
        current = built.proof;
        chain.push(name);

        const outcome = audit(current, rules);
        const counts = stats[name];
        counts.tried += 1;
        if (outcome.accepted) counts.accepted += 1;
        else counts.rejected += 1;
        if (outcome.rejection) rejections[outcome.rejection] = (rejections[outcome.rejection] ?? 0) + 1;
        if ("line" in outcome) {
          falsePositives.push({ from: text, chain: [...chain], ...outcome, proof: formatProof(current) });
        }
      }
    }
  });
  return { stats, falsePositives, rejections };
}

const report = ({ from, chain, line, sequent: wrong, proof }) => (
  `${from} [${chain.join(" + ")}] linha ${line}: ${wrong}\n${proof}`
);

test("o corpo tem pelo menos 30 provas e usa todas as regras do catálogo", () => {
  assert.ok(ENTRIES.length >= 30, `${ENTRIES.length} provas`);
  const used = new Set(ENTRIES.flatMap(({ proof }) => proof.lines.map(({ rule }) => rule)));
  for (const id of RULE_IDS) assert.ok(used.has(id), `falta uma prova com ${id}`);
});

test("os sequentes do corpo são todos distintos", () => {
  const texts = ENTRIES.map(({ goal }) => formatSequent(goal));
  assert.equal(new Set(texts).size, texts.length);
});

for (const { text, goal, proof } of ENTRIES) {
  test(`o corpo: ${text}`, () => {
    const result = verifyProof(proof, goal, POOL);
    assert.deepEqual(result.lineErrors, []);
    assert.equal(result.ok, true);
    assert.ok(isValid(goal));
    assert.equal(audit(proof, POOL).accepted, true);
  });
}

for (const seed of SEEDS) {
  test(`as mutações com a semente ${seed} nunca dão um falso positivo`, (t) => {
    const { stats, falsePositives } = fuzz(ENTRIES, POOL, seed);
    t.diagnostic(JSON.stringify(stats));
    assert.equal(falsePositives.length, 0, falsePositives.slice(0, 3).map(report).join("\n\n"));

    // Sem isto, o teste passaria se os mutantes deixassem de se construir ou fossem todos recusados.
    // Os aceites contam-se no total: fechar uma subdedução mais cedo quase nunca dá uma prova.
    for (const [name, { tried, rejected }] of Object.entries(stats)) {
      assert.ok(tried >= 300, `${name}: só ${tried} mutantes`);
      assert.ok(rejected > 0, `${name}: nenhum mutante recusado`);
    }
    const accepted = Object.values(stats).reduce((total, counts) => total + counts.accepted, 0);
    assert.ok(accepted >= 100, `só ${accepted} mutantes aceites`);
  });
}

test("a mesma semente dá sempre as mesmas contagens", () => {
  const entries = ENTRIES.slice(0, 5);
  assert.deepEqual(fuzz(entries, POOL).stats, fuzz(entries, POOL).stats);
});

test("a auditoria apanha uma regra que não é sólida", () => {
  const unsound = [...POOL, defineRule("Errada", ["φ"], "¬φ")];
  const built = parseProof(`
    1 | a    premissa
    2 | ¬a   Errada, 1`.trimStart());
  assert.ok(built.ok);
  assert.equal(audit(built.proof, unsound).line, 2);
});

test("as mutações denunciam um →E que esquece a premissa menor", () => {
  const unsound = POOL.map((rule) => (rule.id === "→E" ? defineRule("→E", ["φ → ψ"], "ψ") : rule));
  const { falsePositives } = fuzz(ENTRIES.slice(4, 7), unsound);
  assert.ok(falsePositives.length > 0);
});

test("a citação de uma subdedução não pode acabar dentro de outra subdedução", () => {
  const built = parseProof(`
    1 |   a      hipótese
    2 |     b    hipótese
    3 | a → b    →I, 1–2`.trimStart());
  assert.ok(built.ok);
  const goal = sequent([], implies(atom("a"), atom("b")));
  assert.equal(isValid(goal), false);
  const result = verifyProof(built.proof, goal, POOL);
  assert.equal(result.ok, false);
  assert.deepEqual(result.lineErrors.map(({ code }) => code), ["nestedConclusion"]);
});

// 1.ª ordem

const FIRST_ORDER_ENTRIES = ENTRIES.filter(({ firstOrder }) => firstOrder);

test("o corpo de 1.ª ordem usa as seis regras novas, as quatro derivadas e as três formas de caixa [v]", () => {
  const used = new Set(FIRST_ORDER_ENTRIES.flatMap(({ proof }) => proof.lines.map(({ rule }) => rule)));
  for (const id of [...FIRST_ORDER_RULES.map((rule) => rule.id), "NQ1", "NQ2", "NQ3", "NQ4"]) {
    assert.ok(used.has(id), `falta uma prova com ${id}`);
  }
  const lines = FIRST_ORDER_ENTRIES.flatMap(({ proof }) => proof.lines);
  assert.ok(lines.some((line) => line.kind === "step" && line.fresh), "caixa num passo");
  assert.ok(lines.some((line) => line.kind === "hypothesis" && line.fresh), "caixa numa hipótese");
  assert.ok(lines.some((line) => line.label), "linha de etiqueta");
});

test("as mutações das provas de 1.ª ordem dão mutantes aceites e recusados, sem falsos positivos", (t) => {
  const { stats, falsePositives, rejections } = fuzz(FIRST_ORDER_ENTRIES, POOL, SEEDS[1]);
  t.diagnostic(JSON.stringify(stats));
  t.diagnostic(JSON.stringify(rejections));
  // As condições de 1.ª ordem e as caixas [v] chegam a ser postas à prova, e não só a forma das fórmulas.
  for (const code of ["notFresh", "variableEscapes", "missingFreshBox", "wrongBox"]) {
    assert.ok(rejections[code] > 0, `nenhum mutante recusado com ${code}`);
  }
  assert.equal(falsePositives.length, 0, falsePositives.slice(0, 3).map(report).join("\n\n"));
  const total = (key) => Object.values(stats).reduce((sum, counts) => sum + counts[key], 0);
  assert.ok(total("accepted") >= 100, `só ${total("accepted")} mutantes aceites`);
  assert.ok(total("rejected") >= 1000, `só ${total("rejected")} mutantes recusados`);
  assert.ok(stats.changeFresh.rejected > 0 && stats.changeFresh.accepted > 0, JSON.stringify(stats.changeFresh));
});

test("os contramodelos finitos apanham os sequentes inválidos clássicos", () => {
  const invalid = ["∃x P(x) ⊢ ∀x P(x)", "∀x∃y R(x, y) ⊢ ∃y∀x R(x, y)", "P(a) ⊢ ∀x P(x)", "∃x P(x) ⊢ P(a)", "⊢ a = b"];
  for (const text of invalid) assert.equal(isValid(parseSequent(text).sequent), false, text);
  assert.equal(isValid(parseSequent("∀x P(x) ⊢ P(a)").sequent), true);
});

/** O conjunto com a regra `id` trocada por `replacement`. */
const swapRule = (id, replacement) => POOL.map((rule) => (rule.id === id ? replacement : rule));

const FORALL_WITHOUT_FRESH = defineRule("∀I", [subproof(null, "φ[v/x]", { fresh: "v" })], "∀x φ");

function readProof(text) {
  const built = parseProof(text.replace(/^\n/, ""));
  assert.ok(built.ok, JSON.stringify(built.error));
  return built.proof;
}

test("a auditoria apanha um ∀I sem a condição «v nova»", () => {
  const proof = readProof(`
    1 | P(a)          premissa
    2 |  [a] P(a)     R, 1
    3 | ∀x P(x)       ∀I, 2–2`);
  assert.equal(verifyLine(proof, 3, POOL).ok, false);
  assert.equal(audit(proof, swapRule("∀I", FORALL_WITHOUT_FRESH)).line, 3);
});

test("a auditoria apanha um ∃E que deixa a variável escapar", () => {
  const leaky = defineRule("∃E", ["∃x φ", subproof("φ[v/x]", "ψ", { fresh: "v" })], "ψ", {
    conditions: [FIRST_ORDER_RULES.find(({ id }) => id === "∃E").conditions[0]],
  });
  const proof = readProof(`
    1 | ∃x P(x)      premissa
    2 |  [a] P(a)    hipótese
    3 |   P(a)       R, 2
    4 | P(a)         ∃E, 1, 2–3`);
  assert.equal(verifyLine(proof, 4, POOL).ok, false);
  assert.equal(audit(proof, swapRule("∃E", leaky)).line, 4);
});
