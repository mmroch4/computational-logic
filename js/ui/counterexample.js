// A valoração de um contraexemplo, de `panelFromResult` em core/assist.js: a ajuda da Provar e o Passo a
// passo mostram-na da mesma forma, cada um com a sua frase por cima.
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
