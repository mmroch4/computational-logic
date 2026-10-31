// Cartão do passo no topo do palco: chip do evento, «Passo 5 de 13 · ramo p», título grande
// («Propagar q») e uma frase que explica o passo. O mesmo texto vai para a região de estado da
// página, que é quem o anuncia aos leitores de ecrã (o cartão é redesenhado a cada passo).
//
// Como nos outros componentes, stepCardModel() e renderStepCard() são puras (testáveis em node);
// só mountStepCard() mexe no DOM.
import { complement } from "../core/literals.js";
import { callOf } from "../core/flowchart.js";
import { t, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { eventChipHtml, ruleOf } from "./events.js";
import { clauseHtml, literalHtml, variableHtml } from "./formula-input.js";
import { stepExplanationHtml as dllLimitHtml } from "./pseudocode-view.js";
import { stepExplanationHtml as dpLimitHtml } from "./dp-view.js";
import { truthLabel } from "./result-card.js";

// Cor do literal no título: classes por inteiro, para o Tailwind as encontrar.
const TITLE_CLASS = {
  unit: "text-ev-unit",
  branch: "text-ev-branch",
  backtrack: "text-ev-back",
  resolution: "text-ev-res",
};

/** A chave do texto do evento `e`; as ramificações distinguem o 1.º ramo do complementar. */
function eventKey(e, previous) {
  switch (e.type) {
    case "branch":
      return previous?.type === "backtrack" ? "branchSecond" : "branchFirst";
    case "resolve":
      return e.pairs.length ? "resolve" : "resolvePure";
    case "result":
      return e.sat === null ? "resultLimited" : e.sat ? "resultSat" : "resultUnsat";
    default:
      return e.type;
  }
}

/**
 * O que o cartão mostra no passo `index` do trace:
 *   { key, rule, index, last, algorithm, branch: [literais escolhidos até aqui], params }
 * Os params são dados (literais, cláusulas, números); a formatação é feita no render.
 */
export function stepCardModel(trace, index, algorithm = "dll") {
  const e = trace[index];
  if (!e) return null;
  const params = { n: e.S?.length ?? 0, steps: e.steps ?? null };
  if (e.type === "unit") {
    params.clause = e.before[e.clauseIndex];
    params.literal = e.literal;
  } else if (e.type === "branch") {
    params.literal = e.literal;
    params.failed = complement(e.literal);
  } else if (e.type === "backtrack") {
    params.literal = e.literal;
    params.failed = complement(e.literal);
  } else if (e.type === "resolve") {
    params.variable = e.variable;
  }
  // No resultado, o callOf volta à raiz: «satisfazível» é a resposta do ramo do passo anterior.
  const branchIndex = e.type === "result" && e.sat ? index - 1 : index;
  const branch = algorithm === "dll" ? callOf(trace, branchIndex).literals : [];
  return { key: eventKey(e, trace[index - 1]), rule: ruleOf(e), index, last: Math.max(trace.length - 1, 0), algorithm, branch, params };
}

const lit = (l) => `<span class="lit">${literalHtml(l)}</span>`;
const branchHtml = (literals) => literals.map(lit).join(" → ");

/** O título em HTML: o literal ou a variável do passo vão em mono, na cor do evento. */
function titleHtml({ key, rule, params }) {
  const cls = TITLE_CLASS[rule] ?? "";
  const mark = (html) => `<code class="step-card__mark ${cls}">${html}</code>`;
  return t(`stepCard.title.${key}`, {
    literal: params.literal && mark(literalHtml(params.literal)),
    variable: params.variable && mark(variableHtml(params.variable)),
  });
}

/** A frase do passo em HTML (os limites já têm texto nas explicações dos dois algoritmos). */
function textHtml(trace, { key, index, algorithm, branch, params }) {
  if (key === "limit") return algorithm === "dp" ? dpLimitHtml(trace, index) : dllLimitHtml(trace, index);
  const positive = params.variable && { v: params.variable, neg: false };
  return t(`stepCard.text.${key}${algorithm === "dp" && key === "start" ? "Dp" : ""}`, {
    n: params.n,
    clause: params.clause && `<span class="lit">{${clauseHtml(params.clause)}}</span>`,
    literal: params.literal && lit(params.literal),
    opposite: params.literal && lit(complement(params.literal)),
    failed: params.failed && lit(params.failed),
    variable: positive && lit(positive),
    negated: positive && lit(complement(positive)),
    branch: branch.length ? branchHtml(branch) : "",
  });
}

function chipHtml({ key, rule }) {
  if (rule === null) return "";
  return key === "resultUnsat" ? eventChipHtml(rule, t("stepCard.unsat")) : eventChipHtml(rule);
}

/** «Passo 5 de 13 · ramo p»; no DP, o ano em vez do ramo. No mobile, o contador fica só na timeline. */
function metaHtml({ index, last, algorithm, branch }) {
  const counter = escapeHtml(t("timeline.counter", { i: index, n: last }));
  const extra = algorithm === "dp"
    ? escapeHtml(t("stepAlgo.title.dp"))
    : branch.length ? `${escapeHtml(t("stepCard.branch"))} ${branchHtml(branch)}` : "";
  return `<span class="max-md:hidden">${counter}${extra ? " · " : ""}</span>${extra}`;
}

/** HTML do cartão para um modelo de stepCardModel(). */
export function renderStepCard(trace, model) {
  return (
    `<p class="step-card__meta">${chipHtml(model)}<span>${metaHtml(model)}</span></p>` +
    `<h2 class="step-card__title">${titleHtml(model)}</h2>` +
    `<p class="step-card__text">${textHtml(trace, model)}</p>`
  );
}

/** «Passo 5 de 13. Propagar q. …» em HTML, para a região de estado da página. */
export function stepAnnouncementHtml(trace, index, algorithm = "dll") {
  const model = stepCardModel(trace, index, algorithm);
  const counter = escapeHtml(t("timeline.counter", { i: index, n: Math.max(trace.length - 1, 0) }));
  return model ? `${counter}. ${titleHtml(model)}. ${textHtml(trace, model)}` : counter;
}

/** «Valoração até aqui»: uma pastilha por variável, com o valor que este passo trouxe realçado. */
export function renderValuation(entries) {
  const pill = ({ variable, value, isNew }) => {
    const name = variableHtml(variable);
    if (value === null) return `<li class="val val--free">${name} = ?</li>`;
    const letter = `<b${value ? "" : ' class="f"'}>${escapeHtml(truthLabel(value))}</b>`;
    const tag = isNew ? `<span class="val__new">${escapeHtml(t("stepCard.new"))}</span>` : "";
    return `<li class="val${isNew ? " new" : ""}">${name} = ${letter}${tag}</li>`;
  };
  return (
    `<section class="step-val" aria-labelledby="step-val-heading">` +
    `<h2 class="step-val__heading" id="step-val-heading">${escapeHtml(t("stepCard.valuation"))}</h2>` +
    `<ul class="val-list">${entries.map(pill).join("")}</ul></section>`
  );
}

/** Monta o cartão em `container`. Devolve { show(trace, index, algorithm) }. */
export function mountStepCard(container) {
  let current = null;

  function draw() {
    if (!current) return;
    const model = stepCardModel(current.trace, current.index, current.algorithm);
    container.innerHTML = model ? renderStepCard(current.trace, model) : "";
  }
  onLangChange(draw);

  return {
    show(trace, index, algorithm) {
      current = { trace, index, algorithm };
      draw();
    },
  };
}
