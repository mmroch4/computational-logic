// Dicas para uma prova parcial. Módulo puro (sem DOM).
// Contrato:
//   hint(proof, goal, { rules = RULES, known = rules, maxSteps })
//     → { status: "step", target, strategy, step, levels }      o próximo passo; target: objetivo atual
//     | { status: "fixLine", line, error, levels }              uma linha tem de ser corrigida primeiro
//     | { status: "deadEnd", line, reason, step, levels }       a subdedução da linha não leva ao objetivo
//     | { status: "done" | "invalid" | "noProof" | "unknown" }  sem passo: prova acabada, `counterexample`,
//                                                               `witness` (como no `solve`) ou `error`
//   step: { action: "write", line, replaces, kind, depth, formula, rule, citations, strategy, viaRule, fresh? }
//       | { action: "deleteSubproof", line }
//     `replaces`: a linha `line` fica substituída; sem isso, insere-se ali. `viaRule`: numa hipótese,
//     a regra que a vai fechar. `fresh`: a variável nova de uma caixa [v] que a linha abre (um passo por
//     justificar, no ∀I, ou a hipótese do ∃E).
// Num sequente de 1.ª ordem não há tabela de verdade nem solver: ver `firstOrderHint`, mais abaixo.
//   levels: [estratégia, regra, passo exato], cada um { key, params }, com `key` em `solver.strategies.*`,
//     `hints.*` ou `verify.*`. Passa `params` por `localizeRuleParam` antes de `t()`.
//   applyHint(proof, step) → { ok, proof | error }, como as operações de `proof.js`.
//
// O cursor é a primeira linha por preencher ou sem regra e, sem nenhuma, o fim da prova: o que vem
// depois dele ainda não conta. Em cada subdedução aberta infere-se o que ela pretende a partir da
// hipótese e do objetivo de fora, porque a prova não guarda a intenção de quem a escreveu. Depois
// pergunta-se ao `solve` como chegar ao objetivo a partir das linhas acessíveis, e a dica é a
// primeira linha dessa prova, com a estratégia que o solver lhe deu. Assim herda as heurísticas dele,
// e o conjunto de regras ativo. Uma subdedução que já chegou ao objetivo fecha-se sem o solver.
// `offTrack` é uma opinião, não um teorema: uma hipótese estranha nunca impede a prova, por isso o
// texto diz que ela não parece ajudar. `noProof` só sai com a demonstração do `solve`.

import { strategyOf } from "./derivation.js";
import {
  displayName, equals, FALSUM, format, isSubstitutable, not, substitute, term,
} from "./formula.js";
import { freeTerms, namesOf, unusedName } from "./guided.js";
import {
  accessibleFrom, citeLine, citeRange, createProof, deleteLine, editLine, enclosingSubproofs, insertAtBoxStart, insertLine,
  subproofs,
} from "./proof.js";
import { RULES } from "./rules.js";
import { sameFormula } from "./schema.js";
import { checkSequent } from "./semantics.js";
import { isPropositionalSequent, sequent } from "./sequent.js";
import { solve } from "./solver.js";
import { verifyLine, verifyProof } from "./verify.js";

/** Códigos de `fixLine` que não vêm do verificador; os outros são `VERIFY_ERROR_CODES`. */
export const HINT_ERROR_CODES = [
  "extraPremise", // { line }: premissa fora do sequente
  "notDerivable", // { line }: a fórmula da linha não se segue do que está acima dela
];

/** Porque é que uma subdedução não leva ao objetivo. */
export const DEAD_END_REASONS = [
  "offTrack", // a hipótese não encaixa em nenhuma estratégia
  "noWayOut", // o sequente tem prova, mas não a partir daqui
];

const citationText = (citation) => (
  citation.kind === "line" ? String(citation.line) : `${citation.from}–${citation.to}`
);

function stepLevels(step, strategyKey) {
  const { line, formula, rule, viaRule, citations, kind, fresh = null } = step;
  const params = { line, formula: format(formula) };
  if (fresh !== null) {
    // Uma caixa com variável: a do ∀I abre num passo por justificar, a do ∃E numa hipótese.
    const box = kind === "hypothesis" ? "existsBox" : "forallBox";
    const variable = displayName(fresh);
    return [
      { key: strategyKey, params: {} },
      { key: `hints.rule.${box}`, params: { variable } },
      { key: `hints.exact.${box}`, params: { ...params, variable } },
    ];
  }
  if (kind === "premise") {
    return [
      { key: strategyKey, params: {} },
      { key: "hints.rule.premise", params: {} },
      { key: "hints.exact.premise", params },
    ];
  }
  if (kind === "hypothesis") {
    return [
      { key: strategyKey, params: {} },
      { key: "hints.rule.hypothesis", params: { rule: viaRule } },
      { key: "hints.exact.hypothesis", params },
    ];
  }
  const cited = citations.map(citationText).join(", ");
  return [
    { key: strategyKey, params: {} },
    { key: "hints.rule.step", params: { rule } },
    cited === ""
      ? { key: "hints.exact.stepUncited", params: { ...params, rule } }
      : { key: "hints.exact.step", params: { ...params, rule, citations: cited } },
  ];
}

function fixLine(line, error) {
  const detail = HINT_ERROR_CODES.includes(error.code)
    ? { key: error.code === "extraPremise" ? "verify.extraPremise" : "hints.notDerivable", params: { line } }
    : { key: `verify.errors.${error.code}`, params: error.params };
  return {
    status: "fixLine",
    line,
    error,
    levels: [{ key: "hints.fixLine.look", params: { line } }, detail, { key: "hints.fixLine.exact", params: { line } }],
  };
}

function deadEnd(line, reason) {
  return {
    status: "deadEnd",
    line,
    reason,
    step: { action: "deleteSubproof", line },
    levels: [
      { key: `hints.deadEnd.${reason}`, params: { line } },
      { key: "hints.deadEnd.rule", params: { line } },
      { key: "hints.deadEnd.exact", params: { line } },
    ],
  };
}

const isBlank = ({ formula }) => !formula;
const isUnjustified = ({ kind, rule }) => kind === "step" && !rule;

/** A primeira linha por preencher ou sem regra, ou null. */
function firstOpenLine({ lines }) {
  const index = lines.findIndex((line) => isBlank(line) || isUnjustified(line));
  return index === -1 ? null : index + 1;
}

/** Todas as subfórmulas de `formulas`, com repetições. */
function subformulasOf(formulas) {
  const found = [];
  const pending = [...formulas];
  while (pending.length > 0) {
    const formula = pending.pop();
    found.push(formula);
    pending.push(...formula.args);
  }
  return found;
}

function createPlanner(proof, goal, { rules, maxSteps }) {
  const { lines } = proof;
  const allowed = new Set(rules.map(({ id }) => id));
  const can = (id) => allowed.has(id);
  const all = subproofs(proof);

  /** Fórmulas que a linha n pode citar: { formula, line }. */
  const factsAt = (n) => accessibleFrom(proof, n).lines
    .filter((line) => lines[line - 1].formula)
    .map((line) => ({ formula: lines[line - 1].formula, line }));

  const entails = (facts, formula) => {
    const decided = checkSequent(sequent(facts, formula));
    return decided.ok && decided.valid;
  };

  /** O caso anterior, quando a subdedução `subproof` é o segundo caso de `disjunction`. */
  function firstCaseOf(subproof, target, hypothesis, disjunction) {
    const [left, right] = disjunction.args;
    const other = equals(left, hypothesis) ? right : left;
    const before = all.find(({ to, depth }) => to === subproof.from - 1 && depth === subproof.depth);
    if (!before) return null;
    const closesOnTarget = lines[before.to - 1].depth === before.depth
      && equals(lines[before.to - 1].formula, target);
    return closesOnTarget && equals(lines[before.from - 1].formula, other) ? before : null;
  }

  /**
   * O que pretende a subdedução, sabendo o objetivo de fora: { target, closing }, ou null.
   * closing: { rule, formula } | { rule: "∨E", disjunction, first } | { nextCase, disjunction }.
   */
  function inferFrame(subproof, outer, enclosing = []) {
    const hypothesis = lines[subproof.from - 1].formula;
    const facts = factsAt(subproof.from);
    const known = facts.map(({ formula }) => formula);
    const isNew = (formula) => !known.some((fact) => equals(fact, formula));
    // Dentro de um caso de uma disjunção, voltar a ela não adianta.
    const inCase = (line) => enclosing.some(({ closing }) => closing.disjunction?.line === line);
    const disjunctions = !can("∨E") ? [] : facts.filter(({ formula, line }) => (
      formula.kind === "or" && !inCase(line) && formula.args.some((side) => equals(side, hypothesis))
    ));

    for (const disjunction of disjunctions) {
      const first = firstCaseOf(subproof, outer, hypothesis, disjunction.formula);
      if (first) return { target: outer, closing: { rule: "∨E", disjunction, first } };
    }
    const antecedentOf = (formula) => formula.kind === "implies" && equals(formula.args[0], hypothesis);
    if (can("→I") && antecedentOf(outer)) {
      return { target: outer.args[1], closing: { rule: "→I", formula: outer } };
    }
    if (can("¬I") && outer.kind === "not" && equals(outer.args[0], hypothesis)) {
      return { target: FALSUM, closing: { rule: "¬I", formula: outer } };
    }
    if (equals(hypothesis, not(outer))) {
      if (can("RA")) return { target: FALSUM, closing: { rule: "RA", formula: outer } };
      if (can("¬I") && can("¬E")) return { target: FALSUM, closing: { rule: "¬I", formula: not(hypothesis) } };
    }
    // Um primeiro caso só o é se a hipótese for novidade.
    if (disjunctions.length > 0 && isNew(hypothesis)) {
      const [disjunction] = disjunctions;
      const [left, right] = disjunction.formula.args;
      const other = equals(left, hypothesis) ? right : left;
      return { target: outer, closing: { nextCase: other, disjunction } };
    }
    // Fechar uma subdedução para obter o que já está provado não adianta: é assim que se evita um ciclo.
    function refute() {
      if (!entails([...known, hypothesis], FALSUM)) return null;
      if (can("RA") && hypothesis.kind === "not" && isNew(hypothesis.args[0])) {
        return { target: FALSUM, closing: { rule: "RA", formula: hypothesis.args[0] } };
      }
      if (can("¬I") && isNew(not(hypothesis))) {
        return { target: FALSUM, closing: { rule: "¬I", formula: not(hypothesis) } };
      }
      return null;
    }
    function lemma() {
      if (!can("→I")) return null;
      const lemmas = subformulasOf([...known, outer, goal.conclusion])
        .filter((formula) => antecedentOf(formula) && isNew(formula) && entails(known, formula));
      // Com factos contraditórios todas se seguem: fica a que tem o consequente mais à mão.
      const found = lemmas.find((formula) => !isNew(formula.args[1])) ?? lemmas[0];
      return found ? { target: found.args[1], closing: { rule: "→I", formula: found } } : null;
    }
    // Assumir o que já está provado só faz sentido para uma implicação: refutá-lo daria um ciclo.
    return isNew(hypothesis) ? refute() ?? lemma() : lemma() ?? refute();
  }

  /** Infere as subdeduções abertas, de fora para dentro; `failed` é a primeira que não encaixa. */
  function inferFrames(chain) {
    const frames = [];
    let target = goal.conclusion;
    for (const subproof of chain) {
      const frame = inferFrame(subproof, target, frames);
      if (!frame) return { frames, target, failed: subproof };
      frames.push({ ...frame, subproof });
      target = frame.target;
    }
    return { frames, target, failed: null };
  }

  return { all, can, entails, factsAt, inferFrame, inferFrames, maxSteps, rules };
}

/** A linha escrita pelo passo, com os campos comuns. */
function writeStep(cursor, fields) {
  const { line, proof } = cursor;
  const current = proof.lines[line - 1];
  const replaces = !cursor.synthetic && (
    isBlank(current) || (fields.kind === "step" && equals(current.formula, fields.formula))
  );
  return { action: "write", line, replaces, rule: null, citations: [], viaRule: null, ...fields };
}

function stepHint(cursor, target, fields) {
  const step = writeStep(cursor, fields);
  return {
    status: "step",
    target,
    strategy: step.strategy,
    step,
    levels: stepLevels(step, `solver.strategies.${step.strategy}`),
  };
}

/** Fecha uma subdedução que chegou ao objetivo dela. */
function closingHint(cursor, { subproof, closing }, outerTarget) {
  const range = citeRange(subproof.from, cursor.line - 1);
  if (closing.nextCase) {
    return stepHint(cursor, outerTarget, {
      kind: "hypothesis",
      depth: subproof.depth,
      formula: closing.nextCase,
      strategy: "assumeCase",
      viaRule: "∨E",
    });
  }
  const citations = closing.rule === "∨E"
    ? [citeLine(closing.disjunction.line), citeRange(closing.first.from, closing.first.to), range]
    : [range];
  return stepHint(cursor, outerTarget, {
    kind: "step",
    depth: subproof.depth - 1,
    formula: closing.formula ?? outerTarget,
    rule: closing.rule,
    citations,
    strategy: strategyOf(closing.rule),
  });
}

/** A subdedução fechada que acaba mesmo antes do cursor, se ainda estiver à espera da regra que a usa. */
function justClosed(planner, cursor, depth) {
  const { proof, line } = cursor;
  const previous = proof.lines[line - 2];
  if (previous?.depth !== depth + 1) return null;
  return planner.all.find(({ to, depth: inner }) => to === line - 1 && inner === depth + 1) ?? null;
}

/** O que a última procura diz quando não há prova a partir daqui. */
function noWayFromHere(planner, goal, chain, result) {
  if (chain.length === 0) {
    if (result.provable === false) return { status: "noProof", witness: result.witness };
    return { status: "unknown", error: { code: "searchExhausted", params: {} } };
  }
  const whole = solve(goal, { rules: planner.rules, maxSteps: planner.maxSteps });
  if (!whole.ok) return { status: "unknown", error: whole.error };
  if (whole.provable === false) return { status: "noProof", witness: whole.witness };
  return deadEnd(chain.at(-1).from, "noWayOut");
}

/** A primeira linha de uma prova de `target` a partir dos factos, traduzida para a prova do utilizador. */
function nextFromSolver(planner, cursor, target, facts, depth) {
  const unique = facts.filter(({ formula }, index) => (
    facts.findIndex((other) => equals(other.formula, formula)) === index
  ));
  const result = solve(sequent(unique.map(({ formula }) => formula), target), {
    rules: planner.rules,
    maxSteps: planner.maxSteps,
  });
  if (!result.ok) return { failure: { status: "unknown", error: result.error } };
  if (!result.provable) return { unprovable: result };

  const { lines } = result.proof;
  const { index, skipped, numbers } = firstNewLine(lines, unique);
  const first = lines[index];
  const number = index + 1;
  const closer = lines.find(({ citations }) => citations.some((item) => item.kind === "range" && item.from === number));
  const hint = stepHint(cursor, target, {
    kind: first.kind,
    depth: depth + first.depth - skipped,
    formula: first.formula,
    rule: first.rule,
    citations: first.citations.map(({ line }) => citeLine(numbers.get(line))),
    strategy: first.strategy,
    viaRule: first.kind === "hypothesis" ? closer?.rule ?? null : null,
  });
  return { hint };
}

/**
 * A primeira linha do plano a escrever. Um plano pode começar por assumir o que já está provado, para
 * uma implicação: repetir isso abria subdeduções sem fim, por isso entra-se nela e aproveita-se a
 * primeira linha nova lá de dentro, que vale neste escopo. Se ela depender do que ficou por escrever,
 * fica a hipótese. `numbers`: da linha do plano para a da prova; `skipped`: hipóteses saltadas.
 */
function firstNewLine(lines, facts) {
  const numbers = new Map(facts.map(({ line }, index) => [index + 1, line]));
  const start = lines.findIndex(({ kind }) => kind !== "premise");
  const asWritten = { index: start, skipped: 0, numbers };
  const factFor = ({ formula }) => facts.find((fact) => equals(fact.formula, formula));
  if (lines[start].kind !== "hypothesis" || !factFor(lines[start])) return asWritten;

  const inner = new Map(numbers);
  let skipped = 0;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const fact = factFor(line);
    if (!fact) {
      const usable = line.citations.every(({ kind, line: cited }) => kind === "line" && inner.has(cited));
      return usable ? { index, skipped, numbers: inner } : asWritten;
    }
    if (line.citations.some(({ kind }) => kind === "range")) return asWritten;
    inner.set(index + 1, fact.line);
    if (line.kind === "hypothesis") skipped += 1;
  }
  return asWritten;
}

/** O cursor: a linha onde se escreve. Sem linha aberta, uma linha nova no fim, na última profundidade. */
function findCursor(proof) {
  const open = firstOpenLine(proof);
  if (open !== null) return { proof, line: open, synthetic: false };
  const depth = proof.lines.at(-1)?.depth ?? 0;
  const { proof: extended } = insertLine(proof, proof.lines.length, { depth });
  return { proof: extended, line: extended.lines.length, synthetic: true };
}

/** A prova sem a linha por preencher do fim, se a houver. */
export function withoutTrailingBlank(proof) {
  const last = proof.lines.at(-1);
  if (!last || !isBlank(last) || last.kind !== "step") return proof;
  return deleteLine(proof, proof.lines.length).proof;
}

/** A fórmula que a linha `line`, por preencher, parece preparar: a seguinte do mesmo escopo. */
function nextFormula({ lines }, line) {
  const next = lines[line];
  const fits = next?.formula && next.kind === "step" && next.depth === lines[line - 1].depth;
  return fits ? next.formula : null;
}

/**
 * Se a prova está acabada. Uma linha por preencher no fim não conta, exceto se só houver premissas
 * antes dela: no editor há sempre uma linha para escrever, e ali falta repetir a premissa.
 */
export function isFinished(proof, goal, rules, known = rules) {
  const written = withoutTrailingBlank(proof);
  if (written !== proof && written.lines.every(({ kind }) => kind === "premise")) return false;
  return verifyProof(written, goal, rules, known).ok;
}

/** Sugere o próximo passo de `proof` para demonstrar `goal`. */
export function hint(proof, goal, { rules = RULES, known = rules, maxSteps } = {}) {
  if (!isPropositionalSequent(goal)) return firstOrderHint(proof, goal, { rules, known });
  const decided = checkSequent(goal);
  if (!decided.ok) return { status: "unknown", error: decided.error };
  if (!decided.valid) return { status: "invalid", counterexample: decided.counterexample };
  if (isFinished(proof, goal, rules, known)) return { status: "done" };

  const cursor = findCursor(proof);
  const fix = firstBrokenLine(proof, cursor, rules, known);
  if (fix) return fix;
  const written = proof.lines.filter(({ formula }) => formula).map(({ formula }) => formula);
  const sizeCheck = checkSequent(sequent(written, goal.conclusion));
  if (!sizeCheck.ok) return { status: "unknown", error: sizeCheck.error };
  const premiseStep = premiseHint(proof, goal);
  if (premiseStep) return premiseStep;
  return propositionalStep(cursor, goal, { rules, maxSteps });
}

/** A primeira linha antes do cursor que o verificador recusa, como dica `fixLine`, ou null. */
function firstBrokenLine(proof, cursor, rules, known) {
  for (let line = 1; line < cursor.line; line += 1) {
    const checked = verifyLine(proof, line, rules, known);
    if (!checked.ok) return fixLine(line, checked.error);
  }
  return null;
}

/** Uma premissa a mais, ou a primeira que falta escrever, ou null. */
function premiseHint(proof, goal) {
  const premises = proof.lines.filter(({ kind, formula }) => kind === "premise" && formula);
  const extra = proof.lines.findIndex(({ kind, formula }) => (
    kind === "premise" && formula && !goal.premises.some((premise) => equals(premise, formula))
  ));
  if (extra !== -1) return fixLine(extra + 1, { code: "extraPremise", params: { line: extra + 1 } });

  const missing = goal.premises.find((premise) => !premises.some(({ formula }) => equals(formula, premise)));
  if (missing) {
    const count = proof.lines.filter(({ kind }) => kind === "premise").length;
    const step = {
      action: "write",
      line: count + 1,
      replaces: false,
      kind: "premise",
      depth: 0,
      formula: missing,
      rule: null,
      citations: [],
      viaRule: null,
      strategy: null,
    };
    if (isBlank(proof.lines[count] ?? {}) && proof.lines[count]) step.replaces = true;
    return {
      status: "step",
      target: goal.conclusion,
      strategy: null,
      step,
      levels: stepLevels(step, "hints.startFromPremises"),
    };
  }
  return null;
}

/** O passo proposicional, pelo solver, depois das verificações comuns. */
function propositionalStep(cursor, goal, { rules, maxSteps }) {
  const planner = createPlanner(cursor.proof, goal, { rules, maxSteps });
  const chain = enclosingSubproofs(cursor.proof, cursor.line).filter(({ from }) => from !== cursor.line);
  const depth = chain.at(-1)?.depth ?? 0;
  const facts = planner.factsAt(cursor.line);
  const current = cursor.proof.lines[cursor.line - 1];
  const own = current.formula;

  let target;
  let frames = [];
  if (own) {
    target = own;
  } else {
    // Uma subdedução pode ter caminho e o sequente não: diz-se já, sem deixar continuar às cegas.
    if (chain.length > 0) {
      const whole = solve(goal, { rules, maxSteps });
      if (whole.provable === false) return { status: "noProof", witness: whole.witness };
    }
    const inferred = planner.inferFrames(chain);
    if (inferred.failed) return deadEnd(inferred.failed.from, "offTrack");
    ({ frames, target } = inferred);

    const previous = cursor.proof.lines[cursor.line - 2];
    const closed = justClosed(planner, cursor, depth);
    const closedFrame = closed && planner.inferFrame(closed, target, frames);
    if (closedFrame && equals(previous.formula, closedFrame.target)) {
      return closingHint(cursor, { ...closedFrame, subproof: closed }, target);
    }
    const last = frames.at(-1);
    if (last && previous.depth === last.subproof.depth && equals(previous.formula, last.target)) {
      return closingHint(cursor, last, frames.at(-2)?.target ?? goal.conclusion);
    }
    const ahead = nextFormula(cursor.proof, cursor.line);
    if (ahead && planner.entails(facts.map(({ formula }) => formula), ahead)) target = ahead;
  }

  const repeated = facts.find(({ formula }) => equals(formula, target));
  if (repeated) {
    if (!planner.can("R")) return { status: "unknown", error: { code: "searchExhausted", params: {} } };
    return stepHint(cursor, target, {
      kind: "step",
      depth,
      formula: target,
      rule: "R",
      citations: [citeLine(repeated.line)],
      strategy: "repeatFact",
    });
  }

  const next = nextFromSolver(planner, cursor, target, facts, depth);
  if (next.hint) return next.hint;
  if (next.failure) return next.failure;
  if (own) return fixLine(cursor.line, { code: "notDerivable", params: { line: cursor.line } });
  return noWayFromHere(planner, goal, chain, next.unprovable);
}

// --- 1.ª ordem -------------------------------------------------------------------------------------
// Sem solver nem tabela de verdade (a validade é indecidível), as dicas seguem as heurísticas da
// cadeira, pela ordem: repetir um facto; um passo só que dê o objetivo com o que já está na prova (o
// verificador decide); objetivo ∀ → abrir a caixa [v] do ∀I; premissa ∃ → abrir a caixa [v] do ∃E;
// instanciar um ∀ com os termos que já existem; assumir o antecedente ou a fórmula a negar. Não dizem
// `invalid` nem `noProof`: sem passo, `unknown` com `searchExhausted`.

/** Uma variável nova para uma caixa: nenhum nome da prova nem do sequente. */
const freshFor = (proof, goal) => unusedName(
  namesOf([...goal.premises, goal.conclusion, ...proof.lines.map(({ formula }) => formula)]),
  ["v", "u", "w"],
  "v",
);

/** A linha `∃x φ` acessível de onde vem a hipótese `[v] φ[v/x]`, ou null. */
function witnessSource(proof, from, hypothesis, variable) {
  const { lines } = proof;
  const line = accessibleFrom(proof, from).lines.find((number) => {
    const formula = lines[number - 1].formula;
    return formula?.kind === "exists"
      && sameFormula(substitute(formula.args[0], formula.name, term(variable)), hypothesis);
  });
  return line ?? null;
}

/** O que pretende cada caixa aberta, de fora para dentro; `failed` é a primeira que não encaixa. */
function firstOrderFrames(proof, chain, conclusion) {
  const frames = [];
  let target = conclusion;
  for (const subproof of chain) {
    const first = proof.lines[subproof.from - 1];
    const hypothesis = first.formula;
    let frame = null;
    if (subproof.fresh !== null && (first.kind === "step" || subproof.label)) {
      if (target.kind === "forall" && isSubstitutable(target.args[0], target.name, term(subproof.fresh))) {
        const inner = substitute(target.args[0], target.name, term(subproof.fresh));
        frame = { target: inner, closing: { rule: "∀I", formula: target } };
      }
    } else if (subproof.fresh !== null) {
      const source = hypothesis && witnessSource(proof, subproof.from, hypothesis, subproof.fresh);
      if (source) frame = { target, closing: { rule: "∃E", formula: target, source } };
    } else if (hypothesis) {
      if (target.kind === "implies" && sameFormula(target.args[0], hypothesis)) {
        frame = { target: target.args[1], closing: { rule: "→I", formula: target } };
      } else if (target.kind === "not" && sameFormula(target.args[0], hypothesis)) {
        frame = { target: FALSUM, closing: { rule: "¬I", formula: target } };
      } else if (sameFormula(hypothesis, not(target))) {
        frame = { target: FALSUM, closing: { rule: "RA", formula: target } };
      }
    }
    if (!frame) return { frames, target, failed: subproof };
    frames.push({ ...frame, subproof });
    target = frame.target;
  }
  return { frames, target, failed: null };
}

/** As formas de citar com que se tenta um passo só: linhas, caixas e o par linha e caixa (∃E). */
function* citationChoices(rule, facts, ranges) {
  const formulas = rule.premises.filter(({ kind }) => kind === "formula").length;
  const boxes = rule.premises.length - formulas;
  if (boxes === 0 && formulas === 0) yield [];
  if (boxes === 0 && formulas === 1) for (const fact of facts) yield [citeLine(fact.line)];
  if (boxes === 0 && formulas === 2) {
    for (const [i, a] of facts.entries()) for (const b of facts.slice(i)) yield [citeLine(a.line), citeLine(b.line)];
  }
  if (boxes === 1 && formulas === 0) for (const range of ranges) yield [citeRange(range.from, range.to)];
  if (boxes === 1 && formulas === 1) {
    for (const fact of facts) for (const range of ranges) yield [citeLine(fact.line), citeRange(range.from, range.to)];
  }
}

/** Um passo só, com uma regra ativa e o que já está na prova, que dê `target` na linha do cursor. */
function oneStep(cursor, target, facts, { rules, known }) {
  const { proof, line } = cursor;
  if (proof.lines[line - 1].kind !== "step") return null;
  const ranges = accessibleFrom(proof, line).ranges;
  const tried = new Set();
  for (const rule of rules) {
    if (rule.id === "R" || tried.has(rule.id)) continue;
    tried.add(rule.id);
    for (const citations of citationChoices(rule, facts, ranges)) {
      const probe = editLine(proof, line, { formula: target, rule: rule.id, citations });
      if (probe.ok && verifyLine(probe.proof, line, rules, known).ok) return { rule: rule.id, citations };
    }
  }
  return null;
}

/** Se `part` é `whole` ou uma subfórmula dela. */
function within(part, whole) {
  return sameFormula(part, whole) || whole.args.some((arg) => arg.kind !== "term" && within(part, arg));
}

/** Os termos que já existem no objetivo e nos factos; sem nenhum, um nome novo. */
function existingTerms(target, facts, names) {
  const found = new Map();
  for (const formula of [target, ...facts.map((fact) => fact.formula)]) freeTerms(formula, found);
  return found.size > 0 ? [...found.values()] : [term(unusedName(names, ["a", "b", "c"], "a"))];
}

/**
 * O que leva ao objetivo num passo: num ∃x φ, φ com cada termo que já existe no lugar de x (∃I); numa
 * conjunção, os dois lados e o que leva a cada um.
 */
function witnessesOf(target, terms) {
  if (target.kind === "and") return target.args.flatMap((side) => [side, ...witnessesOf(side, terms)]);
  if (target.kind !== "exists") return [];
  const [body] = target.args;
  return terms.filter((t) => isSubstitutable(body, target.name, t)).map((t) => substitute(body, target.name, t));
}

/**
 * Uma instância de um ∀ acessível com um termo que já existe, que ajude: contém o objetivo ou uma
 * fórmula que daria o objetivo ∃ (`wanted`), é uma delas, ou aparece dentro de outro facto. Devolve
 * { formula, line }, ou null.
 */
function usefulInstance(target, facts, terms, wanted) {
  const isFact = (formula) => facts.some((fact) => sameFormula(fact.formula, formula));
  const witnesses = (formula) => wanted.some((item) => sameFormula(item, formula));
  const instances = [];
  for (const fact of [...facts].reverse()) {
    if (fact.formula.kind === "forall") {
      const [body] = fact.formula.args;
      for (const t of terms) {
        if (isSubstitutable(body, fact.formula.name, t)) {
          const formula = substitute(body, fact.formula.name, t);
          if (!isFact(formula)) instances.push({ formula, line: fact.line });
        }
      }
    }
  }
  const inOther = (formula) => facts.some((fact) => fact.formula.kind !== "forall" && within(formula, fact.formula));
  const leads = (formula) => [target, ...wanted].some((item) => within(item, formula)) && !witnesses(formula);
  // Um ∀ dentro de outro: a instância ajuda se alguma instância dela ajudar (∀x∀y R(x, y) dá ∀y R(u, y)).
  const nested = (formula) => formula.kind === "forall" && terms.some((t) => (
    isSubstitutable(formula.args[0], formula.name, t) && leads(substitute(formula.args[0], formula.name, t))
  ));
  return instances.find(({ formula }) => leads(formula))
    ?? instances.find(({ formula }) => witnesses(formula))
    ?? instances.find(({ formula }) => nested(formula))
    ?? instances.find(({ formula }) => inOther(formula))
    ?? instances.find(({ formula }) => [...freeTerms(target).keys()].some((name) => freeTerms(formula).has(name)))
    ?? null;
}

/** Dica de 1.ª ordem: ver o comentário acima. */
function firstOrderHint(proof, goal, { rules, known }) {
  if (isFinished(proof, goal, rules, known)) return { status: "done" };
  let cursor = findCursor(proof);
  const fix = firstBrokenLine(proof, cursor, rules, known);
  if (fix) return fix;
  const premiseStep = premiseHint(proof, goal);
  if (premiseStep) return premiseStep;

  const can = (id) => rules.some((rule) => rule.id === id);
  const real = cursor;
  const own = real.proof.lines[real.line - 1];
  let frames = [];
  let target = own.formula;
  let outer = goal.conclusion;
  if (!target) {
    const chain = enclosingSubproofs(real.proof, real.line).filter(({ from }) => from !== real.line);
    const inferred = firstOrderFrames(real.proof, chain, goal.conclusion);
    if (inferred.failed) return deadEnd(inferred.failed.from, "offTrack");
    ({ frames, target } = inferred);
  } else {
    // Uma caixa que acaba logo antes desta linha, mais funda, ainda está a ser escrita: o passo entra
    // nela, como se houvesse ali uma linha por preencher, e o objetivo dela sai do desta linha.
    const previous = real.proof.lines[real.line - 2];
    const virtual = previous && previous.depth > own.depth && own.kind === "step"
      ? insertLine(real.proof, real.line - 1, { depth: previous.depth })
      : { ok: false };
    if (virtual.ok) {
      const deeper = enclosingSubproofs(virtual.proof, real.line).filter(({ depth: inner }) => inner > own.depth);
      const inferred = firstOrderFrames(virtual.proof, deeper, own.formula);
      if (deeper.length > 0 && !inferred.failed) {
        cursor = { proof: virtual.proof, line: real.line, synthetic: true };
        ({ frames, target } = inferred);
        outer = own.formula;
      }
    }
  }
  const { lines } = cursor.proof;
  const current = lines[cursor.line - 1];
  const depth = current.depth;
  const facts = accessibleFrom(cursor.proof, cursor.line).lines
    .filter((line) => lines[line - 1].formula)
    .map((line) => ({ formula: lines[line - 1].formula, line }));

  const last = frames.at(-1);
  const previous = lines[cursor.line - 2];
  if (last && previous?.formula && previous.depth === last.subproof.depth && sameFormula(previous.formula, last.target)) {
    const range = citeRange(last.subproof.from, cursor.line - 1);
    const { rule, formula, source } = last.closing;
    const closingDepth = last.subproof.depth - 1;
    // A caixa fecha na própria linha escrita: é ela que fica justificada.
    const onOwn = cursor !== real && closingDepth === own.depth && sameFormula(formula, own.formula);
    return stepHint(onOwn ? real : cursor, frames.at(-2)?.target ?? outer, {
      kind: "step",
      depth: closingDepth,
      formula,
      rule,
      citations: rule === "∃E" ? [citeLine(source), range] : [range],
      strategy: strategyOf(rule),
    });
  }

  const repeated = facts.find(({ formula }) => sameFormula(formula, target));
  if (repeated && can("R")) {
    return stepHint(cursor, target, {
      kind: "step", depth, formula: target, rule: "R", citations: [citeLine(repeated.line)], strategy: "repeatFact",
    });
  }
  const direct = oneStep(cursor, target, facts, { rules, known });
  if (direct) {
    return stepHint(cursor, target, { kind: "step", depth, formula: target, ...direct, strategy: strategyOf(direct.rule) });
  }
  if (target.kind === "forall" && can("∀I")) {
    const variable = freshFor(cursor.proof, goal);
    // A linha abre a caixa de outro ∀I, e só cabe uma caixa por linha: a de fora começa por repetir um facto.
    if ((current.fresh ?? null) !== null && current.kind === "step" && can("R") && facts.length > 0) {
      const [fact] = facts;
      return stepHint(cursor, target, {
        kind: "step", depth, formula: fact.formula, rule: "R", citations: [citeLine(fact.line)], strategy: "separateBoxes",
      });
    }
    if ((current.fresh ?? null) === null && isSubstitutable(target.args[0], target.name, term(variable))) {
      return stepHint(cursor, target, {
        kind: "step",
        depth: depth + 1,
        formula: substitute(target.args[0], target.name, term(variable)),
        fresh: variable,
        strategy: "openForallBox",
        viaRule: "∀I",
      });
    }
  }
  // Um ∃ que a própria prova tirou por ∃I não se volta a abrir: dava um ciclo.
  const opened = new Set(frames.map(({ closing }) => closing.source).filter(Boolean));
  const witness = can("∃E") && facts.find(({ formula, line }) => (
    formula.kind === "exists" && !opened.has(line) && lines[line - 1].rule !== "∃I"
  ));
  if (witness) {
    const variable = freshFor(cursor.proof, goal);
    const [body] = witness.formula.args;
    if (isSubstitutable(body, witness.formula.name, term(variable))) {
      return stepHint(cursor, target, {
        kind: "hypothesis",
        depth: depth + 1,
        formula: substitute(body, witness.formula.name, term(variable)),
        fresh: variable,
        strategy: "assumeWitness",
        viaRule: "∃E",
      });
    }
  }
  // Uma conjunção provada separa-se: cada lado pode ser o que falta.
  const split = can("∧E") && facts.flatMap(({ formula, line }) => (
    formula.kind === "and" ? formula.args.map((side) => ({ formula: side, line })) : []
  )).find(({ formula }) => !facts.some((fact) => sameFormula(fact.formula, formula)));
  if (split) {
    return stepHint(cursor, target, {
      kind: "step", depth, formula: split.formula, rule: "∧E", citations: [citeLine(split.line)], strategy: "useConjunction",
    });
  }
  const names = namesOf([...goal.premises, goal.conclusion, ...lines.map(({ formula }) => formula)]);
  const terms = existingTerms(target, facts, names);
  const wanted = witnessesOf(target, terms);
  const instance = can("∀E") && usefulInstance(target, facts, terms, wanted);
  if (instance) {
    return stepHint(cursor, target, {
      kind: "step", depth, formula: instance.formula, rule: "∀E", citations: [citeLine(instance.line)], strategy: "instantiate",
    });
  }
  // Para um objetivo ∃, uma instância dele que saia num passo só do que já está provado.
  for (const formula of wanted.filter((item) => !facts.some((fact) => sameFormula(fact.formula, item)))) {
    const step = oneStep(cursor, formula, facts, { rules, known });
    if (step) return stepHint(cursor, target, { kind: "step", depth, formula, ...step, strategy: strategyOf(step.rule) });
  }
  const assume = (formula, rule, strategy) => stepHint(cursor, target, {
    kind: "hypothesis", depth: depth + 1, formula, strategy, viaRule: rule,
  });
  if (target.kind === "implies" && can("→I")) return assume(target.args[0], "→I", "assumeAntecedent");
  if (target.kind === "not" && can("¬I")) return assume(target.args[0], "¬I", "assumeToNegate");
  return { status: "unknown", error: { code: "searchExhausted", params: {} } };
}

/**
 * Aplica um passo de `hint` à prova. Uma linha substituída guarda a caixa que abria (`fresh`, `label`);
 * uma linha que entra antes do passo que abre a caixa do ∀I passa a abri-la ela.
 */
export function applyHint(proof, step) {
  if (step.action === "deleteSubproof") return deleteLine(proof, step.line);
  const { line, replaces, kind, depth, formula, rule, citations, strategy, fresh = null } = step;
  const written = { kind, depth, formula, rule, citations, strategy, fresh };
  if (!replaces) {
    const next = proof.lines[line - 1];
    const opensBox = next?.kind === "step" && (next.fresh ?? null) !== null;
    const fits = kind === "hypothesis" ? depth === next?.depth + 1 : depth === next?.depth && fresh === null;
    if (opensBox && fits) {
      return insertAtBoxStart(proof, line, written);
    }
    return insertLine(proof, line - 1, written);
  }
  const lines = proof.lines.map((old, index) => (
    index === line - 1
      ? { ...written, fresh: fresh ?? old.fresh ?? null, label: kind === "hypothesis" ? old.label ?? null : null }
      : old
  ));
  return createProof(lines);
}
