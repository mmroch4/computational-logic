// Procura de provas de 1.ª ordem. Módulo puro (sem DOM); quem a usa é o `solver.js`.
// Contrato:
//   searchFirstOrder(goal, { rules, maxSteps })
//     → { status: "found", derivation, premises, steps }   derivação de `derivation.js`, por arrumar
//     | { status: "exhausted", steps }                      nenhuma prova até onde a procura chega
//     | { status: "stepLimit", steps }                      gastou os `maxSteps`
// Nenhum dos fracassos diz que não há prova: a validade de 1.ª ordem é indecidível.
//
// Sem tabela de verdade, a procura é por aprofundamento iterativo: a profundidade conta os passos que
// são uma escolha (usar uma implicação, um caso, um termo do ∃I, um =E, o RA) e as tentativas crescem
// de 0 em diante até haver prova, até nada ter sido cortado pela profundidade ou até acabarem os passos.
// Assim sai primeiro a prova com menos escolhas. Os passos que nunca perdem nada não contam:
//   - as eliminações diretas, a cada facto novo: ∧E, ¬E, →E com o antecedente à mão, FI, a simetria
//     de uma igualdade, e o ∀E com cada termo que já está na prova (termos fechados do sequente e do
//     objetivo de agora, e variáveis das caixas abertas);
//   - o ∃E sobre um ∃ acessível que não veio de um ∀E, antes de tudo (caixa com uma variável nova);
//   - as introduções do objetivo: →I, ¬I, ∧I, a caixa [v] do ∀I e o =I.
// Depois, por esta ordem: ∨I; ∃I com os termos da prova; as implicações e negações por usar, as mais
// próximas do objetivo primeiro; casos de um ∨; ∃E sobre um ∃ vindo de um ∀E; =E para reescrever o
// objetivo; e o RA (ou ¬I + ¬E). Cada passo só se tenta se a regra estiver ativa.
// As variáveis novas são as primeiras de VARIABLE_NAMES que não ocorrem no sequente nem nas caixas
// abertas. Cada nó com uma variável de caixa na fórmula depende dessa caixa (`uses`), para a escrita
// não o tirar de dentro dela.

import { assumption, boxVariable, node, subderivation } from "./derivation.js";
import { eq, FALSUM, freeVariables, isSubstitutable, not, substitute, term } from "./formula.js";

/** Nomes para as variáveis das caixas, pela ordem dos slides; depois, com índice. */
const VARIABLE_NAMES = ["u", "v", "w", "s", "r"];

/** Nomes para o termo de que o ∀E e o ∃I precisam quando o sequente não tem nenhum. */
const DEFAULT_TERMS = ["a", "b", "c", "d"];

/** Ocorrências de um termo que o =E chega a combinar. */
const MAX_OCCURRENCES = 4;

class StepLimit extends Error {}

const isQuantifier = ({ kind }) => kind === "forall" || kind === "exists";

/** Chave a menos do nome das variáveis ligadas: `∀x P(x)` e `∀y P(y)` dão a mesma. */
function keyOf(formula) {
  const bound = [];
  const visit = (item) => {
    if (item.kind === "term" && item.args.length === 0) {
      const index = bound.lastIndexOf(item.name);
      return index === -1 ? item.name : `#${bound.length - 1 - index}`;
    }
    if (isQuantifier(item)) {
      bound.push(item.name);
      const body = visit(item.args[0]);
      bound.pop();
      return `${item.kind}.${body}`;
    }
    return `${item.kind}:${item.name ?? ""}(${item.args.map(visit).join(",")})`;
  };
  return visit(formula);
}

/** Todos os nomes que ocorrem nas fórmulas: termos, funções, predicados e variáveis ligadas. */
function namesIn(formulas) {
  const names = new Set();
  const visit = (item) => {
    if (item.name) names.add(item.name);
    item.args.forEach(visit);
  };
  formulas.forEach(visit);
  return names;
}

/** Os termos fechados de `formula` (sem variáveis ligadas), por chave. */
function closedTerms(formula, found = new Map()) {
  const visit = (item, bound) => {
    if (item.kind === "term") {
      const free = freeVariables(item);
      if (![...free].some((name) => bound.has(name))) found.set(keyOf(item), item);
      item.args.forEach((arg) => visit(arg, bound));
      return;
    }
    const inner = isQuantifier(item) ? new Set([...bound, item.name]) : bound;
    item.args.forEach((arg) => visit(arg, inner));
  };
  visit(formula, new Set());
  return found;
}

/**
 * As fórmulas que se obtêm de `formula` trocando um subconjunto não vazio das ocorrências livres de
 * `from` por `to`, sem captura. Com mais de MAX_OCCURRENCES ocorrências, só todas de uma vez.
 */
function rewrites(formula, from, to) {
  const fromKey = keyOf(from);
  const fromNames = freeVariables(from);
  const toNames = freeVariables(to);
  let count = 0;
  const countVisit = (item, bound) => {
    if (item.kind === "term") {
      const free = ![...fromNames].some((name) => bound.has(name));
      const safe = ![...toNames].some((name) => bound.has(name));
      if (free && safe && keyOf(item) === fromKey) {
        count += 1;
        return;
      }
      if (item.kind === "term") item.args.forEach((arg) => countVisit(arg, bound));
      return;
    }
    const inner = isQuantifier(item) ? new Set([...bound, item.name]) : bound;
    item.args.forEach((arg) => countVisit(arg, inner));
  };
  countVisit(formula, new Set());
  if (count === 0) return [];

  const replace = (mask) => {
    let index = 0;
    const visit = (item, bound) => {
      if (item.kind === "term") {
        const free = ![...fromNames].some((name) => bound.has(name));
        const safe = ![...toNames].some((name) => bound.has(name));
        if (free && safe && keyOf(item) === fromKey) {
          const chosen = (mask >> index) & 1;
          index += 1;
          return chosen ? to : item;
        }
      }
      if (item.args.length === 0) return item;
      const inner = isQuantifier(item) ? new Set([...bound, item.name]) : bound;
      const args = item.args.map((arg) => visit(arg, inner));
      if (args.every((arg, i) => arg === item.args[i])) return item;
      return Object.freeze({ ...item, args: Object.freeze(args) });
    };
    return visit(formula, new Set());
  };

  if (count > MAX_OCCURRENCES) return [replace((1 << count) - 1)];
  const all = [];
  for (let mask = (1 << count) - 1; mask >= 1; mask -= 1) all.push(replace(mask));
  return all;
}

export function searchFirstOrder(goal, { rules, maxSteps }) {
  const allowed = new Set(rules.map(({ id }) => id));
  const can = (id) => allowed.has(id);
  const entries = new Map();
  const intern = (formula) => {
    const key = keyOf(formula);
    let entry = entries.get(key);
    if (!entry) {
      entry = { id: entries.size, key, formula };
      entries.set(key, entry);
    }
    return entry;
  };
  const absurd = intern(FALSUM);
  const goalFormulas = [...goal.premises, goal.conclusion];
  const goalNames = namesIn(goalFormulas);
  let steps = 0;
  let cutoff = false;
  const active = new Set();

  function spend() {
    steps += 1;
    if (steps > maxSteps) throw new StepLimit();
  }

  const arg = (entry, index) => intern(entry.formula.args[index]);
  const known = (context, entry) => context.facts.has(entry.id);
  const fact = (context, entry) => context.facts.get(entry.id);

  /** Nó da derivação, a depender das caixas das variáveis livres da fórmula. */
  function make(context, entry, rule, from, strategy) {
    const made = node(entry, rule, from, strategy);
    const uses = [...freeVariables(entry.formula)]
      .filter((name) => context.boxes.has(name))
      .map((name) => context.boxes.get(name));
    if (uses.length > 0) made.uses = uses;
    return made;
  }

  /** φ[t/x] de `∀x φ` ou `∃x φ`, ou null se t não for substituível. */
  function instance(entry, t) {
    const { name, args: [body] } = entry.formula;
    return isSubstitutable(body, name, t) ? intern(substitute(body, name, t)) : null;
  }

  /** Acrescenta `items` (e os termos `newTerms`) e tudo o que segue deles sem escolhas. */
  function extend(context, items, newTerms = []) {
    const facts = new Map(context.facts);
    const terms = new Map(context.terms);
    for (const t of newTerms) terms.set(keyOf(t), t);
    const pending = [...items];
    const add = (rule, entry, from, strategy) => {
      if (entry && can(rule) && !facts.has(entry.id)) pending.push(make(context, entry, rule, from, strategy));
    };
    const instantiate = (item, list) => {
      for (const t of list) add("∀E", instance(item.entry, t), [item]);
    };
    if (newTerms.length > 0) {
      for (const item of context.facts.values()) {
        if (item.entry.formula.kind === "forall") instantiate(item, newTerms);
      }
    }
    while (pending.length > 0) {
      const item = pending.pop();
      if (facts.has(item.entry.id)) continue;
      spend();
      const { entry } = item;
      facts.set(entry.id, item);
      const { formula } = entry;
      if (formula.kind === "and") {
        add("∧E", arg(entry, 0), [item]);
        add("∧E", arg(entry, 1), [item]);
      }
      if (formula.kind === "not") {
        const inner = arg(entry, 0);
        if (facts.has(inner.id)) add("FI", absurd, [facts.get(inner.id), item]);
        if (inner.formula.kind === "not") add("¬E", arg(inner, 0), [item]);
      }
      if (formula.kind === "implies" && facts.has(arg(entry, 0).id)) {
        add("→E", arg(entry, 1), [facts.get(arg(entry, 0).id), item]);
      }
      if (formula.kind === "forall") instantiate(item, terms.values());
      if (formula.kind === "eq" && keyOf(formula.args[0]) !== keyOf(formula.args[1]) && can("=I")) {
        const [left, right] = formula.args;
        const reflexive = make(context, intern(eq(left, left)), "=I", []);
        add("=E", intern(eq(right, left)), [item, reflexive]);
      }
      const negated = entries.get(keyOf(not(formula)));
      if (negated && facts.has(negated.id)) add("FI", absurd, [item, facts.get(negated.id)]);
      for (const other of facts.values()) {
        const otherFormula = other.entry.formula;
        if (otherFormula.kind === "implies" && keyOf(otherFormula.args[0]) === entry.key) {
          add("→E", arg(other.entry, 1), [item, other]);
        }
      }
    }
    return { ...context, facts, terms };
  }

  /** A primeira variável nova: não ocorre no sequente nem nas caixas abertas. */
  function freshName(context) {
    for (let index = 0; ; index += 1) {
      for (const base of VARIABLE_NAMES) {
        const name = index === 0 ? base : `${base}${index}`;
        if (!goalNames.has(name) && !context.boxes.has(name) && !context.terms.has(name)) return name;
      }
    }
  }

  /** Prova `target` numa subdedução com a hipótese `entry`. */
  function inSubproof(context, entry, target, strategy, depth) {
    const hypothesis = assumption(entry);
    const end = prove(extend(context, [hypothesis]), target, depth);
    return end && subderivation(hypothesis, end, strategy);
  }

  function forallIntro(context, target, depth) {
    const name = freshName(context);
    const marker = boxVariable(name);
    const variable = term(name);
    const body = instance(target, variable);
    if (!body) return null;
    const inner = extend({ ...context, boxes: new Map(context.boxes).set(name, marker) }, [], [variable]);
    const end = prove(inner, body, depth);
    return end && make(context, target, "∀I", [subderivation(marker, end, "openForallBox", name)]);
  }

  function existsElim(context, item, target, depth) {
    const name = freshName(context);
    const variable = term(name);
    const entry = instance(item.entry, variable);
    if (!entry) return null;
    const hypothesis = assumption(entry);
    const boxes = new Map(context.boxes).set(name, hypothesis);
    const opened = new Set(context.opened).add(item.entry.id);
    const inner = extend({ ...context, boxes, opened }, [hypothesis], [variable]);
    const end = prove(inner, target, depth);
    return end && make(context, target, "∃E", [item, subderivation(hypothesis, end, "assumeWitness", name)]);
  }

  /** As introduções que nunca perdem nada, ou undefined se o objetivo não tiver nenhuma. */
  function introduce(context, target, depth) {
    const { formula } = target;
    if (formula.kind === "implies" && can("→I")) {
      const body = inSubproof(context, arg(target, 0), arg(target, 1), "assumeAntecedent", depth);
      return body && make(context, target, "→I", [body]);
    }
    if (formula.kind === "not" && can("¬I")) {
      const body = inSubproof(context, arg(target, 0), absurd, "assumeToNegate", depth);
      return body && make(context, target, "¬I", [body]);
    }
    if (formula.kind === "and" && can("∧I")) {
      const left = prove(context, arg(target, 0), depth);
      const right = left && prove(extend(context, [left]), arg(target, 1), depth);
      return right && make(context, target, "∧I", [left, right]);
    }
    if (formula.kind === "forall" && can("∀I")) return forallIntro(context, target, depth);
    if (formula.kind === "eq" && keyOf(formula.args[0]) === keyOf(formula.args[1]) && can("=I")) {
      return make(context, target, "=I", []);
    }
    return undefined;
  }

  /** Tenta os candidatos por ordem e devolve a primeira derivação. */
  function firstOf(candidates, attempt) {
    for (const candidate of candidates) {
      const result = attempt(candidate);
      if (result) return result;
    }
    return null;
  }

  /** Termos para o ∃I: os da prova e os que ocorrem nos factos. */
  function witnessTerms(context, target) {
    const found = new Map(context.terms);
    closedTerms(target.formula, found);
    for (const item of context.facts.values()) closedTerms(item.entry.formula, found);
    return [...found.values()];
  }

  function existsIntro(context, target, depth) {
    if (!can("∃I")) return null;
    const instances = [];
    for (const t of witnessTerms(context, target)) {
      const entry = instance(target, t);
      if (entry && !instances.includes(entry)) instances.push(entry);
    }
    const ready = instances.find((entry) => known(context, entry));
    if (ready) return make(context, target, "∃I", [fact(context, ready)]);
    return firstOf(instances, (entry) => {
      const proved = prove(context, entry, depth);
      return proved && make(context, target, "∃I", [proved]);
    });
  }

  function orIntro(context, target, depth) {
    if (!can("∨I")) return null;
    const sides = [arg(target, 0), arg(target, 1)].sort((a, b) => known(context, b) - known(context, a));
    return firstOf(sides, (side) => {
      const proved = prove(context, side, depth);
      return proved && make(context, target, "∨I", [proved]);
    });
  }

  /** Quão perto `gives` está do objetivo: 0 é ele, 1 contém-no, 2 é outra coisa. */
  function closeness(gives, target) {
    if (gives === target) return 0;
    const contains = (formula) => keyOf(formula) === target.key || formula.args.some(
      (item) => item.kind !== "term" && contains(item),
    );
    if (target !== absurd && contains(gives.formula)) return 1;
    if (target === absurd && (gives.formula.kind === "not" || contains(gives.formula))) return 1;
    return 2;
  }

  /** Implicações e negações por usar, com o que lhes falta, das mais próximas do objetivo. */
  function pendingUses(context, target) {
    const uses = [];
    for (const item of context.facts.values()) {
      const { entry } = item;
      if (entry.formula.kind === "implies" && can("→E")) {
        const gives = arg(entry, 1);
        if (!known(context, gives)) uses.push({ item, needs: arg(entry, 0), gives, rule: "→E" });
      } else if (entry.formula.kind === "not" && can("FI") && target === absurd) {
        uses.push({ item, needs: arg(entry, 0), gives: absurd, rule: "FI" });
      }
    }
    const rank = (use) => closeness(use.gives, target) * 1000 + use.needs.key.length;
    return uses.sort((a, b) => rank(a) - rank(b));
  }

  function applyUse(context, { item, needs, gives, rule }, target, depth) {
    const proved = prove(context, needs, depth);
    if (!proved) return null;
    const strategy = rule === "→E" ? "chainImplication" : undefined;
    const made = make(context, gives, rule, [proved, item], strategy);
    return gives === target ? made : prove(extend(context, [made]), target, depth);
  }

  function splitOn(context, item, target, depth) {
    const left = inSubproof(context, arg(item.entry, 0), target, "assumeCase", depth);
    const right = left && inSubproof(context, arg(item.entry, 1), target, "assumeCase", depth);
    return right && make(context, target, "∨E", [item, left, right]);
  }

  /** =E: o objetivo é φ[t/x] e há t1 = t; falta φ[t1/x]. */
  function rewrite(context, target, depth) {
    if (!can("=E")) return null;
    const options = [];
    for (const item of context.facts.values()) {
      if (item.entry.formula.kind !== "eq") continue;
      const [from, to] = item.entry.formula.args;
      if (keyOf(from) === keyOf(to)) continue;
      for (const formula of rewrites(target.formula, to, from)) options.push({ item, needs: intern(formula) });
    }
    const ready = options.find(({ needs }) => known(context, needs));
    if (ready) return make(context, target, "=E", [ready.item, fact(context, ready.needs)]);
    return firstOf(options, ({ item, needs }) => {
      if (needs === target) return null;
      const proved = prove(context, needs, depth);
      return proved && make(context, target, "=E", [item, proved]);
    });
  }

  function classical(context, target, depth) {
    const negated = intern(not(target.formula));
    if (known(context, negated)) return null;
    if (can("RA")) {
      const body = inSubproof(context, negated, absurd, "assumeNegation", depth);
      return body && make(context, target, "RA", [body]);
    }
    if (can("¬I") && can("¬E")) {
      const body = inSubproof(context, negated, absurd, "assumeNegation", depth);
      const doubled = body && make(context, intern(not(negated.formula)), "¬I", [body], "concludeByAbsurd");
      return doubled && make(context, target, "¬E", [doubled]);
    }
    return null;
  }

  function search(outer, target, depth) {
    // Os termos do objetivo (como f(v) em R(v, f(v))) também servem para o ∀E.
    const newTerms = [...closedTerms(target.formula).entries()]
      .filter(([key]) => !outer.terms.has(key))
      .map(([, t]) => t);
    const context = newTerms.length > 0 ? extend(outer, [], newTerms) : outer;
    if (context !== outer && known(context, target)) return fact(context, target);
    if (target !== absurd && can("FE") && known(context, absurd)) {
      return make(context, target, "FE", [fact(context, absurd)]);
    }
    if (can("∃E")) {
      const witness = [...context.facts.values()].find(({ entry, rule }) => (
        entry.formula.kind === "exists" && rule !== "∀E" && !context.opened.has(entry.id)
      ));
      if (witness) return existsElim(context, witness, target, depth);
    }
    const introduced = introduce(context, target, depth);
    if (introduced !== undefined) return introduced;

    if (depth <= 0) {
      cutoff = true;
      return null;
    }
    const next = depth - 1;
    const { kind } = target.formula;
    if (kind === "or") {
      const picked = orIntro(context, target, next);
      if (picked) return picked;
    }
    if (kind === "exists") {
      const shown = existsIntro(context, target, next);
      if (shown) return shown;
    }
    const used = firstOf(pendingUses(context, target), (use) => applyUse(context, use, target, next));
    if (used) return used;
    if (can("∨E")) {
      const cases = [...context.facts.values()].filter(({ entry }) => (
        entry.formula.kind === "or" && !known(context, arg(entry, 0)) && !known(context, arg(entry, 1))
      ));
      const split = firstOf(cases, (item) => splitOn(context, item, target, next));
      if (split) return split;
    }
    if (can("∃E")) {
      const witnesses = [...context.facts.values()].filter(({ entry }) => (
        entry.formula.kind === "exists" && !context.opened.has(entry.id)
      ));
      const opened = firstOf(witnesses, (item) => existsElim(context, item, target, next));
      if (opened) return opened;
    }
    if (target !== absurd) {
      return rewrite(context, target, next) ?? classical(context, target, next);
    }
    return null;
  }

  /** Derivação de `target`, ou null. Voltar ao mesmo estado num ramo aberto não leva a lado nenhum. */
  function prove(context, target, depth) {
    if (known(context, target)) return fact(context, target);
    spend();
    const ids = [...context.facts.keys()].sort((a, b) => a - b).join();
    const state = `${ids}⊢${target.id}`;
    if (active.has(state)) return null;
    active.add(state);
    try {
      return search(context, target, depth);
    } finally {
      active.delete(state);
    }
  }

  const terms = new Map();
  for (const formula of goalFormulas) closedTerms(formula, terms);
  if (terms.size === 0) {
    const name = DEFAULT_TERMS.find((candidate) => !goalNames.has(candidate))
      ?? VARIABLE_NAMES.map((base) => `${base}0`).find((candidate) => !goalNames.has(candidate));
    terms.set(name, term(name));
  }
  const premises = goal.premises.map((formula) => assumption(intern(formula)));
  const conclusion = intern(goal.conclusion);

  try {
    for (let depth = 0; ; depth += 1) {
      cutoff = false;
      const empty = { facts: new Map(), terms, boxes: new Map(), opened: new Set() };
      const root = extend(empty, premises);
      const derivation = prove(root, conclusion, depth);
      if (derivation) return { status: "found", derivation, premises, steps };
      if (!cutoff) return { status: "exhausted", steps };
    }
  } catch (error) {
    if (error instanceof StepLimit) return { status: "stepLimit", steps };
    throw error;
  }
}
