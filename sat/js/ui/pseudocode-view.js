// Painel do algoritmo no Passo a passo: o pseudocódigo DLL com a(s) linha(s) do passo
// atual realçada(s) na cor da regra, e por baixo a explicação do passo em linguagem natural.
//
// Que linha corresponde a cada evento do trace:
//   start     → DLL(S)                            (a chamada inicial)
//   unit      → S := propagate(S)                 (um literal de cada vez)
//   sat       → if S vazio then …
//   conflict  → if S contém F then …
//   branch    → l := select_literal(S) + if DLL(S ∪ {l}) …   (1.º ramo, l)
//               else return DLL(S ∪ {l̃})                     (2.º ramo, depois de um backtrack)
//   backtrack → if DLL(S ∪ {l}) = satisfazível   (a condição falhou: segue-se o else)
//   result    → o return da chamada inicial: if S vazio, if S contém F ou, se ramificou, o else
//   limit     → nenhuma linha (o algoritmo parou sem resposta)
//
// Como nos outros componentes, pseudocodeModel() e renderPseudocode() são puras (testáveis em node);
// só mountPseudocodeView() mexe no DOM.
import { complement } from "../core/literals.js";
import { t, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { literalHtml, clauseHtml } from "./formula-input.js";
import { storage as defaultStorage } from "./storage.js";
import { currentLinesBox, glideHighlight } from "./code-glide.js";

/** As linhas do pseudocódigo, por ordem, com a indentação de cada uma. */
export const PSEUDOCODE_LINES = [
  { id: "call", indent: 0 },
  { id: "input", indent: 1 },
  { id: "output", indent: 1 },
  { id: "propagate", indent: 1 },
  { id: "ifEmpty", indent: 1 },
  { id: "ifFalse", indent: 1 },
  { id: "select", indent: 1 },
  { id: "ifBranch", indent: 1 },
  { id: "then", indent: 2 },
  { id: "else", indent: 2 },
];

/** true se a ramificação em `index` é a do literal complementar (vem logo a seguir a um backtrack). */
function isSecondBranch(trace, index) {
  return trace[index - 1]?.type === "backtrack";
}

/**
 * O que o painel mostra no passo `index` do trace:
 *   { type, rule, lines: [id da linha realçada], explanation: { key, params } | null, returns? }
 * returns = true no último passo: a linha realçada é a que devolve a resposta.
 * Os params da explicação são dados (literais, cláusulas, números); a formatação é feita no render.
 */
export function pseudocodeModel(trace, index) {
  const e = trace[index];
  if (!e) return { type: null, rule: null, lines: [], explanation: null };
  const base = { type: e.type, rule: null, lines: [], explanation: null };

  switch (e.type) {
    case "start":
      return { ...base, lines: ["call"], explanation: { key: "start", params: { n: e.S.length } } };
    case "unit": {
      const clause = e.before[e.clauseIndex];
      return {
        ...base,
        rule: "unit",
        lines: ["propagate"],
        explanation: { key: "unit", params: { clause, literal: e.literal } },
      };
    }
    case "sat":
      return { ...base, rule: "sat", lines: ["ifEmpty"], explanation: { key: "sat", params: {} } };
    case "conflict":
      return { ...base, rule: "conflict", lines: ["ifFalse"], explanation: { key: "conflict", params: {} } };
    case "branch":
      return isSecondBranch(trace, index)
        ? { ...base, rule: "branch", lines: ["else"], explanation: { key: "branchSecond", params: { literal: e.literal } } }
        : { ...base, rule: "branch", lines: ["select", "ifBranch"], explanation: { key: "branchFirst", params: { literal: e.literal } } };
    case "backtrack":
      // e.literal é o l̃ que se vai tentar; o ramo que falhou foi o de l.
      return {
        ...base,
        rule: "backtrack",
        lines: ["ifBranch"],
        explanation: { key: "backtrack", params: { failed: complement(e.literal), literal: e.literal } },
      };
    case "limit":
      return { ...base, explanation: { key: "limit", params: { steps: e.steps } } };
    case "result": {
      if (e.sat === null) return { ...base, explanation: { key: "resultLimited", params: {} } };
      const unsatLine = trace.some((event) => event.type === "branch") ? "else" : "ifFalse";
      return {
        ...base,
        rule: e.sat ? "sat" : "conflict",
        lines: [e.sat ? "ifEmpty" : unsatLine],
        returns: true,
        explanation: { key: e.sat ? "resultSat" : "resultUnsat", params: {} },
      };
    }
    default:
      return base;
  }
}

const CHEVRON =
  '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';

// Palavras reservadas do pseudocódigo (iguais em PT e EN).
const KEYWORDS = /\b(if|then|else|return)\b/g;

/** Uma linha do pseudocódigo em HTML, com as palavras reservadas destacadas (também usada pelo DP). */
function lineHtml(text) {
  return escapeHtml(text).replace(KEYWORDS, `<span class="pseudocode__kw">$1</span>`);
}

/** Explicação em HTML: os literais e as cláusulas vão formatados (¬, ∨, subscritos). */
export function explanationHtml({ key, params }) {
  const html = {
    n: params.n,
    steps: params.steps,
    literal: params.literal && `<span class="lit">${literalHtml(params.literal)}</span>`,
    opposite: params.literal && `<span class="lit">${literalHtml(complement(params.literal))}</span>`,
    failed: params.failed && `<span class="lit">${literalHtml(params.failed)}</span>`,
    clause: params.clause && `<span class="pseudocode__clause">{${clauseHtml(params.clause)}}</span>`,
  };
  return t(`pseudocode.explain.${key}`, html);
}

/** Explicação do passo `index` em HTML ("" se não houver): é o texto anunciado aos leitores de ecrã. */
export function stepExplanationHtml(trace, index) {
  const { explanation } = pseudocodeModel(trace, index);
  return explanation ? explanationHtml(explanation) : "";
}

// Fundo suave da linha atual, por evento: classes por inteiro, para o CSS e o Tailwind as verem.
const LINE_CLASS = {
  unit: " c-unit",
  branch: " c-branch",
  conflict: " c-conflict",
  sat: " c-sat",
  backtrack: " c-back",
  resolution: " c-res",
};

/** As linhas de um pseudocódigo (também usadas pelo DP): `text(id)` dá o texto de cada linha. */
export function codeLinesHtml(lines, model, text) {
  const current = escapeHtml(t("pseudocode.current"));
  const here = escapeHtml(t(model.returns ? "pseudocode.returnTag" : "pseudocode.thisStep"));
  return lines.map(({ id, indent }, i) => {
    const isCurrent = model.lines.includes(id);
    const attrs = isCurrent
      ? ` class="pseudocode__line${LINE_CLASS[model.rule] ?? ""} is-current" aria-current="step"`
      : ` class="pseudocode__line"`;
    const tag = isCurrent ? `<span class="sr-only"> (${current})</span><span class="code__tag" aria-hidden="true">${here}</span>` : "";
    return `<li${attrs} style="--indent: ${indent}"><span class="pseudocode__num" aria-hidden="true">${i + 1}</span>` +
      `<code class="pseudocode__code">${lineHtml(text(id))}</code>${tag}</li>`;
  }).join("");
}

/**
 * HTML do painel para um modelo de pseudocodeModel().
 * `headingLevel` muda o nível do título (no Aprender o painel fica dentro de uma secção h2).
 * Com `open` (true ou false), as linhas ficam num painel que se recolhe.
 * Sem `explanation`, fica só o código (no Passo a passo, a frase do passo está no cartão do passo).
 */
export function renderPseudocode(model, { headingLevel = 2, open = null, explanation: withExplanation = true } = {}) {
  const rule = model.rule ? ` rule-${model.rule}` : "";
  const lines = `<ol class="code">${codeLinesHtml(PSEUDOCODE_LINES, model, (id) => t(`pseudocode.lines.${id}`))}</ol>`;
  const heading = `<h${headingLevel} class="pseudocode__heading" id="pseudocode-heading">${escapeHtml(t("pseudocode.heading"))}</h${headingLevel}>`;
  const body = open === null
    ? `<div class="code-panel">${heading}${lines}</div>`
    : `<details class="code-panel"${open ? " open" : ""}><summary>${heading}${CHEVRON}</summary>${lines}</details>`;

  const explanation = withExplanation && model.explanation
    ? `<p class="pseudocode__explain">${explanationHtml(model.explanation)}</p>`
    : "";

  return `
    <section class="pseudocode${rule}" aria-labelledby="pseudocode-heading">
      ${body}
      ${explanation}
    </section>`;
}

/**
 * Monta o painel em `container`. Devolve { show(trace, index, { animate }) }; com `animate`, o
 * realce desliza da linha anterior para a nova, e show() devolve essa sequência (js/ui/motion.js).
 * Redesenha ao mudar de idioma. Fica recolhido ou aberto como o aluno o deixou (store).
 */
export function mountPseudocodeView(container, { store = defaultStorage, explanation = true } = {}) {
  let current = null;
  let glide = null; // a animação do realce, entre dois passos

  function draw() {
    if (!current) return;
    container.innerHTML = renderPseudocode(pseudocodeModel(current.trace, current.index), { open: store.getCodeOpen(), explanation });
  }
  onLangChange(draw);
  // O toggle não sobe na árvore: apanha-se na captura.
  container.addEventListener("toggle", (event) => store.setCodeOpen(event.target.open), true);

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
