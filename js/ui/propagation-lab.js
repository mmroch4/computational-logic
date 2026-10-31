// Interativos da §3 (Aprender): propagação unitária.
//   - renderRulesDiagram(): diagrama antes/depois das duas regras da propagação, com um exemplo pequeno;
//   - mountPropagationLab(): o aluno clica numa cláusula unitária e vê a propagação acontecer
//     (as cláusulas com l saem, l̃ fica riscado), até S ficar vazio, aparecer F ou não haver unitárias.
// Os cartões são os mesmos do Passo a passo (cardHtml + clauseSetModel de clause-set-view.js).
//
// As funções render* são puras (testadas em node); mountPropagationLab mexe no DOM.
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { literalHtml } from "./formula-input.js";
import { cardHtml, clauseSetModel } from "./clause-set-view.js";
import { parse } from "../core/parser.js";
import { isEmptyClause, isUnitClause } from "../core/clauses.js";
import { complement } from "../core/literals.js";
import { propagateClause, propagationStatus } from "../core/propagation.js";
import { lessonFigureHtml, lessonIcon } from "./lesson-figure.js";

// Uma cadeia de propagações (só com propagação chega a F) e dois casos pequenos: um que fica vazio
// e outro em que a propagação para sem unitárias (e o DLL tem de escolher um literal).
export const LAB_EXAMPLES = [
  { id: "chain", text: "p1, -p1 -p2, p3 p2, -p7 p2, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7" },
  { id: "sat", text: "p, -p q, -q -p r" },
  { id: "stuck", text: "p, -p q r, -q -r" },
];

// Exemplo do diagrama: propagar p em {p, p ∨ q, ¬p ∨ r, q ∨ s} dá {r, q ∨ s}.
const RULES_EXAMPLE = "p, p q, -p r, q s";

function clausesOf(text) {
  const result = parse(text);
  if (!result.ok) throw new Error(`Exemplo inválido: ${text}`);
  return result.clauses;
}

export function labExampleClauses(id) {
  const example = LAB_EXAMPLES.find((e) => e.id === id) ?? LAB_EXAMPLES[0];
  return clausesOf(example.text);
}

/** Cartões de S antes do passo, marcados pelo que lhes acontece (unitária, satisfeita, l̃ riscado). */
function beforeCardsHtml(step) {
  const model = clauseSetModel([step], 0);
  return `<ol class="clauses">${model.cards.map(cardHtml).join("")}</ol>`;
}

/** Cartões simples de um conjunto (F em vermelho; {} quando vazio). */
function plainCardsHtml(S) {
  if (S.length === 0) return `<p class="propagation-diagram__empty">{ }</p>`;
  const cards = S.map((clause) => cardHtml({ clause, state: isEmptyClause(clause) ? "empty" : "normal", struck: [] }));
  return `<ol class="clauses">${cards.join("")}</ol>`;
}

/** O que cada regra fez neste passo, com l e l̃ do passo. */
function rulesSummaryHtml(step) {
  const l = `<span class="lit">${literalHtml(step.literal)}</span>`;
  const opposite = `<span class="lit">${literalHtml(complement(step.literal))}</span>`;
  const merged = step.merged.length
    ? `<li>${escapeHtml(t("learn.propagation.merged", { n: step.merged.length }))}</li>`
    : "";
  return (
    `<ul class="propagation-diagram__rules list-none">` +
    `<li><strong>${escapeHtml(t("learn.propagation.rule1"))}</strong> ` +
    `${escapeHtml(t("learn.propagation.rule1Count", { n: step.removed.length }))} ${l}</li>` +
    `<li><strong>${escapeHtml(t("learn.propagation.rule2"))}</strong> ` +
    `${escapeHtml(t("learn.propagation.rule2Count", { n: step.shortened.length }))} ${opposite}</li>` +
    merged +
    `</ul>`
  );
}

/** Diagrama antes → depois de um passo de propagação. `afterHtml` substitui a coluna "Depois". */
export function stepDiagramHtml(step, { afterHtml } = {}) {
  const after = afterHtml ?? plainCardsHtml(step.after);
  return (
    `<div class="propagation-diagram rule-unit">` +
    `<div class="propagation-diagram__col">` +
    `<p class="propagation-diagram__label">${escapeHtml(t("learn.propagation.before"))} ` +
    `<span class="propagation-diagram__literal">${escapeHtml(t("learn.propagation.propagate"))} ` +
    `<span class="lit">${literalHtml(step.literal)}</span></span></p>` +
    beforeCardsHtml(step) +
    `</div>` +
    `<div class="propagation-diagram__arrow">${lessonIcon("arrow")}</div>` +
    `<div class="propagation-diagram__col">` +
    `<p class="propagation-diagram__label">${escapeHtml(t("learn.propagation.after"))}</p>` +
    after +
    `</div>` +
    `</div>` +
    rulesSummaryHtml(step)
  );
}

/** Figura estática das duas regras da propagação. */
export function renderRulesDiagram() {
  const step = propagateClause(clausesOf(RULES_EXAMPLE), 0);
  return (
    `<figure class="propagation-figure">` +
    `<figcaption class="propagation-figure__title">${escapeHtml(t("learn.propagation.diagramTitle"))}</figcaption>` +
    stepDiagramHtml(step) +
    `</figure>`
  );
}

/** S atual no interativo: as unitárias são botões enquanto ainda se pode propagar. */
function currentCardsHtml(S, clickable) {
  if (S.length === 0) return `<p class="propagation-diagram__empty">{ }</p>`;
  const cards = S.map((clause, index) => {
    if (clickable && isUnitClause(clause)) {
      // Sem aria-label: o nome é o texto visível («p₁ unitária») com a ação à frente, só para
      // leitores de ecrã, para quem usa o comando de voz poder dizer o que vê.
      return (
        `<li><button type="button" class="clause unit propagation-lab__unit" data-index="${index}">` +
        `<span class="sr-only">${escapeHtml(t("learn.propagation.lab.clickUnit"))} </span>` +
        `<span class="clause__text"><span class="lit">${literalHtml(clause[0])}</span></span>` +
        `<span class="clause__tag">${escapeHtml(t("clauseSet.state.unit"))}</span></button></li>`
      );
    }
    return cardHtml({ clause, state: isEmptyClause(clause) ? "empty" : "normal", struck: [] });
  });
  return `<ol class="clauses">${cards.join("")}</ol>`;
}

/**
 * HTML completo do interativo para o estado { exampleId, S, last, propagated }:
 *   S = conjunto atual; last = último passo (evento "unit") ou null; propagated = literais já propagados.
 */
export function renderPropagationLab({ exampleId, S, last = null, propagated = [] }) {
  const status = propagationStatus(S);
  const examples = LAB_EXAMPLES.map(
    (example) =>
      `<button type="button" data-example="${example.id}" aria-pressed="${example.id === exampleId}">${escapeHtml(t(`learn.propagation.lab.examples.${example.id}`))}</button>`,
  ).join("");
  const current = currentCardsHtml(S, status === "units");
  const body = last
    ? stepDiagramHtml(last, { afterHtml: current })
    : `<p class="propagation-diagram__label">${escapeHtml(t("learn.propagation.lab.start"))}</p>${current}`;
  const history = propagated.length
    ? `<p class="propagation-lab__history">${escapeHtml(t("learn.propagation.lab.history"))} ` +
      propagated.map((l) => `<span class="lit">${literalHtml(l)}</span>`).join(", ") + `</p>`
    : "";
  const disabled = propagated.length === 0 ? ' aria-disabled="true"' : "";
  const content =
    `<div class="seg sm lesson-choices" role="group" aria-label="${escapeHtml(t("learn.propagation.lab.examplesLabel"))}">${examples}</div>` +
    `<div class="propagation-lab__body">${body}</div>` +
    `<p class="propagation-lab__status propagation-lab__status--${status}" aria-live="polite">${escapeHtml(t(`learn.propagation.lab.status.${status}`))}</p>` +
    history +
    `<div class="propagation-lab__actions">` +
    `<button type="button" class="btn" data-variant="secondary" data-size="sm" data-action="undo"${disabled}>${escapeHtml(t("learn.propagation.lab.undo"))}</button>` +
    `<button type="button" class="btn" data-variant="secondary" data-size="sm" data-action="restart"${disabled}>${lessonIcon("cycle")}${escapeHtml(t("learn.propagation.lab.restart"))}</button>` +
    `</div>`;
  return lessonFigureHtml({ classes: "propagation-lab", icon: "arrow", title: t("learn.propagation.lab.title"), body: content });
}

/** Monta o interativo em `container`. Devolve { refresh } para redesenhar ao mudar de idioma. */
export function mountPropagationLab(container, { exampleId = LAB_EXAMPLES[0].id } = {}) {
  if (!container) return { refresh() {} };
  // history = passos feitos (eventos "unit"), para desfazer.
  let state = { exampleId, start: labExampleClauses(exampleId), history: [] };

  function view() {
    const last = state.history.at(-1) ?? null;
    return {
      exampleId: state.exampleId,
      S: last ? last.after : state.start,
      last,
      propagated: state.history.map((step) => step.literal),
    };
  }

  function draw({ focus } = {}) {
    container.innerHTML = renderPropagationLab(view());
    // Depois de redesenhar, o foco segue para a próxima unitária (ou para a ação pedida).
    if (focus) container.querySelector(focus)?.focus();
  }

  container.addEventListener("click", (event) => {
    const unit = event.target.closest("[data-index]");
    if (unit) {
      const step = propagateClause(view().S, Number(unit.dataset.index));
      if (!step) return;
      state.history.push(step);
      draw({ focus: ".propagation-lab__unit, [data-action='undo']" });
      return;
    }
    const example = event.target.closest("[data-example]");
    if (example) {
      state = { exampleId: example.dataset.example, start: labExampleClauses(example.dataset.example), history: [] };
      draw({ focus: `[data-example='${state.exampleId}']` });
      return;
    }
    const action = event.target.closest('[data-action]:not([aria-disabled="true"])')?.dataset.action;
    if (action === "undo") {
      state.history.pop();
      draw({ focus: state.history.length ? "[data-action='undo']" : ".propagation-lab__unit" });
    } else if (action === "restart") {
      state.history = [];
      draw({ focus: ".propagation-lab__unit" });
    }
  });

  draw();
  return { refresh: () => draw() };
}
