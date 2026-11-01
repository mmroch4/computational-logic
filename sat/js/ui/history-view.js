// Interativo da §6 (Aprender): o Davis-Putnam original (1960) no exemplo com dois ramos.
//   1. elimina p por resolução: cada par (cláusula com p, cláusula com ¬p) dá um resolvente,
//      e os tautológicos são descartados;
//   2. o conjunto que fica tem unitárias, por isso propaga (a mesma regra da propagação unitária) e aparece F.
// Por baixo do texto, o player do DP (dp-player.js) deixa repetir isto noutros conjuntos.
//
// renderHistoryFigure() é pura (testada em node).
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { clauseHtml } from "./formula-input.js";
import { cardHtml } from "./clause-set-view.js";
import { stepDiagramHtml } from "./propagation-lab.js";
import { parse } from "../core/parser.js";
import { isEmptyClause } from "../core/clauses.js";
import { eliminateVariable } from "../core/resolution.js";
import { propagateClause } from "../core/propagation.js";
import { lessonIcon } from "./lesson-figure.js";

// Exemplo com dois ramos: {¬p ∨ ¬q, ¬p ∨ q, p ∨ ¬q, p ∨ q}.
export const HISTORY_EXAMPLE = "-p -q, -p q, p -q, p q";
const HISTORY_VARIABLE = "p";

function exampleClauses() {
  const result = parse(HISTORY_EXAMPLE);
  if (!result.ok) throw new Error(`Exemplo inválido: ${HISTORY_EXAMPLE}`);
  return result.clauses;
}

/** Os dois passos do DP no exemplo: eliminação de p e a propagação que se segue. */
export function historySteps() {
  const S = exampleClauses();
  const elimination = eliminateVariable(S, HISTORY_VARIABLE);
  const unitIndex = elimination.after.findIndex((clause) => clause.length === 1);
  const propagation = unitIndex === -1 ? null : propagateClause(elimination.after, unitIndex);
  return { S, elimination, propagation };
}

function cardsHtml(S) {
  const cards = S.map((clause) => cardHtml({ clause, state: isEmptyClause(clause) ? "empty" : "normal", struck: [] }));
  return `<ol class="clauses">${cards.join("")}</ol>`;
}

const clauseSpan = (clause) => `<span class="lit">${clauseHtml(clause)}</span>`;

/** Uma linha por par resolvido: p ∨ C · ¬p ∨ D → C ∨ D (os tautológicos riscados e descartados). */
function pairsHtml(S, elimination) {
  const rows = elimination.pairs.map((pair) => {
    const tag = pair.tautology
      ? ` <span class="resolution-pair__tag">${escapeHtml(t("learn.history.figure.tautology"))}</span>`
      : "";
    const result = pair.tautology ? `<s>${clauseSpan(pair.resolvent)}</s>` : clauseSpan(pair.resolvent);
    return (
      `<li class="resolution-pair${pair.tautology ? " resolution-pair--dropped" : ""}">` +
      `${clauseSpan(S[pair.positive])} <span class="resolution-pair__op">·</span> ${clauseSpan(S[pair.negative])} ` +
      `<span class="resolution-pair__op" aria-hidden="true">→</span> ${result}${tag}</li>`
    );
  });
  return `<ul class="resolution-pairs list-none">${rows.join("")}</ul>`;
}

/** Figura completa da §6. */
export function renderHistoryFigure() {
  const { S, elimination, propagation } = historySteps();
  const v = `<span class="lit">${escapeHtml(elimination.variable)}</span>`;
  const eliminationStep =
    `<p class="history-figure__step">${escapeHtml(t("learn.history.figure.step1"))} ${v}</p>` +
    `<div class="propagation-diagram rule-branch">` +
    `<div class="propagation-diagram__col">` +
    `<p class="propagation-diagram__label">${escapeHtml(t("learn.propagation.before"))}</p>${cardsHtml(S)}</div>` +
    `<div class="propagation-diagram__arrow">${lessonIcon("arrow")}</div>` +
    `<div class="propagation-diagram__col">` +
    `<p class="propagation-diagram__label">${escapeHtml(t("learn.history.figure.pairs"))}</p>${pairsHtml(S, elimination)}</div>` +
    `</div>`;
  const propagationStep = propagation
    ? `<p class="history-figure__step">${escapeHtml(t("learn.history.figure.step2"))}</p>${stepDiagramHtml(propagation)}`
    : "";
  return (
    `<figure class="propagation-figure history-figure">` +
    `<figcaption class="propagation-figure__title">${escapeHtml(t("learn.history.figure.title"))}</figcaption>` +
    eliminationStep +
    propagationStep +
    `<p class="history-figure__result">${escapeHtml(t("learn.history.figure.result"))}</p>` +
    `</figure>`
  );
}
