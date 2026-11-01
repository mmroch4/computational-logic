// Interativo da §7 (Aprender): quiz de 8 perguntas, uma de cada vez.
// Depois de responder, as opções bloqueiam, a certa e a escolhida ficam marcadas (com ícone e
// texto, nunca só cor) e aparece a explicação com a regra do DLL. No fim há um resumo
// com as corretas, a precisão, a revisão "a tua resposta" vs "resposta certa" e o melhor resultado,
// guardado em progress (storage.js) com a chave QUIZ_PROGRESS_ID.
//
// As perguntas e as respostas certas vêm de js/core/quiz.js. renderQuiz é pura (testada em node);
// mountQuiz mexe no DOM e no armazenamento.
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { literalHtml, setHtml } from "./formula-input.js";
import { msgHtml } from "./message.js";
import { statusRegion } from "./dll-player.js";
import { fillBar, showFeedback } from "./feedback-motion.js";
import { quizQuestions, isCorrect, quizScore } from "../core/quiz.js";

/** Id do quiz no progress (dpsat:v1:progress), ao lado dos ids dos exercícios. */
export const QUIZ_PROGRESS_ID = "learn-quiz";

const OPTION_KEYS = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/** Estado inicial: primeira pergunta, sem respostas. */
export function initialQuizState() {
  return { index: 0, answers: {}, finished: false };
}

/** Rótulo (HTML) de uma opção, conforme o tipo. */
export function optionLabelHtml(option) {
  if (option.kind === "set") return `<span class="quiz__math">${setHtml(option.clauses)}</span>`;
  if (option.kind === "action") {
    const { type, literal } = option.action;
    if (type === "sat" || type === "unsat") return escapeHtml(t(`learn.quiz.actions.${type}`));
    // O literal entra já em HTML (subscritos); o resto do texto é escapado à volta.
    const marker = "\u0000";
    const parts = t(`learn.quiz.actions.${type}`, { lit: marker }).split(marker).map(escapeHtml);
    return parts.join(`<span class="quiz__math">${literalHtml(literal)}</span>`);
  }
  return escapeHtml(t(`learn.quiz.options.${option.id}`));
}

const optionOf = (question, id) => question.options.find((option) => option.id === id);

const MARK_ICONS = {
  right: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  wrong: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const NEXT_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

// As opções são botões com role="radio", e não <input type="radio">: escolher é responder, por isso
// as setas só mexem o foco (nos nativos, a primeira seta já daria uma resposta).
function optionHtml(question, option, answer, index) {
  const answered = answer !== undefined;
  const chosen = option.id === answer;
  let modifier = "";
  let mark = '<i class="quiz__radio" aria-hidden="true"></i>';
  let tag = "";
  if (answered && option.id === question.answer) {
    modifier = " quiz__option--right";
    mark = MARK_ICONS.right;
    tag = `<span class="quiz__tag">${escapeHtml(t("learn.quiz.rightTag"))}</span>`;
  } else if (answered && chosen) {
    modifier = " quiz__option--wrong";
    mark = MARK_ICONS.wrong;
    tag = `<span class="quiz__tag">${escapeHtml(t("learn.quiz.yourTag"))}</span>`;
  }
  return (
    `<button type="button" class="quiz__option${modifier}" data-option="${escapeHtml(option.id)}" role="radio" ` +
    `aria-checked="${chosen}" tabindex="${index === 0 ? 0 : -1}"${answered ? " disabled" : ""}>` +
    `${mark}<span class="quiz__label">${optionLabelHtml(option)}</span>${tag}</button>`
  );
}

/** A frase depois de responder: o veredito e o porquê, sem HTML. */
function feedbackText(question, answer) {
  const verdict = t(isCorrect(question, answer) ? "learn.quiz.right" : "learn.quiz.wrong");
  return { verdict, why: t(`learn.quiz.questions.${question.id}.why`) };
}

function questionHtml(questions, state) {
  const question = questions[state.index];
  const answer = state.answers[question.id];
  const answered = answer !== undefined;
  const { correct, total } = quizScore(questions, state.answers);
  const kind = `<p class="quiz__kind">${escapeHtml(t(`learn.quiz.kinds.${question.kind}`))}</p>`;
  const set = question.set ? `<p class="quiz__set">S = <span class="quiz__math">${setHtml(question.set)}</span></p>` : "";
  const options = question.options.map((option, index) => optionHtml(question, option, answer, index)).join("");
  let feedback = "";
  if (answered) {
    const { verdict, why } = feedbackText(question, answer);
    const last = state.index === questions.length - 1;
    const kindClass = isCorrect(question, answer) ? "right" : "wrong";
    feedback =
      msgHtml("info", `<b>${escapeHtml(verdict)}</b> ${escapeHtml(why)}`, { classes: `quiz__feedback quiz__feedback--${kindClass}` }) +
      `<div class="quiz__actions"><button type="button" class="btn" data-next>` +
      `${escapeHtml(t(last ? "learn.quiz.finish" : "learn.quiz.next"))}${NEXT_ICON}</button></div>`;
  }
  return (
    `<div class="quiz__head"><p class="quiz__count">${escapeHtml(t("learn.quiz.count", { n: state.index + 1, total: questions.length }))}</p>` +
    `<div class="quiz__track" aria-hidden="true"><i style="width:${((state.index + 1) / questions.length) * 100}%"></i></div>` +
    `<p class="quiz__score">${escapeHtml(t("learn.quiz.score", { n: correct, total }))}</p></div>` +
    `<div class="quiz__card">${kind}` +
    `<h3 class="quiz__prompt" tabindex="-1">${escapeHtml(t(`learn.quiz.questions.${question.id}.prompt`))}</h3>` +
    set +
    `<div class="quiz__options" role="radiogroup" aria-label="${escapeHtml(t("learn.quiz.optionsLabel"))}">${options}</div>` +
    feedback +
    `</div>`
  );
}

function summaryHtml(questions, state, best) {
  const { correct, total } = quizScore(questions, state.answers);
  const percent = Math.round((100 * correct) / total);
  const review = questions.map((question) => {
    const answer = state.answers[question.id];
    const right = isCorrect(question, answer);
    const yours = answer === undefined ? "—" : optionLabelHtml(optionOf(question, answer));
    const fix = right
      ? ""
      : `<p class="quiz__review-line quiz__review-line--right">${escapeHtml(t("learn.quiz.correctAnswer"))} ${optionLabelHtml(optionOf(question, question.answer))}</p>`;
    return (
      `<li class="quiz__review-item quiz__review-item--${right ? "right" : "wrong"}">` +
      `<p class="quiz__review-prompt"><span aria-hidden="true">${right ? "✓" : "✗"}</span> ` +
      `<span class="sr-only">${escapeHtml(t(right ? "learn.quiz.right" : "learn.quiz.wrong"))}</span>` +
      `${escapeHtml(t(`learn.quiz.questions.${question.id}.prompt`))}</p>` +
      (question.set ? `<p class="quiz__review-line">S = <span class="quiz__math">${setHtml(question.set)}</span></p>` : "") +
      `<p class="quiz__review-line">${escapeHtml(t("learn.quiz.yourAnswer"))} ${yours}</p>${fix}</li>`
    );
  });
  const bestLine =
    best && typeof best.best === "number"
      ? `<p class="quiz__best">${escapeHtml(t("learn.quiz.best", { n: best.best, total: best.total ?? total }))}</p>`
      : "";
  return (
    `<div class="quiz__card quiz__summary">` +
    `<h3 class="quiz__prompt" tabindex="-1">${escapeHtml(t("learn.quiz.summaryTitle", { n: correct, total }))}</h3>` +
    `<div class="quiz__metrics">` +
    `<p class="quiz__metric"><span class="quiz__metric-value">${correct}/${total}</span><span class="quiz__metric-label">${escapeHtml(t("learn.quiz.metricCorrect"))}</span></p>` +
    `<p class="quiz__metric"><span class="quiz__metric-value">${percent}%</span><span class="quiz__metric-label">${escapeHtml(t("learn.quiz.metricAccuracy"))}</span></p>` +
    `</div>` +
    bestLine +
    `<p class="quiz__summary-note">${escapeHtml(t(correct === total ? "learn.quiz.allRight" : "learn.quiz.reviewIntro"))}</p>` +
    `<ol class="quiz__review list-none">${review.join("")}</ol>` +
    `<button type="button" class="btn" data-variant="secondary" data-restart>${escapeHtml(t("learn.quiz.restart"))}</button>` +
    `</div>`
  );
}

/** HTML completo do quiz. `best` é o registo guardado em progress (ou null). */
export function renderQuiz(questions, state, { best = null } = {}) {
  const body = state.finished ? summaryHtml(questions, state, best) : questionHtml(questions, state);
  return (
    `<figure class="quiz">` +
    `<figcaption class="sr-only">${escapeHtml(t("learn.quiz.title"))}</figcaption>` +
    body +
    `</figure>`
  );
}

/**
 * Registo a guardar no fim: o último resultado e o melhor de sempre.
 * previous é o que já estava em progress (pode ser null ou lixo).
 */
export function quizRecord(previous, score, now = Date.now()) {
  const oldBest = previous && typeof previous.best === "number" ? previous.best : -1;
  return { last: score.correct, best: Math.max(oldBest, score.correct), total: score.total, completedAt: now };
}

/** Monta o quiz em `container`. Devolve { refresh } para redesenhar ao mudar de idioma. */
export function mountQuiz(container, { storage = null } = {}) {
  if (!container) return { refresh() {} };
  const questions = quizQuestions();
  let state = initialQuizState();
  const readBest = () => storage?.getProgress(QUIZ_PROGRESS_ID) ?? null;
  // O quiz é redesenhado inteiro; o anúncio do veredito vive num nó fixo, como nos players.
  const status = statusRegion(container);
  const all = (selector) => Array.from(container.querySelectorAll(selector));

  function draw(focus) {
    container.innerHTML = renderQuiz(questions, state, { best: readBest() });
    if (focus) container.querySelector(focus)?.focus();
  }

  container.addEventListener("click", (event) => {
    const option = event.target.closest("[data-option]");
    if (option && !option.disabled) {
      const question = questions[state.index];
      state = { ...state, answers: { ...state.answers, [question.id]: option.dataset.option } };
      draw("[data-next]");
      const { verdict, why } = feedbackText(question, option.dataset.option);
      status.textContent = `${verdict} ${why}`;
      showFeedback({
        marks: all('[aria-checked="true"] .ic'),
        appear: all('.quiz__option--right[aria-checked="false"]'),
        messages: all(".quiz__feedback, .quiz__actions"),
      });
      return;
    }
    if (event.target.closest("[data-next]")) {
      if (state.index < questions.length - 1) {
        const before = container.querySelector(".quiz__track i").style.width;
        state = { ...state, index: state.index + 1 };
        draw(".quiz__prompt");
        fillBar(container.querySelector(".quiz__track i"), before);
        return;
      } else {
        state = { ...state, finished: true };
        storage?.setProgress(QUIZ_PROGRESS_ID, quizRecord(readBest(), quizScore(questions, state.answers)));
      }
      draw(".quiz__prompt");
      return;
    }
    if (event.target.closest("[data-restart]")) {
      state = initialQuizState();
      draw(".quiz__prompt");
    }
  });

  // Setas: o foco anda pelas opções (dá a volta nas pontas) sem responder; Tab sai do grupo.
  container.addEventListener("keydown", (event) => {
    const step = OPTION_KEYS[event.key];
    const option = event.target.closest("[data-option]");
    if (!step || !option) return;
    event.preventDefault();
    const options = Array.from(container.querySelectorAll("[data-option]"));
    const next = options[(options.indexOf(option) + step + options.length) % options.length];
    options.forEach((other) => (other.tabIndex = other === next ? 0 : -1));
    next.focus();
  });

  draw();
  return { refresh: () => draw() };
}
