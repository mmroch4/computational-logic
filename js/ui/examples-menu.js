// Menu de exemplos da página Provar: os sequentes de core/examples.js, por grupos. O comportamento
// (teclado, fechar, folha no telemóvel) vem do menu.js.
import { EXAMPLE_GROUPS, findExample } from "../core/examples.js";
import { onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { closeMenu, mountMenus } from "./menu.js";

const icon = (path, classes = "ic") => `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
const BOOK = '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5"/>';
const CHEVRON = '<path d="m6 9 6 6 6-6"/>';

/** HTML do painel: por grupo, um título e os exemplos, com o nome e o sequente. */
export function renderExamplesPanel() {
  return EXAMPLE_GROUPS.map(({ id, examples }) => {
    const items = examples.map(
      (example) =>
        `<button type="button" class="examples-menu__item" data-example="${example.id}">` +
        `<span>${escapeHtml(t(`examples.items.${example.id}`))}</span>` +
        `<code>${escapeHtml(example.sequent)}</code></button>`,
    );
    return `<div class="grp">${escapeHtml(t(`examples.groups.${id}`))}</div>${items.join("")}`;
  }).join("");
}

/** Monta o menu em `container`; `onSelect(sequent)` corre ao escolher um exemplo. */
export function mountExamplesMenu(container, { onSelect }) {
  function build() {
    const label = escapeHtml(t("examples.toggle"));
    container.innerHTML = `
      <details class="dd" data-sheet-title="${label}">
        <summary class="btn" data-variant="secondary">
          ${icon(BOOK)}<span>${label}</span>${icon(CHEVRON, "ic size-3.5")}
        </summary>
        <div class="menu dd-panel examples-menu">${renderExamplesPanel()}</div>
      </details>`;
    const details = container.querySelector("details");
    container.querySelector(".dd-panel").addEventListener("click", (event) => {
      const example = findExample(event.target.closest("[data-example]")?.dataset.example);
      if (!example) return;
      closeMenu(details, { focus: true });
      onSelect(example.sequent);
    });
  }

  mountMenus(container);
  build();
  onLangChange(build);
}
