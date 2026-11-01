// Modo guiado do editor: seleciona-se o que citar, escolhe-se uma regra e a ferramenta gera o passo.
// Módulo puro (sem DOM). Trabalha sobre o estado de `editor.js`, por isso desfaz-se como o resto.
//
// Objetivo: uma linha por justificar (`step` sem regra). O cursor marca o objetivo atual. A fórmula dele
// é a da linha ou, na última linha vazia ao nível de topo, a conclusão do sequente.
// Uma regra pode funcionar de duas maneiras, e as duas partem do mesmo cálculo:
//   - a partir do objetivo: a conclusão da regra corresponde ao objetivo. O que faltar citar passa a
//     linhas novas por justificar, ou subdeduções com hipótese e objetivo, acima dele.
//   - para a frente: não dá o objetivo, por isso tudo tem de estar citado e o passo fica numa linha nova
//     acima do objetivo. Sem objetivo, fica por baixo do cursor.
// Se a regra servir o objetivo, só se oferece isso. Uma premissa que já exista numa linha acessível é
// citada sem ser preciso selecioná-la.
// Sem seleção, se a regra não tiver outro passo, procuram-se citações nas linhas acessíveis: primeiro
// para dar o objetivo e depois para a frente, só com fórmulas novas que já apareçam na prova ou no
// sequente. Assim, `a` e `b` dão `a ∧ b` num toque em ∧I se a prova precisar dela, sem oferecer `a ∧ a`.
// Contrato:
//   guidedLines(editor, selection) → [{ role, item, selected }], por linha
//     role: "current" (objetivo atual), "objective", "citable" ou "locked". item: citação, ou null.
//   guidedRules(editor, selection, { rules, known }) → [{ id, outcomes, reason }]
//     outcomes: passos possíveis; mais do que um quer dizer que há uma escolha a fazer (ver
//     `outcomeLabel`). Sem nenhum, `reason` é { key, params }, em `guided.reasons.*`.
//   applyOutcome(editor, outcome, ruleLabels) → estado seguinte
// `selection` é uma lista de citações de `proof.js`, feita com `toggleSelection`.

import { blankDraft, commit, moveCursor, spliced, syncJustifications } from "./editor.js";
import { equals, format } from "./formula.js";
import { accessibleFrom, citeLine, citeRange, editLine, insertLine } from "./proof.js";
import { formatJustification } from "./proof-text.js";
import { applySubstitution, matchSchema } from "./schema.js";
import { bindPremise } from "./verify.js";

/**
 * Passos oferecidos por regra, fórmulas candidatas para uma metavariável livre e, nas citações automáticas,
 * resultados e tentativas. As tentativas travam a procura mesmo quando nenhuma forma de citar chega ao fim.
 */
export const GUIDED_LIMITS = Object.freeze({ outcomes: 12, candidates: 8, automatic: 200, attempts: 20000 });

const isPending = ({ kind, rule }) => kind === "step" && rule === null;

/** A fórmula que a linha `line` tem de provar, ou null. */
function targetOf({ goal, proof }, line) {
  const { formula, depth } = proof.lines[line - 1];
  if (formula) return formula;
  return line === proof.lines.length && depth === 0 ? goal.conclusion : null;
}

/** Onde entra o próximo passo: `at` é a linha depois da qual se insere, e `access` o que ele pode citar. */
export function guidedAnchor(editor) {
  const { proof, cursor: { line } } = editor;
  const current = proof.lines[line - 1];
  if (isPending(current)) {
    return { line, at: line - 1, depth: current.depth, target: targetOf(editor, line), pending: true, access: accessibleFrom(proof, line) };
  }
  const { proof: probe } = insertLine(proof, line, { depth: current.depth });
  return { line, at: line, depth: current.depth, target: null, pending: false, access: accessibleFrom(probe, line + 1) };
}

/** Só se cita o que tem fórmula. */
export function citableFrom({ lines }, access) {
  return {
    lines: access.lines.filter((line) => lines[line - 1].formula),
    ranges: access.ranges.filter(({ from, to }) => lines[from - 1].formula && lines[to - 1].formula),
  };
}

const citable = (proof, { access }) => citableFrom(proof, access);

const sameItem = (a, b) => a.kind === b.kind && a.line === b.line && a.from === b.from && a.to === b.to;

/** Junta a citação à seleção, ou tira-a se já lá estiver. */
export function toggleSelection(selection, item) {
  const kept = selection.filter((other) => !sameItem(other, item));
  return kept.length === selection.length ? [...selection, item] : kept;
}

/** O papel de cada linha. Tocar numa linha de dentro de uma subdedução fechada seleciona a subdedução. */
export function guidedLines(editor, selection) {
  const { proof } = editor;
  const anchor = guidedAnchor(editor);
  const { lines, ranges } = citable(proof, anchor);
  return proof.lines.map((line, index) => {
    const number = index + 1;
    if (isPending(line)) {
      const role = anchor.pending && number === anchor.line ? "current" : "objective";
      return { role, item: null, selected: false };
    }
    const range = ranges.find(({ from, to }) => from <= number && number <= to);
    let item = null;
    if (lines.includes(number)) item = citeLine(number);
    else if (range) item = citeRange(range.from, range.to);
    if (!item) return { role: "locked", item: null, selected: false };
    return { role: "citable", item, selected: selection.some((other) => sameItem(other, item)) };
  });
}

/** Põe o cursor num objetivo, ao entrar no modo guiado. */
export function focusObjective(editor) {
  const { proof, cursor: { line } } = editor;
  if (isPending(proof.lines[line - 1])) return editor;
  const pending = proof.lines.findIndex(isPending);
  return pending === -1 ? editor : moveCursor(editor, pending + 1);
}

const premiseKind = ({ kind }) => (kind === "formula" ? "line" : "range");

/** Todas as formas de distribuir a seleção pelas premissas, porque a ordem é livre. */
export function* assignments(premises, selection, lines, substitution) {
  const cited = new Map();
  function* place(index, bound) {
    if (index === selection.length) {
      yield { substitution: bound, cited: new Map(cited) };
      return;
    }
    const item = selection[index];
    for (const [position, premise] of premises.entries()) {
      const free = !cited.has(position) && premiseKind(premise) === item.kind;
      const next = free ? bindPremise(premise, item, lines, bound) : null;
      if (next) {
        cited.set(position, item);
        yield* place(index + 1, next);
        cited.delete(position);
      }
    }
  }
  yield* place(0, substitution);
}

/** Formas de citar todas as premissas da forma com o que já está na prova. */
function* automaticAssignments(premises, { lines, available }, substitution) {
  const items = [...available.lines.map(citeLine), ...available.ranges.map(({ from, to }) => citeRange(from, to))];
  const cited = new Map();
  let yielded = 0;
  let attempts = 0;
  function* place(position, bound) {
    if (position === premises.length) {
      yielded += 1;
      yield { substitution: bound, cited: new Map(cited) };
      return;
    }
    for (const item of items) {
      if (yielded >= GUIDED_LIMITS.automatic || attempts >= GUIDED_LIMITS.attempts) return;
      attempts += 1;
      const next = premiseKind(premises[position]) === item.kind ? bindPremise(premises[position], item, lines, bound) : null;
      if (next) {
        cited.set(position, item);
        yield* place(position + 1, next);
        cited.delete(position);
      }
    }
  }
  yield* place(0, substitution);
}

export function instanceOf(schema, substitution) {
  const result = applySubstitution(schema, substitution);
  return result.ok ? result.formula : null;
}

/** A premissa com as metavariáveis substituídas, ou null se faltar alguma. */
function fillPremise(premise, substitution) {
  if (premise.kind === "formula") {
    const formula = instanceOf(premise.schema, substitution);
    return formula && { kind: "formula", formula };
  }
  const hypothesis = instanceOf(premise.hypothesis, substitution);
  const conclusion = instanceOf(premise.conclusion, substitution);
  return hypothesis && conclusion ? { kind: "subproof", hypothesis, conclusion } : null;
}

/** A citação de algo que já está na prova e dá a premissa, ou null. */
function existingCitation(filled, { lines, available }) {
  if (filled.kind === "formula") {
    const line = available.lines.find((number) => equals(lines[number - 1].formula, filled.formula));
    return line ? citeLine(line) : null;
  }
  const range = available.ranges.find(({ from, to }) => (
    equals(lines[from - 1].formula, filled.hypothesis) && equals(lines[to - 1].formula, filled.conclusion)
  ));
  return range ? citeRange(range.from, range.to) : null;
}

/**
 * Como obter as premissas da forma: `citations` tem citações ou { added: índice em `added` }. Com
 * `allowNew` a false, tudo tem de estar na prova. Um objetivo novo igual ao atual não adianta nada.
 */
function planPremises(form, { substitution, cited }, context, allowNew) {
  const citations = [];
  const added = [];
  for (const [position, premise] of form.premises.entries()) {
    if (cited.has(position)) {
      citations.push(cited.get(position));
    } else {
      const filled = fillPremise(premise, substitution);
      if (!filled) return null;
      const existing = existingCitation(filled, context);
      if (existing) {
        citations.push(existing);
      } else {
        const repeatsTarget = filled.kind === "formula" && context.target && equals(filled.formula, context.target);
        if (!allowNew || repeatsTarget) return null;
        citations.push({ added: added.length });
        added.push(filled);
      }
    }
  }
  return { citations, added };
}

function metasOf(schema, found = new Set()) {
  if (schema.kind === "meta") found.add(schema.name);
  for (const arg of schema.args) metasOf(arg, found);
  return found;
}

function premiseMetas(premises) {
  const found = new Set();
  for (const premise of premises) {
    for (const schema of premise.kind === "formula" ? [premise.schema] : [premise.hypothesis, premise.conclusion]) {
      metasOf(schema, found);
    }
  }
  return found;
}

/** Subfórmulas do sequente e da prova, sem repetições, indexadas pelo texto. */
function subformulas({ goal, proof }) {
  const seen = new Map();
  const visit = (formula) => {
    if (formula.kind !== "falsum") seen.set(format(formula), formula);
    for (const arg of formula.args) visit(arg);
  };
  [...goal.premises, goal.conclusion, ...proof.lines.map(({ formula }) => formula)]
    .filter(Boolean)
    .forEach(visit);
  return seen;
}

/** As substituições que fixam as metavariáveis `free`, que só aparecem na conclusão. */
function* freeChoices(free, substitution, candidates) {
  const [first, ...rest] = free;
  if (first === undefined) {
    yield substitution;
    return;
  }
  for (const formula of candidates) yield* freeChoices(rest, { ...substitution, [first]: formula }, candidates);
}

/** Os passos que dão o objetivo. `options.pick` troca a seleção por citações encontradas sozinhas. */
function fromTarget(form, formIndex, selection, context, { pick = null } = {}) {
  const found = [];
  for (const [index, conclusion] of form.conclusions.entries()) {
    const match = matchSchema(conclusion, context.target);
    if (match.ok) {
      const source = pick
        ? pick(form, match.substitution)
        : assignments(form.premises, selection, context.lines, match.substitution);
      for (const assignment of source) {
        const plan = planPremises(form, assignment, context, !pick);
        if (plan) found.push({ ...plan, group: `${formIndex}:${index}`, id: form.id, formula: context.target, closes: true });
      }
    }
  }
  return found;
}

/** Os passos que seguem do que está selecionado, sem objetivo. */
function fromSelection(form, formIndex, selection, context, { pick = null } = {}) {
  if (!pick && selection.length === 0 && form.premises.length > 0) return [];
  const found = [];
  const fromPremises = premiseMetas(form.premises);
  for (const [index, conclusion] of form.conclusions.entries()) {
    const source = pick ? pick(form, {}) : assignments(form.premises, selection, context.lines, {});
    for (const assignment of source) {
      const free = [...metasOf(conclusion)].filter((name) => !assignment.substitution[name] && !fromPremises.has(name));
      for (const substitution of freeChoices(free, assignment.substitution, context.candidates)) {
        const plan = planPremises(form, { ...assignment, substitution }, context, false);
        const formula = plan && instanceOf(conclusion, substitution);
        if (formula) {
          const group = `${formIndex}:${index}:${free.map((name) => format(substitution[name])).join()}`;
          found.push({ ...plan, group, id: form.id, formula, closes: false });
        }
      }
    }
  }
  return found;
}

/** O que a regra acrescenta à prova: menos linhas e fórmulas mais curtas é melhor. */
const cost = ({ added }) => added.reduce((total, item) => (
  total + 1000 + (item.kind === "formula" ? format(item.formula).length : format(item.hypothesis).length + format(item.conclusion).length)
), 0);

const addedText = (item) => (
  item.kind === "formula" ? format(item.formula) : `[${format(item.hypothesis)}] … ${format(item.conclusion)}`
);

/** O que distingue um passo dos outros da mesma regra, para escolher. */
export function outcomeLabel(outcome) {
  return outcome.closes && outcome.added.length > 0
    ? outcome.added.map(addedText).join(", ")
    : format(outcome.formula);
}

/** Dentro de cada grupo só conta a melhor distribuição das citações. Formas diferentes ficam todas. */
function bestOutcomes(found) {
  const best = new Map();
  for (const outcome of found) {
    const current = best.get(outcome.group);
    if (!current || cost(outcome) < cost(current)) best.set(outcome.group, outcome);
  }
  const unique = new Map();
  for (const outcome of best.values()) {
    const key = JSON.stringify([format(outcome.formula), outcome.added.map(addedText), outcome.citations]);
    if (!unique.has(key)) unique.set(key, outcome);
  }
  return [...unique.values()].slice(0, GUIDED_LIMITS.outcomes);
}

const premiseText = (premise) => (
  premise.kind === "formula"
    ? format(premise.schema)
    : `[${format(premise.hypothesis)}] … ${format(premise.conclusion)}`
);

const uniqueText = (items) => [...new Set(items)].join(" · ");

/** Os passos sem seleção: os que dão o objetivo ou, sem nenhum, os que trazem uma fórmula útil. */
function automaticSteps(forms, context) {
  const pick = (form, substitution) => automaticAssignments(form.premises, context, substitution);
  const options = { pick };
  const towardsTarget = context.target
    ? forms.flatMap((form, index) => fromTarget(form, index, [], context, options))
    : [];
  if (towardsTarget.length > 0) return towardsTarget;
  const known = context.available.lines.map((line) => format(context.lines[line - 1].formula));
  return forms
    .flatMap((form, index) => fromSelection(form, index, [], context, options))
    .filter(({ formula }) => context.useful.has(format(formula)) && !known.includes(format(formula)))
    .map((step) => ({ ...step, group: `${step.group}:${format(step.formula)}` }));
}

/** Porque é que nenhuma forma da regra serve. */
function refusal(forms, selection, target) {
  const premises = uniqueText(forms.map((form) => form.premises.map(premiseText).join(", ")));
  if (selection.length > 0) return { key: "guided.reasons.selectionMismatch", params: { premises } };
  const reachable = target && forms.some((form) => form.conclusions.some((schema) => matchSchema(schema, target).ok));
  if (target && !reachable) {
    const conclusions = uniqueText(forms.flatMap((form) => form.conclusions.map(format)));
    return { key: "guided.reasons.targetMismatch", params: { conclusions } };
  }
  return { key: "guided.reasons.needsSelection", params: { premises } };
}

/** Todas as regras que existem, cada uma com os passos possíveis ou o motivo por que não tem nenhum. */
export function guidedRules(editor, selection, { rules, known = rules }) {
  const anchor = guidedAnchor(editor);
  const useful = subformulas(editor);
  const context = {
    lines: editor.proof.lines,
    available: citable(editor.proof, anchor),
    target: anchor.target,
    candidates: [...useful.values()].slice(0, GUIDED_LIMITS.candidates),
    useful,
  };
  const ids = [...new Set([...known, ...rules].map(({ id }) => id))];

  return ids.map((id) => {
    const forms = rules.filter((rule) => rule.id === id);
    if (forms.length === 0) {
      return { id, outcomes: [], reason: { key: "guided.reasons.notAllowed", params: { rule: id } } };
    }
    const towardsTarget = context.target
      ? forms.flatMap((form, index) => fromTarget(form, index, selection, context))
      : [];
    let found = towardsTarget.length > 0
      ? towardsTarget
      : forms.flatMap((form, index) => fromSelection(form, index, selection, context));
    if (found.length === 0 && selection.length === 0) found = automaticSteps(forms, context);
    const outcomes = bestOutcomes(found);
    return { id, outcomes, reason: outcomes.length > 0 ? null : refusal(forms, selection, context.target) };
  });
}

const writtenDraft = (formula) => ({ ...blankDraft(), formula: format(formula) });

/** O primeiro objetivo a partir da linha `from`, ou o primeiro da prova; sem nenhum, `fallback`. */
function nextObjective(proof, from, fallback) {
  const numbers = proof.lines.map((_, index) => index + 1).filter((number) => isPending(proof.lines[number - 1]));
  return numbers.find((number) => number >= from) ?? numbers[0] ?? fallback;
}

/** Acrescenta o passo `outcome` de `guidedRules`, calculado para este mesmo estado. */
export function applyOutcome(editor, outcome, ruleLabels = {}) {
  const anchor = guidedAnchor(editor);
  const { depth } = anchor;
  const first = anchor.at + 1;
  let { proof, drafts } = editor;
  let after = anchor.at;

  const insert = (line) => {
    ({ proof } = insertLine(proof, after, line));
    drafts = spliced(drafts, after, 0, writtenDraft(line.formula));
    after += 1;
    return after;
  };

  const opened = outcome.added.map((item) => {
    if (item.kind === "formula") return citeLine(insert({ depth, formula: item.formula }));
    const from = insert({ kind: "hypothesis", depth: depth + 1, formula: item.hypothesis });
    return citeRange(from, insert({ depth: depth + 1, formula: item.conclusion }));
  });
  const citations = outcome.citations.map((citation) => (
    "added" in citation ? opened[citation.added] : citation
  ));

  const step = { formula: outcome.formula, rule: outcome.id, citations };
  let stepLine;
  if (outcome.closes) {
    stepLine = after + 1;
    ({ proof } = editLine(proof, stepLine, step));
  } else {
    stepLine = insert({ depth, ...step });
  }
  const justification = formatJustification(outcome.id, citations, ruleLabels);
  drafts = spliced(drafts, stepLine - 1, 1, { ...writtenDraft(outcome.formula), justification });

  const objective = anchor.pending && !outcome.closes
    ? stepLine + 1
    : nextObjective(proof, outcome.closes ? first : stepLine, stepLine);
  return commit(editor, { proof, drafts: syncJustifications(proof, drafts), cursor: { line: objective, field: "formula" } });
}
