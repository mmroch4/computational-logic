// O contraexemplo de `panelFromResult` em core/assist.js: a ajuda da Provar e o Passo a passo mostram-no
// da mesma forma, cada um com a sua frase por cima. Num sequente proposicional é uma valoração; em 1.ª
// ordem, uma estrutura finita de core/structures.js (domínio, constantes, funções e extensões).
import { displayName } from "../core/formula.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";

/** Os valores do contraexemplo e, se ficarem variáveis de fora, o aviso de que podem ter qualquer valor. */
export function valuationHtml({ valuation, freeVariables }) {
  if (valuation.length === 0) return `<p class="assist__note">${escapeHtml(t("assist.anyValuation"))}</p>`;
  const items = valuation.map(([name, value]) => (
    `<li>${escapeHtml(`${displayName(name)} = ${t(`assist.values.${value}`)}`)}</li>`
  )).join("");
  const others = freeVariables ? `<p class="assist__note">${escapeHtml(t("assist.otherValues"))}</p>` : "";
  return `<ul class="assist__valuation" aria-label="${escapeHtml(t("assist.valuationLabel"))}">${items}</ul>${others}`;
}

/** Os elementos do domínio mostram-se de 1 a n; na estrutura vão de 0 a n − 1. */
const element = (value) => String(value + 1);

const tuple = (values) => (values.length === 1 ? element(values[0]) : `(${values.map(element).join(", ")})`);

const setText = (items) => (items.length === 0 ? "∅" : `{${items.join(", ")}}`);

function constantItems(constants) {
  return constants.map(({ name, value }) => `${displayName(name)} = ${element(value)}`);
}

function functionItems(functions) {
  return functions.flatMap(({ name, table }) => table.map(({ args, value }) => (
    `${displayName(name)}(${args.map(element).join(", ")}) = ${element(value)}`
  )));
}

function predicateItems(predicates) {
  return predicates.map(({ name, arity, extension }) => {
    if (arity === 0) return `${displayName(name)} = ${t(`assist.values.${extension.length > 0}`)}`;
    return `${displayName(name)} = ${setText(extension.map(tuple))}`;
  });
}

function rowHtml(key, items) {
  if (items.length === 0) return "";
  const chips = items.map((text) => `<li>${escapeHtml(text)}</li>`).join("");
  return `<div class="assist__structure-row"><dt>${escapeHtml(t(`assist.structure.${key}`))}</dt>`
    + `<dd><ul class="assist__valuation">${chips}</ul></dd></div>`;
}

/** A estrutura de um contramodelo de 1.ª ordem: domínio, constantes, funções e extensões dos predicados. */
export function structureHtml({ size, constants, functions, predicates }) {
  const domain = `D = ${setText(Array.from({ length: size }, (_, value) => element(value)))}`;
  return `<dl class="assist__structure" aria-label="${escapeHtml(t("assist.structure.label"))}">`
    + rowHtml("domain", [domain])
    + rowHtml("constants", constantItems(constants))
    + rowHtml("functions", functionItems(functions))
    + rowHtml("predicates", predicateItems(predicates))
    + "</dl>";
}

/** O contraexemplo de um painel `invalid`: a estrutura, em 1.ª ordem, ou a valoração. */
export const counterexampleHtml = (panel) => (panel.structure ? structureHtml(panel.structure) : valuationHtml(panel));
