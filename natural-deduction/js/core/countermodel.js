// Demonstrações de que um sequente não tem prova com um conjunto de regras. Módulo puro (sem DOM).
// Contrato:
//   countermodel(goal, rules) → witness | null
//   respects(witness, rule)   → a regra é correta no modelo
//   refutes(witness, goal)    → a valoração do modelo falha o sequente
// null quer dizer só «não encontrei»: nunca serve de prova de que há prova.
//
// Um modelo é um reticulado distributivo finito L, mais uma função em L para cada conectivo, que não
// tem de ser a habitual. Uma regra é correta em L se, para todo o contexto c e todos os valores das
// metavariáveis, c ≤ cada premissa e c ∧ h ≤ ψ em cada subdedução [h] … ψ implicam c ≤ conclusão.
// Por indução nas linhas, toda a linha de uma prova só com regras corretas vale pelo menos o ínfimo
// das premissas e das hipóteses abertas nela: as linhas e subdeduções acessíveis têm um contexto
// maior ou igual, por isso as citações mantêm-se. Logo, se todas as regras ativas são corretas em L e
// alguma valoração dá ínf(Γ) ≰ φ, o sequente Γ ⊢ φ não tem prova com essas regras. As fórmulas são
// aqui apenas valores de L: um átomo literal de uma regra do utilizador conta como metavariável, o
// que só torna a exigência mais forte.

import { variablesOf } from "./semantics.js";

/** Quantas avaliações cada reticulado pode gastar antes de se desistir dele. */
const MAX_EVALUATIONS = 3_000_000;
/** Quantas combinações de valores se aceitam percorrer numa regra ou no sequente. */
const MAX_ASSIGNMENTS = 300_000;

const CONNECTIVES = ["falsum", "not", "and", "or", "implies"];

class OutOfBudget extends Error {}

/**
 * Álgebra de Heyting dos conjuntos superiores de um modelo de Kripke, cada um numa máscara de bits.
 * Os valores são posições em `elements`, e o último é o máximo.
 */
function createLattice(name, elements) {
  const size = elements.length;
  const values = elements.map((_, index) => index);
  const indexOf = (mask) => elements.indexOf(mask);
  const meet = values.map((a) => values.map((b) => indexOf(elements[a] & elements[b])));
  const join = values.map((a) => values.map((b) => indexOf(elements[a] | elements[b])));
  const leq = values.map((a) => values.map((b) => (elements[a] & ~elements[b]) === 0));
  const implies = values.map((a) => values.map((b) => {
    let mask = 0;
    for (const u of elements) if ((u & elements[a] & ~elements[b]) === 0) mask |= u;
    return indexOf(mask);
  }));
  const top = size - 1;
  const bottom = 0;

  const unary = (f) => values.map(f);
  const binary = (f) => values.map((a) => values.map((b) => f(a, b)));
  const flipped = binary((a, b) => implies[b][a]);
  const neutral = [
    binary(() => top),
    binary(() => bottom),
    binary((a) => a),
    binary((_, b) => b),
  ];

  // A interpretação habitual vem primeiro. ¬ depende de F, por isso é resolvida em `interpret`.
  const candidates = {
    falsum: values,
    not: ["heyting", unary((a) => a), unary(() => top), unary(() => bottom)],
    and: [meet, join, implies, flipped, ...neutral],
    or: [join, meet, implies, flipped, ...neutral],
    implies: [implies, flipped, meet, join, ...neutral],
  };
  return { name, size, meet, leq, implies, top, candidates };
}

const LATTICES = [
  createLattice("two", [0, 1]), // lógica clássica
  createLattice("chain", [0, 1, 3]), // um mundo e o seu sucessor: refuta ¬¬p ⊢ p
  createLattice("fork", [0, 1, 2, 3, 7]), // dois sucessores: refuta ¬p ∨ ¬¬p
  createLattice("diamond", [0, 1, 3, 5, 7, 15]), // dois sucessores com um topo comum: refuta (p → q) ∨ (q → p)
];

function collect(formula, names, kinds) {
  if (formula.kind === "atom" || formula.kind === "meta") names.add(formula.name);
  else kinds.add(formula.kind);
  for (const arg of formula.args) collect(arg, names, kinds);
}

const ruleFormulas = ({ premises, conclusions }) => [
  ...premises.flatMap((item) => (
    item.kind === "formula" ? [item.schema] : [item.hypothesis, item.conclusion]
  )),
  ...conclusions,
];

function evaluate(formula, model, valuation) {
  const { connectives } = model;
  const [left, right] = formula.args.map((arg) => evaluate(arg, model, valuation));
  switch (formula.kind) {
    case "atom":
    case "meta":
      return valuation.get(formula.name);
    case "falsum":
      return connectives.falsum;
    case "not":
      return connectives.not[left];
    default:
      return connectives[formula.kind][left][right];
  }
}

/** Corre `visit` com cada atribuição de valores a `names`, até ele devolver true. */
function someAssignment(names, size, visit) {
  const valuation = new Map(names.map((name) => [name, 0]));
  for (;;) {
    if (visit(valuation)) return true;
    let position = 0;
    while (position < names.length) {
      const name = names[position];
      const next = valuation.get(name) + 1;
      if (next < size) {
        valuation.set(name, next);
        break;
      }
      valuation.set(name, 0);
      position += 1;
    }
    if (position === names.length) return false;
  }
}

const tooMany = (size, count) => size ** count > MAX_ASSIGNMENTS;

function ruleHolds(rule, model, spend) {
  const { lattice } = model;
  const { leq, meet, size } = lattice;
  const names = new Set();
  for (const formula of ruleFormulas(rule)) collect(formula, names, new Set());
  if (tooMany(size, names.size + 1)) return false; // Sem a conta feita, a regra não conta como correta.

  const value = (formula, valuation) => evaluate(formula, model, valuation);
  const failsAt = (valuation) => {
    spend();
    const contexts = lattice.size;
    for (let context = 0; context < contexts; context += 1) {
      const premisesHold = rule.premises.every((item) => (
        item.kind === "formula"
          ? leq[context][value(item.schema, valuation)]
          : leq[meet[context][value(item.hypothesis, valuation)]][value(item.conclusion, valuation)]
      ));
      if (premisesHold && rule.conclusions.some((conclusion) => !leq[context][value(conclusion, valuation)])) {
        return true;
      }
    }
    return false;
  };
  return !someAssignment([...names], size, failsAt);
}

/** A valoração que dá ínf(Γ) ≰ φ, ou null. */
function falsifying(goal, model, spend) {
  const { lattice } = model;
  const names = variablesOf([...goal.premises, goal.conclusion]);
  if (tooMany(lattice.size, names.length)) return null;
  let found = null;
  someAssignment(names, lattice.size, (valuation) => {
    spend();
    let context = lattice.top;
    for (const premise of goal.premises) context = lattice.meet[context][evaluate(premise, model, valuation)];
    if (lattice.leq[context][evaluate(goal.conclusion, model, valuation)]) return false;
    found = new Map(valuation);
    return true;
  });
  return found;
}

/** Transforma as escolhas numa interpretação: o ¬ habitual é x → F. */
function interpret(lattice, picks) {
  const connectives = { ...picks };
  if (picks.not === "heyting") {
    connectives.not = lattice.implies.map((row) => row[picks.falsum]);
  }
  return { lattice, connectives };
}

function searchLattice(goal, rules, lattice) {
  let evaluations = 0;
  const spend = () => {
    evaluations += 1;
    if (evaluations > MAX_EVALUATIONS) throw new OutOfBudget();
  };

  const kindsOf = (formulas) => {
    const kinds = new Set();
    for (const formula of formulas) collect(formula, new Set(), kinds);
    return kinds;
  };
  const inRules = rules.map((rule) => kindsOf(ruleFormulas(rule)));
  const relevant = kindsOf([...goal.premises, goal.conclusion]);
  for (const kinds of inRules) for (const kind of kinds) relevant.add(kind);

  if (relevant.has("not")) relevant.add("falsum");

  // Uma regra avalia-se quando o último dos seus conectivos estiver escolhido. F vem antes de ¬.
  const levelOf = (kinds) => Math.max(0, ...[...kinds].map((kind) => CONNECTIVES.indexOf(kind)));
  const byLevel = CONNECTIVES.map(() => []);
  rules.forEach((rule, index) => byLevel[levelOf(inRules[index])].push(rule));

  const choose = (level, picks) => {
    if (level === CONNECTIVES.length) {
      const model = interpret(lattice, picks);
      const valuation = falsifying(goal, model, spend);
      return valuation && { lattice: lattice.name, connectives: model.connectives, valuation, model };
    }
    const kind = CONNECTIVES[level];
    const options = lattice.candidates[kind];
    for (const option of relevant.has(kind) ? options : options.slice(0, 1)) {
      const next = { ...picks, [kind]: option };
      const model = interpret(lattice, { and: null, or: null, implies: null, ...next });
      if (byLevel[level].every((rule) => ruleHolds(rule, model, spend))) {
        const found = choose(level + 1, next);
        if (found) return found;
      }
    }
    return null;
  };
  return choose(0, {});
}

/** Procura um modelo em que todas as regras são corretas e `goal` falha. */
export function countermodel(goal, rules) {
  for (const lattice of LATTICES) {
    try {
      const found = searchLattice(goal, rules, lattice);
      if (found) return found;
    } catch (error) {
      if (!(error instanceof OutOfBudget)) throw error;
    }
  }
  return null;
}

/** A regra é correta no modelo da testemunha. */
export function respects({ model }, rule) {
  return ruleHolds(rule, model, () => {});
}

/** A valoração da testemunha falha o sequente. */
export function refutes({ model, valuation }, goal) {
  const { lattice } = model;
  let context = lattice.top;
  for (const premise of goal.premises) context = lattice.meet[context][evaluate(premise, model, valuation)];
  return !lattice.leq[context][evaluate(goal.conclusion, model, valuation)];
}
