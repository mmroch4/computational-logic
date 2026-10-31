// Interativo da §2 (Aprender): conversor ao vivo entre as 3 notações de um conjunto de cláusulas.
// O aluno escreve em qualquer notação; vê o mesmo conjunto em compacta, conjuntos e lógica, o tipo de
// cada cláusula (unitária, vazia = F, tautologia) e os avisos de repetidos que colapsaram.
//
// renderNotationConverter e renderConverterOutput são puras (testadas em node); mountNotationConverter
// mexe no DOM. Ao escrever só se redesenha a parte de baixo (redesenhar o textarea perdia o cursor).
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { variableHtml } from "./formula-input.js";
import { parserErrorMessage, parserWarningMessage } from "./parser-messages.js";
import { parse, NOTATIONS } from "../core/parser.js";
import { formatNotations, clauseSetSummary } from "../core/notations.js";
import { lessonFigureHtml } from "./lesson-figure.js";

// Exemplos de FNC → conjunto (e uma tautologia) e os dois casos-limite da definição.
export const CONVERTER_EXAMPLES = [
  { id: "cnf", text: "¬p ∧ (q ∨ r ∨ q) ∧ (¬r ∨ ¬s) ∧ (p ∨ s) ∧ (¬q ∨ ¬s)" },
  { id: "tautology", text: "{p ∨ ¬q ∨ ¬p ∨ s}" },
  { id: "withF", text: "p1, -p1 -p2, F" },
  { id: "emptySet", text: "{}" },
];

const DEFAULT_CONVERTER_TEXT = CONVERTER_EXAMPLES[0].text;

const IDENTIFIER_RE = /[A-Za-z][A-Za-z0-9_]*/g;

/** Texto de uma notação em HTML, com o sufixo numérico das variáveis em <sub> (F fica F). */
export function notationHtml(text, { subscripts = true } = {}) {
  if (!subscripts) return escapeHtml(text);
  let html = "";
  let last = 0;
  for (const match of text.matchAll(IDENTIFIER_RE)) {
    html += escapeHtml(text.slice(last, match.index)) + variableHtml(match[0]);
    last = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(last));
}

function summaryHtml(summary) {
  const parts = [
    t(summary.clauses === 1 ? "learn.clauses.converter.oneClause" : "learn.clauses.converter.manyClauses", { n: summary.clauses }),
    t("learn.clauses.converter.units", { n: summary.unit }),
    t("learn.clauses.converter.empties", { n: summary.empty }),
    t("learn.clauses.converter.tautologies", { n: summary.tautology }),
  ];
  return parts.map((part) => `<span class="st">${escapeHtml(part)}</span>`).join("");
}

// Conclusão imediata nos dois casos que a definição resolve sem algoritmo.
function verdictHtml(clauses, summary) {
  if (clauses.length === 0) return `<p class="notation-converter__verdict">${escapeHtml(t("learn.clauses.converter.emptySetSat"))}</p>`;
  if (summary.empty > 0) return `<p class="notation-converter__verdict">${escapeHtml(t("learn.clauses.converter.hasFUnsat"))}</p>`;
  return "";
}

/** Parte de baixo do conversor (resultado do parse do texto escrito). */
export function renderConverterOutput(text) {
  if (text.trim() === "") return `<p class="notation-converter__hint">${escapeHtml(t("learn.clauses.converter.typeSomething"))}</p>`;
  const result = parse(text);
  if (!result.ok) {
    return msgHtml("error", escapeHtml(parserErrorMessage(result.error)), { classes: "field-error notation-converter__error" });
  }
  const texts = formatNotations(result.clauses);
  const summary = clauseSetSummary(result.clauses);
  const rows = NOTATIONS.map((notation) => {
    const value = texts[notation];
    const current = notation === result.notation;
    const shown =
      value === null
        ? `<span class="notation-converter__none">${escapeHtml(t("learn.clauses.converter.noWriting"))}</span>`
        : `<code class="notation-converter__text">${notationHtml(value, { subscripts: notation !== "compact" })}</code>`;
    const yours = current ? ` · ${escapeHtml(t("learn.clauses.converter.yours"))}` : "";
    return (
      `<div class="notation-converter__row${current ? " notation-converter__row--current" : ""}">` +
      `<dt>${escapeHtml(t(`parser.notations.${notation}`))}${yours}</dt><dd>${shown}</dd></div>`
    );
  }).join("");
  const warnings = result.warnings.length
    ? `<ul class="notation-converter__warnings">${result.warnings
        .map((w) => `<li>${escapeHtml(parserWarningMessage(w))}</li>`)
        .join("")}</ul>`
    : "";
  return (
    `<dl class="notation-converter__list">${rows}</dl>` +
    `<p class="notation-converter__summary">${summaryHtml(summary)}</p>` +
    verdictHtml(result.clauses, summary) +
    warnings
  );
}

/** HTML completo do interativo. */
export function renderNotationConverter({ text = DEFAULT_CONVERTER_TEXT } = {}) {
  const examples = CONVERTER_EXAMPLES.map(
    (example) =>
      `<button type="button" class="btn" data-variant="secondary" data-size="sm" data-example="${example.id}">` +
      `${escapeHtml(t(`learn.clauses.converter.examples.${example.id}`))}</button>`,
  ).join("");
  const body =
    `<div class="notation-converter__field">` +
    `<label class="field__label" for="notation-input">${escapeHtml(t("learn.clauses.converter.label"))}</label>` +
    `<div class="field-box"><textarea class="notation-converter__input" id="notation-input" rows="2" ` +
    `autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">${escapeHtml(text)}</textarea></div>` +
    `</div>` +
    `<div class="notation-converter__examples" role="group" aria-label="${escapeHtml(t("learn.clauses.converter.examplesLabel"))}">${examples}</div>` +
    `<div class="notation-converter__output" aria-live="polite">${renderConverterOutput(text)}</div>`;
  return lessonFigureHtml({ classes: "notation-converter", icon: "cycle", title: t("learn.clauses.converter.title"), body });
}

/** Monta o conversor em `container`. Devolve { refresh } para redesenhar ao mudar de idioma. */
export function mountNotationConverter(container, { text = DEFAULT_CONVERTER_TEXT } = {}) {
  if (!container) return { refresh() {} };
  let current = text;

  function update() {
    container.querySelector(".notation-converter__output").innerHTML = renderConverterOutput(current);
  }

  container.addEventListener("input", (event) => {
    if (!event.target.matches(".notation-converter__input")) return;
    current = event.target.value;
    update();
  });
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-example]");
    if (!button) return;
    const example = CONVERTER_EXAMPLES.find((e) => e.id === button.dataset.example);
    if (!example) return;
    current = example.text;
    container.querySelector(".notation-converter__input").value = current;
    update();
  });

  container.innerHTML = renderNotationConverter({ text: current });
  return { refresh: () => (container.innerHTML = renderNotationConverter({ text: current })) };
}
