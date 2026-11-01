// Vista do DP original (1960) no Passo a passo. O DP não ramifica, por isso não há árvore: a vista
// principal é a sequência de conjuntos (como a vista de prova do DLL), e ao lado o pseudocódigo do
// DP com a linha do passo atual, a explicação e, numa eliminação, os pares resolvidos:
//   (1) S
//   (2) propagação de l: S′
//   (3) eliminação de x por resolução: S″     ← pares (x ∨ C) · (¬x ∨ D) → C ∨ D
//       S contém F ⇒ insatisfazível
//
// Como nos outros componentes, dpSequenceModel(), dpStepModel() e renderDp() são puras
// (testáveis em node); só mountDpView() mexe no DOM.
import { compareVariables, complement, formatLiteral } from "../core/literals.js";
import { repeatedPairs } from "../core/resolution.js";
import { t, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { clauseHtml, literalHtml, setHtml, variableHtml } from "./formula-input.js";
import { codeLinesHtml } from "./pseudocode-view.js";
import { currentLinesBox, glideHighlight } from "./code-glide.js";
import { truthLabel } from "./result-card.js";
import { eventChipHtml } from "./events.js";

const formatVariable = (v) => formatLiteral({ v, neg: false });

/** As linhas do pseudocódigo do DP (o mesmo de js/core/dp.js), com a indentação de cada uma. */
const DP_LINES = [
  { id: "call", indent: 0 },
  { id: "loop", indent: 1 },
  { id: "ifEmpty", indent: 2 },
  { id: "ifFalse", indent: 2 },
  { id: "ifUnit", indent: 2 },
  { id: "else", indent: 2 },
];

/** Cor da regra de cada evento do DP (as mesmas classes .rule-* do resto da página). */
const RULE_OF = { unit: "unit", resolve: "resolution", conflict: "conflict", sat: "sat" };

/** Linha do pseudocódigo de cada evento (limit: nenhuma; result: a do return, no dpStepModel). */
const LINE_OF = { start: "call", unit: "ifUnit", resolve: "else", sat: "ifEmpty", conflict: "ifFalse" };

/**
 * A sequência de conjuntos no passo `index` do trace do DP:
 *   { current, steps: [{ n, kind, index, S?, literal?, variable?, assignment?, limit?, sat?, rule, state }] }
 * n = número do conjunto (só start, unit e resolve mostram um conjunto novo); state ∈ done|current|future.
 */
export function dpSequenceModel(trace, index) {
  const steps = [];
  let n = 0;
  trace.forEach((e, i) => {
    const step = { n: null, kind: e.type, index: i, rule: RULE_OF[e.type] ?? null };
    if (e.type === "start") steps.push({ ...step, n: ++n, S: e.S });
    else if (e.type === "unit") steps.push({ ...step, n: ++n, S: e.after, literal: e.literal });
    else if (e.type === "resolve") steps.push({ ...step, n: ++n, S: e.after, variable: e.variable });
    else if (e.type === "sat") steps.push({ ...step, assignment: e.assignment });
    else if (e.type === "conflict") steps.push(step);
    else if (e.type === "limit") steps.push({ ...step, limit: e });
    else if (e.type === "result") steps.push({ ...step, sat: e.sat });
  });

  let current = -1;
  steps.forEach((s, i) => {
    if (s.index <= index) current = i;
  });
  return {
    current,
    steps: steps.map((s, i) => ({ ...s, state: i < current ? "done" : i === current ? "current" : "future" })),
  };
}

/**
 * O painel do algoritmo no passo `index`:
 *   { type, rule, lines: [id da linha realçada], explanation: { key, params } | null, resolve: evento | null }
 * Numa eliminação, `resolve` é o próprio evento (before, positive, negative, dropped, pairs, after),
 * para mostrar os pares resolvidos.
 */
export function dpStepModel(trace, index) {
  const e = trace[index];
  if (!e) return { type: null, rule: null, lines: [], explanation: null, resolve: null };
  const base = { type: e.type, rule: RULE_OF[e.type] ?? null, lines: LINE_OF[e.type] ? [LINE_OF[e.type]] : [], resolve: null };

  switch (e.type) {
    case "start":
      return { ...base, explanation: { key: "start", params: { n: e.S.length } } };
    case "unit":
      return { ...base, explanation: { key: "unit", params: { clause: e.before[e.clauseIndex], literal: e.literal } } };
    case "resolve": {
      const dropped = new Set(e.dropped);
      const params = {
        variable: e.variable,
        k: e.positive.filter((i) => !dropped.has(i)).length,
        m: e.negative.filter((i) => !dropped.has(i)).length,
        pairs: e.pairs.length,
        tautologies: e.pairs.filter((p) => p.tautology).length,
        before: e.before.length,
        after: e.after.length,
      };
      return { ...base, explanation: { key: e.pairs.length ? "resolve" : "resolvePure", params }, resolve: e };
    }
    case "sat":
      return { ...base, explanation: { key: "sat", params: {} } };
    case "conflict":
      return { ...base, explanation: { key: "conflict", params: {} } };
    case "limit":
      return { ...base, explanation: { key: "limit", params: e } };
    case "result": {
      if (e.sat === null) return { ...base, explanation: { key: "resultLimited", params: {} } };
      return {
        ...base,
        rule: e.sat ? "sat" : "conflict",
        lines: [e.sat ? "ifEmpty" : "ifFalse"],
        returns: true,
        explanation: { key: e.sat ? "resultSat" : "resultUnsat", params: {} },
      };
    }
    default:
      return { ...base, explanation: null };
  }
}

const lit = (l) => `<span class="lit">${literalHtml(l)}</span>`;
const variable = (v) => `<span class="lit">${variableHtml(v)}</span>`;
const clauseSpan = (c) => `<span class="lit">${clauseHtml(c)}</span>`;

/** A valoração reconstruída pelo DP, por ordem alfabética: "p = F, q = V". */
function assignmentHtml(assignment) {
  const vars = Object.keys(assignment ?? {}).sort(compareVariables);
  return vars.map((v) => `${variableHtml(v)} = ${escapeHtml(truthLabel(assignment[v]))}`).join(", ");
}

/** Explicação em HTML: literais, variáveis e cláusulas formatados (¬, ∨, subscritos). */
function explanationHtml({ key, params }) {
  if (key === "limit") {
    return t(params.code, { variable: params.variable ? variable(params.variable) : "", size: params.size, max: params.max });
  }
  const html = {
    ...params,
    variable: params.variable && variable(params.variable),
    literal: params.literal && lit(params.literal),
    opposite: params.literal && lit(complement(params.literal)),
    clause: params.clause && `<span class="pseudocode__clause">{${clauseHtml(params.clause)}}</span>`,
  };
  return t(`dp.explain.${key}`, html);
}

/** Os pares resolvidos de uma eliminação e as cláusulas com x e ¬x que saem sem resolventes. */
function pairsHtml(e) {
  const x = variable(e.variable);
  const notX = lit({ v: e.variable, neg: true });
  const dropped = new Set(e.dropped);
  const count = (indices) => indices.filter((i) => !dropped.has(i)).length;
  const repeated = repeatedPairs(e.pairs, e.kept.map((i) => e.before[i]));
  const rows = e.pairs.map((pair, index) => {
    const isRepeated = repeated.has(index);
    const result = pair.tautology || isRepeated ? clauseSpan(pair.resolvent) : `<strong>${clauseSpan(pair.resolvent)}</strong>`;
    const label = pair.tautology ? "dp.pairs.tautology" : isRepeated ? "dp.pairs.repeated" : null;
    const tag = label ? ` <span class="resolution-pair__tag">${escapeHtml(t(label))}</span>` : "";
    const cls = pair.tautology ? " resolution-pair--dropped" : isRepeated ? " resolution-pair--repeated" : "";
    return `<tr class="resolution-pair${cls}"><td>${clauseSpan(e.before[pair.positive])}</td>` +
      `<td>${clauseSpan(e.before[pair.negative])}</td><td>${result}${tag}</td></tr>`;
  });
  const table = rows.length
    ? `<p class="dp-pairs__heading">${t("dp.pairs.heading", { variable: x, k: count(e.positive), m: count(e.negative), n: e.pairs.length })}</p>` +
      `<table class="tbl dp-pairs__table"><thead><tr><th scope="col">${t("dp.pairs.with", { literal: x })}</th>` +
      `<th scope="col">${t("dp.pairs.with", { literal: notX })}</th><th scope="col">${escapeHtml(t("dp.pairs.resolvent"))}</th></tr></thead>` +
      `<tbody>${rows.join("")}</tbody></table>`
    : "";
  const note = e.dropped.length
    ? `<p class="dp-pairs__note">${t("dp.pairs.dropped", { variable: x, clauses: e.dropped.map((i) => clauseSpan(e.before[i])).join(", ") })}</p>`
    : "";
  return table || note ? `<div class="dp-pairs">${table}${note}</div>` : "";
}

/** O texto de cada passo da sequência (já em HTML). */
function labelHtml(step) {
  switch (step.kind) {
    case "start":
      return escapeHtml(t("dp.seq.start"));
    case "unit":
      return t("dp.seq.unit", { literal: lit(step.literal) });
    case "resolve":
      return t("dp.seq.resolve", { variable: variable(step.variable) });
    case "conflict":
      return escapeHtml(t("dp.seq.conflict"));
    case "sat": {
      const valuation = assignmentHtml(step.assignment);
      return escapeHtml(t("dp.seq.sat")) + (valuation ? ` <span class="proof__valuation">(${valuation})</span>` : "");
    }
    case "limit":
      return escapeHtml(t("dp.seq.limit"));
    case "result":
      return escapeHtml(t(step.sat === null ? "dp.seq.resultLimited" : step.sat ? "dp.seq.resultSat" : "dp.seq.resultUnsat"));
    default:
      return "";
  }
}

/** Um passo da sequência; `extra` = HTML a seguir ao botão (na folha de impressão, os pares). */
function sequenceStepHtml(step, extra = "") {
  const rule = step.rule ? ` rule-${step.rule}` : "";
  const tag = step.kind === "unit"
    ? eventChipHtml("unit", formatLiteral(step.literal))
    : step.kind === "resolve" ? eventChipHtml("resolution", t("dp.seq.tag", { variable: formatVariable(step.variable) })) : "";
  const cls = `proof__step proof__step--${step.kind} is-${step.state}${rule}`;
  const current = step.state === "current" ? ` aria-current="step"` : "";
  const set = step.S ? `<span class="proof__set">${setHtml(step.S)}</span>` : "";
  const num = step.n !== null ? `<span class="proof__num">(${step.n})</span>` : "";
  return `
    <li class="proof__item">
      <button type="button" class="${cls}" data-step="${step.index}"${current}>
        ${num}
        <span class="proof__body">
          <span class="proof__label">${labelHtml(step)}</span>
          ${set}
        </span>
        ${tag ? `<span class="proof__tag">${tag}</span>` : ""}
      </button>${extra}
    </li>`;
}

/** O painel do algoritmo: pseudocódigo do DP, explicação e (numa eliminação) os pares resolvidos. */
function algorithmHtml(model, h, compact) {
  const rule = model.rule ? ` rule-${model.rule}` : "";
  const explanation = !compact && model.explanation
    ? `<p class="pseudocode__explain">${explanationHtml(model.explanation)}</p>`
    : "";
  return `
    <section class="pseudocode dp-view__algo${rule}" aria-labelledby="dp-algo-heading">
      <div class="code-panel">
        <${h} class="pseudocode__heading" id="dp-algo-heading">${escapeHtml(t("dp.heading"))}</${h}>
        <ol class="code">${codeLinesHtml(DP_LINES, model, (id) => t(`dp.lines.${id}`))}</ol>
      </div>
      ${explanation}
      ${model.resolve ? pairsHtml(model.resolve) : ""}
    </section>`;
}

/** Explicação do passo `index` em HTML ("" se não houver): é o texto anunciado aos leitores de ecrã. */
export function stepExplanationHtml(trace, index) {
  const { explanation } = dpStepModel(trace, index);
  return explanation ? explanationHtml(explanation) : "";
}

/**
 * HTML da vista do DP no passo `index`: o painel do algoritmo e a sequência de conjuntos.
 * headingLevel: nível dos títulos (2 no Passo a passo, 3 dentro de uma secção do Aprender).
 * `compact` tira a frase do passo e a dica da sequência (no Passo a passo, o cartão do passo já explica).
 */
export function renderDp(trace, index, { headingLevel = 2, compact = false } = {}) {
  const sequence = dpSequenceModel(trace, index);
  const h = `h${headingLevel}`;
  return `
    <div class="dp-view">
      ${algorithmHtml(dpStepModel(trace, index), h, compact)}
      <section class="proof dp-view__sequence" aria-labelledby="dp-seq-heading">
        <${h} class="proof__heading" id="dp-seq-heading">${escapeHtml(t("dp.seqHeading"))}</${h}>
        ${compact ? "" : `<p class="proof__hint">${escapeHtml(t("dp.seqHint"))}</p>`}
        <ol class="proof__list">${sequence.steps.map((step) => sequenceStepHtml(step)).join("")}</ol>
      </section>
    </div>`;
}

/**
 * A sequência completa do DP para a folha de impressão: todos os passos e, por baixo de cada
 * eliminação, os pares resolvidos (no ecrã, o painel do algoritmo só mostra os do passo atual).
 */
export function renderDpPrint(trace) {
  const { steps } = dpSequenceModel(trace, trace.length - 1);
  const items = steps.map((step) =>
    sequenceStepHtml(step, step.kind === "resolve" ? pairsHtml(trace[step.index]) : ""),
  );
  return `
    <section class="proof dp-view__sequence" aria-labelledby="dp-seq-heading">
      <h2 class="proof__heading" id="dp-seq-heading">${escapeHtml(t("dp.seqHeading"))}</h2>
      <ol class="proof__list">${items.join("")}</ol>
    </section>`;
}

/**
 * Monta a vista em `container`. Devolve { show(trace, index, { animate }) }.
 * onSelect(step) é chamado quando o aluno escolhe um passo da sequência.
 * Redesenha ao mudar de idioma e mantém o passo atual visível dentro da lista.
 */
export function mountDpView(container, { onSelect, compact = false } = {}) {
  let current = null;
  let glide = null; // a animação do realce do pseudocódigo, entre dois passos

  function draw() {
    if (!current) return;
    const scrollTop = container.querySelector(".proof__list")?.scrollTop ?? 0;
    const focused = container.contains(document.activeElement) ? document.activeElement.dataset.step : null;

    container.innerHTML = renderDp(current.trace, current.index, { compact });

    const list = container.querySelector(".proof__list");
    list.scrollTop = scrollTop;
    if (focused !== null && focused !== undefined) container.querySelector(`[data-step="${focused}"]`)?.focus();

    // Scroll só dentro da lista (não mexe na página durante o play).
    const step = list.querySelector('[aria-current="step"]');
    if (step) {
      const item = step.parentElement;
      const top = item.offsetTop - list.offsetTop;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = top + item.offsetHeight - list.clientHeight;
      }
    }
  }
  onLangChange(draw);

  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (button && onSelect) onSelect(Number(button.dataset.step));
  });

  return {
    show(trace, index, { animate = false } = {}) {
      const before = animate ? currentLinesBox(container) : null;
      glide?.cancel();
      current = { trace, index };
      draw();
      glide = glideHighlight(container, before);
      return glide;
    },
  };
}
