// Cartão de resultado do Resolver: o estado (satisfazível / insatisfazível) com cor + ícone + texto, a
// valoração em tabela, as estatísticas do DLL na cor dos eventos, os avisos do parser e as ações. A
// verificação fica recolhida: cada cláusula original aparece com os literais verdadeiros destacados
// (é isso que mostra porque é que a valoração funciona).
//
// Como no formula-input.js, as funções render*() e verificationRows() são puras (testáveis em node);
// só mountResultCard() mexe no DOM.
import { variablesOf } from "../core/clauses.js";
import { evaluate } from "../core/verify.js";
import { encodeShare } from "../core/share.js";
import { t, getLang, onLangChange, pagePath } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { variableHtml, literalHtml, warningHtml } from "./formula-input.js";
import { eventIconHtml } from "./events.js";
import { mountBarMenus } from "./menu.js";
import { exportMenuHtml } from "./step-bar.js";

/** Valor de verdade: V/F em PT, T/F em EN. */
export function truthLabel(value) {
  return t(value ? "resultCard.true" : "resultCard.false");
}

/**
 * A valoração completa sobre as variáveis de S, por ordem alfabética natural:
 * [{ v, value }] com value = true/false, ou null se o DLL não a fixou (pode ter qualquer valor).
 */
export function valuationEntries(clauses, assignment) {
  return variablesOf(clauses).map((v) => ({ v, value: assignment && v in assignment ? assignment[v] : null }));
}

/**
 * Uma linha por cláusula original: { clause, trueLiterals: [índices dos literais verdadeiros], value }.
 * value = true se algum literal é verdadeiro na valoração (a cláusula fica satisfeita).
 */
export function verificationRows(clauses, assignment) {
  return clauses.map((clause) => {
    const trueLiterals = [];
    clause.forEach((l, i) => {
      if (l.v in assignment && assignment[l.v] === !l.neg) trueLiterals.push(i);
    });
    return { clause, trueLiterals, value: trueLiterals.length > 0 };
  });
}

// Classes por evento, escritas por inteiro para o Tailwind e o CSS as encontrarem.
const STAT_CLASSES = { unit: "ev-unit", branch: "ev-branch", conflict: "ev-conflict", sat: "ev-sat", resolution: "ev-res" };

// Um número grande e o rótulo por baixo; o leitor de ecrã ouve a frase inteira («6 propagações»).
function statHtml({ text, n, label, rule }) {
  const classes = rule ? `result-stat ${STAT_CLASSES[rule]}` : "result-stat result-stat--plain";
  const icon = rule ? eventIconHtml(rule) : "";
  return (
    `<li class="${classes}"><span class="sr-only">${escapeHtml(text)}</span>` +
    `<span class="result-stat__body" aria-hidden="true"><b class="result-stat__n">${n}</b>` +
    `<span class="result-stat__label">${icon}${escapeHtml(label)}</span></span></li>`
  );
}

function statsHtml(stats, algorithm = "dll") {
  const stat = (key, n, rule) => ({
    text: t(key === "eliminations" || key === "resolvents" || key === "maxSize" ? `resultCard.dp.stats.${key}` : `resultCard.stats.${key}`, { n }),
    label: t(`resultCard.statLabels.${key}`, { n }),
    n,
    rule,
  });
  const items = algorithm === "dp"
    ? [
        stat("units", stats.units, "unit"),
        stat("eliminations", stats.eliminations, "resolution"),
        stat("resolvents", stats.resolvents, "resolution"),
        stat("maxSize", stats.maxSize, null),
      ]
    : [
        stat("units", stats.units, "unit"),
        stat("branches", stats.branches, "branch"),
        stat("conflicts", stats.conflicts, "conflict"),
      ];
  const size = algorithm === "dp" ? " result-stats--4" : "";
  return `<ul class="result-stats list-none${size}">${items.map(statHtml).join("")}</ul>`;
}

/** Tempo do DLL com a vírgula do idioma; o relógio do browser não mede abaixo de 0,1 ms. */
export function elapsedLabel(ms) {
  const locale = getLang() === "pt" ? "pt-PT" : "en-GB";
  const format = (value) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return ms < 0.1 ? `< ${format(0.1)} ms` : `${format(ms)} ms`;
}

/** «7 cláusulas · 4 variáveis · 0,1 ms»; o tempo só existe quando a página o mediu. */
function metaText(clauses, elapsedMs) {
  const parts = [
    t("resultCard.meta.clauses", { n: clauses.length }),
    t("resultCard.meta.variables", { n: variablesOf(clauses).length }),
  ];
  if (typeof elapsedMs === "number") parts.push(elapsedLabel(elapsedMs));
  return parts.join(" · ");
}

function headHtml(rule, mark, status, sub) {
  const classes = rule ? `result-card__icon ${STAT_CLASSES[rule]}` : "result-card__icon result-card__icon--plain";
  return (
    `<div class="result-card__head"><span class="${classes}" aria-hidden="true">${mark}</span>` +
    `<div class="min-w-0"><h2 class="result-card__status">${escapeHtml(status)}</h2>` +
    `<p class="result-card__meta">${escapeHtml(sub)}</p></div></div>`
  );
}

/** Uma variável da valoração (`.val`): a letra e a cor dizem o valor; sem valor, «qualquer». */
export function valHtml({ v, value }) {
  if (value === null) return `<li class="val val--free">${variableHtml(v)} = ${escapeHtml(t("resultCard.any"))}</li>`;
  return `<li class="val">${variableHtml(v)} = <b${value ? "" : ' class="f"'}>${escapeHtml(truthLabel(value))}</b></li>`;
}

function valuationCellHtml({ value }) {
  if (value === null) return `<td class="result-valuation__free">${escapeHtml(t("resultCard.any"))}</td>`;
  return `<td class="tv ${value ? "v" : "f"}">${escapeHtml(truthLabel(value))}</td>`;
}

function valuationHtml(entries) {
  const heads = entries.map(({ v }) => `<th scope="col">${variableHtml(v)}</th>`).join("");
  const hasFree = entries.some((e) => e.value === null);
  const freeNote = hasFree ? `<p class="result-card__hint">${escapeHtml(t("resultCard.freeNote"))}</p>` : "";
  return `
    <section class="result-card__section" aria-labelledby="result-valuation">
      <h3 class="result-card__heading" id="result-valuation">${escapeHtml(t("resultCard.valuation"))}</h3>
      <div class="result-valuation" tabindex="0" role="region" aria-labelledby="result-valuation">
        <table class="tbl">
          <thead><tr>${heads}</tr></thead>
          <tbody><tr>${entries.map(valuationCellHtml).join("")}</tr></tbody>
        </table>
      </div>
      ${freeNote}
    </section>`;
}

// Cláusula com os literais verdadeiros destacados (a cláusula vazia é F).
function clauseWithTruthHtml({ clause, trueLiterals }) {
  if (clause.length === 0) return "F";
  return clause
    .map((l, i) =>
      trueLiterals.includes(i) ? `<mark class="lit lit--true">${literalHtml(l)}</mark>` : `<span class="lit">${literalHtml(l)}</span>`,
    )
    .join(" ∨ ");
}

/** Verificação recolhida: o resumo diz que bate certo e abre a tabela cláusula a cláusula. */
function verificationHtml(rows, verified, count) {
  const body = rows
    .map(
      (row, i) => `
        <tr>
          <th scope="row">${i + 1}</th>
          <td class="result-table__clause">${clauseWithTruthHtml(row)}</td>
          <td class="tv ${row.value ? "v" : "f"}">${escapeHtml(truthLabel(row.value))}</td>
        </tr>`,
    )
    .join("");
  const summary = verified
    ? `<span class="result-card__verified"><span aria-hidden="true">✓</span> ${escapeHtml(t("resultCard.verified", { n: count }))}</span>`
    : `<span>${escapeHtml(t("resultCard.check"))}</span>`;
  return `
    <details class="result-check">
      <summary>${summary}<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg></summary>
      <p class="result-card__hint">${escapeHtml(t("resultCard.checkHint"))}</p>
      <div class="result-table-wrap">
        <table class="tbl result-table">
          <thead><tr>
            <th scope="col">${escapeHtml(t("resultCard.colNumber"))}</th>
            <th scope="col">${escapeHtml(t("resultCard.colClause"))}</th>
            <th scope="col">${escapeHtml(t("resultCard.colValue"))}</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </details>`;
}

/** Link para a página Passo a passo com o mesmo conjunto (`/passo-a-passo?f=…&a=dll`). */
export function stepByStepHref(clauses) {
  return `${pagePath("step")}?${encodeShare(clauses)}`;
}

/**
 * Ações no fim do cartão: "Ver passo a passo" é um link (abre a M3 com a fórmula) e o menu Exportar é
 * o mesmo do Passo a passo, com os `data-action` tratados por mountResultCard.
 * Na própria página Passo a passo o link não faz sentido (`stepLink: false`).
 * Com `actions: false` não há ações (o Passo a passo já tem Editar e Exportar na barra).
 */
function actionsHtml(clauses, { stepLink = true, actions = true, canShare = false } = {}) {
  if (!actions) return "";
  const arrow = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const step = stepLink
    ? `<a class="btn" href="${escapeHtml(stepByStepHref(clauses))}">${escapeHtml(t("resultCard.actions.step"))}${arrow}</a>`
    : "";
  return `
      <div class="result-card__actions">
        ${step}
        ${exportMenuHtml({ canShare, step: false })}
      </div>`;
}

/**
 * HTML do cartão para o conjunto `clauses` (já normalizado pelo parser) e o `result` de solveDLL.
 * Satisfazível: estado, valoração, verificação e estatísticas.
 * Insatisfazível: estado com a explicação e estatísticas.
 * Limite de passos atingido (sat: null): estado neutro e explicação.
 * `options.stepLink` (por omissão true) mostra o botão "Ver passo a passo";
 * `options.actions` (por omissão true) mostra as ações no fim do cartão;
 * `options.canShare` acrescenta «Partilhar…» ao menu Exportar;
 * `options.algorithm` = "dp" para um `result` de solveDP (outras frases e estatísticas);
 * `options.warnings` são os avisos do parser, se a página os quiser no cartão;
 * `options.elapsedMs` é o tempo do DLL, que a página mede.
 */
export function renderResultCard(clauses, result, options = {}) {
  const dp = options.algorithm === "dp";
  // As frases do DP ficam em resultCard.dp.*; as restantes são as mesmas para os dois algoritmos.
  const text = (key) => t(dp ? `resultCard.dp.${key}` : `resultCard.${key}`);
  const stats = statsHtml(result.stats, options.algorithm);
  const warnings = options.warnings?.length
    ? `<ul class="result-card__warnings list-none">${options.warnings.map((w) => warningHtml(w, { tag: "li" })).join("")}</ul>`
    : "";
  const actions = actionsHtml(clauses, options);

  if (result.sat === null) {
    return `
      <section class="result-card">
        ${headHtml(null, "…", text("limited"), text("limitedLead"))}
        ${stats}
        ${warnings}
        ${actions}
      </section>`;
  }

  if (!result.sat) {
    return `
      <section class="result-card rule-conflict">
        ${headHtml("conflict", "✕", t("resultCard.unsat"), text("unsatLead"))}
        ${stats}
        ${warnings}
        ${actions}
      </section>`;
  }

  const rows = verificationRows(clauses, result.assignment);
  // A tabela verifica a valoração de forma independente do DLL: todas as cláusulas têm de dar V.
  const verified = evaluate(clauses, result.assignment) === true;
  // O DLL diz tudo no estado e na valoração; o conjunto vazio e o DP precisam da frase.
  const lead = clauses.length === 0 ? t("resultCard.satEmptyLead") : dp ? text("satLead") : "";
  return `
    <section class="result-card rule-sat">
      ${headHtml("sat", "✓", t("resultCard.sat"), metaText(clauses, options.elapsedMs))}
      ${lead ? `<p class="result-card__lead">${escapeHtml(lead)}</p>` : ""}
      ${clauses.length ? valuationHtml(valuationEntries(clauses, result.assignment)) : ""}
      ${clauses.length ? verificationHtml(rows, verified, clauses.length) : ""}
      ${stats}
      ${warnings}
      ${actions}
    </section>`;
}

/**
 * Texto curto que o leitor de ecrã anuncia quando aparece um resultado: o estado e a frase de baixo
 * ("Satisfazível. O DLL chegou ao conjunto vazio: …"). O cartão inteiro seria demasiado para ouvir.
 */
export function resultAnnouncement(clauses, result, { algorithm = "dll" } = {}) {
  const text = (key) => t(algorithm === "dp" ? `resultCard.dp.${key}` : `resultCard.${key}`);
  if (result.sat === null) return `${text("limited")}. ${text("limitedLead")}`;
  if (!result.sat) return `${t("resultCard.unsat")}. ${text("unsatLead")}`;
  const lead = clauses.length === 0 ? t("resultCard.satEmptyLead") : text("satLead");
  return `${t("resultCard.sat")}. ${lead}`;
}

/** Aviso por cima de um resultado que já não corresponde à fórmula escrita no input. */
export function staleNoteHtml() {
  return msgHtml("info", escapeHtml(t("resultCard.stale")), { classes: "result-stale-note" });
}

/**
 * Monta o cartão dentro de `container` (começa vazio e escondido).
 * `onExport(action, clauses)` responde ao menu Exportar (action = "copy-link", "copy-latex",
 * "download-tex", "print-pdf" ou "share").
 * Devolve { show(clauses, result, { algorithm, warnings, elapsedMs }), clear(), setStale(stale) }. Redesenha ao mudar de idioma.
 * `setStale(true)` marca o resultado como desatualizado (a fórmula no input mudou desde que foi resolvida).
 * `stepLink: false` esconde o botão "Ver passo a passo"; `actions: false` esconde todas as ações.
 */
export function mountResultCard(container, { onExport, stepLink = true, actions = true, announce = true } = {}) {
  let current = null;
  let stale = false;
  // Região role="status" fixa, ao lado do cartão: um contentor que aparece (hidden → visível) e é
  // redesenhado nem sempre é anunciado, por isso o anúncio vive num nó que existe desde o início.
  // O Passo a passo desliga-a (announce: false), porque lá o estado de cada passo já é anunciado.
  let status = null;
  mountBarMenus(container);
  if (announce) {
    status = document.createElement("p");
    status.className = "sr-only";
    status.setAttribute("role", "status");
    container.after(status);
  }

  // Um só listener no contentor: o HTML do cartão é redesenhado a cada resultado.
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !current) return;
    onExport?.(button.dataset.action, current.clauses);
  });

  function draw() {
    container.hidden = current === null;
    container.classList.toggle("is-stale", current !== null && stale);
    container.innerHTML = current ? (stale ? staleNoteHtml() : "") + renderResultCard(current.clauses, current.result, { ...current.options, stepLink, actions, canShare: "share" in navigator }) : "";
  }

  onLangChange(draw);
  draw();

  return {
    show(clauses, result, options = {}) {
      const { algorithm = "dll" } = options;
      current = { clauses, result, options: { ...options, algorithm } };
      stale = false;
      draw();
      if (status) status.textContent = resultAnnouncement(clauses, result, { algorithm });
    },
    clear() {
      current = null;
      stale = false;
      draw();
      if (status) status.textContent = "";
    },
    setStale(value) {
      if (stale === Boolean(value)) return;
      stale = Boolean(value);
      draw();
    },
  };
}
