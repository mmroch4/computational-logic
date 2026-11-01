// O formulário do esquema-tipo de uma regra do utilizador: o que está escrito e o que isso vale. Módulo
// puro (sem DOM). A validação é a de `user-rules.js`, e aqui só se decide o que mostrar a meio da escrita.
//
// Um formulário é { name, premises, conclusion }, sempre com texto:
//   premises: [{ kind: "formula", text } | { kind: "subproof", hypothesis, conclusion }]
// Contrato:
//   emptyForm()                → formulário em branco
//   formToDraft(form)          → rascunho para `createUserRule`, sem as premissas em branco
//   checkForm(form, existing)  → um destes estados, com `rule` (para a pré-visualização) desde que o
//                                esquema se leia:
//     { status: "empty" }                     nada escrito
//     { status: "incomplete", rule? }         falta a conclusão
//     { status: "invalid", error, rule? }     erro de `user-rules.js`, com `field`, `index` e `part`
//     { status: "unsound", rule, formula, valuation, freeVariables }   valuation: [[nome, valor]]
//     { status: "unnamed", rule }             é sólida, e só falta o nome
//     { status: "ready", rule }               pronta a guardar

import { parseUserRule, checkSoundness, createUserRule } from "./user-rules.js";
import { variablesOf } from "./semantics.js";

export const emptyForm = () => ({ name: "", premises: [], conclusion: "" });

export const formulaPremise = () => ({ kind: "formula", text: "" });

export const subproofPremise = () => ({ kind: "subproof", hypothesis: "", conclusion: "" });

const isBlank = (text) => text.trim() === "";

const blankPremise = (premise) => (
  premise.kind === "formula" ? isBlank(premise.text) : isBlank(premise.hypothesis) && isBlank(premise.conclusion)
);

/** Índices em `premises` das premissas que contam, pela ordem do rascunho. */
export const filledPremises = ({ premises }) => premises.flatMap((premise, index) => (blankPremise(premise) ? [] : [index]));

export function formToDraft(form) {
  const premises = form.premises.filter((premise) => !blankPremise(premise)).map((premise) => (
    premise.kind === "formula" ? premise.text : { hypothesis: premise.hypothesis, conclusion: premise.conclusion }
  ));
  return { name: form.name.trim(), premises, conclusion: form.conclusion };
}

/** Um nome qualquer, para ler e testar o esquema antes de haver nome. */
const PLACEHOLDER_NAME = "x";

/** O erro de uma premissa fala do índice no rascunho; o formulário precisa do índice dele. */
function inForm(error, form) {
  if (error.field !== "premise" || error.index === undefined) return error;
  return { ...error, index: filledPremises(form)[error.index] };
}

export function checkForm(form, existing = []) {
  const draft = formToDraft(form);
  const noConclusion = isBlank(draft.conclusion);
  if (draft.name === "" && draft.premises.length === 0 && noConclusion) return { status: "empty" };

  // A conclusão provisória deixa ler as premissas antes de ela estar escrita.
  const read = parseUserRule({ ...draft, name: PLACEHOLDER_NAME, conclusion: noConclusion ? "F" : draft.conclusion });
  if (!read.ok) return { status: "invalid", error: inForm(read.error, form) };
  if (noConclusion) return { status: "incomplete" };

  const named = draft.name === "" ? null : { ...read.rule, id: draft.name };
  const shown = named ?? read.rule;
  const soundness = checkSoundness(read.rule);
  if (!soundness.ok) return { status: "invalid", error: soundness.error, rule: shown };
  if (!soundness.sound) {
    const { formula, counterexample } = soundness;
    return {
      status: "unsound",
      rule: shown,
      formula,
      valuation: [...counterexample],
      freeVariables: variablesOf([formula]).some((name) => !counterexample.has(name)),
    };
  }
  if (draft.name === "") return { status: "unnamed", rule: shown };

  const created = createUserRule(draft, existing);
  return created.ok ? { status: "ready", rule: created.rule } : { status: "invalid", error: created.error, rule: shown };
}
