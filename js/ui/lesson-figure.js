// Bloco das figuras da lição: um `figure` em `--color-surface`, mais largo do que o texto, com ícone e
// título. As interativas levam o rótulo «Interativo». O conteúdo é de cada figura.
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";

const PATHS = {
  proof: '<path d="M6 4v16M10 8h8M10 12h6M10 16h8"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8M12 16.5v.01"/>',
};

/** Um dos ícones da lição (decorativo: o nome vem sempre do texto ao lado). */
export const lessonIcon = (name) =>
  `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;

/** `figure` da lição. `classes` são as da própria figura; `body` é HTML já escapado. */
export function lessonFigureHtml({ classes = "", icon, title, interactive = false, body }) {
  const tag = interactive ? `<span class="lesson-figure__tag">${escapeHtml(t("learn.interactive"))}</span>` : "";
  return (
    `<figure class="lesson-figure ${classes}">` +
    `<figcaption class="lesson-figure__head"><span class="lesson-figure__icon">${lessonIcon(icon)}</span>` +
    `<b class="lesson-figure__title">${escapeHtml(title)}</b>${tag}</figcaption>` +
    `${body}</figure>`
  );
}
