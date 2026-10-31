// Interativo da §1 (Aprender): slider com o nº de variáveis → 2ⁿ linhas da tabela de verdade,
// e uma tabela com alguns exemplos (variáveis, linhas e passos do DLL).
//
// renderSatExplorer e rowsSummaryHtml são puras (testadas em node); mountSatExplorer mexe no DOM.
// Ao arrastar o slider só se atualizam o texto, as barras e as linhas destacadas (redesenhar o <input>
// interrompia o arrasto).
import { t, getLang, pagePath } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { MIN_VARS, MAX_VARS, clampVars, truthTableRows, exampleCosts } from "../core/sat-cost.js";
import { encodeShare } from "../core/share.js";
import { lessonFigureHtml } from "./lesson-figure.js";

const DEFAULT_VARS = 10;

/** Número com separadores de milhares do idioma (pt-PT: 1 048 576; en: 1,048,576). */
export function formatCount(value, lang = getLang()) {
  return new Intl.NumberFormat(lang === "en" ? "en" : "pt-PT").format(value);
}

/** "10 variáveis → 2¹⁰ = 1024 linhas" (o expoente vai em <sup>). */
export function rowsSummaryHtml(n, lang = getLang()) {
  const vars = clampVars(n);
  return t("learn.sat.explorer.summary", {
    vars: escapeHtml(t(vars === 1 ? "learn.sat.explorer.var" : "learn.sat.explorer.vars", { n: vars })),
    power: `2<sup>${vars}</sup>`,
    rows: escapeHtml(formatCount(truthTableRows(vars), lang)),
  });
}

function costRowHtml(cost, n, lang) {
  const title = cost.example.title[lang] ?? cost.example.title.pt;
  const href = `${pagePath("step")}?${encodeShare(cost.clauses)}`;
  const match = cost.vars === n ? " sat-explorer__row--match" : "";
  return (
    `<tr class="sat-explorer__row${match}" data-vars="${cost.vars}">` +
    `<th scope="row"><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></th>` +
    `<td><button type="button" class="sat-explorer__vars" data-set-vars="${cost.vars}" ` +
    `aria-label="${escapeHtml(t("learn.sat.explorer.useVars", { n: cost.vars }))}">${cost.vars}</button></td>` +
    `<td>${escapeHtml(formatCount(cost.rows, lang))}</td>` +
    `<td>${cost.steps}</td></tr>`
  );
}

/**
 * Altura (px) da barra de n variáveis. A curva é ilustrativa: em 2ⁿ, quase todas as barras teriam
 * altura zero ao lado da última. Os números certos estão no texto.
 */
export function barHeight(n) {
  return Math.max(4, Math.round(80 * (n / MAX_VARS) ** 2.5));
}

function barsHtml(vars) {
  const bars = Array.from({ length: MAX_VARS }, (_, i) =>
    `<i class="sat-explorer__bar${i < vars ? " is-on" : ""}" style="height:${barHeight(i + 1)}px"></i>`
  );
  return `<div class="sat-explorer__bars" aria-hidden="true">${bars.join("")}</div>`;
}

/** HTML completo do interativo para n variáveis. `costs` = exampleCosts() (calculado uma vez). */
export function renderSatExplorer({ n = DEFAULT_VARS, costs = exampleCosts(), lang = getLang() } = {}) {
  const vars = clampVars(n);
  const rows = costs.map((cost) => costRowHtml(cost, vars, lang)).join("");
  const body =
    `<div class="sat-explorer__control">` +
    `<div class="sat-explorer__head">` +
    `<label class="sat-explorer__label" for="sat-vars">${escapeHtml(t("learn.sat.explorer.label"))}</label>` +
    `<p class="sat-explorer__summary" aria-live="polite">${rowsSummaryHtml(vars, lang)}</p>` +
    `</div>` +
    `<input class="sat-explorer__range" id="sat-vars" type="range" min="${MIN_VARS}" max="${MAX_VARS}" step="1" value="${vars}">` +
    `</div>` +
    barsHtml(vars) +
    `<div class="sat-explorer__table-wrap">` +
    `<table class="tbl sat-explorer__table">` +
    `<caption>${escapeHtml(t("learn.sat.explorer.caption"))}</caption>` +
    `<thead><tr><th scope="col">${escapeHtml(t("learn.sat.explorer.colExample"))}</th>` +
    `<th scope="col">${escapeHtml(t("learn.sat.explorer.colVars"))}</th>` +
    `<th scope="col">${t("learn.sat.explorer.colRows")}</th>` +
    `<th scope="col">${escapeHtml(t("learn.sat.explorer.colSteps"))}</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>` +
    `<p class="sat-explorer__note">${escapeHtml(t("learn.sat.explorer.note"))}</p>`;
  return lessonFigureHtml({ classes: "sat-explorer", icon: "tree", title: t("learn.sat.explorer.title"), body });
}

/** Monta o interativo em `container`. Devolve { refresh } para redesenhar ao mudar de idioma. */
export function mountSatExplorer(container, { n = DEFAULT_VARS } = {}) {
  if (!container) return { refresh() {} };
  const costs = exampleCosts();
  let vars = clampVars(n);

  function update() {
    container.querySelector(".sat-explorer__summary").innerHTML = rowsSummaryHtml(vars);
    container.querySelectorAll(".sat-explorer__bar").forEach((bar, i) => bar.classList.toggle("is-on", i < vars));
    container.querySelectorAll(".sat-explorer__row").forEach((row) => {
      row.classList.toggle("sat-explorer__row--match", Number(row.dataset.vars) === vars);
    });
  }

  function render() {
    container.innerHTML = renderSatExplorer({ n: vars, costs });
  }

  container.addEventListener("input", (event) => {
    if (!event.target.matches(".sat-explorer__range")) return;
    vars = clampVars(event.target.value);
    update();
  });
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-set-vars]");
    if (!button) return;
    vars = clampVars(button.dataset.setVars);
    container.querySelector(".sat-explorer__range").value = String(vars);
    update();
  });

  render();
  return { refresh: render };
}
