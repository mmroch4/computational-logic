// Modo exercício «Próximo passo»: o aluno faz o DLL à mão sobre o conjunto atual S.
//   - clicar numa cláusula   → propagar essa cláusula (se não for unitária, o avaliador explica porquê);
//   - clicar num literal     → escolher l (S ∪ {l}), quando já não há unitárias;
//   - «Satisfazível» / «Insatisfazível» → a resposta (num ramo, «insatisfazível» = este ramo chegou a F
//     e o avaliador volta atrás sozinho para o ramo l̃).
// A árvore cresce com as jogadas do aluno: é o mesmo desenho do Passo a passo, feito a partir do trace
// do avaliador (js/core/exercise-play.js).
//
// playFeedback() e renderPlayBoard() são puras (testáveis em node); só mountExercisePlay() mexe no DOM.
import { isEmptyClause, variablesOf } from "../core/clauses.js";
import { complement, formatLiteral } from "../core/literals.js";
import { HINT_LEVELS, hintFor, playMove, startGame, takeHint } from "../core/exercise-play.js";
import { finishedRecord } from "../core/exercises.js";
import { encodeShare } from "../core/share.js";
import { t, pagePath } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { literalHtml, variableHtml } from "./formula-input.js";
import { eventIconHtml } from "./events.js";
import { truthLabel, valuationEntries, valHtml } from "./result-card.js";
import { mountTreeView } from "./tree-view.js";
import { showFeedback } from "./feedback-motion.js";

const icon = (path) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;

const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
const CROSS = '<path d="M6 6l12 12M18 6 6 18"/>';
const BULB = '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>';
const RESTART = '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>';

// Texto simples (para mensagens e aria-label): {¬p₂}, p₁ ∨ ¬q, F.
const literalText = (l) => formatLiteral(l);
const clauseText = (clause) => (clause.length === 0 ? "F" : clause.map(literalText).join(" ∨ "));
const unitsText = (units) => units.map(({ literal }) => `{${literalText(literal)}}`).join(", ");

/** Texto da mensagem de erro de moveError() (ver os códigos em exercise-play.js). */
function errorText(error, state) {
  const units = error.units ?? [];
  switch (error.code) {
    case "notUnit": {
      const clause = clauseText(state.S[error.clauseIndex]);
      const tail = units.length
        ? t("exercises.play.errors.unitsAre", { units: unitsText(units) })
        : t("exercises.play.errors.noUnits");
      return `${t("exercises.play.errors.notUnit", { c: clause })} ${tail}`;
    }
    case "stillUnits":
      return t("exercises.play.errors.stillUnits", { units: unitsText(units) });
    case "notInSet":
      return t("exercises.play.errors.notInSet", { l: error.literal ? literalText(error.literal) : "?" });
    case "notEmpty":
    case "noF": {
      const tail = units.length ? ` ${t("exercises.play.errors.unitsAre", { units: unitsText(units) })}` : "";
      return t(`exercises.play.errors.${error.code}`) + tail;
    }
    default:
      return t(`exercises.play.errors.${error.code}`);
  }
}

/**
 * O que dizer ao aluno depois de playMove(): { kind: "ok" | "warning" | "error", verdict, text }.
 * `before` é o estado antes da jogada (para as mensagens de erro que citam S).
 */
export function playFeedback(result, before) {
  if (!result.ok) {
    return { kind: "error", verdict: t("exercises.play.verdict.error"), text: errorText(result.error, before) };
  }
  const types = result.events.map((e) => e.type);
  const last = result.events.at(-1);
  let text;
  if (last.type === "result") {
    text = t(last.sat ? "exercises.play.ok.sat" : "exercises.play.ok.unsat");
  } else if (types.includes("backtrack")) {
    const back = result.events.find((e) => e.type === "backtrack");
    text = t("exercises.play.ok.backtrack", { node: back.to, l: literalText(back.literal) });
  } else if (last.type === "unit") {
    text = t("exercises.play.ok.unit", { l: literalText(last.literal), n: literalText(complement(last.literal)) });
  } else {
    text = t("exercises.play.ok.branch", { l: literalText(last.literal) });
  }
  if (result.warning) {
    text += ` ${t("exercises.play.warning.pathChanges", { tool: literalText(result.warning.tool) })}`;
    return { kind: "warning", verdict: t("exercises.play.verdict.ok"), text };
  }
  return { kind: "ok", verdict: t("exercises.play.verdict.ok"), text };
}

/** Texto do nível `level` (1 o que olhar, 2 que regra, 3 a jogada) da dica { situation, move }. */
export function hintText(hint, level, state) {
  const { situation, move } = hint;
  if (level === 1) return t(`exercises.play.hints.look.${situation}`);
  if (level === 2) return t(`exercises.play.hints.rule.${situation}`);
  if (move.type === "unit") return t("exercises.play.hints.move.units", { c: `{${clauseText(state.S[move.clauseIndex])}}` });
  if (move.type === "branch") return t("exercises.play.hints.move.branch", { l: literalText(move.literal) });
  return t(`exercises.play.hints.move.${situation}`);
}

/** Painel das dicas: as já pedidas nesta posição e o botão para a seguinte, com o custo à vista. */
function hintsHtml(state) {
  const hint = hintFor(state);
  if (!hint) return "";
  const { hintLevel: level } = state;
  const shown = Array.from({ length: level }, (_, i) =>
    `<li><span class="sr-only play__hint-level">${escapeHtml(t("exercises.play.hints.level", { level: i + 1 }))}</span> ` +
    `${escapeHtml(hintText(hint, i + 1, state))}</li>`,
  ).join("");
  const title = level ? t("exercises.play.hints.progress", { level, total: HINT_LEVELS }) : t("exercises.play.hints.title");
  const button = level < HINT_LEVELS
    ? `<span class="play__hint-cost">${escapeHtml(t("exercises.play.hints.cost"))}</span>` +
      `<button type="button" class="btn" data-variant="ghost" data-size="sm" data-play="hint">` +
      `${escapeHtml(t(level ? "exercises.play.hints.more" : "exercises.play.hints.ask", { level: level + 1, total: HINT_LEVELS }))}</button>`
    : "";
  return (
    `<div class="panel play__hints">` +
    `<div class="play__hints-head"><span class="play__hints-title">${icon(BULB)}${escapeHtml(title)}</span>${button}</div>` +
    (shown ? `<ol class="play__hint-list list-none" aria-live="polite">${shown}</ol>` : "") +
    `</div>`
  );
}

// Com a dica do nível 3 à vista, a jogada fica destacada (cláusula, literal ou resposta).
function hintedMove(state) {
  return state.hintLevel >= HINT_LEVELS ? hintFor(state)?.move ?? null : null;
}

function clauseInnerHtml(clause) {
  if (isEmptyClause(clause)) return `<span class="clause__false">F</span>`;
  return clause.map((l) => `<span class="lit">${literalHtml(l)}</span>`).join(" ∨ ");
}

/** As cláusulas de S: botões enquanto o exercício decorre (a cláusula vazia F nunca se clica). */
function clausesHtml(S, playing, hinted = null) {
  if (S.length === 0) return `<p class="play__empty">{ } <span>${escapeHtml(t("exercises.play.emptySet"))}</span></p>`;
  const items = S.map((clause, index) => {
    const empty = isEmptyClause(clause);
    const cls = `clause${empty ? " clause--empty" : ""}`;
    if (!playing || empty) return `<li class="${cls}"><span class="clause__text">${clauseInnerHtml(clause)}</span></li>`;
    const label = t("exercises.play.clauseButton", { c: clauseText(clause) });
    const hint = hinted?.type === "unit" && hinted.clauseIndex === index ? " play__target" : "";
    return (
      `<li><button type="button" class="${cls} play__clause${hint}" data-clause="${index}" aria-label="${escapeHtml(label)}">` +
      `<span class="clause__text">${clauseInnerHtml(clause)}</span></button></li>`
    );
  });
  return `<ol class="clauses">${items.join("")}</ol>`;
}

/** Um botão por literal de S (os dois sinais de cada variável, por ordem alfabética natural). */
function literalButtonsHtml(S, hinted = null) {
  const vars = variablesOf(S);
  if (vars.length === 0) return `<p class="play__none">${escapeHtml(t("exercises.play.noLiterals"))}</p>`;
  return vars
    .flatMap((v) => [false, true].map((neg) => {
      const l = { v, neg };
      const label = t("exercises.play.literalButton", { l: literalText(l) });
      const hint = hinted?.type === "branch" && hinted.literal.v === v && hinted.literal.neg === neg ? " play__target" : "";
      return (
        `<button type="button" class="btn play__literal${hint}" data-variant="outline" data-literal="${escapeHtml(v)}" data-neg="${neg}" ` +
        `aria-label="${escapeHtml(label)}"><span class="lit">${literalHtml(l)}</span></button>`
      );
    }))
    .join("");
}

// Os literais fixados no ramo, sem repetir: escolher l acrescenta {l}, que depois se propaga (l outra vez).
function pathHtml(path) {
  path = path.filter((l, i) => path.findIndex((m) => m.v === l.v && m.neg === l.neg) === i);
  if (path.length === 0) return "";
  const values = path.map((l) => `<code>${variableHtml(l.v)} = ${escapeHtml(truthLabel(!l.neg))}</code>`);
  return ` · ${escapeHtml(t("exercises.play.path"))} ${values.join(", ")}`;
}

const FEEDBACK_KINDS = { ok: "ok", warning: "warn", error: "error" };

/** A mensagem da última jogada; fica fora do tabuleiro, numa região que o leitor de ecrã anuncia. */
export function feedbackHtml(feedback) {
  if (!feedback) return "";
  return msgHtml(FEEDBACK_KINDS[feedback.kind], `<b>${escapeHtml(feedback.verdict)}.</b> ${escapeHtml(feedback.text)}`, { classes: "play__feedback" });
}

/** Fim do exercício: veredito com ícone + texto, a valoração (se satisfazível) e as ações. */
function finishedHtml(state, exercise) {
  const sat = state.finished === "sat";
  const valuation = sat
    ? `<ul class="val-list play__valuation">` +
      valuationEntries(exercise.clauses, state.assignment)
        .map(valHtml)
        .join("") +
      `</ul>`
    : "";
  const stepHref = `${pagePath("step")}?${encodeShare(exercise.clauses)}`;
  return (
    `<div class="card play__done play__done--${state.finished}">` +
    `<p class="play__done-title"><span aria-hidden="true">${sat ? "✓" : "✕"}</span> ` +
    `${escapeHtml(t(sat ? "exercises.play.done.sat" : "exercises.play.done.unsat"))}</p>` +
    valuation +
    `<p class="play__done-stats">${escapeHtml(t("exercises.play.done.stats", { moves: state.moves, errors: state.errors, hints: state.hints }))}</p>` +
    `<div class="play__done-actions">` +
    `<a class="btn" href="${escapeHtml(stepHref)}">${escapeHtml(t("exercises.seeSolution"))}</a>` +
    `<button type="button" class="btn" data-variant="secondary" data-play="restart">${escapeHtml(t("exercises.play.restart"))}</button>` +
    `</div></div>`
  );
}

/** HTML do tabuleiro para o estado do avaliador. */
export function renderPlayBoard(state, exercise) {
  const playing = !state.finished;
  const hinted = hintedMove(state);
  const answerButton = (type, path, label) =>
    `<button type="button" class="btn${hinted?.type === type ? " play__target" : ""}" data-variant="outline" data-play="${type}">` +
    `${icon(path)}${escapeHtml(t(label))}</button>`;
  const controls = playing
    ? `<div class="play__moves">` +
      `<div class="card play__card" role="group" aria-labelledby="play-branch-label">` +
      `<p class="play__card-label play__card-label--branch" id="play-branch-label">${eventIconHtml("branch")}${escapeHtml(t("exercises.play.branchLabel"))}</p>` +
      `<div class="play__choices">${literalButtonsHtml(state.S, hinted)}</div></div>` +
      `<div class="card play__card" role="group" aria-labelledby="play-answer-label">` +
      `<p class="play__card-label" id="play-answer-label">${escapeHtml(t("exercises.play.answerLabel"))}</p>` +
      `<div class="play__choices play__answers">` +
      answerButton("sat", CHECK, "exercises.play.sat") +
      answerButton("unsat", CROSS, "exercises.play.unsat") +
      `</div><p class="play__note">${escapeHtml(t("exercises.play.unsatHint"))}</p></div></div>` +
      hintsHtml(state) +
      `<div><button type="button" class="btn" data-variant="ghost" data-play="restart">${icon(RESTART)}${escapeHtml(t("exercises.play.restart"))}</button></div>`
    : finishedHtml(state, exercise);
  return (
    `<div class="play__set">` +
    `<p class="play__label">${escapeHtml(t("exercises.play.current", { node: state.node }))}${pathHtml(state.path)}</p>` +
    (playing ? `<p class="play__how">${escapeHtml(t("exercises.play.how"))}</p>` : "") +
    clausesHtml(state.S, playing, hinted) +
    `</div>` +
    controls
  );
}

/** HTML fixo do modo: a mensagem da jogada, o tabuleiro e, ao lado, a árvore. */
export function renderPlayShell() {
  return (
    `<div class="play-layout">` +
    `<section class="play__main" aria-labelledby="play-title">` +
    `<h2 class="sr-only play__title" id="play-title">${escapeHtml(t("exercises.play.title"))}</h2>` +
    `<p class="sr-only play__intro">${escapeHtml(t("exercises.play.intro"))}</p>` +
    `<div role="status" data-play-feedback></div>` +
    `<div class="play__board" data-play-board></div></section>` +
    `<div class="play__tree" data-play-tree></div></div>`
  );
}

/**
 * Monta o modo em `container` para o exercício. Ao terminar grava o progresso como feito
 * (`storage.setProgress`) e, a cada desenho, passa as contas a `onCounters`. Devolve { refresh }
 * para redesenhar ao mudar de idioma.
 */
export function mountExercisePlay(container, exercise, { storage = null, onFinish, onCounters } = {}) {
  if (!container) return { refresh() {} };
  let state = startGame(exercise.clauses);
  let feedback = null;
  let lastResult = null; // { result, before } da última jogada, para traduzir o feedback de novo

  container.innerHTML = renderPlayShell();
  const board = container.querySelector("[data-play-board]");
  const status = container.querySelector("[data-play-feedback]");
  const tree = mountTreeView(container.querySelector("[data-play-tree]"), { title: () => t("exercises.play.treeTitle") });

  function draw(focus) {
    status.innerHTML = feedbackHtml(feedback);
    board.innerHTML = renderPlayBoard(state, exercise);
    tree.show(state.trace, state.trace.length - 1);
    onCounters?.({ moves: state.moves, errors: state.errors, hints: state.hints });
    if (focus) (board.querySelector(focus) ?? board.querySelector(".play__clause, .play__literal, [data-play]"))?.focus();
  }

  function play(move, focus) {
    const before = state;
    const result = playMove(state, move);
    state = result.state;
    lastResult = { result, before };
    feedback = playFeedback(result, before);
    if (result.ok && state.finished) {
      storage?.setProgress(exercise.id, finishedRecord(storage.getProgress(exercise.id), {
        result: state.finished,
        moves: state.moves,
        errors: state.errors,
        hints: state.hints,
      }));
      onFinish?.(state);
      focus = ".play__done-actions .btn";
    }
    draw(focus);
    showFeedback({ messages: [...status.children] });
  }

  board.addEventListener("click", (event) => {
    const clause = event.target.closest("[data-clause]");
    if (clause) return play({ type: "unit", clauseIndex: Number(clause.dataset.clause) }, ".play__clause");
    const literal = event.target.closest("[data-literal]");
    if (literal) {
      const l = { v: literal.dataset.literal, neg: literal.dataset.neg === "true" };
      return play({ type: "branch", literal: l }, ".play__clause");
    }
    const action = event.target.closest("[data-play]")?.dataset.play;
    if (action === "sat" || action === "unsat") return play({ type: action }, `[data-play="${action}"]`);
    if (action === "hint") {
      state = takeHint(state);
      return draw(state.hintLevel < HINT_LEVELS ? '[data-play="hint"]' : ".play__target");
    }
    if (action === "restart") {
      state = startGame(exercise.clauses);
      feedback = lastResult = null;
      draw(".play__clause");
    }
  });

  draw();
  return {
    refresh() {
      container.querySelector(".play__title").textContent = t("exercises.play.title");
      container.querySelector(".play__intro").textContent = t("exercises.play.intro");
      if (lastResult) feedback = playFeedback(lastResult.result, lastResult.before);
      draw();
    },
  };
}
