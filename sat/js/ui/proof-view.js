// "Vista de prova" do Passo a passo: a lista numerada de conjuntos, ou seja, o que se escreve ao
// resolver à mão:
//   (1) S
//   (2) S′                                   → p₁
//       ramo p
//   (3) (2) ∪ {p}                            ⑂ p
//       S contém F ⇒ insatisfazível          (sem número: não é um conjunto novo)
// Os conjuntos dentro de uma ramificação ficam indentados pela profundidade do nó. Os passos já
// feitos aparecem normais, o passo atual realçado na cor da regra e os seguintes a cinzento; clicar
// num passo salta para ele (como na árvore). Na folha de impressão, o CSS troca as etiquetas e o
// «(2) ∪ {p}» pelo texto de cada passo e pelo conjunto completo.
//
// Como nos outros componentes, proofModel() e renderProof() são puras (testáveis em node);
// só mountProofView() mexe no DOM.
import { proofSteps } from "../core/trace.js";
import { compareVariables, formatLiteral } from "../core/literals.js";
import { t, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { literalHtml, setHtml, variableHtml } from "./formula-input.js";
import { truthLabel } from "./result-card.js";
import { eventChipHtml, eventIconHtml } from "./events.js";

/** Cor da regra de cada tipo de passo (as mesmas classes .rule-* do resto da página). */
const RULE_OF = {
  start: null,
  unit: "unit",
  branch: "branch",
  conflict: "conflict",
  sat: "sat",
  backtrack: "backtrack",
  limit: null,
  result: null,
};

/**
 * Quantas cláusulas a vista desenha no máximo (soma dos conjuntos mostrados). Nos exemplos da
 * exemplos cabe sempre a prova inteira; numa fórmula com centenas de cláusulas e milhares de passos
 * a lista completa teria milhões de cláusulas e bloqueava a página durante segundos (M8.5).
 */
export const PROOF_CLAUSE_BUDGET = 5000;
/** Mesmo com conjuntos enormes, a janela mostra pelo menos estes passos. */
export const PROOF_MIN_WINDOW = 12;

/**
 * O troço de passos [from, to) a mostrar: todos, se couberem em `size`; senão uma janela de
 * `size` passos que avança aos saltos de meia janela, com o passo atual sempre longe das pontas
 * (pelo menos ¼ da janela de cada lado, exceto no início e no fim da lista). Como a janela só
 * muda de vez em quando, os passos dentro dela só precisam de trocar de estado (sem redesenhar).
 */
export function proofWindow(length, current, size) {
  if (length <= size) return { from: 0, to: length };
  const half = Math.max(1, Math.floor(size / 2));
  const start = Math.floor(Math.max(current - Math.floor(half / 2), 0) / half) * half;
  const from = Math.min(start, length - size);
  return { from, to: from + size };
}

/**
 * O que a vista mostra no passo `index` do trace:
 *   { current, steps: [{ ...passo de proofSteps(), state, rule, second? }], hiddenBefore, hiddenAfter }
 * state ∈ "done" | "current" | "future"; o passo atual é o último cujo evento já aconteceu.
 * second = true na ramificação com o literal complementar (vem depois de um retrocesso).
 * base = na ramificação, o número do conjunto de onde ela parte: o `(2)` de «(2) ∪ {p}».
 * No fim junta-se um passo { kind: "result", sat } com a resposta do DLL.
 * options.budget: nº máximo de cláusulas desenhadas (PROOF_CLAUSE_BUDGET; Infinity = prova inteira).
 * Se a prova não couber, `steps` só tem a janela à volta do passo atual (`current` conta a partir
 * do início da janela) e hiddenBefore/hiddenAfter dizem quantos passos ficaram de fora.
 */
export function proofModel(trace, index, { budget = PROOF_CLAUSE_BUDGET } = {}) {
  // O 2.º ramo parte do mesmo conjunto do 1.º, que é o último numerado antes de este começar.
  const baseAt = [];
  let lastN = null;
  const steps = proofSteps(trace).map((s, i, all) => {
    const second = s.kind === "branch" && all[i - 1]?.kind === "backtrack";
    if (s.kind === "branch" && !second) baseAt[s.depth] = lastN;
    const step = { ...s, second, base: s.kind === "branch" ? baseAt[s.depth] : null };
    lastN = s.n ?? lastN;
    return step;
  });
  const result = trace.at(-1);
  if (result?.type === "result") steps.push({ n: null, kind: "result", index: trace.length - 1, depth: 0, sat: result.sat });

  let current = -1;
  steps.forEach((s, i) => {
    if (s.index <= index) current = i;
  });
  // Os conjuntos só encolhem (ou ganham a unitária {l}), por isso |S| + 1 limita cada passo.
  const setSize = (trace[0]?.S?.length ?? 0) + 1;
  const size = Math.max(PROOF_MIN_WINDOW, Math.floor(budget / setSize));
  const { from, to } = proofWindow(steps.length, Math.max(current, 0), size);
  return {
    current: current - from,
    hiddenBefore: from,
    hiddenAfter: steps.length - to,
    steps: steps.slice(from, to).map((s, i) => ({
      ...s,
      rule: RULE_OF[s.kind],
      state: i + from < current ? "done" : i + from === current ? "current" : "future",
    })),
  };
}

const lit = (l) => `<span class="lit">${literalHtml(l)}</span>`;

/** A valoração parcial que o DLL encontrou, por ordem alfabética: "p = F, r = F". */
function assignmentHtml(assignment) {
  const vars = Object.keys(assignment ?? {}).sort(compareVariables);
  return vars.map((v) => `${variableHtml(v)} = ${escapeHtml(truthLabel(assignment[v]))}`).join(", ");
}

/** O texto de cada passo (já em HTML): a etiqueta antes do conjunto ou a conclusão. */
function labelHtml(step) {
  switch (step.kind) {
    case "start":
      return escapeHtml(t("proof.start"));
    case "unit":
      return t("proof.unit", { literal: lit(step.literal) });
    case "branch":
      return t(step.second ? "proof.branchSecond" : "proof.branchFirst", { literal: lit(step.literal) });
    case "conflict":
      return escapeHtml(t("proof.conflict"));
    case "sat": {
      const valuation = assignmentHtml(step.assignment);
      return escapeHtml(t("proof.sat")) + (valuation ? ` <span class="proof__valuation">(${valuation})</span>` : "");
    }
    case "backtrack":
      return t("proof.backtrack", { literal: lit(step.literal) });
    case "limit":
      return escapeHtml(t("proof.limit", { steps: step.steps }));
    case "result":
      return escapeHtml(t(step.sat === null ? "proof.resultLimited" : step.sat ? "proof.resultSat" : "proof.resultUnsat"));
    default:
      return "";
  }
}

/** Os passos que mostram um conjunto (os numerados). */
const SHOWS_SET = new Set(["start", "unit", "branch"]);

/** Etiqueta do lado direito: o evento do passo e o seu literal. */
function tagHtml(step) {
  if (step.rule === null) return "";
  const label = step.kind === "conflict" ? "F" : step.kind === "sat" ? "{ }" : formatLiteral(step.literal);
  return `<span class="proof__tag">${eventChipHtml(step.rule, label)}</span>`;
}

function stepHtml(step) {
  const rule = step.rule ? ` rule-${step.rule}` : "";
  const cls = `proof__step proof__step--${step.kind} is-${step.state}${rule}`;
  const current = step.state === "current" ? ` aria-current="step"` : "";
  const set = SHOWS_SET.has(step.kind) ? `<span class="proof__set">${setHtml(step.S)}</span>` : "";
  const ref = step.base ? `<span class="proof__ref" aria-hidden="true">(${step.base}) ∪ {${literalHtml(step.literal)}}</span>` : "";
  const num = step.n !== null ? `<span class="proof__num">(${step.n})</span>` : "";
  // O 1.º passo de um ramo leva o cabeçalho «ramo p» por cima.
  const branch = step.kind === "branch"
    ? `<li class="proof__branch" style="--depth: ${step.depth}" aria-hidden="true">${eventIconHtml("branch")}${escapeHtml(t("stepCard.branch"))} ${lit(step.literal)}</li>`
    : "";
  return `${branch}
    <li class="proof__item" style="--depth: ${step.depth}">
      <button type="button" class="${cls}" data-step="${step.index}"${current}>
        ${num}
        <span class="proof__body">
          <span class="proof__label">${labelHtml(step)}</span>
          ${set}${ref}
        </span>
        ${tagHtml(step)}
      </button>
    </li>`;
}

/** "… 120 passos anteriores": marca os passos que ficaram fora da janela. */
function hiddenHtml(key, count) {
  return count > 0 ? `<li class="proof__more">${escapeHtml(t(key, { n: count }))}</li>` : "";
}

/** HTML da vista para um modelo de proofModel(); `heading` é a chave i18n do título. */
export function renderProof(model, { heading = "proof.heading" } = {}) {
  return `
    <section class="proof" aria-labelledby="proof-heading">
      <h2 class="proof__heading" id="proof-heading">${escapeHtml(t(heading))}</h2>
      <ol class="proof__list">${hiddenHtml("proof.hiddenBefore", model.hiddenBefore)}${model.steps.map(stepHtml).join("")}${hiddenHtml("proof.hiddenAfter", model.hiddenAfter)}</ol>
    </section>`;
}

/**
 * Monta a vista em `container`. Devolve { show(trace, index) }.
 * onSelect(step) é chamado quando o aluno escolhe um passo da lista.
 * Redesenha ao mudar de idioma e mantém o passo atual visível dentro da lista.
 * Com o contentor escondido (`hidden`) não desenha nada: a página volta a chamar show() quando
 * o aluno escolhe a vista de prova.
 */
export function mountProofView(container, { onSelect } = {}) {
  let current = null;
  let drawn = null; // { trace, first, length }: o que está desenhado (para só trocar os estados)

  /** Os passos desenhados são os mesmos do modelo? Então basta atualizar o estado de cada um. */
  function sameSteps(model) {
    return drawn && drawn.trace === current.trace && drawn.first === model.steps[0]?.index && drawn.length === model.steps.length;
  }

  /** Atualiza done/current/future e o aria-current sem refazer o HTML (conjuntos grandes). */
  function updateStates(model) {
    const buttons = container.querySelectorAll(".proof__step");
    model.steps.forEach((step, i) => {
      const button = buttons[i];
      for (const state of ["done", "current", "future"]) button.classList.toggle(`is-${state}`, step.state === state);
      if (step.state === "current") button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  }

  function draw() {
    if (!current || container.hidden) return;
    const model = proofModel(current.trace, current.index);
    const oldList = container.querySelector(".proof__list");
    const scrollTop = oldList?.scrollTop ?? 0;

    if (sameSteps(model)) {
      updateStates(model);
    } else {
      const focused = container.contains(document.activeElement) ? document.activeElement.dataset.step : null;
      container.innerHTML = renderProof(model, { heading: "proof.listHeading" });
      drawn = { trace: current.trace, first: model.steps[0]?.index, length: model.steps.length };
      container.querySelector(".proof__list").scrollTop = scrollTop;
      if (focused !== null && focused !== undefined) container.querySelector(`[data-step="${focused}"]`)?.focus();
    }
    const list = container.querySelector(".proof__list");

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
  // Ao mudar de idioma os textos mudam todos: redesenha tudo (já, ou quando a vista aparecer).
  onLangChange(() => {
    drawn = null;
    draw();
  });

  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (button && onSelect) onSelect(Number(button.dataset.step));
  });

  return {
    show(trace, index) {
      current = { trace, index };
      draw();
    },
  };
}
