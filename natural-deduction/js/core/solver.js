// Procura de provas. Módulo puro (sem DOM).
// Contrato:
//   solve(goal, { rules = RULES, maxSteps = MAX_STEPS })
//     → { ok: true, valid: true, provable: true, proof, steps }
//     | { ok: true, valid: true, provable: false, witness }
//     | { ok: true, valid: false, counterexample }
//     | { ok: false, error: { code, params } }
// `rules` é o conjunto ativo, como um `ruleSet` ou o `rules` de `activeRules`.
// `provable: false` só sai com uma demonstração: `witness` é um modelo de `countermodel.js` em que
// todas as regras ativas são corretas e o sequente falha. Um erro nunca diz nada sobre haver prova.
// As mensagens estão em `solver.noProof` e `solver.errors.*`; `tooManyVariables` vem da semântica.
//
// A tabela de verdade decide a validade e depois guia a procura: só se tenta provar o que as fórmulas
// conhecidas implicam. Cada fórmula guarda as linhas da tabela em que é verdadeira, num BigInt, por
// isso «Γ implica φ» é uma conta de bits. Quando Γ é inconsistente, tudo se implica e a tabela deixa
// de distinguir: conta então o que Γ implica sem a fórmula candidata.
//
// A procura constrói uma derivação em árvore (`derivation.js`) e só no fim a arruma e escreve em Fitch,
// pelo que os factos que a prova não usa nunca chegam a ser linhas. Sai a versão verificada mais curta.
// Ordem para um objetivo: já conhecido; regra de introdução da conclusão; encadear uma implicação;
// casos de uma disjunção; contradição; e, em último recurso, o passo clássico ou assumir uma fórmula
// para obter a negação dela. O passo clássico é RA, ou ¬I + ¬E, ou TE + ∨E + FE, conforme o conjunto.
// Cada passo só se tenta se a regra estiver ativa. As outras regras (MT, SD, regras do utilizador)
// só entram numa segunda procura, se a primeira falhar: nela, tudo o que derem é um facto de partida.

import { countermodel } from "./countermodel.js";
import { assumption, node, subderivation, tidy, writeProof } from "./derivation.js";
import { atom, equals, FALSUM, format, not, or } from "./formula.js";
import { RULES } from "./rules.js";
import { applySubstitution, matchSchema } from "./schema.js";
import { checkSequent, variablesOf } from "./semantics.js";
import { verifyProof } from "./verify.js";

/** Limite de passos da procura. */
export const MAX_STEPS = 20000;

/** Códigos de erro próprios; o outro é `tooManyVariables`. Nenhum afirma que não há prova. */
export const SOLVER_ERROR_CODES = [
  "stepLimit", // { max }: a procura parou sem provar nem refutar que há prova
  "searchExhausted", // a procura acabou sem prova nem demonstração de que não a há
  "unverifiedProof", // a prova gerada não passou no verificador: é um erro do solver
];

/** Regras que a procura sabe usar por si. */
const CORE_RULES = new Set(["∧I", "∧E", "∨I", "∨E", "¬I", "¬E", "FI", "FE", "→I", "→E", "R", "RA", "TE"]);

/** Uma fórmula nova vinda das outras regras pode ser isto maior do que a maior do sequente. */
const EXTRA_FORMULA_SLACK = 4;

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

/** As regras que `applyExtras` pode usar: só premissas simples, e não as que a procura já conhece. */
const extraRulesOf = (rules) => rules.filter(({ id, premises }) => (
  !CORE_RULES.has(id) && premises.length > 0 && premises.every(({ kind }) => kind === "formula")
));

function createSearch(goal, maxSteps, rules, extraRules) {
  const table = createTable(variablesOf([...goal.premises, goal.conclusion]));
  const { all, intern } = table;
  const absurd = intern(FALSUM);
  const active = new Set();
  const allowed = new Set(rules.map(({ id }) => id));
  const can = (id) => allowed.has(id);
  const largest = Math.max(...[...goal.premises, goal.conclusion].map((formula) => format(formula).length));
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
      if (can(item.rule) && !facts.has(item.entry.id)) pending.push(item);
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

  /** O que Γ implica sem `left` nem as fórmulas que, sozinhas, já a dão (como p ∧ q dá q). */
  function withoutSources(context, left) {
    let models = all;
    for (const { entry } of context.facts.values()) {
      if (!entailedBy(entry.models, left)) models &= entry.models;
    }
    return models;
  }

  const bySize = (a, b) => a.needs.key.length - b.needs.key.length;

  /** Prova `target` dentro de uma subdedução com a hipótese `entry`. */
  function inSubproof(context, entry, target, strategy) {
    const hypothesis = assumption(entry);
    const end = prove(extend(context, [hypothesis]), target);
    return end && subderivation(hypothesis, end, strategy);
  }

  function introduce(context, target) {
    const { formula } = target;
    if (formula.kind === "implies" && can("→I")) {
      const body = inSubproof(context, arg(target, 0), arg(target, 1), "assumeAntecedent");
      return body && node(target, "→I", [body]);
    }
    if (formula.kind === "not" && can("¬I")) {
      const body = inSubproof(context, arg(target, 0), absurd, "assumeToNegate");
      return body && node(target, "¬I", [body]);
    }
    if (formula.kind === "and" && can("∧I")) {
      const left = prove(context, arg(target, 0));
      const right = left && prove(extend(context, [left]), arg(target, 1));
      return right && node(target, "∧I", [left, right]);
    }
    if (formula.kind === "or" && can("∨I")) {
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
      if (entry.formula.kind === "implies" && can("→E")) {
        const gives = arg(entry, 1);
        if (!known(context, gives)) uses.push({ item, needs: arg(entry, 0), gives, rule: "→E" });
      } else if (entry.formula.kind === "not" && can("FI")) {
        uses.push({ item, needs: arg(entry, 0), gives: absurd, rule: "FI" });
      }
    }
    return uses.sort(bySize);
  }

  /** Prova o que `use` precisa, junta o que ele dá e continua até `target`. */
  function applyUse(context, { item, needs, gives, rule }, target) {
    const proved = prove(context, needs);
    if (!proved) return null;
    const strategy = rule === "→E" ? "chainImplication" : undefined;
    return prove(extend(context, [node(gives, rule, [proved, item], strategy)]), target);
  }

  /** `use` serve se o resto de Γ lhe dá o antecedente sem já implicar o objetivo. */
  function isNeeded({ item, needs }, context, target) {
    const rest = without(context, item.entry);
    return entailedBy(rest, needs) && !entailedBy(rest, target);
  }

  function disjunctions(context) {
    if (!can("∨E")) return [];
    return [...context.facts.values()].filter(({ entry }) => (
      entry.formula.kind === "or" && !known(context, arg(entry, 0)) && !known(context, arg(entry, 1))
    ));
  }

  function splitOn(context, item, target) {
    const left = inSubproof(context, arg(item.entry, 0), target, "assumeCase");
    const right = left && inSubproof(context, arg(item.entry, 1), target, "assumeCase");
    return right && node(target, "∨E", [item, left, right]);
  }

  /** Assume cada fórmula ainda por decidir: a subdedução dá ¬φ, um facto novo, e continua-se. */
  function assumeAndRefute(context) {
    if (!can("¬I")) return null;
    const pending = pendingUses(context).map(({ needs }) => needs);
    const atoms = variablesOf([...goal.premises, goal.conclusion]).map((name) => intern(atom(name)));
    for (const entry of [...pending, ...atoms]) {
      if (known(context, entry) || known(context, negation(entry))) continue;
      const body = inSubproof(context, entry, absurd, "assumeToRefute");
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

  /** Prova `target` por absurdo, com as regras clássicas que estiverem ativas. */
  function classical(context, target) {
    const negated = negation(target);
    if (known(context, negated) && !known(context, absurd)) return null;
    if (can("RA")) {
      const body = inSubproof(context, negated, absurd, "assumeNegation");
      return body && node(target, "RA", [body]);
    }
    if (can("¬I") && can("¬E")) {
      const body = inSubproof(context, negated, absurd, "assumeNegation");
      return body && node(target, "¬E", [node(negation(negated), "¬I", [body], "concludeByAbsurd")]);
    }
    if (can("TE") && can("∨E") && can("FE")) {
      const refuted = inSubproof(context, negated, target, "assumeCase");
      if (!refuted) return null;
      const hypothesis = assumption(target);
      const middle = node(intern(or(target.formula, negated.formula)), "TE");
      return node(target, "∨E", [middle, subderivation(hypothesis, hypothesis, "assumeCase"), refuted]);
    }
    return null;
  }

  /** O que as outras regras dão de novo a partir de Γ. */
  function applyExtras(context) {
    const facts = [...context.facts.values()];
    const found = new Map();

    function bind(rule, index, substitution, citations) {
      if (index < rule.premises.length) {
        for (const fact of facts) {
          spend();
          const match = matchSchema(rule.premises[index].schema, fact.entry.formula, substitution);
          if (match.ok) bind(rule, index + 1, match.substitution, [...citations, fact]);
        }
        return;
      }
      for (const conclusion of rule.conclusions) {
        const instance = applySubstitution(conclusion, substitution);
        if (!instance.ok) continue;
        const entry = intern(instance.formula);
        const fits = entry.key.length <= largest + EXTRA_FORMULA_SLACK;
        if (fits && !known(context, entry) && !found.has(entry.id)) {
          found.set(entry.id, node(entry, rule.id, citations));
        }
      }
    }

    for (const rule of extraRules) bind(rule, 0, {}, []);
    return [...found.values()];
  }

  function search(context, target) {
    const extras = extraRules.length > 0 ? applyExtras(context) : [];
    if (extras.length > 0) return prove(extend(context, extras), target);

    if (target !== absurd) {
      if (can("FE") && known(context, absurd)) return node(target, "FE", [context.facts.get(absurd.id)]);
      if (can("FE") && context.models === 0n) {
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
    const usefulCases = cases.filter(({ entry }) => !entailedBy(withoutSources(context, entry), target));
    const split = firstOf(usefulCases, (item) => splitOn(context, item, target));
    if (split) return split;

    const otherCases = cases.filter((item) => !usefulCases.includes(item));
    if (target === absurd) {
      return firstOf(uses.filter((use) => !needed.includes(use)), (use) => applyUse(context, use, target))
        ?? firstOf(otherCases, (item) => splitOn(context, item, target))
        ?? assumeAndRefute(context);
    }
    // Um ramo que não use a hipótese do caso sai depois, no `tidy`.
    return firstOf(otherCases, (item) => splitOn(context, item, target)) ?? classical(context, target);
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

/** Uma passagem da procura: a prova verificada, ou o erro que explica porque não há. */
function attempt(goal, maxSteps, rules, extraRules) {
  const failure = (code, params = {}) => ({ ok: false, error: { code, params } });
  let found;
  try {
    found = createSearch(goal, maxSteps, rules, extraRules);
  } catch (error) {
    if (error instanceof StepLimit) return failure("stepLimit", { max: maxSteps });
    throw error;
  }
  if (!found.derivation) return failure("searchExhausted");

  const { derivation, premises } = found;
  const tidied = tidy(derivation);
  const drafts = [
    writeProof(tidied, premises),
    writeProof(tidied, premises, { share: true }),
    writeProof(derivation, premises),
  ].sort((a, b) => a.lines.length - b.lines.length);

  // A escrita pede R ao fechar uma subdedução com um facto exterior: sem R, essa prova não serve.
  const hasR = rules.some(({ id }) => id === "R");
  const usable = drafts.filter(({ lines }) => hasR || lines.every(({ rule }) => rule !== "R"));
  if (usable.length === 0) return failure("searchExhausted");
  const proof = usable.find((draft) => verifyProof(draft, goal, rules).ok);
  if (!proof) return failure("unverifiedProof");
  return { ok: true, valid: true, provable: true, proof, steps: found.stepsUsed() };
}

/** Decide `goal` e, se for válido, procura uma prova, que passa pelo verificador antes de sair. */
export function solve(goal, { rules = RULES, maxSteps = MAX_STEPS } = {}) {
  const decided = checkSequent(goal);
  if (!decided.ok) return decided;
  if (!decided.valid) return { ok: true, valid: false, counterexample: decided.counterexample };

  let result = attempt(goal, maxSteps, rules, []);
  const extraRules = extraRulesOf(rules);
  if (!result.ok && result.error.code !== "unverifiedProof" && extraRules.length > 0) {
    result = attempt(goal, maxSteps, rules, extraRules);
  }
  if (result.ok || result.error.code === "unverifiedProof") return result;

  const witness = countermodel(goal, rules);
  return witness ? { ok: true, valid: true, provable: false, witness } : result;
}
