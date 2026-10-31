// Menu de exemplos: pesquisa, as fórmulas que o aluno já resolveu (localStorage, com "limpar") e os
// exemplos agrupados por tema (Só propagação, Com ramificação, Extras).
//
// O comportamento (teclado, fechar, folha no mobile) vem do menu.js; aqui fecha-se ao escolher uma fórmula.
//
// Como no formula-input.js, renderMenuPanel(), matchesSearch() e recentLabel() são puras (testáveis em
// node); só mountExamplesMenu() mexe no DOM e no storage.
import { EXAMPLE_SOURCES, examplesBySource, getExample } from "../core/examples.js";
import { parse } from "../core/parser.js";
import { t, getLang, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { setHtml } from "./formula-input.js";
import { mountMenus, openMenu, closeMenu } from "./menu.js";
import { storage as defaultStorage } from "./storage.js";

/** Os exemplos agrupados pela ordem das fontes: [{ source, examples }]. */
export function exampleGroups() {
  return EXAMPLE_SOURCES.map((source) => ({ source, examples: examplesBySource(source) })).filter(
    (group) => group.examples.length > 0,
  );
}

// Pré-visualização de uma fórmula com ¬, ∨ e subscritos; se não for válida, o texto tal como está.
export function formulaPreviewHtml(text) {
  const result = parse(text);
  return result.ok ? setHtml(result.clauses) : escapeHtml(text);
}

const icon = (path) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;

const CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
const SEARCH = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>';
const CLOSE = '<path d="M6 6l12 12M18 6 6 18"/>';
const BOOK = '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5"/>';
const CHEVRON = '<path d="m6 9 6 6 6-6"/>';

// Sem acentos e em minúsculas: «ramificacao» encontra «ramificação».
const normalize = (text) => String(text).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** A pesquisa encontra `text` se todas as palavras de `query` aparecerem nele, por qualquer ordem. */
export function matchesSearch(query, text) {
  const haystack = normalize(text);
  return normalize(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

/** Há quanto tempo foi resolvida: «há 2 min.», «ontem»… (vazio em entradas sem data). */
export function recentLabel(savedAt, now = Date.now(), lang = getLang()) {
  if (typeof savedAt !== "number") return "";
  const format = new Intl.RelativeTimeFormat(lang === "pt" ? "pt-PT" : "en-GB", { numeric: "auto", style: "short" });
  const minutes = Math.floor(Math.max(0, now - savedAt) / 60000);
  if (minutes < 1) return format.format(0, "second");
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  return days < 30 ? format.format(-days, "day") : format.format(-Math.floor(days / 30), "month");
}

function exampleItemHtml(ex, lang, withWord) {
  const title = ex.title[lang] ?? ex.title.pt;
  const count = parse(ex.input).clauses?.length ?? 0;
  // O primeiro item diz o que é o número; os outros já não precisam, e no mobile nunca há espaço.
  const word = withWord ? `<span class="max-md:hidden"> ${escapeHtml(t("examplesMenu.clausesWord"))}</span>` : "";
  return (
    `<li><button type="button" class="examples-menu__item" data-example="${escapeHtml(ex.id)}" ` +
    `data-search="${escapeHtml(`${title} ${ex.input}`)}">` +
    `<span class="examples-menu__title">${escapeHtml(title)}</span>` +
    `<span class="sr-only">${formulaPreviewHtml(ex.input)}</span>` +
    `<span class="examples-menu__meta">${count}${word}</span></button></li>`
  );
}

function historyItemHtml(entry, i, { lang, now }) {
  const when = recentLabel(entry.savedAt, now, lang);
  return (
    `<li><button type="button" class="examples-menu__item" data-history="${i}" data-search="${escapeHtml(entry.formula)}">` +
    `${icon(CLOCK)}<code class="examples-menu__formula">${formulaPreviewHtml(entry.formula)}</code>` +
    (when ? `<span class="examples-menu__meta">${escapeHtml(when)}</span>` : "") +
    `</button></li>`
  );
}

/**
 * HTML do painel do menu: a pesquisa, o histórico primeiro (é o que o aluno procura de volta) e depois
 * os exemplos por fonte. `history` = [{ formula, savedAt }] como devolvido por storage.getHistory().
 */
export function renderMenuPanel({ history = [], lang = getLang(), now = Date.now() } = {}) {
  const historyBody = history.length
    ? `<ul class="examples-menu__list list-none">${history.map((entry, i) => historyItemHtml(entry, i, { lang, now })).join("")}</ul>`
    : `<p class="examples-menu__empty">${escapeHtml(t("examplesMenu.historyEmpty"))}</p>`;
  const clearButton = history.length
    ? `<button type="button" class="examples-menu__item examples-menu__clear">${icon(CLOSE)}${escapeHtml(t("examplesMenu.clearHistory"))}</button>`
    : "";
  const search = escapeHtml(t("examplesMenu.search"));

  const exampleSections = exampleGroups()
    .map(({ source, examples }, g) => {
      const items = examples.map((ex, i) => exampleItemHtml(ex, lang, g === 0 && i === 0)).join("");
      return `
    <section class="examples-menu__group" aria-labelledby="examples-menu-${source}">
      <h2 class="grp" id="examples-menu-${source}">${escapeHtml(t(`examplesMenu.sources.${source}`))}</h2>
      <ul class="examples-menu__list list-none">${items}</ul>
    </section>`;
    })
    .join("");

  return `
    <div class="examples-menu__search">${icon(SEARCH)}<input type="search" aria-label="${search}" placeholder="${search}" autocomplete="off" spellcheck="false"></div>
    <section class="examples-menu__group examples-menu__group--history" aria-labelledby="examples-menu-history">
      <h2 class="grp" id="examples-menu-history">${escapeHtml(t("examplesMenu.history"))}</h2>
      ${historyBody}
    </section>
    ${exampleSections}
    <p class="examples-menu__empty" data-no-results role="status" hidden>${escapeHtml(t("examplesMenu.noResults"))}</p>
    ${clearButton}`;
}

/** Esconde os itens que não respondem à pesquisa, e os grupos que ficam vazios. */
function applySearch(panel, query) {
  let found = 0;
  panel.querySelectorAll(".examples-menu__group").forEach((group) => {
    let visible = 0;
    group.querySelectorAll("[data-search]").forEach((item) => {
      const match = matchesSearch(query, item.dataset.search);
      item.closest("li").hidden = !match;
      if (match) visible += 1;
    });
    group.hidden = visible === 0 && query.trim() !== "";
    found += visible;
  });
  panel.querySelector("[data-no-results]").hidden = found > 0 || query.trim() === "";
}

/**
 * Monta o menu dentro de `container`.
 * - `onSelect(text, example)`: chamado ao escolher uma fórmula (`example` é null no histórico);
 * - `open`: começa aberto (útil para screenshots: ?menu=examples);
 * - `store`: o armazenamento (por omissão o partilhado de storage.js).
 * Devolve { open, close, refresh }.
 */
export function mountExamplesMenu(container, { onSelect, open = false, store = defaultStorage } = {}) {
  let details;
  let panel;

  function renderPanel() {
    panel.innerHTML = renderMenuPanel({ history: store.getHistory() });
  }

  function build() {
    const wasOpen = details?.open ?? open;
    container.innerHTML = `
      <details class="dd">
        <summary class="btn" data-variant="secondary">
          ${icon(BOOK)}<span>${escapeHtml(t("examplesMenu.toggle"))}</span>${icon(CHEVRON).replace('class="ic"', 'class="ic size-3.5"')}
        </summary>
        <div class="menu dd-panel md:w-95 md:max-h-[min(32rem,70vh)] md:overflow-y-auto"></div>
      </details>`;
    details = container.querySelector("details");
    panel = container.querySelector(".dd-panel");

    panel.addEventListener("input", (event) => applySearch(panel, event.target.value));
    // Enter na pesquisa escolhe o primeiro resultado.
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !event.target.matches("input")) return;
      event.preventDefault();
      panel.querySelector("li:not([hidden]) [data-search]")?.click();
    });

    panel.addEventListener("click", (event) => {
      if (event.target.closest(".examples-menu__clear")) {
        store.clearHistory();
        renderPanel();
        details.querySelector("summary").focus();
        return;
      }
      const item = event.target.closest(".examples-menu__item");
      if (!item) return;
      let text;
      let example = null;
      if (item.dataset.example) {
        example = getExample(item.dataset.example);
        text = example?.input;
      } else {
        text = store.getHistory()[Number(item.dataset.history)]?.formula;
      }
      if (text == null) return;
      closeMenu(details);
      onSelect?.(text, example);
    });

    renderPanel();
    if (wasOpen) openMenu(details);
  }

  // O histórico pode ter mudado desde a última abertura: volta a ler sempre que abre.
  mountMenus(container, { onOpen: renderPanel });
  build();
  onLangChange(build);

  return {
    open: () => openMenu(details, { onOpen: renderPanel }),
    close: (options) => closeMenu(details, options),
    refresh: renderPanel,
  };
}
