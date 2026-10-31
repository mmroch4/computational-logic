// Procura de provas. Módulo puro (sem DOM).
// Contrato:
//   solve(goal, { maxSteps = MAX_STEPS })
//     → { ok: true, valid: true, proof, steps }
//     | { ok: true, valid: false, counterexample }
//     | { ok: false, error: { code, params } }
// As mensagens estão em `solver.errors.*`; `tooManyVariables` vem da semântica.
//
// A tabela de verdade decide a validade e depois guia a procura: só se tenta provar o que as fórmulas
// conhecidas implicam. Cada fórmula guarda as linhas da tabela em que é verdadeira, num BigInt, por
// isso «Γ implica φ» é uma conta de bits. Quando Γ é inconsistente, tudo se implica e a tabela deixa
// de distinguir: conta então o que Γ implica sem a fórmula candidata.
//
// A procura constrói uma derivação em árvore (`node`) e só no fim a escreve em Fitch, pelo que os
// factos que a prova não usa nunca chegam a ser linhas.
// Ordem para um objetivo: já conhecido; regra de introdução da conclusão; encadear uma implicação;
// casos de uma disjunção; contradição; e, em último recurso, RA ou assumir uma fórmula para obter a
// negação dela (sem TE, para o resultado valer com as regras base mais RA).

import { atom, equals, FALSUM, format, not } from "./formula.js";
import { citeLine, citeRange, createProof } from "./proof.js";
import { RULES } from "./rules.js";
import { checkSequent, variablesOf } from "./semantics.js";
import { verifyProof } from "./verify.js";

/** Limite de passos da procura. */
export const MAX_STEPS = 20000;

/** Códigos de erro próprios; o outro é `tooManyVariables`. */
export const SOLVER_ERROR_CODES = [
  "stepLimit", // { max }: a procura parou sem provar nem refutar que há prova
  "searchExhausted", // o sequente é válido e a procura acabou sem prova: é um erro do solver
  "unverifiedProof", // a prova gerada não passou no verificador: é um erro do solver
];

class StepLimit extends Error {}

/** Colunas da tabela de verdade das fórmulas da procura, com cada fórmula única por texto. */
function createTable(names) {
  const rows = 2 ** names.length;
  const all = (1n << BigInt(rows)) - 1n;
  const entries = new Map();
  const atoms = new Map(names.map((name, index) => {
    // Colunas periódicas: a variável i muda de 2^i em 2^i linhas.
    let width = BigInt(2 ** index);
    let column = ((1n << width) - 1n) << width;
    for (width *= 2n; width < BigInt(rows); width *= 2n) column |= column << width;
    return [name, column];
  }));

  function modelsOf({ kind, name, args }) {
    const [left, right] = args.map((arg) => intern(arg).models);
    switch (kind) {
      case "falsum":
        return 0n;
      case "atom":
        return atoms.get(name);
      case "not":
        return all ^ left;
      case "and":
        return left & right;
      case "or":
        return left | right;
      case "implies":
        return (all ^ left) | right;
      default:
        throw new Error(`Fórmula sem tabela de verdade: ${kind}`);
    }
  }

  function intern(formula) {
    const key = format(formula);
    let entry = entries.get(key);
    if (!entry) {
      const models = modelsOf(formula); // interna os filhos, por isso vem antes de contar as entradas
      entry = { id: entries.size, key, formula, models };
      entries.set(key, entry);
    }
    return entry;
  }

  return { all, intern };
}

/** Passo da derivação. `from` tem nós e, para as subdeduções, `{ hypothesis, end }`. */
const node = (entry, rule, from = []) => ({ entry, rule, from });

const assumption = (entry) => node(entry, null);

const subderivation = (hypothesis, end) => ({ hypothesis, end });

function createSearch(goal, maxSteps) {
  const table = createTable(variablesOf([...goal.premises, goal.conclusion]));
  const { all, intern } = table;
  const absurd = intern(FALSUM);
  const active = new Set();
  let steps = 0;

  const negation = (entry) => intern(not(entry.formula));
  const arg = (entry, index) => intern(entry.formula.args[index]);
  const entailedBy = (models, entry) => (models & (all ^ entry.models)) === 0n;
  const known = (context, entry) => context.facts.has(entry.id);

  function spend() {
    steps += 1;
    if (steps > maxSteps) throw new StepLimit();
  }

  /** Acrescenta `fresh` e tudo o que segue por ∧E, ¬E, →E e FI. */
  function extend(context, fresh) {
    const facts = new Map(context.facts);
    const pending = [...fresh];
    const add = (item) => {
      if (!facts.has(item.entry.id)) pending.push(item);
    };
    while (pending.length > 0) {
      const item = pending.pop();
      if (facts.has(item.entry.id)) continue;
      spend();
      const { entry } = item;
      facts.set(entry.id, item);
      const { kind } = entry.formula;
      if (kind === "and") {
        add(node(arg(entry, 0), "∧E", [item]));
        add(node(arg(entry, 1), "∧E", [item]));
      }
      if (kind === "not") {
        const inner = arg(entry, 0);
        if (facts.has(inner.id)) add(node(absurd, "FI", [facts.get(inner.id), item]));
        if (inner.formula.kind === "not") add(node(arg(inner, 0), "¬E", [item]));
      }
      if (kind === "implies" && facts.has(arg(entry, 0).id)) {
        add(node(arg(entry, 1), "→E", [facts.get(arg(entry, 0).id), item]));
      }
      const negated = negation(entry);
      if (facts.has(negated.id)) add(node(absurd, "FI", [item, facts.get(negated.id)]));
      for (const other of facts.values()) {
        const formula = other.entry.formula;
        if (formula.kind === "implies" && equals(formula.args[0], entry.formula)) {
          add(node(arg(other.entry, 1), "→E", [item, other]));
        }
      }
    }
    let models = all;
    for (const { entry } of facts.values()) models &= entry.models;
    return { facts, models };
  }

  /** O que Γ implica sem a fórmula `left`. */
  function without(context, left) {
    let models = all;
    for (const { entry } of context.facts.values()) {
      if (entry.id !== left.id) models &= entry.models;
    }
    return models;
  }

  const bySize = (a, b) => a.needs.key.length - b.needs.key.length;

  /** Prova `target` dentro de uma subdedução com a hipótese `entry`. */
  function inSubproof(context, entry, target) {
    const hypothesis = assumption(entry);
    const end = prove(extend(context, [hypothesis]), target);
    return end && subderivation(hypothesis, end);
  }

  function introduce(context, target) {
    const { formula } = target;
    if (formula.kind === "implies") {
      const body = inSubproof(context, arg(target, 0), arg(target, 1));
      return body && node(target, "→I", [body]);
    }
    if (formula.kind === "not") {
      const body = inSubproof(context, arg(target, 0), absurd);
      return body && node(target, "¬I", [body]);
    }
    if (formula.kind === "and") {
      const left = prove(context, arg(target, 0));
      const right = left && prove(extend(context, [left]), arg(target, 1));
      return right && node(target, "∧I", [left, right]);
    }
    if (formula.kind === "or") {
      const sides = [arg(target, 0), arg(target, 1)]
        .filter((side) => entailedBy(context.models, side))
        .sort((a, b) => known(context, b) - known(context, a));
      for (const side of sides) {
        const proved = prove(context, side);
        if (proved) return node(target, "∨I", [proved]);
      }
    }
    return null;
  }

  /** Implicações e negações em Γ que ainda não renderam, com o antecedente que lhes falta. */
  function pendingUses(context) {
    const uses = [];
    for (const item of context.facts.values()) {
      const { entry } = item;
      if (entry.formula.kind === "implies") {
        const gives = arg(entry, 1);
        if (!known(context, gives)) uses.push({ item, needs: arg(entry, 0), gives, rule: "→E" });
      } else if (entry.formula.kind === "not") {
        uses.push({ item, needs: arg(entry, 0), gives: absurd, rule: "FI" });
      }
    }
    return uses.sort(bySize);
  }

  /** Prova o que `use` precisa, junta o que ele dá e continua até `target`. */
  function applyUse(context, { item, needs, gives, rule }, target) {
    const proved = prove(context, needs);
    if (!proved) return null;
    return prove(extend(context, [node(gives, rule, [proved, item])]), target);
  }

  /** `use` serve se o resto de Γ lhe dá o antecedente sem já implicar o objetivo. */
  function isNeeded({ item, needs }, context, target) {
    const rest = without(context, item.entry);
    return entailedBy(rest, needs) && !entailedBy(rest, target);
  }

  function disjunctions(context) {
    return [...context.facts.values()].filter(({ entry }) => (
      entry.formula.kind === "or" && !known(context, arg(entry, 0)) && !known(context, arg(entry, 1))
    ));
  }

  function splitOn(context, item, target) {
    const left = inSubproof(context, arg(item.entry, 0), target);
    const right = left && inSubproof(context, arg(item.entry, 1), target);
    return right && node(target, "∨E", [item, left, right]);
  }

  /** Assume cada fórmula ainda por decidir: a subdedução dá ¬φ, um facto novo, e continua-se. */
  function assumeAndRefute(context) {
    const pending = pendingUses(context).map(({ needs }) => needs);
    const atoms = variablesOf([...goal.premises, goal.conclusion]).map((name) => intern(atom(name)));
    for (const entry of [...pending, ...atoms]) {
      if (known(context, entry) || known(context, negation(entry))) continue;
      const body = inSubproof(context, entry, absurd);
      if (!body) continue;
      const proved = prove(extend(context, [node(negation(entry), "¬I", [body])]), absurd);
      if (proved) return proved;
    }
    return null;
  }

  /** Tenta os candidatos por ordem e devolve a primeira derivação. */
  function firstOf(candidates, attempt) {
    for (const candidate of candidates) {
      const result = attempt(candidate);
      if (result) return result;
    }
    return null;
  }

  function search(context, target) {
    if (target !== absurd) {
      if (known(context, absurd)) return node(target, "FE", [context.facts.get(absurd.id)]);
      if (context.models === 0n) {
        const contradiction = prove(context, absurd);
        if (contradiction) return node(target, "FE", [contradiction]);
      }
      const introduced = introduce(context, target);
      if (introduced) return introduced;
    }

    const uses = pendingUses(context);
    const needed = uses.filter((use) => (
      (use.gives !== absurd || target === absurd) && isNeeded(use, context, target)
    ));
    const chained = firstOf(needed, (use) => applyUse(context, use, target));
    if (chained) return chained;

    const cases = disjunctions(context);
    const usefulCases = cases.filter(({ entry }) => !entailedBy(without(context, entry), target));
    const split = firstOf(usefulCases, (item) => splitOn(context, item, target));
    if (split) return split;

    if (target === absurd) {
      return firstOf(uses.filter((use) => !needed.includes(use)), (use) => applyUse(context, use, target))
        ?? firstOf(cases.filter((item) => !usefulCases.includes(item)), (item) => splitOn(context, item, target))
        ?? assumeAndRefute(context);
    }

    const negated = negation(target);
    if (known(context, negated)) return null;
    const body = inSubproof(context, negated, absurd);
    return body && node(target, "RA", [body]);
  }

  /** Derivação de `target`, ou null. Voltar ao mesmo estado num ramo aberto não leva a lado nenhum. */
  function prove(context, target) {
    if (known(context, target)) return context.facts.get(target.id);
    spend();
    const ids = [...context.facts.keys()].sort((a, b) => a - b).join();
    const state = `${ids}⊢${target.id}`;
    if (active.has(state)) return null;
    active.add(state);
    try {
      return search(context, target);
    } finally {
      active.delete(state);
    }
  }

  const premises = goal.premises.map((formula) => assumption(intern(formula)));
  const root = extend({ facts: new Map(), models: all }, premises);
  return { derivation: prove(root, intern(goal.conclusion)), premises, stepsUsed: () => steps };
}

/** Escreve a derivação em Fitch. Uma fórmula já acessível no escopo não se deriva de novo. */
function writeProof(derivation, premises) {
  const lines = [];
  const scopes = [new Map()];
  const lineOf = (entry) => {
    for (const scope of scopes.toReversed()) {
      if (scope.has(entry.id)) return scope.get(entry.id);
    }
    return null;
  };
  const depth = () => scopes.length - 1;
  const push = (entry, line) => {
    lines.push({ ...line, formula: entry.formula, depth: depth() });
    if (!scopes.at(-1).has(entry.id)) scopes.at(-1).set(entry.id, lines.length);
    return lines.length;
  };

  /** Garante que a última linha do escopo é `end`, com R se ela vier de trás. */
  function finish(end) {
    const line = write(end);
    const closesScope = line === lines.length && lines[line - 1].depth === depth();
    if (!closesScope) push(end.entry, { kind: "step", rule: "R", citations: [citeLine(line)] });
  }

  function writeSubproof({ hypothesis, end }) {
    scopes.push(new Map());
    const from = push(hypothesis.entry, { kind: "hypothesis" });
    finish(end);
    scopes.pop();
    return citeRange(from, lines.length);
  }

  function write(item) {
    const line = lineOf(item.entry);
    if (line !== null) return line;
    const citations = item.from.map((source) => (
      source.hypothesis ? writeSubproof(source) : citeLine(write(source))
    ));
    return push(item.entry, { kind: "step", rule: item.rule, citations });
  }

  for (const { entry } of premises) {
    lines.push({ kind: "premise", depth: 0, formula: entry.formula });
    if (!scopes[0].has(entry.id)) scopes[0].set(entry.id, lines.length);
  }
  finish(derivation);
  return createProof(lines).proof;
}

/** Decide `goal` e, se for válido, procura uma prova, que passa pelo verificador antes de sair. */
export function solve(goal, { maxSteps = MAX_STEPS } = {}) {
  const decided = checkSequent(goal);
  if (!decided.ok) return decided;
  if (!decided.valid) return { ok: true, valid: false, counterexample: decided.counterexample };

  const limit = { ok: false, error: { code: "stepLimit", params: { max: maxSteps } } };
  let found;
  try {
    found = createSearch(goal, maxSteps);
  } catch (error) {
    if (error instanceof StepLimit) return limit;
    throw error;
  }
  if (!found.derivation) return { ok: false, error: { code: "searchExhausted", params: {} } };

  const proof = writeProof(found.derivation, found.premises);
  if (!verifyProof(proof, goal, RULES).ok) {
    return { ok: false, error: { code: "unverifiedProof", params: {} } };
  }
  return { ok: true, valid: true, proof, steps: found.stepsUsed() };
}
