// Gerador de fórmulas (Resolver e Passo a passo): nº de variáveis (2–8), nº de cláusulas, literais
// por cláusula, "qualquer / satisfazível / insatisfazível" e uma semente opcional. Gera com generateWanted()
// do core, que experimenta sementes seguidas até o DLL dar o resultado pedido.
//
// A semente que deu o conjunto vai para a URL (?seed=…&vars=…&clauses=…&want=…): abrir esse link
// volta a gerar o mesmo conjunto. `size` só vai quando não é a mistura, que é o que os links sem ele
// sempre deram. O painel abre com o menu.js, como o examples-menu.js; as funções
// render* e as conversões de/para a URL são puras (testáveis em node).
import { CLAUSE_SIZES, GENERATOR_LIMITS, GENERATOR_WANTS, generateWanted, normalizeSeed, randomSeed } from "../core/generator.js";
import { t, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { mountMenus, openMenu, closeMenu } from "./menu.js";

export const GENERATOR_UI_LIMITS = { minVars: 2, maxVars: GENERATOR_LIMITS.maxVars, minClauses: 1, maxClauses: GENERATOR_LIMITS.maxClauses };
const GENERATOR_DEFAULTS = { vars: 3, clauses: 6, want: "any" };
const DEFAULT_SIZE = "mix";

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** Opções válidas a partir de valores soltos (do formulário ou da URL). */
export function normalizeGeneratorOptions({ vars, clauses, want, size } = {}) {
  const L = GENERATOR_UI_LIMITS;
  const options = {
    vars: clampInt(vars, L.minVars, L.maxVars, GENERATOR_DEFAULTS.vars),
    clauses: clampInt(clauses, L.minClauses, L.maxClauses, GENERATOR_DEFAULTS.clauses),
    want: GENERATOR_WANTS.includes(want) ? want : GENERATOR_DEFAULTS.want,
  };
  if (size in CLAUSE_SIZES && size !== DEFAULT_SIZE) options.size = String(size);
  return options;
}

/** Parâmetros da URL para um conjunto gerado: { seed, vars, clauses, want }. */
export function generatorParams({ seed, ...options }) {
  return { seed, ...normalizeGeneratorOptions(options) };
}

/** Lê os parâmetros do gerador da URL (`params` de decodeShare); null se não houver `seed`. */
export function generatorFromParams(params = {}) {
  if (params.seed == null || String(params.seed).trim() === "") return null;
  return { seed: normalizeSeed(params.seed), ...normalizeGeneratorOptions(params) };
}

/** Gera o conjunto pedido; devolve o resultado de generateWanted() com `params` para a URL. */
export function runGenerator({ seed, ...options }) {
  const opts = normalizeGeneratorOptions(options);
  const sizes = CLAUSE_SIZES[opts.size ?? DEFAULT_SIZE];
  const out = generateWanted({ seed, vars: opts.vars, clauses: opts.clauses, want: opts.want, ...sizes });
  return { ...out, params: generatorParams({ ...opts, seed: out.seed }) };
}

const DICE = '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>';
const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
const icon = (path, classes = "ic") => `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;

function rangeHtml(name, label, min, max, value) {
  return `
      <label class="generator__range">
        <span class="generator__range-head">${escapeHtml(label)}<b>${value}</b></span>
        <input type="range" name="${name}" min="${min}" max="${max}" value="${value}">
      </label>`;
}

function segHtml(id, label, buttons) {
  return `
      <div class="generator__seg">
        <span id="${id}">${escapeHtml(label)}</span>
        <div class="seg" role="group" aria-labelledby="${id}">${buttons}</div>
      </div>`;
}

/**
 * HTML do formulário. `state` = { vars, clauses, want, size, seedText, lastSeed, error }: seedText vazio =
 * semente aleatória; lastSeed = semente do último conjunto gerado (ou null); error = mensagem de
 * "não encontrei" (ou "").
 */
export function renderGeneratorForm({ vars, clauses, want, size, seedText = "", lastSeed = null, error = "" } = {}) {
  const L = GENERATOR_UI_LIMITS;
  const opts = normalizeGeneratorOptions({ vars, clauses, want, size });
  const chosenSize = opts.size ?? DEFAULT_SIZE;
  const sizeButton = (id) =>
    `<button type="button" data-size="${id}" aria-pressed="${chosenSize === id}">${escapeHtml(t(`generator.sizes.${id}`))}</button>`;
  const wantButton = (id) =>
    `<button type="button" data-want="${id}" aria-pressed="${opts.want === id}">` +
    `${escapeHtml(t(`generator.wants.${id}`))}</button>`;
  const lastHtml = lastSeed != null
    ? `<span class="generator__hint">${escapeHtml(t("generator.lastSeed", { seed: lastSeed }))}</span>`
    : "";
  const errorHtml = error ? `<p class="generator__error" role="alert">${escapeHtml(error)}</p>` : "";
  return `
    <form class="generator__form" novalidate>
      <h2 class="generator__title max-md:hidden">${escapeHtml(t("generator.title"))}</h2>
      ${rangeHtml("vars", t("generator.vars"), L.minVars, L.maxVars, opts.vars)}
      ${rangeHtml("clauses", t("generator.clauses"), L.minClauses, L.maxClauses, opts.clauses)}
      ${segHtml("generator-size", t("generator.size"), ["2", "3", "mix"].map(sizeButton).join(""))}
      ${segHtml("generator-want", t("generator.want"), GENERATOR_WANTS.map(wantButton).join(""))}
      <div class="generator__seed-block">
        <label class="generator__seed">
          ${escapeHtml(t("generator.seed"))}
          <input class="input" type="text" name="seed" inputmode="numeric" autocomplete="off" spellcheck="false"
            title="${escapeHtml(t("generator.seedHint"))}"
            placeholder="${escapeHtml(t("generator.seedPlaceholder"))}" value="${escapeHtml(seedText)}">
        </label>
        ${lastHtml}
      </div>
      ${errorHtml}
      <button type="submit" class="btn generator__submit">${icon(DICE)}${escapeHtml(t("generator.submit"))}</button>
    </form>`;
}

/**
 * Monta o gerador dentro de `container`.
 * - `onGenerate({ clauses, sat, seed, params })`: chamado com o conjunto gerado (o painel fecha);
 * - `initial`: opções iniciais (ex.: as da URL, generatorFromParams); a semente aparece como a última;
 * - `open`: começa aberto (screenshots: ?menu=generator).
 * Devolve { open, close, setOptions }.
 */
export function mountGenerator(container, { onGenerate, initial = null, open = false } = {}) {
  const state = {
    size: DEFAULT_SIZE,
    ...normalizeGeneratorOptions(initial ?? {}),
    seedText: "",
    lastSeed: initial?.seed ?? null,
    error: "",
  };
  let details;
  let panel;

  function readForm() {
    const form = panel.querySelector("form");
    state.vars = form.elements.vars.value;
    state.clauses = form.elements.clauses.value;
    state.seedText = form.elements.seed.value.trim();
  }

  function renderPanel() {
    panel.innerHTML = renderGeneratorForm(state);
  }

  function generate() {
    readForm();
    Object.assign(state, normalizeGeneratorOptions(state));
    const seed = state.seedText === "" ? randomSeed() : state.seedText;
    const out = runGenerator({ seed, vars: state.vars, clauses: state.clauses, want: state.want, size: state.size });
    if (!out.found) {
      state.error = t("generator.notFound", {
        want: t(`generator.wantsLower.${state.want}`),
        vars: state.vars,
        clauses: state.clauses,
      });
      renderPanel();
      return;
    }
    // O campo volta a "aleatória" (gerar outra vez dá um conjunto novo); a semente que deu este
    // conjunto fica à vista e na URL, para o repetir.
    state.error = "";
    state.seedText = "";
    state.lastSeed = out.seed;
    renderPanel();
    closeMenu(details);
    onGenerate?.(out);
  }

  function build() {
    const wasOpen = details?.open ?? open;
    container.innerHTML = `
      <details class="dd generator" data-sheet-title="${escapeHtml(t("generator.title"))}">
        <summary class="btn" data-variant="secondary">
          ${icon(DICE)}<span>${escapeHtml(t("generator.toggle"))}</span>${icon(CHEVRON, "ic size-3.5")}
        </summary>
        <div class="pop dd-panel generator__panel"></div>
      </details>`;
    details = container.querySelector("details");
    panel = container.querySelector(".generator__panel");

    panel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-want], [data-size]");
      if (!button) return;
      readForm();
      const key = "want" in button.dataset ? "want" : "size";
      state[key] = button.dataset[key];
      for (const b of panel.querySelectorAll(`[data-${key}]`)) b.setAttribute("aria-pressed", String(b === button));
    });
    // O número ao lado do slider acompanha-o.
    panel.addEventListener("input", (event) => {
      const value = event.target.closest(".generator__range")?.querySelector("b");
      if (value) value.textContent = event.target.value;
    });
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      generate();
    });
    renderPanel();
    if (wasOpen) openMenu(details, { onOpen: focusField });
  }

  // Ao abrir, o primeiro campo recebe o foco (teclado e leitores de ecrã).
  function focusField() {
    panel.querySelector("input")?.focus({ preventScroll: true });
  }

  mountMenus(container, { onOpen: focusField });
  build();
  onLangChange(() => {
    if (details.open) readForm();
    build();
  });

  return {
    open: () => openMenu(details, { onOpen: focusField }),
    close: (options) => closeMenu(details, options),
    /** Mostra no formulário as opções de um conjunto gerado (ex.: vindo da URL). */
    setOptions(options) {
      Object.assign(state, { size: DEFAULT_SIZE }, normalizeGeneratorOptions(options), { seedText: "", lastSeed: options?.seed ?? null, error: "" });
      renderPanel();
    },
  };
}
