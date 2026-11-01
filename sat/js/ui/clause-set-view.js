// Vista do conjunto atual S no Passo a passo: uma cláusula por cartão, com o que o passo faz marcado
// diretamente nos cartões:
//   unitária   → a cláusula unitária escolhida (cor da propagação);
//   satisfeita → as cláusulas com l ficam esbatidas com a etiqueta "satisfeita";
//   encurtada  → o literal l̃ fica riscado (e já não aparece no conjunto seguinte);
//   F          → a cláusula vazia aparece em vermelho;
//   nova       → a cláusula {l} acrescentada por uma ramificação S ∪ {l}.
// O estado de cada passo fica sempre visível (riscado, esbatido, cor). A animação do passo vem do
// js/ui/step-motion.js: no fim dela, as cláusulas que saíram somem da lista (settle).
//
// Como nos outros componentes, clauseSetModel() e renderClauseSet() são puras (testáveis em node);
// só mountClauseSetView() mexe no DOM.
import { isEmptyClause } from "../core/clauses.js";
import { complement, sameLiteral } from "../core/literals.js";
import { t, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { literalHtml, setHtml } from "./formula-input.js";

/** Cartão normal: o estado depende só de a cláusula ser vazia (F). */
function plainCard(clause) {
  return { clause, state: isEmptyClause(clause) ? "empty" : "normal", struck: [] };
}

/** O último conjunto conhecido antes do evento `index` (para limit/result, que não trazem S). */
function lastSet(trace, index) {
  for (let i = index - 1; i >= 0; i--) {
    const e = trace[i];
    if (e.after) return e.after;
    if (e.S) return e.S;
  }
  return [];
}

/**
 * O que a vista mostra no passo `index` do trace:
 *   { type, rule, literal, cards: [{ clause, state, struck: [índices de literais riscados] }], after }
 * state ∈ "normal" | "unit" | "satisfied" | "shortened" | "merged" | "empty" | "new".
 * `after` (só na propagação) é o conjunto que fica depois do passo; nos outros eventos é null.
 * `rule` é a cor da regra do evento (start/limit/result não têm regra: null).
 */
export function clauseSetModel(trace, index) {
  const e = trace[index];
  if (!e) return { type: null, rule: null, literal: null, cards: [], after: null };
  const base = { type: e.type, rule: null, literal: e.literal ?? null, after: null };

  switch (e.type) {
    case "unit": {
      // Mostra S antes do passo, com cada cláusula marcada pelo que lhe acontece.
      const opposite = complement(e.literal);
      const shortened = new Map(e.shortened.map((s) => [s.idx, s]));
      const cards = e.before.map((clause, idx) => {
        if (idx === e.clauseIndex) return { clause, state: "unit", struck: [] };
        if (e.removed.includes(idx)) return { clause, state: "satisfied", struck: [] };
        if (shortened.has(idx)) {
          const struck = [];
          clause.forEach((l, i) => sameLiteral(l, opposite) && struck.push(i));
          const state = e.merged.includes(idx) ? "merged" : clause.length === struck.length ? "empty" : "shortened";
          return { clause, state, struck };
        }
        return plainCard(clause);
      });
      return { ...base, rule: "unit", cards, after: e.after };
    }
    case "branch": {
      // S ∪ {l}: a cláusula {l} entra no fim (se já lá estava, o conjunto fica igual).
      const added = e.after.length > e.before.length;
      const cards = e.after.map((clause, idx) =>
        added && idx === e.after.length - 1 ? { clause, state: "new", struck: [] } : plainCard(clause),
      );
      return { ...base, rule: "branch", cards };
    }
    case "conflict":
      return { ...base, rule: "conflict", cards: e.S.map(plainCard) };
    case "sat":
      return { ...base, rule: "sat", cards: [] };
    case "backtrack": {
      // Volta ao conjunto do nó pai, que é o `before` da ramificação seguinte (S ∪ {l̃}).
      const next = trace[index + 1];
      const S = next && next.type === "branch" ? next.before : lastSet(trace, index);
      return { ...base, rule: "backtrack", cards: S.map(plainCard) };
    }
    case "start":
      return { ...base, cards: e.S.map(plainCard) };
    case "result":
      return { ...base, rule: e.sat === null ? null : e.sat ? "sat" : "conflict", cards: lastSet(trace, index).map(plainCard) };
    default:
      return { ...base, cards: lastSet(trace, index).map(plainCard) };
  }
}

// Etiqueta visível de cada estado (os normais não têm).
const STATE_LABEL = {
  unit: "clauseSet.state.unit",
  satisfied: "clauseSet.state.satisfied",
  merged: "clauseSet.state.merged",
  empty: "clauseSet.state.empty",
  new: "clauseSet.state.new",
};

// Classes de cada estado (a satisfeita e a repetida saem as duas do conjunto).
const STATE_CLASS = { unit: " unit", satisfied: " gone", merged: " gone", empty: " clause--empty", new: " new" };

function cardClauseHtml({ clause, struck }) {
  if (clause.length === 0) return `<span aria-hidden="true">✕ </span><span class="lit clause__false">F</span>`;
  const removed = escapeHtml(t("clauseSet.struck"));
  return clause
    .map((l, i) =>
      struck.includes(i)
        ? `<s class="lit lit--strike">${literalHtml(l)}<span class="sr-only"> (${removed})</span></s>`
        : `<span class="lit">${literalHtml(l)}</span>`,
    )
    .join(" ∨ ");
}

export function cardHtml(card) {
  // A etiqueta F só faz falta quando a cláusula ainda mostra o literal riscado (acabou de ficar vazia).
  const label = card.state === "empty" && card.struck.length === 0 ? null : STATE_LABEL[card.state];
  const tag = label ? `<span class="clause__tag">${escapeHtml(t(label))}</span>` : "";
  return `<li class="clause${STATE_CLASS[card.state] ?? ""}">` +
    `<span class="clause__text">${cardClauseHtml(card)}</span>${tag}</li>`;
}

const CHECK = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12 5 5 9-10"/></svg>';
const ARROW_DOWN = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';

/** HTML da vista para um modelo de clauseSetModel(). */
export function renderClauseSet(model) {
  const rule = model.rule ? ` rule-${model.rule}` : "";
  const count = model.after
    ? t("clauseSet.change", { from: model.cards.length, to: model.after.length })
    : t("clauseSet.count", { n: model.cards.length });

  let body;
  if (model.cards.length === 0) {
    body = `<p class="clause-set__empty">${CHECK}<span class="clause-set__empty-set">{ }</span>` +
      `<span class="clause-set__empty-text">${escapeHtml(t("clauseSet.emptySet"))}</span></p>`;
  } else {
    body = `<ol class="clauses">${model.cards.map(cardHtml).join("")}</ol>`;
  }

  const after = model.after
    ? `<p class="clause-set__after">${ARROW_DOWN}<span class="clause-set__after-label sr-only">${escapeHtml(t("clauseSet.after"))}</span> ` +
      `<span class="clause-set__after-set">${model.after.length === 0 ? "{ }" : setHtml(model.after)}</span></p>`
    : "";

  return `
    <section class="clause-set${rule}" aria-labelledby="clause-set-heading">
      <h2 class="clause-set__heading" id="clause-set-heading">
        <span class="max-md:hidden">${escapeHtml(t("clauseSet.heading"))} · </span>${escapeHtml(count)}
      </h2>
      ${body}
      ${after}
    </section>`;
}

/** Tira de `root` as cláusulas que saem do conjunto neste passo (a etapa "leave" da coreografia). */
export function hideLeaving(root) {
  root.querySelectorAll(".clause.unit, .clause.gone").forEach((card) => { card.hidden = true; });
}

/**
 * Monta a vista em `container`. Devolve { show(trace, index), settle() }.
 * settle() tira da lista as cláusulas que saíram (o fim da animação do passo).
 * Redesenha ao mudar de idioma, no mesmo estado.
 */
export function mountClauseSetView(container) {
  let current = null;

  function draw() {
    if (!current) return;
    container.innerHTML = renderClauseSet(clauseSetModel(current.trace, current.index));
    if (current.settled) hideLeaving(container);
  }
  onLangChange(draw);

  return {
    show(trace, index) {
      // O mesmo passo outra vez (ex.: voltar da vista de prova) fica como estava.
      const settled = current?.settled === true && current.trace === trace && current.index === index;
      current = { trace, index, settled };
      draw();
    },
    settle() {
      if (!current) return;
      current.settled = true;
      hideLeaving(container);
    },
  };
}
