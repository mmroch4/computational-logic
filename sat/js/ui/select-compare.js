// Interativo da §5 (Aprender): o mesmo conjunto resolvido duas vezes, com o ramo ¬ primeiro
// e com o ramo positivo primeiro (como a ferramenta), lado a lado.
// O leitor escolhe o conjunto e o critério que escolhe a variável; cada lado mostra a
// árvore de decisão completa (compacta) e o nº de nós, e um resumo diz qual ficou mais pequena.
//
// A lógica está em js/core/heuristics.js. renderSelectCompare é pura (testada em node);
// mountSelectCompare mexe no DOM.
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { setHtml } from "./formula-input.js";
import { treeModel, compactTreeSvg, COMPACT_TREE_SIZES } from "./tree-view.js";
import { parse } from "../core/parser.js";
import { getExample } from "../core/examples.js";
import { HEURISTICS, compareBranchOrder } from "../core/heuristics.js";
import { lessonFigureHtml } from "./lesson-figure.js";

/**
 * Conjuntos do interativo: o de dois ramos (os dois sinais dão o mesmo), dois de três variáveis
 * em que cada sinal ganha uma vez, e um em que o critério é que faz a diferença.
 */
export const COMPARE_EXAMPLES = ["two-branches", "three-vars-b", "three-vars-e", "extra-8-vars"];

/** Chave do nome de cada conjunto nos locales (os ids têm pontos, que o t() lê como níveis). */
const EXAMPLE_KEYS = { "two-branches": "twoBranches", "three-vars-b": "threeVarsB", "three-vars-e": "threeVarsE", "extra-8-vars": "vars8" };

/** Os dois lados, pela ordem em que aparecem: primeiro o ramo ¬. */
const SIDES = ["negative", "positive"];

function compareExampleClauses(exampleId) {
  return parse(getExample(exampleId).input).clauses;
}

function sideHtml(side, run, smaller) {
  const { stats, sat } = run.result;
  const model = treeModel(run.trace, run.trace.length - 1, COMPACT_TREE_SIZES);
  const winner = smaller === side;
  const badge = winner ? `<span class="select-compare__badge">${escapeHtml(t("learn.select.compare.smaller"))}</span>` : "";
  const answer = t(sat ? "learn.select.compare.sat" : "learn.select.compare.unsat");
  return (
    `<section class="select-compare__side${winner ? " select-compare__side--winner" : ""}" aria-label="${escapeHtml(t(`learn.select.compare.sides.${side}`))}">` +
    `<h3 class="select-compare__heading">${escapeHtml(t(`learn.select.compare.sides.${side}`))}${badge}</h3>` +
    `<p class="select-compare__stats"><strong>${escapeHtml(t("learn.select.compare.nodes", { n: stats.nodes }))}</strong> · ` +
    `${escapeHtml(t("learn.select.compare.branches", { n: stats.branches }))} · ${escapeHtml(answer)}</p>` +
    `<div class="select-compare__tree">${compactTreeSvg(model, t(`learn.select.compare.treeLabel.${side}`))}</div>` +
    `</section>`
  );
}

/** HTML completo do interativo para { exampleId, heuristic }. */
export function renderSelectCompare({ exampleId = COMPARE_EXAMPLES[0], heuristic = "alphabetical" } = {}) {
  const S = compareExampleClauses(exampleId);
  const comparison = compareBranchOrder(S, heuristic);
  const examples = COMPARE_EXAMPLES.map(
    (id) =>
      `<button type="button" data-example="${id}" aria-pressed="${id === exampleId}">${escapeHtml(t(`learn.select.compare.examples.${EXAMPLE_KEYS[id]}`))}</button>`,
  ).join("");
  const options = HEURISTICS.map(
    (h) => `<option value="${h}"${h === heuristic ? " selected" : ""}>${escapeHtml(t(`learn.select.heuristics.${h}`))}</option>`,
  ).join("");
  const body =
    `<div class="seg sm lesson-choices" role="group" aria-label="${escapeHtml(t("learn.select.compare.examplesLabel"))}">${examples}</div>` +
    `<p class="select-compare__set">S = ${setHtml(S)}</p>` +
    `<label class="select-compare__criterion"><span>${escapeHtml(t("learn.select.compare.criterion"))}</span>` +
    `<select class="select" data-heuristic>${options}</select></label>` +
    `<div class="select-compare__grid">${SIDES.map((side) => sideHtml(side, comparison[side], comparison.smaller)).join("")}</div>` +
    `<p class="select-compare__verdict" aria-live="polite">${escapeHtml(t(`learn.select.compare.verdict.${comparison.smaller}`, {
      negative: comparison.negative.result.stats.nodes,
      positive: comparison.positive.result.stats.nodes,
    }))}</p>`;
  return lessonFigureHtml({ classes: "select-compare", icon: "fork", title: t("learn.select.compare.title"), body });
}

/** Monta o interativo em `container`. Devolve { refresh } para redesenhar ao mudar de idioma. */
export function mountSelectCompare(container, { exampleId = COMPARE_EXAMPLES[0], heuristic = "alphabetical" } = {}) {
  if (!container) return { refresh() {} };
  const state = { exampleId, heuristic };

  function draw(focus) {
    container.innerHTML = renderSelectCompare(state);
    if (focus) container.querySelector(focus)?.focus();
  }

  container.addEventListener("click", (event) => {
    const example = event.target.closest("[data-example]");
    if (!example) return;
    state.exampleId = example.dataset.example;
    draw(`[data-example='${state.exampleId}']`);
  });
  container.addEventListener("change", (event) => {
    if (!event.target.matches("[data-heuristic]")) return;
    state.heuristic = event.target.value;
    draw("[data-heuristic]");
  });

  draw();
  return { refresh: () => draw() };
}
