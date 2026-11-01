// Estado vazio do Resolver: enquanto não há resultado, uma dica curta e três exemplos que se resolvem
// com um clique (um só com propagação, um com ramificação e um satisfazível). Enquanto a fórmula tiver
// um erro, a coluna mostra antes a cábula da notação (mountNotationHelp).
//
// Como nos outros componentes, renderEmptyState() e renderNotationHelp() são puras (testáveis em node);
// só os mount*() mexem no DOM.
import { getExample } from "../core/examples.js";
import { t, getLang, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { formulaPreviewHtml } from "./examples-menu.js";

/** Os exemplos sugeridos no estado vazio (ids de js/core/examples.js). */
export const EMPTY_STATE_EXAMPLES = ["propagation-chain", "two-branches", "unit-then-branch"];

const code = (text) => `<code>${escapeHtml(text)}</code>`;

const BULB = '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>';

/** HTML do estado vazio: dica e os exemplos sugeridos como botões (`data-example`). */
export function renderEmptyState({ lang = getLang() } = {}) {
  const items = EMPTY_STATE_EXAMPLES.map(getExample)
    .filter(Boolean)
    .map(
      (ex) =>
        `<li><button type="button" class="btn empty-state__example" data-variant="outline" data-example="${escapeHtml(ex.id)}">` +
        `<span class="empty-state__title">${escapeHtml(ex.title[lang] ?? ex.title.pt)}</span>` +
        `<code class="empty-state__formula">${formulaPreviewHtml(ex.input)}</code></button></li>`,
    )
    .join("");
  const hint = t("emptyState.hint", { compact: code("p, -p q"), sets: code("{{p}, {¬p, q}}"), logic: code("p ∧ (¬p ∨ q)") });
  return `
    <div class="empty-state">
      <span class="empty-state__icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${BULB}</svg></span>
      <h2 class="empty-state__heading">${escapeHtml(t("emptyState.heading"))}</h2>
      <p class="empty-state__hint">${hint}</p>
      <p class="empty-state__hint">${escapeHtml(t("emptyState.start"))}</p>
      <ul class="empty-state__list list-none">${items}</ul>
    </div>`;
}

// As linhas da cábula: o nome (chave i18n) e o que se pode escrever.
const NOTATION_ROWS = [
  ["not", "¬  ~  -  !"],
  ["or", "∨  |  \\/  v"],
  ["and", "∧  &  /\\  ^"],
  ["variables", "p, q1, p_11"],
];

/** HTML da cábula da notação, que substitui o estado vazio enquanto a fórmula tem um erro. */
export function renderNotationHelp() {
  const rows = NOTATION_ROWS.map(
    ([key, symbols]) => `<tr><th scope="row">${escapeHtml(t(`notationHelp.${key}`))}</th><td>${code(symbols)}</td></tr>`,
  ).join("");
  return `
    <div class="notation-help">
      <h2 class="notation-help__heading">${escapeHtml(t("notationHelp.heading"))}</h2>
      <table class="tbl"><tbody>${rows}</tbody></table>
      <p class="notation-help__note">${escapeHtml(t("notationHelp.note"))}</p>
    </div>`;
}

/** Monta a cábula em `container` (começa escondida). Devolve { show(visible) }. */
export function mountNotationHelp(container) {
  const draw = () => {
    container.innerHTML = renderNotationHelp();
  };
  onLangChange(draw);
  draw();
  return {
    show(visible) {
      container.hidden = !visible;
    },
  };
}

/**
 * Monta o estado vazio em `container`. `onSelect(text, example)` é chamado ao escolher um exemplo.
 * Devolve { show(visible) }. Redesenha ao mudar de idioma.
 */
export function mountEmptyState(container, { onSelect } = {}) {
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-example]");
    if (!button) return;
    const example = getExample(button.dataset.example);
    if (example) onSelect?.(example.input, example);
  });

  function draw() {
    container.innerHTML = renderEmptyState();
  }
  onLangChange(draw);
  draw();

  return {
    show(visible) {
      container.hidden = !visible;
    },
  };
}
