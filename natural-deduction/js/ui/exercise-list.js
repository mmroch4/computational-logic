// Página Exercícios, lista: o progresso, o exercício a seguir, os dois modos, os filtros, os níveis e o
// repor com confirmação no próprio sítio. Cada exercício abre em `?ex=<id>`; o modo fica em `?mode=`.
//
// As funções *Html são puras; só mountExerciseList() mexe no DOM e no storage.
import { EXERCISE_FILTERS, EXERCISE_MODES, hasProgress, levelGroups, listMode, nextExercise, overallSummary, ruleSummary } from "../core/exercise-page.js";
import { isExerciseId } from "../core/exercises.js";
import { ruleLabel } from "../core/rules.js";
import { readAsHtml, spokenProse } from "./fitch-view.js";
import { LOCALES, getLang, onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";

const icon = (path) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
const CHEVRON = '<path d="m9 6 6 6-6 6"/>';
const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

// O estado nunca é só cor: há sempre o ícone e o texto.
const STATUS_ICONS = {
  todo: '<span class="exercise-status exercise-status--todo" aria-hidden="true"></span>',
  solved: `<span class="exercise-status exercise-status--solved" aria-hidden="true">${icon(CHECK)}</span>`,
  solvedWithUserRules: `<span class="exercise-status exercise-status--own" aria-hidden="true">${icon(CHECK)}</span>`,
};

export const exerciseHref = (id) => `?ex=${encodeURIComponent(id)}`;

/** Um sequente com a leitura em palavras. */
export const sequentHtml = (text) => readAsHtml(escapeHtml(text), spokenProse(text));

/** Os ids de regras com as siglas do idioma. */
export function ruleNames(ids) {
  const labels = LOCALES[getLang()].rules.labels;
  return ids.map((id) => ruleLabel(id, labels)).join(", ");
}

function segHtml(attribute, options, active, label, text) {
  const buttons = options.map((name) => (
    `<button type="button" data-${attribute}="${name}" aria-pressed="${name === active}">${escapeHtml(text(name))}</button>`
  )).join("");
  return `<div class="seg" role="group" aria-label="${escapeHtml(label)}">${buttons}</div>`;
}

export function progressHtml(progress) {
  const { total, solved, solvedWithUserRules } = overallSummary(progress);
  const count = t("exercises.count", { solved: solved + solvedWithUserRules, total });
  const own = solvedWithUserRules > 0 ? t("exercises.ownRulesCount", { count: solvedWithUserRules }) : "";
  const label = escapeHtml(t("exercises.progressLabel"));
  const value = [count, own].filter(Boolean).join(", ");
  return '<div class="exercise-progress">'
    + `<p class="exercise-progress__label" aria-hidden="true"><span>${label}</span><b>${escapeHtml(count)}</b></p>`
    + `<div class="exercise-progress__bar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${total}" `
    + `aria-valuenow="${solved + solvedWithUserRules}" aria-valuetext="${escapeHtml(value)}">`
    + `<i class="exercise-progress__solved" style="width: ${(100 * solved) / total}%"></i>`
    + `<i class="exercise-progress__own" style="width: ${(100 * solvedWithUserRules) / total}%"></i></div>`
    + (own ? `<p class="exercise-progress__own-note">${escapeHtml(own)}</p>` : "")
    + "</div>";
}

/** «Começar» ou «Continuar» no primeiro por fazer do modo; se não houver, diz que acabou. */
export function nextHtml(mode, progress) {
  const next = nextExercise(mode, progress);
  if (!next) return `<p class="exercise-next exercise-next--done">${escapeHtml(t("exercises.allDone"))}</p>`;
  const started = levelGroups(mode, progress, "done").length > 0;
  return `<a class="exercise-next" href="${exerciseHref(next.id)}">`
    + '<span class="exercise-next__text">'
    + `<span class="exercise-next__label">${escapeHtml(t(`exercises.nextLabel.${started ? "continue" : "start"}`))}</span>`
    + `<span class="exercise-next__title">${sequentHtml(next.sequent)}</span></span>${icon(CHEVRON)}</a>`;
}

export function ruleSummaryText(exercise) {
  const { kind, rules } = ruleSummary(exercise);
  return t(`exercises.ruleSets.${kind}`, { rules: ruleNames(rules) });
}

function itemHtml({ exercise, status }) {
  const label = escapeHtml(t(`exercises.status.${status}`));
  const tag = status === "solvedWithUserRules" ? `<span class="exercise-item__tag" aria-hidden="true">${label}</span>` : "";
  return `<li><a class="exercise-item" href="${exerciseHref(exercise.id)}">${STATUS_ICONS[status]}`
    + `<span class="sr-only">${label}:</span><span class="exercise-item__body">`
    + `<span class="exercise-item__title">${sequentHtml(exercise.sequent)}</span>`
    + `<span class="exercise-item__meta">${sequentHtml(ruleSummaryText(exercise))}</span>${tag}</span>`
    + `${icon(CHEVRON)}</a></li>`;
}

function groupHtml(mode, { level, items }) {
  const id = `exercise-level-${level}`;
  const number = t("exercises.level", { level });
  const title = mode === "proof" ? `${number} · ${t(`exercises.levels.${level}`)}` : number;
  return `<section class="exercise-group" aria-labelledby="${id}">`
    + `<h2 class="exercise-group__heading" id="${id}">${escapeHtml(title)}<span class="exercise-group__count">${items.length}</span></h2>`
    + `<ul class="exercise-group__list" role="list">${items.map(itemHtml).join("")}</ul></section>`;
}

/** O repor. `reset`: "idle", "confirm" ou "done", com a mensagem depois de apagar. */
function resetHtml(progress, reset) {
  if (reset === "confirm") {
    return '<section class="exercise-reset exercise-reset--confirm">'
      + `<p class="exercise-reset__question">${escapeHtml(t("exercises.reset.confirm"))}</p>`
      + `<p class="exercise-reset__hint">${escapeHtml(t("exercises.reset.hint"))}</p>`
      + '<div class="exercise-reset__actions">'
      + `<button type="button" class="btn" data-reset="yes">${escapeHtml(t("exercises.reset.yes"))}</button>`
      + `<button type="button" class="btn" data-variant="outline" data-reset="no">${escapeHtml(t("exercises.reset.no"))}</button>`
      + "</div></section>";
  }
  const status = `<p class="exercise-reset__status" role="status">${reset === "done" ? escapeHtml(t("exercises.reset.done")) : ""}</p>`;
  if (!hasProgress(progress)) return reset === "done" ? `<section class="exercise-reset">${status}</section>` : "";
  return '<section class="exercise-reset">'
    + `<button type="button" class="btn" data-variant="outline" data-reset="ask">${escapeHtml(t("exercises.reset.button"))}</button>${status}</section>`;
}

/** A página toda, para o estado { mode, filter, reset }. */
export function exerciseListHtml(progress, { mode = "proof", filter = "all", reset = "idle" } = {}) {
  const groups = levelGroups(mode, progress, filter);
  const list = groups.length > 0
    ? groups.map((group) => groupHtml(mode, group)).join("")
    : `<p class="exercise-list__empty">${escapeHtml(t("exercises.emptyFilter"))}</p>`;
  return '<div class="exercises-top"><div class="exercises-title">'
    + `<h1 class="page-empty__title">${escapeHtml(t("exercises.title"))}</h1>`
    + `<p class="page-empty__lead">${escapeHtml(t("exercises.lead"))}</p></div>`
    + `${progressHtml(progress)}</div>`
    + '<div class="exercise-list__toolbar">'
    + segHtml("list-mode", EXERCISE_MODES, mode, t("exercises.modes.label"), (name) => t(`exercises.modes.${name}`))
    + segHtml("filter", EXERCISE_FILTERS, filter, t("exercises.filterLabel"), (name) => t(`exercises.filters.${name}`))
    + `</div>${nextHtml(mode, progress)}${list}${resetHtml(progress, reset)}`;
}

/** Monta a lista em `container`. `search` é o `location.search`. */
export function mountExerciseList(container, { storage, search = "" }) {
  let mode = listMode(search);
  let filter = "all";
  let reset = "idle";

  function draw() {
    container.innerHTML = exerciseListHtml(storage.getAllProgress(), { mode, filter, reset });
  }

  /** Redesenha e devolve o foco a um controlo: sem isto, ele cairia no início da página. */
  function drawAndFocus(selector) {
    draw();
    container.querySelector(selector)?.focus();
  }

  function onReset(action) {
    if (action === "yes") storage.resetProgress(isExerciseId);
    if (action === "ask") reset = "confirm";
    else reset = action === "yes" ? "done" : "idle";
    const targets = { ask: '[data-reset="no"]', no: '[data-reset="ask"]', yes: "a.exercise-next" };
    drawAndFocus(targets[action]);
  }

  container.addEventListener("click", ({ target }) => {
    const modeButton = target.closest("[data-list-mode]");
    const filterButton = target.closest("[data-filter]");
    const resetButton = target.closest("[data-reset]");
    if (modeButton) {
      mode = modeButton.dataset.listMode;
      // O modo fica no URL: voltar de um exercício regressa à mesma lista.
      history.replaceState(null, "", mode === "proof" ? location.pathname : `?mode=${mode}`);
      drawAndFocus(`[data-list-mode="${mode}"]`);
    } else if (filterButton) {
      filter = filterButton.dataset.filter;
      drawAndFocus(`[data-filter="${filter}"]`);
    } else if (resetButton) {
      onReset(resetButton.dataset.reset);
    }
  });

  draw();
  onLangChange(draw);
}
