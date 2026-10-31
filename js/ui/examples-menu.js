// Menu de exemplos da página Provar: os últimos sequentes abertos e os de core/examples.js, por grupos. O
// comportamento (teclado, fechar, folha no telemóvel) vem do menu.js.
import { EXAMPLE_GROUPS, findExample } from "../core/examples.js";
import { onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { closeMenu, mountMenus } from "./menu.js";
import { storage } from "./storage.js";

const icon = (path, classes = "ic") => `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
const BOOK = '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5"/>';
const CHEVRON = '<path d="m6 9 6 6 6-6"/>';

/** Os últimos sequentes abertos, em `history` de `storage.getHistory()`; sem nenhum, não há grupo. */
export function renderHistoryGroup(history) {
  if (history.length === 0) return "";
  const items = history.map(({ sequent }) => (
    `<button type="button" class="examples-menu__item" data-sequent="${escapeHtml(sequent)}"><code>${escapeHtml(sequent)}</code></button>`
  ));
  return `<div class="grp">${escapeHtml(t("examples.history"))}</div>${items.join("")}`
    + `<button type="button" class="examples-menu__item" data-clear-history><span>${escapeHtml(t("examples.clearHistory"))}</span></button>`;
}

/** HTML do painel: os recentes e, por grupo, um título e os exemplos, com o nome e o sequente. */
export function renderExamplesPanel(history = []) {
  const groups = EXAMPLE_GROUPS.map(({ id, examples }) => {
    const items = examples.map(
      (example) =>
        `<button type="button" class="examples-menu__item" data-example="${example.id}">` +
        `<span>${escapeHtml(t(`examples.items.${example.id}`))}</span>` +
        `<code>${escapeHtml(example.sequent)}</code></button>`,
    );
    return `<div class="grp">${escapeHtml(t(`examples.groups.${id}`))}</div>${items.join("")}`;
  }).join("");
  return renderHistoryGroup(history) + groups;
}

/**
 * Monta o menu em `container`; `onSelect(sequent)` corre ao escolher um sequente.
 * Devolve { refresh() }, para mostrar um sequente acabado de entrar no histórico.
 */
export function mountExamplesMenu(container, { onSelect }) {
  function build() {
    const label = escapeHtml(t("examples.toggle"));
    container.innerHTML = `
      <details class="dd" data-sheet-title="${label}">
        <summary class="btn" data-variant="secondary">
          ${icon(BOOK)}<span>${label}</span>${icon(CHEVRON, "ic size-3.5")}
        </summary>
        <div class="menu dd-panel examples-menu">${renderExamplesPanel(storage.getHistory())}</div>
      </details>`;
    const details = container.querySelector("details");
    container.querySelector(".dd-panel").addEventListener("click", (event) => {
      if (event.target.closest("[data-clear-history]")) {
        closeMenu(details, { focus: true });
        storage.clearHistory();
        build();
        return;
      }
      const sequent = event.target.closest("[data-sequent]")?.dataset.sequent
        ?? findExample(event.target.closest("[data-example]")?.dataset.example)?.sequent;
      if (!sequent) return;
      closeMenu(details, { focus: true });
      onSelect(sequent);
    });
  }

  mountMenus(container);
  build();
  onLangChange(build);
  return { refresh: build };
}
