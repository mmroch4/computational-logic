// Player do Passo a passo: reproduz uma prova gerada, uma linha de cada vez, em Fitch ou na árvore de
// Gentzen da linha do passo, com a estratégia que a explica e a timeline por baixo. A árvore de uma fórmula
// leva ao passo que a escreveu. Quem monta dá a prova com `load` e guarda o estado que `onState` lhe diz.
//
// As funções exportadas à parte são puras (testáveis em node); só mountStepPlayer() mexe no DOM.
import { errorKey, panelFromResult } from "../core/assist.js";
import { clampStep, proofAt, proofTrace, stepOfLine } from "../core/proof-trace.js";
import { formatSequent } from "../core/sequent.js";
import { STEP_VIEWS } from "../core/step-link.js";
import { MAX_TREE_NODES, treeAt } from "../core/tree.js";
import { valuationHtml } from "./counterexample.js";
import { fitchHtml, readAsHtml, spokenProse } from "./fitch-view.js";
import { onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { closeMenu, MOBILE_QUERY, mountMenus, openMenu } from "./menu.js";
import { msgHtml } from "./message.js";
import { sequence } from "./motion.js";
import { isTypingTarget, mountTimeline } from "./timeline.js";
import { lineCaption, mountTreeView } from "./tree-view.js";

const KEYBOARD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>';

const proseHtml = (text) => readAsHtml(escapeHtml(text), spokenProse(text));

/** O que dizer em vez de reproduzir o resultado `result` de `solve`, ou null se houver prova. */
export function solveOutcome(result) {
  if (!result.ok) return { kind: "error", key: errorKey(result.error), params: result.error.params };
  if (!result.valid) return { kind: "warn", key: "player.invalid", params: {} };
  if (!result.provable) return { kind: "warn", key: "solver.noProof", params: {} };
  return null;
}

/** A mensagem de um `solveOutcome`; um sequente inválido traz o contraexemplo. Com prova, é vazia. */
export function outcomeHtml(result, goal) {
  const outcome = solveOutcome(result);
  if (!outcome) return "";
  const text = msgHtml(outcome.kind, escapeHtml(t(outcome.key, outcome.params)));
  if (!result.ok || result.valid) return text;
  const panel = panelFromResult({ status: "invalid", counterexample: result.counterexample }, goal);
  const lead = panel.valuation.length === 0 ? "" : `<p class="assist__note">${escapeHtml(t(panel.hasPremises ? "player.counterexample" : "player.counterexampleNoPremises"))}</p>`;
  return `<div class="step-outcome">${text}${lead}${valuationHtml(panel)}</div>`;
}

/** As linhas a destacar no passo `index`: a dele e as que ele cita. */
export function stepMarks(trace, index) {
  const { line, cited = [] } = trace[index];
  const marks = new Map(cited.map((number) => [number, "cited"]));
  if (line !== undefined) marks.set(line, "current");
  return marks;
}

/** A Fitch até ao passo `index`. Sem premissas, o passo 0 ainda não tem linhas. */
export function fitchAtStep(proof, trace, index) {
  const shown = proofAt(proof, trace, index);
  if (shown.lines.length === 0) return `<p class="fitch-empty">${escapeHtml(t("player.noLines"))}</p>`;
  return fitchHtml(shown, { marks: stepMarks(trace, index) });
}

/** O `shown` da vista da árvore no passo `index`: a árvore da linha desse passo. */
export function treeAtStep(proof, trace, index) {
  const { line } = trace[index];
  if (line === undefined) return { status: "note", key: "player.treeStart" };
  const result = treeAt(proof, line);
  return result.ok ? { status: "ready", tree: result.tree, size: result.size } : { status: "tooLarge", limit: MAX_TREE_NODES };
}

/** O título, a linha e a estratégia do passo, como texto. */
function stepTexts(proof, trace, index) {
  const { type, line, strategy, premises } = trace[index];
  const title = t(`timeline.event.${type}`);
  if (type === "start") return { title, detail: null, why: t(premises > 0 ? "player.start" : "player.startEmpty") };
  return { title, detail: lineCaption(proof, line), why: t(`solver.strategies.${strategy}`) };
}

/** O cartão do passo: o que aconteceu e porquê. */
export function stepCardHtml(proof, trace, index) {
  const { title, detail, why } = stepTexts(proof, trace, index);
  const line = detail === null ? "" : `<p class="step-card__line">${proseHtml(detail)}</p>`;
  const done = trace[index].type === "conclude" || trace.length === 1 ? msgHtml("ok", escapeHtml(t("player.done"))) : "";
  return `<h2 class="step-card__title">${escapeHtml(title)}</h2>${line}<p class="step-card__why">${proseHtml(why)}</p>${done}`;
}

/** O que um leitor de ecrã ouve ao mudar de passo. */
export function stepAnnouncement(proof, trace, index) {
  const { detail, why } = stepTexts(proof, trace, index);
  const counter = t("timeline.counter", { i: index, n: trace.length - 1 });
  return spokenProse([counter, detail, why].filter(Boolean).join(". "));
}

export function viewSwitchHtml(view) {
  const button = (id) => `<button type="button" data-view="${id}" aria-pressed="${id === view}">${escapeHtml(t(`player.views.${id}`))}</button>`;
  return `<div class="seg sm" role="group" aria-label="${escapeHtml(t("player.views.label"))}">${STEP_VIEWS.map(button).join("")}</div>`;
}

/** Popover com os atalhos, que só aparece com teclado físico. */
export function shortcutsHtml() {
  const row = (keys, label) => `<div class="step-keys__row"><dt>${keys.map((key) => `<kbd class="kbd-key">${escapeHtml(key)}</kbd>`).join(" ")}</dt>`
    + `<dd>${escapeHtml(t(label))}</dd></div>`;
  const label = escapeHtml(t("player.keys.label"));
  return `<details class="dd end step-menu--keys"><summary class="btn" data-variant="ghost" data-size="icon" aria-label="${label}" title="${label}">${KEYBOARD_ICON}</summary>`
    + `<div class="pop dd-panel w-[min(20rem,calc(100vw-2rem))] p-3"><p class="grp">${label}</p><dl class="step-keys">`
    + row(["←", "→"], "player.keys.step")
    + row([t("timeline.spaceKey")], "player.keys.play")
    + row(["Home", "End"], "player.keys.ends")
    + row(["?"], "player.keys.help")
    + "</dl></div></details>";
}

/** A nova linha entra a desvanecer; o DOM já está no estado final, por isso cancelar não perde nada. */
function enterStep(targets, speed) {
  return sequence([{ tweens: [{ targets, from: { opacity: 0 }, dur: "slow" }] }], { speed });
}

/**
 * Monta o player em `container`, vazio até `load`.
 * onState({ step, view }): chamado sempre que o passo ou a vista mudam, e logo depois de `load`.
 * Devolve { load(goal, proof, { step, view }), clear(), step, view }. `clear` para o player e larga a prova.
 */
export function mountStepPlayer(container, { onState = () => {} } = {}) {
  let current = null; // { goal, proof, trace }
  let view = "fitch";

  container.innerHTML = '<div class="step-player__bar"><p class="step-player__sequent"></p><div class="step-player__actions"></div></div>'
    + '<div class="step-card"></div>'
    + '<div class="step-player__fitch"></div><div class="step-player__tree" hidden></div>'
    + '<p class="sr-only" role="status"></p><div class="step-player__timeline"></div>';
  const $ = (selector) => container.querySelector(selector);
  const fitchEl = $(".step-player__fitch");
  const treeEl = $(".step-player__tree");
  const cardEl = $(".step-card");
  const statusEl = $('[role="status"]');
  const actionsEl = $(".step-player__actions");

  const tree = mountTreeView(treeEl, {
    source: {
      getProof: () => current.proof,
      getShown: () => treeAtStep(current.proof, current.trace, timeline.index),
    },
    onSelect() {},
    hint: "player.treeHint",
  });

  function paintFitch() {
    const left = fitchEl.querySelector(".fitch")?.scrollLeft ?? 0;
    fitchEl.innerHTML = fitchAtStep(current.proof, current.trace, timeline.index);
    const scroller = fitchEl.querySelector(".fitch");
    if (scroller) scroller.scrollLeft = left;
  }

  function paintStep() {
    cardEl.innerHTML = stepCardHtml(current.proof, current.trace, timeline.index);
    fitchEl.hidden = view !== "fitch";
    treeEl.hidden = view !== "tree";
    if (view === "fitch") paintFitch();
    else tree.update();
  }

  // A linha nova pode ficar por baixo da timeline, numa prova comprida.
  function revealLine() {
    const row = fitchEl.querySelector('[data-step-mark="current"]');
    if (view === "fitch") row?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }

  const report = () => onState({ step: timeline.index, view });

  const timeline = mountTimeline($(".step-player__timeline"), {
    onChange(index, { animate, speed }) {
      paintStep();
      revealLine();
      statusEl.textContent = stepAnnouncement(current.proof, current.trace, index);
      report();
      if (!animate) return null;
      const entering = view === "fitch" ? fitchEl.querySelector('[data-step-mark="current"]') : treeEl.querySelector(".gentzen__inner");
      return enterStep([cardEl, entering].filter(Boolean), speed);
    },
  });

  function drawActions() {
    actionsEl.innerHTML = viewSwitchHtml(view) + shortcutsHtml();
  }

  function drawAll() {
    if (!current) return;
    const text = formatSequent(current.goal);
    $(".step-player__sequent").innerHTML = readAsHtml(escapeHtml(text), spokenProse(text));
    drawActions();
    paintStep();
  }

  actionsEl.addEventListener("click", (event) => {
    const next = event.target.closest("[data-view]")?.dataset.view;
    if (!next || next === view) return;
    view = next;
    actionsEl.querySelectorAll("[data-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    });
    timeline.settle();
    paintStep();
    revealLine();
    report();
  });

  // Da árvore para o passo que escreveu a fórmula; as premissas estão em todos os passos, e ficam aqui.
  treeEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tree-line]");
    if (!button) return;
    const step = stepOfLine(current.trace, Number(button.dataset.treeLine));
    if (step === 0 || step === timeline.index) return;
    timeline.go(step);
    treeEl.querySelector('[data-tree-line][tabindex="0"]')?.focus();
  });

  document.addEventListener("keydown", (event) => {
    if (!current) return;
    const menu = $(".step-menu--keys");
    // Aberto com o ?, o foco fica fora do popover, onde o Esc do menu.js não o vê.
    if (event.key === "Escape" && menu.open) closeMenu(menu, { focus: true });
    if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target) || matchMedia(MOBILE_QUERY).matches) return;
    event.preventDefault();
    if (menu.open) closeMenu(menu, { focus: true });
    else openMenu(menu);
  });

  mountMenus(actionsEl);
  onLangChange(drawAll);

  return {
    load(goal, proof, { step = 0, view: startView = "fitch" } = {}) {
      const trace = proofTrace(proof);
      current = { goal, proof, trace };
      view = startView;
      timeline.setTrace(trace, clampStep(step, trace));
      drawAll();
      revealLine();
      report();
    },
    clear() {
      timeline.clear();
      current = null;
    },
    get step() {
      return timeline.index;
    },
    get view() {
      return view;
    },
  };
}
