// Modo exercício «Satisfazível?»: o aluno responde se S é satisfazível; se disser que sim, dá V ou F
// a cada variável e a ferramenta verifica a valoração cláusula a cláusula (js/core/exercise-sat.js).
//
// À esquerda ficam S, a resposta e a valoração; ao lado, a mensagem e a verificação.
// satFeedback(), renderSatBoard() e satCheckHtml() são puras (testáveis em node); só mountExerciseSat()
// mexe no DOM.
import { variablesOf } from "../core/clauses.js";
import { formatLiteral } from "../core/literals.js";
import { satMove, startSatGame } from "../core/exercise-sat.js";
import { finishedRecord } from "../core/exercises.js";
import { encodeShare } from "../core/share.js";
import { t, pagePath } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { clauseHtml, setHtml, variableHtml } from "./formula-input.js";
import { feedbackHtml } from "./exercise-play-view.js";
import { showFeedback } from "./feedback-motion.js";
import { truthLabel, valuationEntries, valHtml } from "./result-card.js";

const icon = (path) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;

const clauseText = (clause) => (clause.length === 0 ? "F" : clause.map((l) => formatLiteral(l)).join(" ∨ "));
const clauseListText = (rows) => rows.map((row) => `{${clauseText(row.clause)}}`).join(", ");

/** O que dizer ao aluno depois de satMove(): { kind: "ok" | "error" | "warning", verdict, text } ou null. */
export function satFeedback(result) {
  const check = result.state.check;
  switch (result.outcome) {
    case "correctUnsat":
    case "satisfies":
      return { kind: "ok", verdict: t("exercises.sat.verdict.ok"), text: t(`exercises.sat.ok.${result.outcome}`) };
    case "wrongUnsat":
      return { kind: "error", verdict: t("exercises.sat.verdict.error"), text: t("exercises.sat.errors.wrongUnsat") };
    case "falsifies":
      return {
        kind: "error",
        verdict: t("exercises.sat.verdict.error"),
        text: t("exercises.sat.errors.falsifies", { clauses: clauseListText(check.rows.filter((row) => row.value === false)) }),
      };
    case "undecided":
      return {
        kind: "warning",
        verdict: t("exercises.sat.verdict.almost"),
        text: t("exercises.sat.errors.undecided", { clauses: clauseListText(check.rows.filter((row) => row.value === null)) }),
      };
    default:
      return null;
  }
}

/** Uma linha por variável de S com o segmented V/F (carregar outra vez no escolhido tira o valor). */
function valuationInputsHtml(S, draft) {
  const vars = variablesOf(S);
  if (vars.length === 0) return `<p class="play__none">${escapeHtml(t("exercises.sat.noVariables"))}</p>`;
  const rows = vars.map((v) => {
    const name = formatLiteral({ v, neg: false });
    const buttons = [true, false]
      .map((value) => {
        const label = t("exercises.sat.setValue", { v: name, value: truthLabel(value) });
        return (
          `<button type="button" data-var="${escapeHtml(v)}" data-value="${value}" ` +
          `aria-pressed="${draft[v] === value}" aria-label="${escapeHtml(label)}">${escapeHtml(truthLabel(value))}</button>`
        );
      })
      .join("");
    const empty = v in draft ? "" : `<span class="sat-var__empty">${escapeHtml(t("exercises.sat.noValue"))}</span>`;
    return (
      `<li class="sat-var"><code class="sat-var__name">${variableHtml(v)}</code>` +
      `<span class="seg" role="group" aria-label="${escapeHtml(t("exercises.sat.valueGroup", { v: name }))}">${buttons}</span>${empty}</li>`
    );
  });
  return `<ul class="sat-vars list-none">${rows.join("")}</ul>`;
}

// O ícone, a marca da linha e o que explica o valor. Classes escritas por inteiro.
const ROW_KINDS = {
  true: { classes: "sat-check__row", icon: icon('<path d="m5 12.5 4.5 4.5L19 7.5"/>') },
  null: { classes: "sat-check__row sat-check__row--open", icon: icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>') },
  false: { classes: "sat-check__row sat-check__row--bad", icon: icon('<path d="M6 6l12 12M18 6 6 18"/>') },
};

function rowReasonHtml(row) {
  if (row.value === null) {
    return escapeHtml(t("exercises.sat.row.undecided", { vars: row.missing.map((v) => formatLiteral({ v, neg: false })).join(", ") }));
  }
  if (row.value === false) return escapeHtml(t("exercises.sat.row.false"));
  // Satisfeita: basta um literal verdadeiro, e mostra-se o primeiro.
  const l = row.clause[row.trueLiterals[0]];
  return `<span class="sr-only">${escapeHtml(t("exercises.sat.row.satisfied"))}: </span>${variableHtml(l.v)} = ${escapeHtml(truthLabel(!l.neg))}`;
}

/**
 * A coluna da verificação: uma linha por cláusula (✓ satisfeita, ⓘ por decidir, ✕ falsa) se
 * `showCheck`, um aviso de onde ela vai aparecer enquanto não há nenhuma, e nada num fim sem valoração.
 */
export function satCheckHtml(state, { showCheck = false } = {}) {
  const title = `<h2 class="sat-check__title">${escapeHtml(t("exercises.sat.checkTitle"))}</h2>`;
  if (state.check && (showCheck || state.phase === "done")) {
    const rows = state.check.rows.map((row) => {
      const kind = ROW_KINDS[row.value];
      return (
        `<li class="${kind.classes}">${kind.icon}<code class="sat-check__clause">${clauseHtml(row.clause)}</code>` +
        `<span class="sat-check__why">${rowReasonHtml(row)}</span></li>`
      );
    });
    return `${title}<ul class="sat-check list-none">${rows.join("")}</ul>`;
  }
  if (state.phase === "done") return "";
  return `${title}<p class="play__note">${escapeHtml(t("exercises.sat.checkEmpty"))}</p>`;
}

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
    `<p class="play__done-stats">${escapeHtml(t("exercises.sat.doneStats", { moves: state.moves, errors: state.errors }))}</p>` +
    `<div class="play__done-actions">` +
    `<a class="btn" href="${escapeHtml(stepHref)}">${escapeHtml(t("exercises.seeSolution"))}</a>` +
    `<button type="button" class="btn" data-variant="secondary" data-sat="restart">${escapeHtml(t("exercises.play.restart"))}</button>` +
    `</div></div>`
  );
}

/** Sim | Não. Com a valoração à vista, a resposta dada é o Sim. As setas ficam de fora: cada resposta conta. */
function answerHtml(state) {
  const pressed = state.phase === "valuation" ? "sat" : null;
  const button = (answer, label) =>
    `<button type="button" data-sat="${answer}" aria-pressed="${pressed === answer}">${escapeHtml(t(label))}</button>`;
  return (
    `<div class="sat-answer">` +
    `<h3 id="sat-answer-label">${escapeHtml(t("exercises.sat.question"))}</h3>` +
    `<div class="seg" role="group" aria-labelledby="sat-answer-label" data-seg-keys="off">` +
    button("sat", "exercises.sat.yes") +
    button("unsat", "exercises.sat.no") +
    `</div></div>`
  );
}

/** HTML do tabuleiro: `draft` = valoração a ser editada { v: true/false }. */
export function renderSatBoard(state, exercise, { draft = {} } = {}) {
  const set = `<div class="card sat-set"><p class="play__label">${escapeHtml(t("exercises.sat.setLabel"))}</p><code>${setHtml(state.S)}</code></div>`;
  if (state.phase === "done") return set + finishedHtml(state, exercise);
  const valuation =
    state.phase === "valuation"
      ? `<div class="sat-valuation" role="group" aria-labelledby="sat-valuation-label">` +
        `<p class="sat-valuation__title" id="sat-valuation-label">${escapeHtml(t("exercises.sat.valuationLabel"))}</p>` +
        `<p class="play__how">${escapeHtml(t("exercises.sat.valuationHint"))}</p>` +
        valuationInputsHtml(state.S, draft) +
        `<div class="play__done-actions">` +
        `<button type="button" class="btn" data-sat="check">${escapeHtml(t("exercises.sat.check"))}</button>` +
        `<button type="button" class="btn" data-variant="ghost" data-sat="change">${escapeHtml(t("exercises.sat.change"))}</button>` +
        `</div></div>`
      : "";
  return set + answerHtml(state) + valuation;
}

/** HTML fixo do modo: o tabuleiro e, ao lado, a mensagem e a verificação. */
export function renderSatShell() {
  return (
    `<div class="play-layout">` +
    `<section class="play__main" aria-labelledby="sat-title">` +
    `<h2 class="sr-only play__title" id="sat-title">${escapeHtml(t("exercises.sat.title"))}</h2>` +
    `<p class="sr-only play__intro">${escapeHtml(t("exercises.sat.intro"))}</p>` +
    `<div class="play__board" data-sat-board></div></section>` +
    `<div class="panel sat-panel"><div role="status" data-sat-feedback></div><div class="sat-panel__check" data-sat-check></div></div></div>`
  );
}

/**
 * Monta o modo em `container` para o exercício. Ao terminar grava o progresso como feito
 * (`storage.setProgress`) e, a cada desenho, passa as contas a `onCounters`. Devolve { refresh }
 * para redesenhar ao mudar de idioma.
 */
export function mountExerciseSat(container, exercise, { storage = null, onFinish, onCounters } = {}) {
  if (!container) return { refresh() {} };
  let state = startSatGame(exercise.clauses);
  let draft = {};
  let lastResult = null; // para traduzir o feedback de novo
  let showCheck = false;

  container.innerHTML = renderSatShell();
  const board = container.querySelector("[data-sat-board]");
  const status = container.querySelector("[data-sat-feedback]");
  const check = container.querySelector("[data-sat-check]");

  function draw(focus) {
    status.innerHTML = feedbackHtml(lastResult ? satFeedback(lastResult) : null);
    board.innerHTML = renderSatBoard(state, exercise, { draft });
    check.innerHTML = satCheckHtml(state, { showCheck });
    onCounters?.({ moves: state.moves, errors: state.errors });
    if (focus) (board.querySelector(focus) ?? board.querySelector("[data-sat], [data-var]"))?.focus();
  }

  function play(move, focus) {
    const result = satMove(state, move);
    state = result.state;
    lastResult = result;
    showCheck = move.type === "check";
    if (state.finished) {
      storage?.setProgress(exercise.id, finishedRecord(storage.getProgress(exercise.id), {
        result: state.finished,
        moves: state.moves,
        errors: state.errors,
        mode: "sat",
      }));
      onFinish?.(state);
      focus = ".play__done-actions .btn";
    }
    draw(focus);
    showFeedback({ marks: [...check.querySelectorAll(".sat-check__row > .ic")], messages: [...status.children] });
  }

  board.addEventListener("click", (event) => {
    const varButton = event.target.closest("[data-var]");
    if (varButton) {
      const { var: v } = varButton.dataset;
      const value = varButton.dataset.value === "true";
      if (draft[v] === value) {
        draft = { ...draft };
        delete draft[v];
      } else {
        draft = { ...draft, [v]: value };
      }
      // A valoração mudou: a verificação anterior já não lhe corresponde.
      showCheck = false;
      lastResult = null;
      return draw(`[data-var="${CSS.escape(v)}"][data-value="${value}"]`);
    }
    const action = event.target.closest("[data-sat]")?.dataset.sat;
    if (action === "sat" || action === "unsat") {
      // Com a valoração à vista, o Sim já é a resposta; o Não é mudar de resposta.
      if (state.phase === "valuation" && action === "sat") return;
      if (state.phase === "valuation") play({ type: "change" });
      return play({ type: "answer", answer: action }, "[data-var]");
    }
    if (action === "check") return play({ type: "check", assignment: draft }, '[data-sat="check"]');
    if (action === "change") return play({ type: "change" }, '[data-sat="sat"]');
    if (action === "restart") {
      state = startSatGame(exercise.clauses);
      draft = {};
      lastResult = null;
      showCheck = false;
      draw('[data-sat="sat"]');
    }
  });

  draw();
  return {
    refresh() {
      container.querySelector(".play__title").textContent = t("exercises.sat.title");
      container.querySelector(".play__intro").textContent = t("exercises.sat.intro");
      draw();
    },
  };
}
