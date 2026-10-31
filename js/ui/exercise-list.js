// Página Exercícios: o progresso, o «Continuar» (uma linha com o exercício em curso ou o próximo),
// filtros por estado e a lista dos 10 exercícios base agrupados por tema, com a
// dificuldade e o estado vindos do progress. "Gerar novo" cria um exercício com semente aleatória.
//
// Cada exercício abre em `?ex=<id>` (com `&mode=sat` no modo «Satisfazível?»); abrir marca-o como
// "em curso". Os modos: «Próximo passo» (exercise-play-view.js) e «Satisfazível?» (exercise-sat-view.js).
// As funções render* são puras (testáveis em node); só mountExercises() mexe no DOM e no storage.
import {
  exerciseCounts,
  exerciseGroups,
  exerciseStatus,
  exerciseSummary,
  generatedExerciseId,
  getExercise,
  hasExerciseProgress,
  isExerciseId,
  nextExercise,
  openedRecord,
} from "../core/exercises.js";
import { variablesOf } from "../core/clauses.js";
import { randomSeed } from "../core/generator.js";
import { encodeShare } from "../core/share.js";
import { t, getLang, pagePath } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { setPreviewHtml } from "./formula-input.js";
import { mountExercisePlay } from "./exercise-play-view.js";
import { mountExerciseSat } from "./exercise-sat-view.js";
import { fillBar } from "./feedback-motion.js";

const EXERCISE_FILTERS = ["all", "todo", "inProgress", "done"];

/** Modos de resolução de um exercício: "step" = Próximo passo, "sat" = Satisfazível?. */
const EXERCISE_MODES = ["step", "sat"];
const MOUNT_MODE = { step: mountExercisePlay, sat: mountExerciseSat };

/** O modo pedido no URL (`mode=sat`), ou "step". */
export function exerciseMode(search = "") {
  const mode = new URLSearchParams(search).get("mode");
  return EXERCISE_MODES.includes(mode) ? mode : "step";
}

function modeSwitchHtml(mode) {
  const buttons = EXERCISE_MODES.map(
    (id) =>
      `<button type="button" data-mode="${id}" aria-pressed="${id === mode}">` +
      `${escapeHtml(t(`exercises.modes.${id}`))}</button>`,
  ).join("");
  return `<div class="seg exercise-modes" role="group" aria-label="${escapeHtml(t("exercises.modes.label"))}">${buttons}</div>`;
}

const icon = (path) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;

const CHEVRON = '<path d="m9 6 6 6-6 6"/>';
const BACK = '<path d="m15 6-6 6 6 6"/>';
const ARROW = '<path d="M5 12h14M13 6l6 6-6 6"/>';
const DICE = '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>';
const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

const DIFFICULTY_BARS = { easy: 1, medium: 2, hard: 3 };
// Círculo vazio, meio cheio ou ✓, sempre com o texto para leitores de ecrã: o estado nunca é só cor.
const STATUS_ICONS = {
  todo: '<span class="exercise-status exercise-status--todo" aria-hidden="true"></span>',
  inProgress: '<span class="exercise-status exercise-status--inProgress" aria-hidden="true"></span>',
  done: `<span class="exercise-status exercise-status--done" aria-hidden="true">${icon(CHECK)}</span>`,
};

/** Link para abrir um exercício nesta página. */
export function exerciseHref(id) {
  return `?ex=${encodeURIComponent(id)}`;
}

/** Título visível: o do exemplo no idioma atual, ou "Gerado · semente N". */
export function exerciseTitle(exercise, lang = getLang()) {
  if (exercise.title) return exercise.title[lang] ?? exercise.title.pt;
  return t("exercises.generatedTitle", { seed: exercise.seed });
}

// Barras + palavra; o que a dificuldade quer dizer fica no title.
function difficultyChip(difficulty) {
  const bars = [1, 2, 3].map((n) => (n <= DIFFICULTY_BARS[difficulty] ? '<i class="on"></i>' : "<i></i>")).join("");
  return (
    `<span class="diff" title="${escapeHtml(t(`exercises.difficulty.${difficulty}`))}">` +
    `<span class="contents" aria-hidden="true">${bars}</span> ${escapeHtml(t(`exercises.difficultyShort.${difficulty}`))}</span>`
  );
}

/** «10 cláusulas · 7 variáveis». */
function sizeText(clauses) {
  return t("exercises.size", { clauses: clauses.length, vars: variablesOf(clauses).length });
}

/** Uma linha com o resumo guardado: "Insatisfazível · Jogadas: 7 · erros: 0 · dicas: 1". */
export function summaryText(summary) {
  const parts = [
    t(`exercises.summary.result.${summary.result}`),
    t("exercises.summary.stats", { moves: summary.moves, errors: summary.errors }),
  ];
  if (summary.hints !== null) parts.push(t("exercises.summary.hints", { hints: summary.hints }));
  return parts.join(" · ");
}

/** Título da página + o progresso: «3 de 10 feitos» e a barra (feitos a verde, em curso a tinta). */
export function renderExercisesHead(progress = {}) {
  const { done, inProgress, total } = exerciseCounts(progress);
  const count = t("exercises.count", { done, total });
  const label = escapeHtml(t("exercises.progressLabel"));
  const valueText = t("exercises.progressValue", { count, inProgress });
  return `
    <div class="exercises-title">
      <h1>${escapeHtml(t("pages.exercises"))}</h1>
      <p>${escapeHtml(t("placeholder.exercisesIntro"))}</p>
    </div>
    <div class="exercise-progress">
      <p class="exercise-progress__label" aria-hidden="true"><span>${label}</span><b>${escapeHtml(count)}</b></p>
      <div class="exercise-progress__bar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-valuetext="${escapeHtml(valueText)}">
        <i class="exercise-progress__done" style="width: ${(100 * done) / total}%"></i>
        <i class="exercise-progress__doing" style="width: ${(100 * inProgress) / total}%"></i>
      </div>
    </div>`;
}

/** «Continuar»: o exercício em curso ou o próximo por fazer; se fez todos, sugere gerar um novo. */
export function renderNextCard(progress = {}, lang = getLang()) {
  const next = nextExercise(progress);
  if (!next) {
    return `
      <section class="card exercise-next" aria-labelledby="exercise-next-title">
        <div class="exercise-next__text">
          <h2 class="exercise-next__title" id="exercise-next-title">${escapeHtml(t("exercises.allDone"))}</h2>
          <p class="exercise-next__label">${escapeHtml(t("exercises.allDoneHint"))}</p>
        </div>
        <button type="button" class="btn" data-generate>${escapeHtml(t("exercises.generate"))}</button>
      </section>`;
  }
  const action = exerciseStatus(progress[next.id]) === "inProgress" ? "continue" : "start";
  return `
    <a class="card exercise-next" href="${exerciseHref(next.id)}">
      <span class="exercise-next__play" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M8 5.5v13l11-6.5z"/></svg></span>
      <span class="exercise-next__text">
        <span class="exercise-next__label">${escapeHtml(t(`exercises.nextLabel.${action}`))}</span>
        <b class="exercise-next__title">${escapeHtml(exerciseTitle(next, lang))}</b>
      </span>
      <span class="exercise-next__meta">${escapeHtml(sizeText(next.clauses))}</span>
      ${icon(CHEVRON)}
    </a>`;
}

function itemHtml(exercise, lang) {
  const { status, summary } = exercise;
  return `
    <li>
      <a class="exercise-item" href="${exerciseHref(exercise.id)}">
        ${STATUS_ICONS[status]}<span class="sr-only">${escapeHtml(t(`exercises.status.${status}`))}:</span>
        <span class="exercise-item__body">
          <span class="exercise-item__title">${escapeHtml(exerciseTitle(exercise, lang))}</span>
          <span class="exercise-item__meta">${escapeHtml(sizeText(exercise.clauses))}<span class="exercise-item__formula"> · <code>${setPreviewHtml(exercise.clauses)}</code></span></span>
          ${summary ? `<span class="exercise-item__summary">${escapeHtml(summaryText(summary))}</span>` : ""}
        </span>
        <span class="exercise-item__side">${difficultyChip(exercise.difficulty)}${status === "inProgress" ? `<span class="st doing" aria-hidden="true"><i></i> ${escapeHtml(t("exercises.status.inProgress"))}</span>` : ""}</span>
        ${icon(CHEVRON)}
      </a>
    </li>`;
}

/**
 * "Repor progresso" no fim da lista, com confirmação no próprio sítio (sem janela do navegador).
 * `reset`: "idle" (botão), "confirm" (pergunta) ou "done" (mensagem depois de apagar).
 */
function resetHtml(progress, reset) {
  const status = `<p class="exercise-reset__status" role="status">${reset === "done" ? escapeHtml(t("exercises.reset.done")) : ""}</p>`;
  if (reset === "confirm") {
    return `
    <section class="exercise-reset exercise-reset--confirm">
      <p class="exercise-reset__question">${escapeHtml(t("exercises.reset.confirm"))}</p>
      <div class="exercise-reset__actions">
        <button type="button" class="btn" data-reset="yes">${escapeHtml(t("exercises.reset.yes"))}</button>
        <button type="button" class="btn" data-variant="secondary" data-reset="no">${escapeHtml(t("exercises.reset.no"))}</button>
      </div>
    </section>`;
  }
  if (!hasExerciseProgress(progress)) return reset === "done" ? `<section class="exercise-reset">${status}</section>` : "";
  return `
    <section class="exercise-reset">
      <button type="button" class="btn" data-variant="ghost" data-reset="ask">${escapeHtml(t("exercises.reset.button"))}</button>
      <p class="exercise-reset__hint">${escapeHtml(t("exercises.reset.hint"))}</p>
      ${status}
    </section>`;
}

/** Filtros por estado + "Gerar novo" + a lista agrupada por fonte (só os grupos com exercícios no filtro). */
export function renderExerciseList(progress = {}, { filter = "all", lang = getLang(), reset = "idle" } = {}) {
  const active = EXERCISE_FILTERS.includes(filter) ? filter : "all";
  const filterButtons = EXERCISE_FILTERS.map(
    (id) =>
      `<button type="button" data-filter="${id}" aria-pressed="${active === id}">` +
      `${escapeHtml(t(`exercises.filters.${id}`))}</button>`,
  ).join("");
  const groups = exerciseGroups(progress)
    .map((group) => ({ ...group, exercises: group.exercises.filter((e) => active === "all" || e.status === active) }))
    .filter((group) => group.exercises.length > 0);
  const groupsHtml = groups.length
    ? groups
        .map(
          (group) => `
      <section class="exercise-group" aria-labelledby="exercise-group-${group.source}">
        <h2 class="exercise-group__heading" id="exercise-group-${group.source}">${escapeHtml(t(`exercises.sources.${group.source}`))}<span class="exercise-group__count">${group.exercises.length}</span></h2>
        <ul class="exercise-group__list list-none">${group.exercises.map((e) => itemHtml(e, lang)).join("")}</ul>
      </section>`,
        )
        .join("")
    : `<p class="exercise-list__empty">${escapeHtml(t("exercises.emptyFilter"))}</p>`;
  return `
    <div class="exercise-list__toolbar">
      <div class="seg exercise-list__filters" role="group" aria-label="${escapeHtml(t("exercises.filterLabel"))}">${filterButtons}</div>
      <button type="button" class="btn" data-variant="secondary" data-generate>${icon(DICE)}${escapeHtml(t("exercises.generate"))}</button>
    </div>
    ${groupsHtml}
    ${resetHtml(progress, reset)}`;
}

/** Jogadas, erros e dicas em números; o modo «Satisfazível?» não tem dicas (hints = null). */
export function countersHtml({ moves, errors, hints = null }) {
  const counter = (key, n, cls = "") =>
    `<span><b${cls}>${n}</b> <span>${escapeHtml(t(`exercises.counters.${key}`, { n }))}</span></span>`;
  return (
    counter("moves", moves) +
    counter("errors", errors, errors > 0 ? ' class="is-bad"' : "") +
    (hints === null ? "" : counter("hints", hints))
  );
}

function solutionLinkHtml(exercise, classes) {
  const href = `${pagePath("step")}?${encodeShare(exercise.clauses)}`;
  return `<a class="btn ${classes}" data-variant="ghost" href="${escapeHtml(href)}">${escapeHtml(t("exercises.seeSolution"))}${icon(ARROW)}</a>`;
}

const backLinkHtml = () => `<a class="exercise-detail__back" href="${pagePath("exercises")}">${icon(BACK)}${escapeHtml(t("exercises.back"))}</a>`;

/**
 * Vista de um exercício aberto: o cabeçalho (voltar, grupo + dificuldade, título, modo e contadores),
 * o contentor [data-play-mount], onde o modo escolhido é montado logo a seguir, e o link para a solução,
 * que no mobile vem no fim. `counters` = { moves, errors, hints } da resolução em curso.
 */
export function renderExerciseDetail(exercise, progress = {}, lang = getLang(), mode = "step", counters = null) {
  const summary = exerciseSummary(progress[exercise.id]);
  const summaryHtml = summary
    ? `<div class="exercise-summary">
        <p class="exercise-summary__title">${escapeHtml(t("exercises.summary.title", { mode: t(`exercises.modes.${summary.mode}`) }))}</p>
        <p class="exercise-summary__stats">${escapeHtml(summaryText(summary))}</p>
        <p class="exercise-summary__hint">${escapeHtml(t("exercises.summary.redo"))}</p>
      </div>`
    : "";
  const shown = counters ?? { moves: 0, errors: 0, hints: mode === "step" ? 0 : null };
  return `
    <div class="exercise-detail">
      <div class="exercise-detail__head" data-detail-head>
        ${backLinkHtml()}
        <div class="exercise-detail__title">
          <div>
            <p class="exercise-detail__eyebrow"><span>${escapeHtml(t(`exercises.sources.${exercise.source}`))}</span>${difficultyChip(exercise.difficulty)}</p>
            <h1>${escapeHtml(exerciseTitle(exercise, lang))}</h1>
          </div>
          ${solutionLinkHtml(exercise, "exercise-detail__solution")}
        </div>
        <div class="exercise-detail__bar">
          ${modeSwitchHtml(mode)}
          <p class="exercise-counters" data-counters>${countersHtml(shown)}</p>
        </div>
        ${summaryHtml}
      </div>
      <div class="exercise-play" data-play-mount></div>
      <div class="exercise-detail__foot" data-detail-foot>${solutionLinkHtml(exercise, "self-start")}</div>
    </div>`;
}

function renderNotFound() {
  return `
    <div class="exercise-detail">
      <div class="exercise-detail__head">
        ${backLinkHtml()}
        ${msgHtml("warn", escapeHtml(t("exercises.notFound")), { attrs: ' role="alert"' })}
      </div>
    </div>`;
}

/**
 * Monta a página em `container`. `search` = location.search; `navigate(href)` muda de página
 * (por omissão location.assign). Devolve { refresh } para redesenhar ao mudar de idioma.
 */
export function mountExercises(container, { storage = null, search = "", navigate = (href) => location.assign(href) } = {}) {
  if (!container) return { refresh() {} };
  const id = new URLSearchParams(search).get("ex");
  const exercise = id ? getExercise(id) : null;
  let mode = exerciseMode(search);
  let filter = "all";
  let reset = "idle";

  // Abrir um exercício marca-o como "em curso" (um feito continua feito).
  if (exercise && storage) storage.setProgress(exercise.id, openedRecord(storage.getProgress(exercise.id)));

  // Vista de um exercício: o cabeçalho redesenha-se (idioma, estado), o jogo monta-se uma só vez
  // (e de novo só ao trocar de modo) para não se perder ao mudar de idioma.
  let play = null;
  let counters = null;
  function showCounters(next) {
    counters = next;
    const element = container.querySelector("[data-counters]");
    if (element) element.innerHTML = countersHtml(next);
  }
  function mountMode() {
    play = MOUNT_MODE[mode](container.querySelector("[data-play-mount]"), exercise, {
      storage,
      onFinish: () => drawDetail(),
      onCounters: showCounters,
    });
  }
  function drawDetail() {
    const progress = storage?.getAllProgress() ?? {};
    if (!play) {
      container.innerHTML = renderExerciseDetail(exercise, progress, getLang(), mode);
      mountMode();
      return;
    }
    // Troca só o que está à volta do jogo.
    const fresh = document.createElement("div");
    fresh.innerHTML = renderExerciseDetail(exercise, progress, getLang(), mode, counters);
    for (const part of ["[data-detail-head]", "[data-detail-foot]"]) {
      container.querySelector(part).replaceWith(fresh.querySelector(part));
    }
  }

  function draw() {
    if (id) {
      if (!exercise) {
        container.innerHTML = renderNotFound();
        return;
      }
      drawDetail();
      play?.refresh();
      return;
    }
    const progress = storage?.getAllProgress() ?? {};
    container.innerHTML = `
      <div class="exercises-page">
        <div class="exercises-top">${renderExercisesHead(progress)}${renderNextCard(progress)}</div>
        ${renderExerciseList(progress, { filter, reset })}
      </div>`;
    fillBars();
  }

  // As barras do progresso enchem-se ao abrir a lista e sempre que o progresso muda.
  const barWidths = new Map(); // seletor → largura mostrada
  function fillBars() {
    for (const selector of [".exercise-progress__done", ".exercise-progress__doing"]) {
      const bar = container.querySelector(selector);
      if (!bar) continue;
      const from = barWidths.get(selector) ?? "0%";
      barWidths.set(selector, bar.style.width);
      if (from !== bar.style.width) fillBar(bar, from);
    }
  }

  container.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-mode]");
    if (modeButton && modeButton.dataset.mode !== mode) {
      mode = modeButton.dataset.mode;
      // O modo fica no URL (link partilhável), sem recarregar a página.
      const params = new URLSearchParams(search);
      if (mode === "step") params.delete("mode");
      else params.set("mode", mode);
      globalThis.history?.replaceState(null, "", `?${params}`);
      drawDetail();
      mountMode();
      container.querySelector(`[data-mode="${mode}"]`)?.focus();
      return;
    }
    const resetButton = event.target.closest("[data-reset]");
    if (resetButton) {
      const action = resetButton.dataset.reset;
      // Só as entradas dos exercícios; o quiz do Aprender partilha o mesmo registo e fica.
      if (action === "yes") storage?.resetProgress(isExerciseId);
      reset = action === "ask" ? "confirm" : action === "yes" ? "done" : "idle";
      draw();
      const focusTarget = reset === "confirm" ? '[data-reset="no"]' : action === "no" ? '[data-reset="ask"]' : "a.exercise-next";
      container.querySelector(focusTarget)?.focus();
      return;
    }
    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      filter = filterButton.dataset.filter;
      draw();
      container.querySelector(`[data-filter="${filter}"]`)?.focus();
      return;
    }
    if (event.target.closest("[data-generate]")) navigate(exerciseHref(generatedExerciseId(randomSeed())));
  });

  draw();
  return { refresh: draw };
}
