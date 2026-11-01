// Catálogo declarativo das regras de inferência. Módulo puro (sem DOM).
// Uma regra é { id, premises, conclusions }, mais `proof` nas derivadas:
//   id: o que fica em `rule` numa linha da prova. É o nome PT e nunca muda com o idioma: a sigla
//     mostrada sai de `ruleLabel`. Entradas com o mesmo id são formas alternativas da regra (DM, SD).
//   premises: { kind: "formula", schema } | { kind: "subproof", hypothesis, conclusion }
//   conclusions: esquemas alternativos, para as regras com mais do que uma forma (∧E, ∨I)
//   proof: prova em texto (formato de `proof-text.js`) só com regras base, sobre os átomos p, q, r no
//     lugar de φ, ψ, θ. Demonstra `ruleGoal(rule)` e vale para qualquer instância, porque o
//     verificador nunca olha para dentro de um átomo.
// As premissas podem ser citadas por qualquer ordem. As metavariáveis são partilhadas entre as
// premissas e a conclusão; a que só aparece na conclusão (o ψ do ∨I) fica com o que lá estiver.

import { atom, implies } from "./formula.js";
import { applySubstitution, parseSchema } from "./schema.js";
import { sequent } from "./sequent.js";

function schema(text) {
  const result = parseSchema(text);
  if (!result.ok) throw new Error(`Esquema inválido: ${text}`);
  return result.formula;
}

/** Premissa que é uma subdedução `[hypothesis] … conclusion`. */
export const subproof = (hypothesis, conclusion) => ({ hypothesis, conclusion });

function premise(item) {
  if (typeof item === "string") return Object.freeze({ kind: "formula", schema: schema(item) });
  return Object.freeze({
    kind: "subproof",
    hypothesis: schema(item.hypothesis),
    conclusion: schema(item.conclusion),
  });
}

/** Cria uma regra a partir de esquemas em texto. Uma regra tem sempre pelo menos uma conclusão. */
export function defineRule(id, premises, ...conclusions) {
  return Object.freeze({
    id,
    premises: Object.freeze(premises.map(premise)),
    conclusions: Object.freeze(conclusions.map(schema)),
  });
}

/** Regras base do sistema DN. */
export const BASE_RULES = Object.freeze([
  defineRule("∧I", ["φ", "ψ"], "φ ∧ ψ"),
  defineRule("∧E", ["φ ∧ ψ"], "φ", "ψ"),
  defineRule("∨I", ["φ"], "φ ∨ ψ", "ψ ∨ φ"),
  defineRule("∨E", ["φ ∨ ψ", subproof("φ", "θ"), subproof("ψ", "θ")], "θ"),
  defineRule("¬I", [subproof("φ", "F")], "¬φ"),
  defineRule("¬E", ["¬¬φ"], "φ"),
  defineRule("FI", ["φ", "¬φ"], "F"),
  defineRule("FE", ["F"], "φ"),
  defineRule("→I", [subproof("φ", "ψ")], "φ → ψ"),
  defineRule("→E", ["φ", "φ → ψ"], "ψ"),
  defineRule("R", ["φ"], "φ"),
]);

function derived(id, premises, conclusion, proof) {
  return Object.freeze({ ...defineRule(id, premises, conclusion), proof });
}

/** Regras derivadas. Cada forma guarda a sua prova. */
export const DERIVED_RULES = Object.freeze([
  derived("MT", ["φ → ψ", "¬ψ"], "¬φ", `
    1 | p → q   premissa
    2 | ¬q      premissa
    3 |   p     hipótese
    4 |   q     →E, 3, 1
    5 |   F     FI, 4, 2
    6 | ¬p      ¬I, 3–5`),
  derived("¬¬I", ["φ"], "¬¬φ", `
    1 | p     premissa
    2 |   ¬p  hipótese
    3 |   F   FI, 1, 2
    4 | ¬¬p   ¬I, 2–3`),
  derived("RA", [subproof("¬φ", "F")], "φ", `
    1 | ¬p → F   premissa
    2 |   ¬p     hipótese
    3 |   F      →E, 2, 1
    4 | ¬¬p      ¬I, 2–3
    5 | p        ¬E, 4`),
  derived("TE", [], "φ ∨ ¬φ", `
    1 |   ¬(p ∨ ¬p)   hipótese
    2 |     p         hipótese
    3 |     p ∨ ¬p    ∨I, 2
    4 |     F         FI, 3, 1
    5 |   ¬p          ¬I, 2–4
    6 |   p ∨ ¬p      ∨I, 5
    7 |   F           FI, 6, 1
    8 | ¬¬(p ∨ ¬p)    ¬I, 1–7
    9 | p ∨ ¬p        ¬E, 8`),
  derived("DM", ["¬(φ ∧ ψ)"], "¬φ ∨ ¬ψ", `
     1 | ¬(p ∧ q)        premissa
     2 |   ¬(¬p ∨ ¬q)    hipótese
     3 |     ¬p          hipótese
     4 |     ¬p ∨ ¬q     ∨I, 3
     5 |     F           FI, 4, 2
     6 |   ¬¬p           ¬I, 3–5
     7 |   p             ¬E, 6
     8 |     ¬q          hipótese
     9 |     ¬p ∨ ¬q     ∨I, 8
    10 |     F           FI, 9, 2
    11 |   ¬¬q           ¬I, 8–10
    12 |   q             ¬E, 11
    13 |   p ∧ q         ∧I, 7, 12
    14 |   F             FI, 13, 1
    15 | ¬¬(¬p ∨ ¬q)     ¬I, 2–14
    16 | ¬p ∨ ¬q         ¬E, 15`),
  derived("DM", ["¬φ ∨ ¬ψ"], "¬(φ ∧ ψ)", `
     1 | ¬p ∨ ¬q      premissa
     2 |   p ∧ q      hipótese
     3 |   p          ∧E, 2
     4 |   q          ∧E, 2
     5 |     ¬p       hipótese
     6 |     F        FI, 3, 5
     7 |     ¬q       hipótese
     8 |     F        FI, 4, 7
     9 |   F          ∨E, 1, 5–6, 7–8
    10 | ¬(p ∧ q)     ¬I, 2–9`),
  derived("DM", ["¬(φ ∨ ψ)"], "¬φ ∧ ¬ψ", `
     1 | ¬(p ∨ q)     premissa
     2 |   p          hipótese
     3 |   p ∨ q      ∨I, 2
     4 |   F          FI, 3, 1
     5 | ¬p           ¬I, 2–4
     6 |   q          hipótese
     7 |   p ∨ q      ∨I, 6
     8 |   F          FI, 7, 1
     9 | ¬q           ¬I, 6–8
    10 | ¬p ∧ ¬q      ∧I, 5, 9`),
  derived("DM", ["¬φ ∧ ¬ψ"], "¬(φ ∨ ψ)", `
     1 | ¬p ∧ ¬q      premissa
     2 | ¬p           ∧E, 1
     3 | ¬q           ∧E, 1
     4 |   p ∨ q      hipótese
     5 |     p        hipótese
     6 |     F        FI, 5, 2
     7 |     q        hipótese
     8 |     F        FI, 7, 3
     9 |   F          ∨E, 4, 5–6, 7–8
    10 | ¬(p ∨ q)     ¬I, 4–9`),
  derived("SH", ["φ → ψ", "ψ → θ"], "φ → θ", `
    1 | p → q   premissa
    2 | q → r   premissa
    3 |   p     hipótese
    4 |   q     →E, 3, 1
    5 |   r     →E, 4, 2
    6 | p → r   →I, 3–5`),
  derived("SD", ["φ ∨ ψ", "¬φ"], "ψ", `
    1 | p ∨ q   premissa
    2 | ¬p      premissa
    3 |   p     hipótese
    4 |   F     FI, 3, 2
    5 |   q     FE, 4
    6 |   q     hipótese
    7 |   q     R, 6
    8 | q       ∨E, 1, 3–5, 6–7`),
  derived("SD", ["φ ∨ ψ", "¬ψ"], "φ", `
    1 | p ∨ q   premissa
    2 | ¬q      premissa
    3 |   p     hipótese
    4 |   p     R, 3
    5 |   q     hipótese
    6 |   F     FI, 5, 2
    7 |   p     FE, 6
    8 | p       ∨E, 1, 3–4, 5–7`),
]);

/** Todas as regras do sistema: as formas de cada uma, com ids repetidos. */
export const RULES = Object.freeze([...BASE_RULES, ...DERIVED_RULES]);

const PROOF_ATOMS = Object.freeze({ φ: atom("p"), ψ: atom("q"), θ: atom("r") });

const instantiate = (schemaNode) => applySubstitution(schemaNode, PROOF_ATOMS).formula;

/**
 * O sequente que a prova de uma derivada demonstra, com p, q, r no lugar de φ, ψ, θ.
 * Uma subdedução `[φ] … ψ` conta como a premissa φ → ψ.
 */
export function ruleGoal({ premises, conclusions }) {
  const asFormula = (item) => (
    item.kind === "formula" ? item.schema : implies(item.hypothesis, item.conclusion)
  );
  return sequent(premises.map((item) => instantiate(asFormula(item))), instantiate(conclusions[0]));
}

const idsOf = (rules) => rules.map(({ id }) => id);

/**
 * Conjunto de regras de um exercício: as formas permitidas, a passar a `verifyLine`/`verifyProof`.
 *   "base" | "completo"
 *   { set: "base", plus: ["MT"] }             base + {…}
 *   { set: "restrito", only: ["∧I", "→E"] }   só as regras indicadas
 * `exclude`, em qualquer forma de objeto, tira regras: serve para os exercícios que pedem para provar
 * uma regra. Um conjunto mal escrito é um erro do autor, por isso lança uma exceção.
 */
export function ruleSet(spec) {
  const { set, plus = [], only = [], exclude = [] } = typeof spec === "string" ? { set: spec } : spec;
  const starts = new Map([["base", idsOf(BASE_RULES)], ["completo", idsOf(RULES)], ["restrito", only]]);
  if (!starts.has(set)) throw new Error(`Conjunto de regras inválido: ${set}`);
  if (only.length > 0 && set !== "restrito") throw new Error("`only` é só para o conjunto restrito");
  if (plus.length > 0 && set !== "base") throw new Error("`plus` é só para o conjunto base");

  const known = new Set(idsOf(RULES));
  for (const id of [...only, ...plus, ...exclude]) {
    if (!known.has(id)) throw new Error(`Regra desconhecida: ${id}`);
  }
  const allowed = new Set([...starts.get(set), ...plus]);
  for (const id of exclude) allowed.delete(id);
  return Object.freeze(RULES.filter(({ id }) => allowed.has(id)));
}

/** A sigla de uma regra no idioma de `labels` (`rules.labels` dos locales). Sem sigla própria, é o id. */
export function ruleLabel(id, labels = {}) {
  return Object.hasOwn(labels, id) ? labels[id] : id;
}

/** Os parâmetros de um erro do verificador com a sigla do idioma, prontos para a mensagem. */
export function localizeRuleParam(params, labels) {
  return "rule" in params ? { ...params, rule: ruleLabel(params.rule, labels) } : params;
}
