// Vista de Fitch, só de leitura: número, estado, barras de escopo, fórmula, regra e citações.
// O número e o estado ficam presos à esquerda, para se verem com a prova deslocada na horizontal.
//
// As funções exportadas à parte são puras (testáveis em node); só mountFitchView() mexe no DOM.
import { format } from "../core/formula.js";
import { ruleLabel } from "../core/rules.js";
import { speakFormula, speakJustification, speakProse } from "../core/speech.js";
import { LOCALES, getLang, onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";

export { lineStates } from "../core/verify.js";

const svg = (path) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;

const STATE_ICONS = {
  ok: svg('<path d="m5 12 5 5 9-10"/>'),
  error: svg('<path d="M12 4 2.5 20h19z"/><path d="M12 10v5M12 17.5v.01"/>'),
  pending: svg('<circle cx="12" cy="12" r="8"/>'),
};

const citationText = (citation) => (
  citation.kind === "line" ? String(citation.line) : `${citation.from}–${citation.to}`
);

/** Justificação da linha, no formato do `proof-text`: `→E, 2, 1`. Sem regra, fica vazia. */
export function justificationText({ kind, rule, citations }) {
  if (kind === "premise") return t("proofText.premise");
  if (kind === "hypothesis") return t("proofText.hypothesis");
  if (rule === null) return "";
  const label = ruleLabel(rule, LOCALES[getLang()].rules.labels);
  return [label, ...citations.map(citationText)].join(", ");
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const SUBSCRIPTS = /[₀-₉]+/g;

/** Fórmula escapada, com subscritos em <sub>: ao copiar, `p₁₁` dá `p11`, que o parser lê. */
export function formulaHtml(formula) {
  if (formula === null) return "?";
  return escapeHtml(format(formula)).replace(SUBSCRIPTS, (digits) => {
    const plain = [...digits].map((digit) => SUBSCRIPT_DIGITS.indexOf(digit)).join("");
    return `<sub>${plain}</sub>`;
  });
}

export function barsHtml({ kind, depth }) {
  const bars = Array.from({ length: depth + 1 }, (_, index) => {
    const opens = kind === "hypothesis" && index === depth;
    return `<span class="${opens ? "fitch__bar fitch__bar--open" : "fitch__bar"}"></span>`;
  });
  return `<span class="fitch__bars" aria-hidden="true">${bars.join("")}</span>`;
}

const speechWords = () => LOCALES[getLang()].speech;

/** A fórmula em palavras; a linha por preencher também se tem de ouvir. */
export function spokenFormula(formula) {
  return formula === null ? t("fitch.emptyFormula") : speakFormula(format(formula), speechWords());
}

/** Uma frase com símbolos, em palavras. */
export const spokenProse = (text) => speakProse(text, speechWords());

/**
 * `html` visível, lido como `spoken`. É um nome e não texto escondido, porque este ao selecionar seria
 * copiado com a fórmula.
 */
export const readAsHtml = (html, spoken) => `<span role="img" aria-label="${escapeHtml(spoken)}">${html}</span>`;

export const formulaReadHtml = (formula) => readAsHtml(formulaHtml(formula), spokenFormula(formula));

/** A coluna da justificação; sem texto, fica vazia, porque um nome vazio não se lê. */
export function whyHtml(text) {
  if (text === "") return '<span class="fitch__why"></span>';
  return `<span class="fitch__why">${readAsHtml(escapeHtml(text), speakJustification(text, speechWords()))}</span>`;
}

/** O ícone do estado, com o texto para leitores de ecrã. */
export const stateHtml = (state) => (
  `<span class="fitch__state">${STATE_ICONS[state]}<span class="sr-only">${escapeHtml(t(`fitch.states.${state}`))}</span></span>`
);

/** O texto do nível da subdedução, para leitores de ecrã. */
export const depthHtml = ({ depth }) => (
  depth > 0 ? `<span class="sr-only">${escapeHtml(t("fitch.depth", { depth }))}</span>` : ""
);

/** Se a linha leva o traço horizontal por baixo: cada hipótese e a última premissa. */
export const closesAssumptions = (lines, index) => (
  lines[index].kind === "hypothesis" || (lines[index].kind === "premise" && lines[index + 1]?.kind !== "premise")
);

/** O número da linha; com `pick`, é um botão que escolhe a linha. */
function numberHtml(number, pick) {
  if (!pick) return `<span class="fitch__number">${number}</span>`;
  return `<button type="button" class="fitch__number fitch__pick" aria-label="${escapeHtml(pick.label(number))}"`
    + `${pick.isDisabled(number) ? " disabled" : ""}>${number}</button>`;
}

/** Uma linha só de leitura; o editor usa-a nas premissas. */
export function lineHtml(line, index, { state, assumption, pick = null }) {
  const number = index + 1;
  const formulaClasses = assumption ? "fitch__formula fitch__formula--assumption" : "fitch__formula";
  const attrs = state ? ` data-state="${state}"` : "";
  return `<li class="fitch__line" data-line="${number}"${attrs}>`
    + `<span class="fitch__gutter">${numberHtml(number, pick)}${state ? stateHtml(state) : ""}</span>`
    + `<span class="fitch__body">${barsHtml(line)}${depthHtml(line)}<span class="${formulaClasses}">${formulaReadHtml(line.formula)}</span></span>`
    + whyHtml(justificationText(line))
    + "</li>";
}

/**
 * HTML da prova. `states` é opcional, de `lineStates`: sem ele, não se mostra estado nenhum (uma prova
 * já verificada, numa lição). O traço horizontal fica por baixo de cada hipótese e da última premissa.
 * `pick` é opcional, `{ label(n), isDisabled(n) }`: torna cada número num botão, para apontar a linha.
 */
export function fitchHtml(proof, { states = null, pick = null } = {}) {
  const { lines } = proof;
  if (lines.length === 0) return `<p class="fitch-empty">${escapeHtml(t("verify.conclusion.emptyProof"))}</p>`;
  const items = lines.map((line, index) => lineHtml(line, index, {
    state: states?.[index] ?? null,
    assumption: closesAssumptions(lines, index),
    pick,
  }));
  // tabindex: quem usa só o teclado também tem de conseguir deslocar uma prova larga.
  const classes = pick ? "fitch fitch--pick" : "fitch";
  return `<div class="${classes}" tabindex="0" role="group" aria-label="${escapeHtml(t("fitch.label"))}">`
    + `<ol class="fitch__lines" role="list">${items.join("")}</ol></div>`;
}

/**
 * Monta a vista em `container`, com a prova `proof` e os estados `states`.
 * Devolve { update(proof, states) }; a posição do scroll mantém-se entre atualizações.
 */
export function mountFitchView(container, { proof, states = null }) {
  let current = { proof, states };

  function paint() {
    const left = container.querySelector(".fitch")?.scrollLeft ?? 0;
    container.innerHTML = fitchHtml(current.proof, { states: current.states });
    const scroller = container.querySelector(".fitch");
    if (scroller) scroller.scrollLeft = left;
  }

  paint();
  onLangChange(paint);

  return {
    update(nextProof, nextStates = null) {
      current = { proof: nextProof, states: nextStates };
      paint();
    },
  };
}
