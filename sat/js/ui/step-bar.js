// Barra do conjunto no Passo a passo: depois de escolhida a fórmula, substitui a caixa de entrada por
// um resumo do conjunto inicial, com Editar, o menu do algoritmo (DLL ou DP), o menu Exportar e o
// popover dos atalhos de teclado. No mobile, Editar e Exportar ficam só com o ícone.
//
// As funções *Html são puras (testadas em node); o comportamento dos menus vem do menu.js.
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { setHtml } from "./formula-input.js";
import { formatSet, variablesOf } from "../core/clauses.js";

const icon = (path, classes = "") =>
  `<svg${classes ? ` class="${classes}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
const PENCIL = '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>';
const EXPORT = '<path d="M12 15V4"/><path d="m8 8 4-4 4 4"/><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>';
const SHARE = '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>';
const ALGO = '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10"/><path d="M6 9c0 3 3 3 6 3h4"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const KEYBOARD = '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>';

/** Atalho da barra para uma tecla: a ação (`data-action`), "shortcuts" ou null. */
export function barKeyAction(key) {
  const actions = { l: "copy-link", p: "print-pdf", "?": "shortcuts" };
  return actions[key.toLowerCase()] ?? null;
}

// Opções do menu Exportar: [data-action, chave do texto, chave da explicação (só na folha), ícone, tecla].
// O Resolver usa o mesmo menu no cartão de resultado.
const EXPORT_ITEMS = [
  ["copy-link", "shareLink.copy", "stepBar.exportHint.link", '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>', "L"],
  ["copy-latex", "latexExport.copy", "stepBar.exportHint.latex", '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4V4h11v1"/>'],
  ["download-tex", "latexExport.download", null, '<path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M5 20h14"/>'],
  ["print-pdf", "printSheet.button", null, '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>', "P"],
];

/** Resumo do conjunto: «Conjunto inicial · 7 cláusulas, 4 variáveis» e o conjunto numa linha. */
export function setSummaryHtml(clauses) {
  const label = [t("stepBar.clauses", { n: clauses.length }), t("stepBar.variables", { n: variablesOf(clauses).length })].join(", ");
  return (
    `<p class="step-bar__label">${escapeHtml(t("stepBar.initial"))} · ${escapeHtml(label)}</p>` +
    `<p class="step-bar__set" title="${escapeHtml(formatSet(clauses))}">${setHtml(clauses)}</p>`
  );
}

/** Botão "Editar" (com `data-action="edit"`); no mobile, só o ícone. */
export function editButtonHtml() {
  return `<button type="button" class="btn max-md:w-11 max-md:px-0" data-variant="ghost" data-action="edit">${icon(PENCIL)}<span class="max-md:sr-only">${escapeHtml(t("stepBar.edit"))}</span></button>`;
}

/**
 * Menu do algoritmo: um botão só com o ícone (o nome do atual no aria-label e no title) que abre a
 * lista dos algoritmos, com o atual marcado (`aria-pressed` e um visto).
 */
export function algoMenuHtml(algorithms, current) {
  const label = escapeHtml(t("stepAlgo.current", { name: t(`stepAlgo.${current}`) }));
  const item = (id) =>
    `<button type="button" data-algo="${id}" aria-pressed="${id === current}">` +
    `<span class="flex-1">${escapeHtml(t(`stepAlgo.${id}`))}<span class="sub">${escapeHtml(t(`stepAlgo.desc.${id}`))}</span></span>` +
    `${id === current ? icon(CHECK) : ""}</button>`;
  return (
    `<details class="dd end step-menu--algo" data-sheet-title="${escapeHtml(t("stepAlgo.label"))}">` +
    `<summary class="btn" data-variant="ghost" data-size="icon" aria-label="${label}" title="${label}">${icon(ALGO)}</summary>` +
    `<div class="menu dd-panel"><p class="grp max-md:hidden">${escapeHtml(t("stepAlgo.label"))}</p>${algorithms.map(item).join("")}</div>` +
    `</details>`
  );
}

function exportItemHtml(action, label, hint, path, key, classes = "") {
  const sub = hint ? `<span class="sub">${escapeHtml(t(hint))}</span>` : "";
  const shortcut = key ? `<kbd class="menu-key max-md:hidden">${key}</kbd>` : "";
  return `<button type="button"${classes} data-action="${action}">${icon(path)}<span class="flex-1">${escapeHtml(t(label))}${sub}</span>${shortcut}</button>`;
}

/**
 * Menu "Exportar": link, LaTeX, .tex e PDF (os `data-action` são tratados pela página). Com
 * `canShare` (Web Share API), a folha do mobile acrescenta «Partilhar…». Com `step: false` (o cartão
 * do Resolver), saem as teclas e a dica do link, que falam do passo atual.
 */
export function exportMenuHtml({ canShare = false, step = true } = {}) {
  const items = EXPORT_ITEMS.map(([action, label, hint, path, key]) =>
    (action === "print-pdf" ? "<hr>" : "") +
    exportItemHtml(action, label, step || action !== "copy-link" ? hint : null, path, step ? key : null)).join("");
  const share = canShare
    ? `<hr class="md:hidden">` + exportItemHtml("share", "stepBar.share", "stepBar.exportHint.share", SHARE, null, ' class="md:hidden"')
    : "";
  return (
    `<details class="dd end">` +
    `<summary class="btn max-md:w-11 max-md:px-0" data-variant="ghost">${icon(EXPORT)}<span class="max-md:sr-only">${escapeHtml(t("stepBar.export"))}</span>${icon(CHEVRON, "max-md:hidden")}</summary>` +
    `<div class="menu dd-panel">${items}${share}</div>` +
    `</details>`
  );
}

/** Popover com os atalhos da timeline (ver keyAction em timeline.js). */
export function shortcutsMenuHtml() {
  const row = (keys, label) =>
    `<div class="step-keys__row"><dt>${keys.map((key) => `<kbd class="kbd-key">${escapeHtml(key)}</kbd>`).join(" ")}</dt><dd>${escapeHtml(t(label))}</dd></div>`;
  const label = escapeHtml(t("stepBar.shortcuts"));
  return (
    `<details class="dd end step-menu--keys">` +
    `<summary class="btn" data-variant="ghost" data-size="icon" aria-label="${label}" title="${label}">${icon(KEYBOARD)}</summary>` +
    `<div class="pop dd-panel w-[min(20rem,calc(100vw-2rem))] p-3"><p class="grp">${label}</p><dl class="step-keys">` +
    row(["←", "→"], "stepBar.keys.step") +
    row([t("stepBar.keys.space")], "stepBar.keys.play") +
    row(["Home", "End"], "stepBar.keys.ends") +
    row(["L"], "stepBar.keys.link") +
    row(["P"], "stepBar.keys.pdf") +
    row(["?"], "stepBar.keys.help") +
    `</dl></div></details>`
  );
}
