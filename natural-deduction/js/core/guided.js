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
//
// 1.ª ordem: um passo pode trazer `ask`, { kind: "term" | "variable", value }, quando a ferramenta
// escolheu um termo (o t do ∀E, do ∃I e do =I, entre os termos que já estão na prova) ou a variável
// nova de uma caixa [v] (∀I, ∃E). Quem mostra o passo deixa mudá-la:
//   reviseOutcome(editor, outcome, text) → { ok: true, outcome } | { ok: false, reason: { key, params } }
// No ∃I e no =E, as várias conclusões possíveis (que ocorrências do termo mudam) são passos à parte.

import { blankDraft, commit, formulaText, moveCursor, spliced, syncJustifications } from "./editor.js";
import {
  VARIABLE_METAVARIABLES, displayName, equals, format, freeVariables, isTermName, occurs, term,
} from "./formula.js";
import { parseFormula } from "./parser.js";
import { accessibleFrom, citeLine, citeRange, editLine, insertAtBoxStart, insertLine } from "./proof.js";
import { formatJustification } from "./proof-text.js";
import { PENDING, applySubstitution, checkCondition, matchSchema, sameFormula } from "./schema.js";
import { bindPremise } from "./verify.js";

/**
 * Passos oferecidos por regra, fórmulas candidatas para uma metavariável livre e, nas citações automáticas,
 * resultados e tentativas. As tentativas travam a procura mesmo quando nenhuma forma de citar chega ao fim.
 * `occurrences`: ocorrências de um termo que o ∃I e o =E podem escolher mudar (2^n − 1 conclusões).
 */
export const GUIDED_LIMITS = Object.freeze({ outcomes: 12, candidates: 8, automatic: 200, attempts: 20000, occurrences: 4 });

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

/**
 * A premissa com as metavariáveis substituídas, ou null se faltar alguma. Uma caixa [v] guarda o nome
 * da variável em `fresh`; a do ∀I tem `hypothesis` null.
 */
function fillPremise(premise, substitution) {
  if (premise.kind === "formula") {
    const formula = instanceOf(premise.schema, substitution);
    return formula && { kind: "formula", formula };
  }
  const hypothesis = premise.hypothesis === null ? null : instanceOf(premise.hypothesis, substitution);
  const conclusion = instanceOf(premise.conclusion, substitution);
  const fresh = premise.fresh ? substitution[premise.fresh]?.name ?? null : null;
  if (!conclusion || (premise.hypothesis !== null && !hypothesis) || (premise.fresh && !fresh)) return null;
  return { kind: "subproof", hypothesis, conclusion, fresh };
}

/** A citação de algo que já está na prova e dá a premissa, ou null. Uma caixa [v] abre-se sempre de novo. */
function existingCitation(filled, { lines, available }) {
  if (filled.kind === "formula") {
    const line = available.lines.find((number) => sameFormula(lines[number - 1].formula, filled.formula));
    return line ? citeLine(line) : null;
  }
  if (filled.fresh) return null;
  const range = available.ranges.find(({ from, to }) => (
    sameFormula(lines[from - 1].formula, filled.hypothesis) && sameFormula(lines[to - 1].formula, filled.conclusion)
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
        const repeatsTarget = filled.kind === "formula" && context.target && sameFormula(filled.formula, context.target);
        if (!allowNew || repeatsTarget) return null;
        citations.push({ added: added.length });
        added.push(filled);
      }
    }
  }
  return { citations, added };
}

const META_KINDS = new Set(["meta", "metaTerm", "metaVariable"]);
const QUANTIFIER_KINDS = new Set(["forall", "exists"]);

/** As metavariáveis de um esquema, por ordem, com o tipo: "meta" (fórmula), "metaTerm" ou "metaVariable". */
function metasOf(schema, found = new Map()) {
  if (META_KINDS.has(schema.kind)) found.set(schema.name, schema.kind);
  else if (QUANTIFIER_KINDS.has(schema.kind) && VARIABLE_METAVARIABLES.includes(schema.name)) found.set(schema.name, "metaVariable");
  for (const arg of schema.args) metasOf(arg, found);
  return found;
}

function premiseMetasInto(premise, found) {
  for (const schema of premise.kind === "formula" ? [premise.schema] : [premise.hypothesis, premise.conclusion]) {
    if (schema) metasOf(schema, found);
  }
  if (premise.kind === "subproof" && premise.fresh) found.set(premise.fresh, "metaVariable");
  return found;
}

function premiseMetas(premises) {
  const found = new Map();
  for (const premise of premises) premiseMetasInto(premise, found);
  return found;
}

/** Os nomes de termos e de variáveis ligadas que ocorrem nas fórmulas. */
export function namesOf(formulas) {
  const names = new Set();
  const visit = (node) => {
    if (node.kind === "term" || QUANTIFIER_KINDS.has(node.kind)) names.add(node.name);
    for (const arg of node.args) visit(arg);
  };
  formulas.filter(Boolean).forEach(visit);
  return names;
}

/** O primeiro nome de `preferred` que não está em `names`, ou `base` com um número. */
export function unusedName(names, preferred, base) {
  const found = preferred.find((name) => !names.has(name));
  if (found) return found;
  for (let i = 1; ; i += 1) if (!names.has(`${base}${i}`)) return `${base}${i}`;
}

/** Os termos de `formula` que não dependem de variáveis ligadas, pela ordem em que aparecem (por texto). */
export function freeTerms(formula, found = new Map(), bound = []) {
  if (formula.kind === "term") {
    if (![...freeVariables(formula)].some((name) => bound.includes(name))) found.set(format(formula), formula);
  }
  const inner = QUANTIFIER_KINDS.has(formula.kind) ? [...bound, formula.name] : bound;
  for (const arg of formula.args) freeTerms(arg, found, inner);
  return found;
}

/**
 * Os termos à escolha para um t: os do objetivo e os das linhas acessíveis, das mais recentes para as
 * mais antigas. Sem nenhum, um nome novo.
 */
function termCandidates({ target, lines, available, names }) {
  const found = new Map();
  const formulas = [target, ...[...available.lines].reverse().map((line) => lines[line - 1].formula)];
  for (const formula of formulas.filter(Boolean)) freeTerms(formula, found);
  const terms = [...found.values()].slice(0, GUIDED_LIMITS.candidates);
  return terms.length > 0 ? terms : [term(unusedName(names, ["a", "b", "c"], "a"))];
}

/**
 * As fórmulas φ em que φ[t/x] dá `formula`: cada escolha não vazia das ocorrências livres de t (até
 * `GUIDED_LIMITS.occurrences`) passa a x. Primeiro as que mudam mais ocorrências.
 */
function abstractions(formula, t, x) {
  const names = [...freeVariables(t)];
  const isOccurrence = (node, bound) => equals(node, t) && !names.some((name) => bound.includes(name)) && !bound.includes(x);
  let count = 0;
  const countIn = (node, bound) => {
    if (isOccurrence(node, bound)) {
      count += 1;
      return;
    }
    const inner = QUANTIFIER_KINDS.has(node.kind) ? [...bound, node.name] : bound;
    for (const arg of node.args) countIn(arg, inner);
  };
  countIn(formula, []);
  const total = Math.min(count, GUIDED_LIMITS.occurrences);
  const masks = Array.from({ length: 2 ** total - 1 }, (_, index) => index + 1);
  const ones = (mask) => mask.toString(2).replaceAll("0", "").length;
  masks.sort((a, b) => ones(b) - ones(a) || a - b);
  const variable = term(x);
  return masks.map((mask) => {
    let index = 0;
    const build = (node, bound) => {
      if (isOccurrence(node, bound)) {
        const hit = index < total && ((mask >> index) & 1) === 1;
        index += 1;
        return hit ? variable : node;
      }
      if (node.args.length === 0) return node;
      const inner = QUANTIFIER_KINDS.has(node.kind) ? [...bound, node.name] : bound;
      const args = node.args.map((arg) => build(arg, inner));
      return args.every((arg, i) => arg === node.args[i]) ? node : Object.freeze({ ...node, args: Object.freeze(args) });
    };
    return build(formula, []);
  });
}

/** A substituição sem o primeiro φ[t/x] adiado, que passa a `item`. */
function withoutFirstPending(substitution) {
  const [item, ...rest] = substitution[PENDING];
  const bindings = { ...substitution };
  delete bindings[PENDING];
  if (rest.length > 0) bindings[PENDING] = Object.freeze(rest);
  return { item, bindings };
}

/**
 * Completa a substituição de uma forma: resolve os φ[t/x] adiados e liga as metavariáveis que faltam
 * nas premissas por citar e na conclusão. Escolhe-se no máximo um termo ou uma variável nova (`ask`):
 * só o t do ∀E, do ∃I e do =I, e só o v de uma caixa [v]. Um t por saber num φ[t/x] só se procura nas
 * premissas citadas, nunca no objetivo: o ∀E não sugere provar ∀x P(x) para chegar a P(a).
 * Dá { substitution, ask, chosen }, com `chosen` o texto do que se escolheu, para distinguir os passos.
 */
function* completions(state, needs, context) {
  const { needed, premiseNames, fresh, conditions } = needs;
  const { substitution, ask, chosen } = state;
  if ((substitution[PENDING] ?? []).length > 0) {
    const { item, bindings } = withoutFirstPending(substitution);
    const [phi, tSchema, xSchema] = item.schema.args;
    const known = bindings[tSchema.name];
    if (bindings[phi.name] || (!known && (tSchema.name !== "t" || item.formula === context.target))) return;
    const terms = known ? [known] : [...freeTerms(item.formula).values()];
    const variable = bindings[xSchema.name]?.name ?? unusedName(namesOf([item.formula]), ["x", "y", "z"], "x");
    for (const t of terms) {
      for (const body of abstractions(item.formula, t, variable)) {
        const tried = { ...bindings, [phi.name]: body, [xSchema.name]: term(variable), [tSchema.name]: t };
        const match = matchSchema(item.schema, item.formula, tried);
        if (match.ok) {
          const next = { substitution: match.substitution, ask, chosen: [...chosen, format(body), format(t)] };
          yield* completions(next, needs, context);
        }
      }
    }
    return;
  }
  const missing = [...needed].find(([name]) => !substitution[name]);
  if (!missing) {
    // As condições que já se podem avaliar: o ∀I de P(v, v) só dá ∀x P(x, x).
    if (conditions.every((condition) => checkCondition(condition, substitution) !== false)) yield state;
    return;
  }
  const [name, kind] = missing;
  const bindOne = function* (value, nextAsk) {
    const next = { substitution: { ...substitution, [name]: value }, ask: nextAsk, chosen: [...chosen, format(value)] };
    yield* completions(next, needs, context);
  };
  if (kind === "metaTerm") {
    if (name !== "t" || ask) return;
    for (const t of context.terms) yield* bindOne(t, { kind: "term", meta: name });
  } else if (kind === "metaVariable") {
    if (!fresh.has(name) || ask) return;
    yield* bindOne(term(context.freshVariable), { kind: "variable", meta: name });
  } else if (!premiseNames.has(name)) {
    for (const formula of context.candidates) yield* bindOne(formula, ask);
  }
}

/** O que `completions` precisa de saber da forma e da distribuição das citações. */
function needsOf(form, conclusion, cited) {
  const needed = new Map();
  form.premises.forEach((premise, position) => {
    if (!cited.has(position)) premiseMetasInto(premise, needed);
  });
  metasOf(conclusion, needed);
  const fresh = new Set(form.premises.filter(({ fresh: name }) => name).map(({ fresh: name }) => name));
  return { needed, premiseNames: premiseMetas(form.premises), fresh, conditions: form.conditions ?? [] };
}

/**
 * As conclusões possíveis de uma regra já com tudo citado (`rule-pick.js`), na linha `line`: { formula,
 * asked }, com `asked` quando a conclusão traz um termo escolhido entre os da prova (o t do ∀E e do =I).
 */
export function possibleConclusions(editor, line, { form, conclusion, substitution, cited }) {
  const { proof } = editor;
  const anchor = { line, target: proof.lines[line - 1].formula, pending: false, access: accessibleFrom(proof, line) };
  const context = guidedContext(editor, anchor);
  const found = new Map();
  for (const { substitution: full, ask } of completions({ substitution, ask: null, chosen: [] }, needsOf(form, conclusion, cited), context)) {
    const formula = instanceOf(conclusion, full);
    if (formula && !found.has(format(formula))) found.set(format(formula), { formula, asked: Boolean(ask) });
  }
  return [...found.values()].slice(0, GUIDED_LIMITS.outcomes);
}

/** As fórmulas das premissas preenchidas, para mostrar o passo quando ele só cita. */
function filledText(form, substitution) {
  return form.premises.map((premise) => {
    const filled = fillPremise(premise, substitution);
    return filled ? addedText(filled) : "";
  }).filter(Boolean).join(", ");
}

/** O passo com a substituição completa, ou null. `source` diz como se chegou lá. */
function buildOutcome(source, substitution, context) {
  const { form, conclusion, cited, closes, allowNew } = source;
  const plan = planPremises(form, { substitution, cited }, context, allowNew);
  if (!plan) return null;
  const formula = closes ? context.target : instanceOf(conclusion, substitution);
  if (!formula) return null;
  return { ...plan, id: form.id, formula, closes };
}

/** Os passos de uma conclusão da forma, para cada distribuição das citações. */
function outcomesOf(form, formIndex, index, sources, context, { closes, allowNew }) {
  const conclusion = form.conclusions[index];
  const found = [];
  for (const assignment of sources) {
    const needs = needsOf(form, conclusion, assignment.cited);
    for (const { substitution, ask, chosen } of completions({ ...assignment, ask: null, chosen: [] }, needs, context)) {
      const source = { form, conclusion, cited: assignment.cited, closes, allowNew, substitution };
      const outcome = buildOutcome(source, substitution, context);
      if (outcome) {
        const group = `${formIndex}:${index}:${chosen.join()}`;
        const extra = ask ? { ask: { ...ask, value: substitution[ask.meta] }, source } : {};
        if (ask && closes && outcome.added.length === 0) extra.text = filledText(form, substitution);
        found.push({ ...outcome, group, ...extra });
      }
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

/** Os passos que dão o objetivo. `options.pick` troca a seleção por citações encontradas sozinhas. */
function fromTarget(form, formIndex, selection, context, { pick = null } = {}) {
  const found = [];
  for (const [index, conclusion] of form.conclusions.entries()) {
    const match = matchSchema(conclusion, context.target);
    if (match.ok) {
      const sources = pick
        ? pick(form, match.substitution)
        : assignments(form.premises, selection, context.lines, match.substitution);
      found.push(...outcomesOf(form, formIndex, index, sources, context, { closes: true, allowNew: !pick }));
    }
  }
  return found;
}

/** Os passos que seguem do que está selecionado, sem objetivo. */
function fromSelection(form, formIndex, selection, context, { pick = null } = {}) {
  if (!pick && selection.length === 0 && form.premises.length > 0) return [];
  const found = [];
  for (const index of form.conclusions.keys()) {
    const sources = pick ? pick(form, {}) : assignments(form.premises, selection, context.lines, {});
    found.push(...outcomesOf(form, formIndex, index, sources, context, { closes: false, allowNew: false }));
  }
  return found;
}

/** O que a regra acrescenta à prova: menos linhas e fórmulas mais curtas é melhor. */
const cost = ({ added }) => added.reduce((total, item) => total + 1000 + addedText(item).length, 0);

/** Uma premissa preenchida em texto: `[v]` marca a caixa com variável, e a do ∀I não tem hipótese. */
function addedText(item) {
  if (item.kind === "formula") return format(item.formula);
  const conclusion = format(item.conclusion);
  if (!item.fresh) return `[${format(item.hypothesis)}] … ${conclusion}`;
  const opening = item.hypothesis === null ? "" : ` ${format(item.hypothesis)}`;
  return `[${displayName(item.fresh)}]${opening} … ${conclusion}`;
}

/** O que distingue um passo dos outros da mesma regra, para escolher. */
export function outcomeLabel(outcome) {
  if (outcome.text) return outcome.text;
  return outcome.closes && outcome.added.length > 0
    ? outcome.added.map(addedText).join(", ")
    : format(outcome.formula);
}

/** O texto a mostrar no campo do pedido: o termo, ou o nome da variável nova. */
export const askText = ({ ask }) => (ask ? format(ask.value) : "");

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

/** Uma premissa em texto; uma caixa com variável leva a marca `[v]` (a do ∀I não tem hipótese). */
export function premiseText(premise, show = format) {
  if (premise.kind === "formula") return show(premise.schema);
  const conclusion = show(premise.conclusion);
  if (!premise.fresh) return `[${show(premise.hypothesis)}] … ${conclusion}`;
  const opening = premise.hypothesis === null ? "" : ` ${show(premise.hypothesis)}`;
  return `[${premise.fresh}]${opening} … ${conclusion}`;
}

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
  const premises = uniqueText(forms.map((form) => form.premises.map((premise) => premiseText(premise)).join(", ")));
  if (selection.length > 0) return { key: "guided.reasons.selectionMismatch", params: { premises } };
  const reachable = target && forms.some((form) => form.conclusions.some((schema) => matchSchema(schema, target).ok));
  if (target && !reachable) {
    const conclusions = uniqueText(forms.flatMap((form) => form.conclusions.map(format)));
    return { key: "guided.reasons.targetMismatch", params: { conclusions } };
  }
  return { key: "guided.reasons.needsSelection", params: { premises } };
}

/** O que os passos precisam de saber do estado do editor. */
function guidedContext(editor, anchor = guidedAnchor(editor)) {
  const useful = subformulas(editor);
  const { goal, proof } = editor;
  const names = namesOf([...goal.premises, goal.conclusion, ...proof.lines.map(({ formula }) => formula)]);
  const context = {
    lines: proof.lines,
    available: citable(proof, anchor),
    target: anchor.target,
    candidates: [...useful.values()].slice(0, GUIDED_LIMITS.candidates),
    useful,
    names,
    freshVariable: unusedName(names, ["v", "u", "w"], "v"),
    // O objetivo que abre a caixa do ∀I passa-a à primeira linha que entrar antes dele.
    boxStart: anchor.pending && (proof.lines[anchor.line - 1].fresh ?? null) !== null,
  };
  context.terms = termCandidates(context);
  return context;
}

/**
 * Se o passo abriria uma caixa do ∀I na mesma linha que a caixa do objetivo: só há uma caixa por linha,
 * por isso o passo não se oferece.
 */
const clashesWithBox = ({ boxStart }, { closes, added }) => (
  boxStart && closes && added[0]?.kind === "subproof" && added[0].fresh !== null && added[0].hypothesis === null
);

/** Todas as regras que existem, cada uma com os passos possíveis ou o motivo por que não tem nenhum. */
export function guidedRules(editor, selection, { rules, known = rules }) {
  const context = guidedContext(editor);
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
    const kept = found.filter((outcome) => !clashesWithBox(context, outcome));
    const outcomes = bestOutcomes(kept);
    if (outcomes.length > 0) return { id, outcomes, reason: null };
    const reason = kept.length < found.length
      ? { key: "guided.reasons.boxClash", params: { variable: displayName(editor.proof.lines[guidedAnchor(editor).line - 1].fresh) } }
      : refusal(forms, selection, context.target);
    return { id, outcomes, reason };
  });
}

/** Lê um termo escrito à mão, ou null. */
function readTerm(text) {
  const read = parseFormula(`P(${text})`);
  if (!read.ok || read.formula.kind !== "atom" || read.formula.args.length !== 1) return null;
  return read.formula.args[0];
}

/**
 * Muda o termo ou a variável nova que o passo escolheu (`outcome.ask`) para o que está em `text`. A
 * variável tem de ser um nome que não ocorre no objetivo, nas linhas acessíveis nem no passo.
 */
export function reviseOutcome(editor, outcome, text) {
  const { ask, source } = outcome;
  if (!ask) return { ok: true, outcome };
  const context = guidedContext(editor);
  const written = text.trim();
  const value = ask.kind === "term" ? readTerm(written) : (isTermName(written) && term(written)) || null;
  if (!value) {
    const key = ask.kind === "term" ? "guided.reasons.badTerm" : "guided.reasons.badVariable";
    return { ok: false, reason: { key, params: { text: written } } };
  }
  const substitution = { ...source.substitution, [ask.meta]: value };
  if (ask.kind === "variable") {
    const seen = [
      context.target,
      ...context.available.lines.map((line) => context.lines[line - 1].formula),
      outcome.formula,
      ...outcome.added.filter(({ kind }) => kind === "formula").map(({ formula }) => formula),
      ...source.form.premises.filter(({ kind }) => kind === "formula").map(({ schema }) => instanceOf(schema, substitution)),
    ];
    if (seen.some((formula) => formula && occurs(formula, value.name))) {
      return { ok: false, reason: { key: "guided.reasons.notFresh", params: { variable: displayName(value.name) } } };
    }
  }
  const built = buildOutcome(source, substitution, context);
  if (!built || clashesWithBox(context, built)) {
    return { ok: false, reason: { key: "guided.reasons.notSubstitutable", params: { term: format(value) } } };
  }
  const revised = { ...outcome, ...built, ask: { ...ask, value }, source: { ...source, substitution } };
  delete revised.text;
  if (outcome.text) revised.text = filledText(source.form, substitution);
  return { ok: true, outcome: revised };
}

const writtenDraft = (line) => ({ ...blankDraft(), formula: formulaText(line) });

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
  let { boxStart } = guidedContext(editor, anchor);

  const insert = (line) => {
    if (boxStart) {
      boxStart = false;
      ({ proof } = insertAtBoxStart(proof, after + 1, line));
      drafts = spliced(drafts, after, 1, { ...drafts[after], formula: formulaText(proof.lines[after + 1]) });
    } else {
      ({ proof } = insertLine(proof, after, line));
    }
    drafts = spliced(drafts, after, 0, writtenDraft(proof.lines[after]));
    after += 1;
    return after;
  };

  const opened = outcome.added.map((item) => {
    if (item.kind === "formula") return citeLine(insert({ depth, formula: item.formula }));
    if (item.hypothesis === null) {
      const from = insert({ depth: depth + 1, formula: item.conclusion, fresh: item.fresh });
      return citeRange(from, from);
    }
    const from = insert({ kind: "hypothesis", depth: depth + 1, formula: item.hypothesis, fresh: item.fresh ?? null });
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
  drafts = spliced(drafts, stepLine - 1, 1, { ...writtenDraft(proof.lines[stepLine - 1]), justification });

  const objective = anchor.pending && !outcome.closes
    ? stepLine + 1
    : nextObjective(proof, outcome.closes ? first : stepLine, stepLine);
  return commit(editor, { proof, drafts: syncJustifications(proof, drafts), cursor: { line: objective, field: "formula" } });
}
