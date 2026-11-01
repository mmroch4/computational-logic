// O quiz final da lição, uma pergunta de cada vez. Depois de responder, as opções bloqueiam, a certa e a
// escolhida ficam marcadas (com ícone e texto, nunca só cor) e aparece a explicação dessa resposta. No
// fim há um resumo com a revisão das respostas e o melhor resultado, guardado no progresso.
//
// As perguntas vêm de `core/quiz.js`. `renderQuiz` é pura; `mountQuiz` mexe no DOM e no armazenamento.
import { QUIZ_PROGRESS_ID, initialQuizState, isCorrect, quizQuestions, quizRecord, quizScore } from "../core/quiz.js";
import { fillBar, showFeedback } from "./feedback-motion.js";
import { fitchHtml, formulaReadHtml, justificationText, readAsHtml, spokenFormula, spokenProse } from "./fitch-view.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { format } from "../core/formula.js";

const OPTION_KEYS = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

const MARK_ICONS = {
  right: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  wrong: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const NEXT_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const proseHtml = (text) => readAsHtml(escapeHtml(text), spokenProse(text));

/** O rótulo de uma opção: a linha candidata fica em letra de prova, com a justificação ao lado. */
function optionLabelHtml(question, option) {
  if (option.kind === "line") {
    const why = justificationText(option.line);
    return `<span class="quiz__math">${formulaReadHtml(option.line.formula)}</span><span class="quiz__why">${proseHtml(why)}</span>`;
  }
  if (option.kind === "step") {
    const { kind, formula } = option.step;
    return proseHtml(t(`learn.quiz.actions.${kind}`, { formula: format(formula) }));
  }
  if (option.kind === "find") {
    return escapeHtml(option.line === null ? t("learn.quiz.noError") : t("learn.quiz.lineOption", { line: option.line }));
  }
  return proseHtml(t(`learn.quiz.questions.${question.id}.options.${option.id}`));
}

const optionOf = (question, id) => question.options.find((option) => option.id === id);

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
    `${mark}<span class="quiz__label">${optionLabelHtml(question, option)}</span>${tag}</button>`
  );
}

/** A frase depois de responder: o veredito e a explicação dessa resposta, sem HTML. */
function feedbackText(question, answer) {
  const verdict = t(isCorrect(question, answer) ? "learn.quiz.right" : "learn.quiz.wrong");
  return { verdict, why: t(`learn.quiz.questions.${question.id}.why.${answer}`) };
}

const sequentHtml = ({ sequent }) => (sequent ? `<p class="quiz__set">${proseHtml(sequent)}</p>` : "");
const proofHtml = ({ proof }) => (proof ? `<div class="lesson-proof__view">${fitchHtml(proof)}</div>` : "");

function questionHtml(questions, state) {
  const question = questions[state.index];
  const answer = state.answers[question.id];
  const answered = answer !== undefined;
  const { correct, total } = quizScore(questions, state.answers);
  const options = question.options.map((option, index) => optionHtml(question, option, answer, index)).join("");
  let feedback = "";
  if (answered) {
    const { verdict, why } = feedbackText(question, answer);
    const last = state.index === questions.length - 1;
    feedback =
      msgHtml(isCorrect(question, answer) ? "ok" : "warn", `<b>${escapeHtml(verdict)}</b> ${proseHtml(why)}`, { classes: "quiz__feedback" }) +
      `<div class="quiz__actions"><button type="button" class="btn" data-next>` +
      `${escapeHtml(t(last ? "learn.quiz.finish" : "learn.quiz.next"))}${NEXT_ICON}</button></div>`;
  }
  return (
    `<div class="quiz__head"><p class="quiz__count">${escapeHtml(t("learn.quiz.count", { n: state.index + 1, total }))}</p>` +
    `<div class="quiz__track" aria-hidden="true"><i style="width:${((state.index + 1) / total) * 100}%"></i></div>` +
    `<p class="quiz__score">${escapeHtml(t("learn.quiz.score", { n: correct, total }))}</p></div>` +
    `<div class="quiz__card"><p class="quiz__kind">${escapeHtml(t(`learn.quiz.kinds.${question.kind}`))}</p>` +
    `<h3 class="quiz__prompt" tabindex="-1">${proseHtml(t(`learn.quiz.questions.${question.id}.prompt`))}</h3>` +
    sequentHtml(question) +
    proofHtml(question) +
    `<div class="quiz__options" role="radiogroup" aria-label="${escapeHtml(t("learn.quiz.optionsLabel"))}">${options}</div>` +
    feedback +
    `</div>`
  );
}

function reviewItemHtml(question, answer) {
  const right = isCorrect(question, answer);
  const yours = answer === undefined ? "—" : optionLabelHtml(question, optionOf(question, answer));
  const fix = right
    ? ""
    : `<p class="quiz__review-line quiz__review-line--right">${escapeHtml(t("learn.quiz.correctAnswer"))} ${optionLabelHtml(question, optionOf(question, question.answer))}</p>`;
  return (
    `<li class="quiz__review-item quiz__review-item--${right ? "right" : "wrong"}">` +
    `<p class="quiz__review-prompt"><span aria-hidden="true">${right ? "✓" : "✗"}</span> ` +
    `<span class="sr-only">${escapeHtml(t(right ? "learn.quiz.right" : "learn.quiz.wrong"))}</span>` +
    `${proseHtml(t(`learn.quiz.questions.${question.id}.prompt`))}</p>` +
    (question.sequent ? `<p class="quiz__review-line">${proseHtml(question.sequent)}</p>` : "") +
    `<p class="quiz__review-line">${escapeHtml(t("learn.quiz.yourAnswer"))} ${yours}</p>${fix}</li>`
  );
}

function summaryHtml(questions, state, best) {
  const { correct, total } = quizScore(questions, state.answers);
  const percent = Math.round((100 * correct) / total);
  const review = questions.map((question) => reviewItemHtml(question, state.answers[question.id]));
  const bestLine = typeof best?.best === "number"
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

/** O HTML do quiz. `best` é o registo guardado no progresso, ou `null`. */
export function renderQuiz(questions, state, { best = null } = {}) {
  const body = state.finished ? summaryHtml(questions, state, best) : questionHtml(questions, state);
  return `<figure class="quiz"><figcaption class="sr-only">${escapeHtml(t("learn.quiz.title"))}</figcaption>${body}</figure>`;
}

/** Monta o quiz em `container`. `storage` é opcional: sem ele, o quiz só não guarda o resultado. */
export function mountQuiz(container, { storage = null } = {}) {
  const questions = quizQuestions();
  let state = initialQuizState();
  const readBest = () => storage?.getProgress(QUIZ_PROGRESS_ID) ?? null;
  // O quiz redesenha-se inteiro: o anúncio do veredito vive num nó fixo, fora dele.
  const status = document.createElement("p");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  container.after(status);
  const all = (selector) => Array.from(container.querySelectorAll(selector));

  function draw(focus) {
    container.innerHTML = renderQuiz(questions, state, { best: readBest() });
    if (focus) container.querySelector(focus)?.focus();
  }

  function answer(optionId) {
    const question = questions[state.index];
    state = { ...state, answers: { ...state.answers, [question.id]: optionId } };
    draw("[data-next]");
    const { verdict, why } = feedbackText(question, optionId);
    status.textContent = `${verdict} ${spokenProse(why)}`;
    showFeedback({
      marks: all('[aria-checked="true"] .ic'),
      appear: all('.quiz__option--right[aria-checked="false"]'),
      messages: all(".quiz__feedback, .quiz__actions"),
    });
  }

  function advance() {
    if (state.index < questions.length - 1) {
      const before = container.querySelector(".quiz__track i").style.width;
      state = { ...state, index: state.index + 1 };
      draw(".quiz__prompt");
      fillBar(container.querySelector(".quiz__track i"), before);
      return;
    }
    state = { ...state, finished: true };
    storage?.setProgress(QUIZ_PROGRESS_ID, quizRecord(readBest(), quizScore(questions, state.answers)));
    draw(".quiz__prompt");
  }

  container.addEventListener("click", ({ target }) => {
    const option = target.closest("[data-option]");
    if (option && !option.disabled) answer(option.dataset.option);
    else if (target.closest("[data-next]")) advance();
    else if (target.closest("[data-restart]")) {
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
    const options = all("[data-option]");
    const next = options[(options.indexOf(option) + step + options.length) % options.length];
    options.forEach((other) => { other.tabIndex = other === next ? 0 : -1; });
    next.focus();
  });

  draw();
}
