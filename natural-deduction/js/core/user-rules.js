// Regras do utilizador: esquema-tipo, validação, solidez e serialização. Módulo puro (sem DOM).
//
// Um rascunho é o que vem do editor, do `localStorage` ou de um link, por isso nunca é de confiança:
//   { name, premises: ["φ → ψ", { hypothesis: "φ", conclusion: "ψ" }], conclusion: "¬φ" }
// Uma regra do utilizador tem a forma das do catálogo (`rules.js`), com uma só conclusão e `user: true`.
// Contrato:
//   parseUserRule(draft)            → { ok: true, rule } | { ok: false, error }: só a sintaxe
//   ruleFormula(rule)               → a fórmula cuja tautologia decide a solidez
//   checkSoundness(rule)            → { ok: true, sound, formula, counterexample: Map | null }
//                                   | { ok: false, error }
//   createUserRule(draft, existing) → { ok: true, rule } | { ok: false, error }: sintaxe e solidez
//   serializeUserRules(rules)       → rascunhos em JSON simples
//   loadUserRules(data)             → { rules, rejected: [{ index, name, error }] }
//   userRulesEnabled(exercise)      → boolean
//   activeRules(exercise, userRules) → { rules, known }, os dois últimos argumentos de `verifyProof`
//   progressMark(result)            → null | "solved" | "solvedWithUserRules"
//   rulesUsedBy(proof, rules)       → as regras de `rules` citadas numa linha da prova
//   mergeUserRules(saved, linked)   → { saved, session, added, replaced }: junta as regras de um link
//   combineUserRules(saved, session) → as regras ativas
// Um erro é { code, params }, mais `field` ("name", "premise", "conclusion"), `index` e `part`
// ("hypothesis", "conclusion") quando é de uma premissa, e as posições dos erros do parser. O erro
// `unsound` traz ainda `formula` e `counterexample`. As mensagens estão em `userRules.errors.*`,
// `parser.errors.*` e `semantics.errors.*`.

import { and, format, implies } from "./formula.js";
import { isReservedRuleWord, RULE_ALIASES } from "./proof-text.js";
import { defineRule, RULES, ruleSet, subproof } from "./rules.js";
import { parseSchema } from "./schema.js";
import { checkTautology } from "./semantics.js";

/** Códigos de erro próprios; os outros são os do parser e `tooManyVariables`. */
export const USER_RULE_ERROR_CODES = [
  "malformed", // o rascunho não tem a forma esperada
  "invalidName", // o nome não é uma letra seguida de letras, dígitos, `_` ou `-`
  "nameTooLong", // { max }
  "reservedName", // { name }: é uma regra do catálogo ou uma palavra do formato das provas
  "duplicateName", // { name }: já há uma regra do utilizador com este nome
  "tooManyPremises", // { count, max }
  "schemaTooLarge", // { size, max }: esquema com nós a mais
  "tooManyRules", // { max }
  "unsound", // o esquema não é tautologia: traz `formula` e `counterexample`
];

/**
 * As regras viajam em links, por isso estes limites impedem um link de bloquear a página: as citações
 * distribuem-se por n! ordens e a solidez percorre a tabela de verdade de cada regra.
 */
export const USER_RULE_LIMITS = Object.freeze({ maxRules: 30, maxPremises: 6, maxName: 24, maxNodes: 100 });

const NAME_RE = /^\p{L}[\p{L}\p{N}_-]*$/u;

/** Nomes que confundiriam, sem distinguir maiúsculas: `mt` e `MT`, `raa` e `RAA`. */
const CATALOG_NAMES = new Set([...RULES.map(({ id }) => id), ...RULE_ALIASES.keys()].map((id) => id.toLowerCase()));

const failure = (code, params = {}, details = {}) => ({ ok: false, error: { code, params, ...details } });

const nodeCount = (node) => node.args.reduce((total, arg) => total + nodeCount(arg), 1);

function readSchema(text, details) {
  if (typeof text !== "string") return failure("malformed", {}, details);
  const result = parseSchema(text);
  if (!result.ok) return { ok: false, error: { ...result.error, ...details } };
  const size = nodeCount(result.formula);
  const max = USER_RULE_LIMITS.maxNodes;
  return size > max ? failure("schemaTooLarge", { size, max }, details) : result;
}

/** Lê uma premissa: devolve o erro, ou null. */
function premiseError(premise, index) {
  if (typeof premise === "string") return readSchema(premise, { field: "premise", index }).error ?? null;
  if (premise === null || typeof premise !== "object") {
    return failure("malformed", {}, { field: "premise", index }).error;
  }
  for (const part of ["hypothesis", "conclusion"]) {
    const result = readSchema(premise[part], { field: "premise", index, part });
    if (!result.ok) return result.error;
  }
  return null;
}

function nameError(name) {
  const details = { field: "name" };
  if (typeof name !== "string") return failure("malformed", {}, details);
  const max = USER_RULE_LIMITS.maxName;
  if (name.length > max) return failure("nameTooLong", { max }, details);
  if (!NAME_RE.test(name)) return failure("invalidName", {}, details);
  if (CATALOG_NAMES.has(name.toLowerCase()) || isReservedRuleWord(name)) {
    return failure("reservedName", { name }, details);
  }
  return null;
}

/** Valida a sintaxe do rascunho. Da entrada só se leem estes campos: um `sound: true` não conta. */
export function parseUserRule(draft) {
  if (draft === null || typeof draft !== "object" || !Array.isArray(draft.premises)) return failure("malformed");
  const name = typeof draft.name === "string" ? draft.name.trim() : draft.name;
  const invalidName = nameError(name);
  if (invalidName) return invalidName;

  const { premises, conclusion } = draft;
  const { maxPremises } = USER_RULE_LIMITS;
  if (premises.length > maxPremises) {
    return failure("tooManyPremises", { count: premises.length, max: maxPremises }, { field: "premise" });
  }
  for (const [index, premise] of premises.entries()) {
    const error = premiseError(premise, index);
    if (error) return { ok: false, error };
  }
  const read = readSchema(conclusion, { field: "conclusion" });
  if (!read.ok) return read;

  const items = premises.map((item) => (
    typeof item === "string" ? item : subproof(item.hypothesis, item.conclusion)
  ));
  return { ok: true, rule: Object.freeze({ ...defineRule(name, items, conclusion), user: true }) };
}

const premiseFormula = (premise) => (
  premise.kind === "formula" ? premise.schema : implies(premise.hypothesis, premise.conclusion)
);

/**
 * (P₁ ∧ … ∧ Pₙ) → C, ou só C sem premissas, onde `[φ] … ψ` conta como φ → ψ. Não usa `ruleGoal`:
 * esse troca φ por p, e aqui φ tem de continuar distinta de um átomo `p` escrito na própria regra.
 */
export function ruleFormula({ premises, conclusions: [conclusion] }) {
  if (premises.length === 0) return conclusion;
  return implies(premises.map(premiseFormula).reduce(and), conclusion);
}

/** Decide a solidez: tautologia, com as metavariáveis e os átomos como variáveis proposicionais. */
export function checkSoundness(rule) {
  const formula = ruleFormula(rule);
  const result = checkTautology(formula);
  if (!result.ok) return result;
  return { ok: true, sound: result.valid, formula, counterexample: result.counterexample };
}

/** Regra pronta a usar, ou o motivo da recusa. `existing`: as regras que já há. */
export function createUserRule(draft, existing = []) {
  const parsed = parseUserRule(draft);
  if (!parsed.ok) return parsed;
  const { rule } = parsed;
  const { maxRules } = USER_RULE_LIMITS;
  if (existing.length >= maxRules) return failure("tooManyRules", { max: maxRules });
  if (existing.some(({ id }) => id === rule.id)) return failure("duplicateName", { name: rule.id }, { field: "name" });

  const soundness = checkSoundness(rule);
  if (!soundness.ok) return soundness;
  if (soundness.sound) return parsed;
  const { formula, counterexample } = soundness;
  return failure("unsound", {}, { formula, counterexample });
}

const serializePremise = (premise) => (
  premise.kind === "formula"
    ? format(premise.schema)
    : { hypothesis: format(premise.hypothesis), conclusion: format(premise.conclusion) }
);

/** O que se guarda e vai no link: só o esquema, porque a validação se repete sempre ao carregar. */
export function serializeUserRules(rules) {
  return rules.map(({ id, premises, conclusions: [conclusion] }) => ({
    name: id,
    premises: premises.map(serializePremise),
    conclusion: format(conclusion),
  }));
}

/**
 * Valida de novo o que vem do `localStorage` ou de um link. Uma regra recusada não impede as outras:
 * a UI avisa, e uma prova que a use dá `unknownRule` no verificador.
 */
export function loadUserRules(data) {
  if (!Array.isArray(data)) return { rules: [], rejected: [{ index: null, name: null, error: failure("malformed").error }] };
  const rules = [];
  const rejected = [];
  const { maxRules } = USER_RULE_LIMITS;
  for (const [index, draft] of data.slice(0, maxRules).entries()) {
    const result = createUserRule(draft, rules);
    if (result.ok) {
      rules.push(result.rule);
    } else {
      const name = typeof draft?.name === "string" ? draft.name.slice(0, USER_RULE_LIMITS.maxName) : null;
      rejected.push({ index, name, error: result.error });
    }
  }
  if (data.length > maxRules) {
    rejected.push({ index: maxRules, name: null, error: failure("tooManyRules", { max: maxRules }).error });
  }
  return { rules: Object.freeze(rules), rejected };
}

/**
 * O campo `userRules` de um exercício { rules, userRules }, ativo por omissão. Desliga-se com
 * `userRules: false`, com `base` puro ou `restrito`, e com `exclude`, que marca um exercício que pede
 * para provar uma regra. `base + {…}` é outro conjunto e fica ativo. O desligado ganha sempre.
 */
export function userRulesEnabled({ rules: spec, userRules = true }) {
  const { set, plus = [], exclude = [] } = typeof spec === "string" ? { set: spec } : spec;
  if (!userRules || set === "restrito" || exclude.length > 0) return false;
  return set !== "base" || plus.length > 0;
}

/**
 * As regras de um exercício, ou do modo livre com { rules: "completo" }. As regras do utilizador ficam
 * sempre em `known`, para uma regra desligada dar `ruleNotAllowed` e não `unknownRule`.
 */
export function activeRules(exercise, userRules = []) {
  const allowed = ruleSet(exercise.rules);
  return {
    rules: userRulesEnabled(exercise) ? [...allowed, ...userRules] : allowed,
    known: [...RULES, ...userRules],
  };
}

/** As regras de `rules` que a prova usa: é só o que precisa de ir no link. */
export function rulesUsedBy({ lines }, rules) {
  const used = new Set(lines.map(({ rule }) => rule));
  return rules.filter(({ id }) => used.has(id));
}

const schemaOf = (rule) => JSON.stringify(serializeUserRules([rule]));

/**
 * Junta as regras `linked` de um link às `saved`, guardadas. Uma regra nova fica guardada, até ao limite.
 * Com o mesmo nome e outro esquema, a do link manda só nesta sessão, porque é com ela que a prova do link
 * foi escrita, e a guardada não se perde. `session` são as regras ativas que não se guardam.
 */
export function mergeUserRules(saved, linked) {
  const next = [...saved];
  const session = [];
  const added = [];
  const replaced = [];
  for (const rule of linked) {
    const same = saved.find(({ id }) => id === rule.id);
    if (same && schemaOf(same) === schemaOf(rule)) continue;
    if (same) {
      session.push(rule);
      replaced.push(rule.id);
    } else {
      if (next.length < USER_RULE_LIMITS.maxRules) next.push(rule);
      else session.push(rule);
      added.push(rule.id);
    }
  }
  return { saved: next, session, added, replaced };
}

/** As regras ativas: as guardadas, com as de `session` por cima das que têm o mesmo nome. */
export function combineUserRules(saved, session) {
  const names = new Set(session.map(({ id }) => id));
  return [...saved.filter(({ id }) => !names.has(id)), ...session];
}

/** O que uma prova verificada conta no progresso: `result` é o resultado de `verifyProof`. */
export function progressMark({ ok, usesUserRules }) {
  if (!ok) return null;
  return usesUserRules ? "solvedWithUserRules" : "solved";
}
