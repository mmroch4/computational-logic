// Pergunta curta no meio da lição: escolhe-se uma opção e cada uma tem a sua explicação. Não conta para
// nada e pode responder-se outra vez. O quiz final é outra coisa.
//
// `lessonCheckHtml` e `lessonCheckFeedbackHtml` são puras; `mountLessonCheck` liga os botões.
import { LESSON_CHECKS } from "../core/lesson.js";
import { readAsHtml, spokenProse } from "./fitch-view.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { lessonFigureHtml } from "./lesson-figure.js";
import { msgHtml } from "./message.js";

const proseHtml = (text) => readAsHtml(escapeHtml(text), spokenProse(text));

function optionHtml(id, option, chosen) {
  return (
    `<li><button type="button" class="lesson-check__option" data-option="${option}" aria-pressed="${option === chosen}">` +
    `${proseHtml(t(`learn.checks.${id}.options.${option}`))}</button></li>`
  );
}

export function lessonCheckFeedbackHtml(id, option) {
  const correct = option === LESSON_CHECKS[id].answer;
  const verdict = escapeHtml(t(correct ? "learn.check.right" : "learn.check.wrong"));
  return msgHtml(correct ? "ok" : "warn", `<b>${verdict}</b> ${proseHtml(t(`learn.checks.${id}.why.${option}`))}`);
}

/** A pergunta `id`, com `chosen` como opção escolhida (ou `null`). */
export function lessonCheckHtml(id, chosen = null) {
  const options = LESSON_CHECKS[id].options.map((option) => optionHtml(id, option, chosen)).join("");
  const body =
    `<p class="lesson-check__question">${proseHtml(t(`learn.checks.${id}.question`))}</p>` +
    `<ul class="lesson-check__options" role="list">${options}</ul>` +
    '<div class="lesson-check__feedback" role="status"></div>';
  return lessonFigureHtml({ classes: "lesson-check", icon: "question", title: t("learn.check.title"), interactive: true, body });
}

export function mountLessonCheck(container, { id }) {
  container.innerHTML = lessonCheckHtml(id);
  const feedback = container.querySelector(".lesson-check__feedback");
  container.addEventListener("click", ({ target }) => {
    const button = target.closest("[data-option]");
    if (!button) return;
    for (const option of container.querySelectorAll("[data-option]")) {
      option.setAttribute("aria-pressed", String(option === button));
    }
    feedback.innerHTML = lessonCheckFeedbackHtml(id, button.dataset.option);
  });
}
