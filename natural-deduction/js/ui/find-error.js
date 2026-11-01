// Modo «encontra o passo errado»: aponta-se a linha na prova e escolhe-se a explicação. A lógica e o
// catálogo estão em `core/find-error.js`; aqui só se desenha e se liga aos cliques.
//
// `findErrorHtml` é puro. `mountFindError(container, { puzzle, onSolved })` monta o desafio e chama
// `onSolved("solved")`, no formato de `recordMark`, quando se chega à explicação certa.
import {
  allowedRuleIds, chooseLine, chooseReason, puzzleGoal, puzzleMark, puzzleProof, puzzleSolution, reasonOptions, startPuzzle,
} from "../core/find-error.js";
import { ruleLabel } from "../core/rules.js";
import { formatSequent } from "../core/sequent.js";
import { fitchHtml, readAsHtml, spokenProse } from "./fitch-view.js";
import { LOCALES, getLang, onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";

const proseHtml = (text) => readAsHtml(escapeHtml(text), spokenProse(text));

/** Linhas já recusadas ficam certas; a errada só se assinala depois de encontrada. */
function pickStates(puzzle, state) {
  return puzzleProof(puzzle).lines.map((_, index) => {
    const number = index + 1;
    if (state.phase !== "line" && number === puzzle.line) return "error";
    return state.wrongLines.includes(number) ? "ok" : null;
  });
}

function proofHtml(puzzle, state) {
  return fitchHtml(puzzleProof(puzzle), {
    states: pickStates(puzzle, state),
    pick: {
      label: (line) => t("exercises.findError.pickLine", { line }),
      isDisabled: (line) => state.phase !== "line" || state.wrongLines.includes(line),
    },
  });
}

function reasonsHtml(puzzle, state) {
  const buttons = reasonOptions(puzzle).map((key) => {
    const refused = state.wrongReasons.includes(key);
    return `<li><button type="button" class="find-error__reason" data-reason="${key}"${refused ? " disabled" : ""}>`
      + `${proseHtml(t(`exercises.findError.reasons.${key}`))}</button></li>`;
  });
  return `<ul class="find-error__reasons" role="list" aria-label="${escapeHtml(t("exercises.findError.reasonsLabel"))}">`
    + `${buttons.join("")}</ul>`;
}

/** O texto da resposta recusada, ou "". */
function feedbackText({ feedback }) {
  if (feedback?.kind === "lineFine") return t("exercises.findError.lineFine", { line: feedback.line });
  return feedback?.kind === "reasonWrong" ? t("exercises.findError.reasonWrong") : "";
}

function doneHtml(puzzle) {
  const solution = puzzleSolution(puzzle);
  const headline = t("exercises.findError.solved", { line: puzzle.line });
  const explanation = t(`exercises.findError.explanations.${puzzle.explanation}`);
  const message = `<b>${escapeHtml(headline)}</b> ${proseHtml(explanation)}`;
  const closing = solution
    ? `<h3 class="find-error__heading">${escapeHtml(t("exercises.findError.correctedProof"))}</h3>${fitchHtml(solution)}`
    : `<p class="find-error__note">${escapeHtml(t("exercises.findError.invalidSequent"))}</p>`;
  return `<div class="find-error__done" tabindex="-1">${msgHtml("ok", message)}${closing}</div>`;
}

const PROMPTS = { line: "exercises.findError.promptLine", reason: "exercises.findError.promptReason" };

/** O desafio no estado `state`. */
export function findErrorHtml(puzzle, state) {
  const labels = LOCALES[getLang()].rules.labels;
  const rules = allowedRuleIds(puzzle).map((id) => ruleLabel(id, labels)).join(", ");
  const sequent = formatSequent(puzzleGoal(puzzle));
  const feedback = feedbackText(state);
  return `<p class="find-error__sequent">${proseHtml(sequent)}</p>`
    + `<p class="find-error__rules">${proseHtml(t("exercises.findError.allowedRules", { rules }))}</p>`
    + (state.phase === "done" ? "" : `<p class="find-error__prompt">${escapeHtml(t(PROMPTS[state.phase], { line: puzzle.line }))}</p>`)
    + proofHtml(puzzle, state)
    + (feedback ? msgHtml("warn", proseHtml(feedback)) : "")
    + (state.phase === "reason" ? reasonsHtml(puzzle, state) : "")
    + (state.phase === "done" ? doneHtml(puzzle) : "");
}

/** O que se anuncia: a mudança de fase também, porque o foco pode saltar por cima do enunciado. */
function announcement(puzzle, state) {
  if (state.phase === "done") return t("exercises.findError.solved", { line: puzzle.line });
  return feedbackText(state) || t(PROMPTS[state.phase], { line: puzzle.line });
}

const FOCUS_TARGETS = {
  line: ".fitch__pick:not(:disabled)",
  reason: ".find-error__reason:not(:disabled)",
  done: ".find-error__done",
};

export function mountFindError(container, { puzzle, onSolved = () => {} }) {
  container.innerHTML = '<div class="find-error"><div class="find-error__view"></div>'
    + '<p class="sr-only find-error__live" role="status"></p></div>';
  const view = container.querySelector(".find-error__view");
  const live = container.querySelector(".find-error__live");
  let state = startPuzzle();

  function paint() {
    const left = view.querySelector(".fitch")?.scrollLeft ?? 0;
    view.innerHTML = findErrorHtml(puzzle, state);
    const scroller = view.querySelector(".fitch");
    if (scroller) scroller.scrollLeft = left;
  }

  function advance(next) {
    if (next === state) return;
    state = next;
    paint();
    live.textContent = spokenProse(announcement(puzzle, state));
    view.querySelector(FOCUS_TARGETS[state.phase])?.focus();
    const mark = puzzleMark(state);
    if (mark) onSolved(mark);
  }

  view.addEventListener("click", ({ target }) => {
    const reason = target.closest("[data-reason]");
    if (reason) {
      advance(chooseReason(puzzle, state, reason.dataset.reason));
      return;
    }
    const line = target.closest(".fitch--pick .fitch__line");
    if (line) advance(chooseLine(puzzle, state, Number(line.dataset.line)));
  });

  paint();
  onLangChange(paint);
}
