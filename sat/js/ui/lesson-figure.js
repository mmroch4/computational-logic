// Bloco dos interativos da lição: um `figure` em `--surface`, mais largo do que o texto, com ícone,
// título e o rótulo «Interativo». O conteúdo é de cada interativo.
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";

const PATHS = {
  tree: '<circle cx="12" cy="4.5" r="2.5"/><circle cx="5" cy="19.5" r="2.5"/><circle cx="19" cy="19.5" r="2.5"/><path d="M12 7L5 17M12 7l7 10"/>',
  cycle: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  arrow: '<path d="M4 12h14M13 6l6 6-6 6"/>',
  play: '<path d="M7 5.5v13l11-6.5z"/>',
  fork: '<path d="M6 4v6a4 4 0 0 0 4 4h4M18 4v6a4 4 0 0 1-4 4M12 14v6"/>',
  cross: '<circle cx="12" cy="12" r="8"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
};

/** Um dos ícones da lição (decorativo: o nome vem sempre do texto ao lado). */
export const lessonIcon = (name) =>
  `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;

/** `figure` de um interativo. `classes` são as do próprio interativo; `body` é HTML já escapado. */
export function lessonFigureHtml({ classes, icon, title, body }) {
  return (
    `<figure class="lesson-figure ${classes}">` +
    `<figcaption class="lesson-figure__head"><span class="lesson-figure__icon">${lessonIcon(icon)}</span>` +
    `<b class="lesson-figure__title">${escapeHtml(title)}</b>` +
    `<span class="lesson-figure__tag">${escapeHtml(t("learn.interactive"))}</span></figcaption>` +
    `${body}</figure>`
  );
}
