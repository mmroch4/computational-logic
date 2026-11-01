// Dicas: em estados iniciais, a meio e sem saída. Seguir as dicas tem de acabar numa prova verificada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { format } from "../js/core/formula.js";
import { applyHint, DEAD_END_REASONS, hint } from "../js/core/hints.js";
import { closeSubproof, createProof, insertLine } from "../js/core/proof.js";
import { parseProof } from "../js/core/proof-text.js";
import { parseFormula } from "../js/core/parser.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { parseSequent, sequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { verifyLine, verifyProof } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

const goalOf = (text) => {
  const result = parseSequent(text);
  assert.ok(result.ok, text);
  return result.sequent;
};

const proofOf = (text) => {
  const result = parseProof(text);
  assert.ok(result.ok, `${text}: ${JSON.stringify(result.error)}`);
  return result.proof;
};

const formulaOf = (text) => parseFormula(text).formula;

const premisesOf = (goal) => createProof(
  goal.premises.map((formula) => ({ kind: "premise", depth: 0, formula })),
).proof;

const stepText = ({ step }) => (
  `${step.line} ${step.kind} ${step.depth} ${format(step.formula)} ${step.rule ?? "-"} ${
    step.citations.map((c) => (c.kind === "line" ? c.line : `${c.from}-${c.to}`)).join(",")}`
);

/** Segue as dicas desde `start`; cada passo tem de dar uma linha que o verificador aceita. */
function follow(goal, start, rules = RULES) {
  let proof = start;
  for (let round = 0; round < 80; round += 1) {
    const result = hint(proof, goal, { rules, known: RULES });
    if (result.status === "done") return proof;
    assert.equal(result.status, "step", `${format(goal.conclusion)}: ${JSON.stringify(result)}`);
    const applied = applyHint(proof, result.step);
    assert.ok(applied.ok, JSON.stringify(applied.error));
    proof = applied.proof;
    const checked = verifyLine(proof, result.step.line, rules, RULES);
    assert.ok(checked.ok, `${stepText(result)}: ${JSON.stringify(checked.error)}`);
  }
  assert.fail(`As dicas não acabaram: ${format(goal.conclusion)}`);
}

const SEQUENTS = [
  "p ∧ q ⊢ q ∧ p",
  "p → q, q → r ⊢ p → r",
  "p ∨ q ⊢ q ∨ p",
  "p → q ⊢ ¬q → ¬p",
  "¬q → ¬p ⊢ p → ¬¬q",
  "¬(p ∨ q) ⊢ ¬p ∧ ¬q",
  "¬(p ∧ q) ⊢ ¬p ∨ ¬q",
  "⊢ p ∨ ¬p",
  "⊢ ((p → q) → p) → p",
  "p → q ∨ r ⊢ (p → q) ∨ (p → r)",
  "(p → q) → r, ¬p ⊢ r",
  "p ∧ (q ∨ r) ⊢ (p ∧ q) ∨ (p ∧ r)",
  "(p ∧ q) ∨ (p ∧ r) ⊢ p ∧ (q ∨ r)",
  "p, ¬p ⊢ q",
  "¬¬p ⊢ p",
  "p ⊢ q → p",
  "⊢ (p → q) ∨ (q → p)",
  "p ∨ q, ¬p ⊢ q",
  "p ⊢ p",
  "⊢ (p → (q → r)) → ((p → q) → (p → r))",
  // Regressões: fizeram as dicas abrir subdeduções sem fim, ou dar por perdido um caminho que tinham dado.
  "r ∨ r ∨ q ⊢ ¬(p ∨ p) ∨ (q → q)",
  "¬p ∨ r ⊢ r ∨ p ∨ (r → p)",
  "¬(p ∨ q), ¬(r ∨ q) ⊢ (¬r ∨ q) ∧ ¬q",
  "r ∨ p → q, q ∧ q ∨ q ⊢ (p ∨ q) ∧ (p → q)",
];

test("seguir as dicas desde as premissas dá uma prova verificada", () => {
  for (const spec of ["completo", "base", { set: "completo", exclude: ["RA", "TE"] }]) {
    const rules = ruleSet(spec);
    for (const text of SEQUENTS) {
      const goal = goalOf(text);
      const proof = follow(goal, premisesOf(goal), rules);
      assert.ok(verifyProof(proof, goal, rules, RULES).ok, text);
    }
  }
});

test("qualquer início de uma prova gerada continua até ao fim", () => {
  for (const text of SEQUENTS) {
    const goal = goalOf(text);
    const { lines } = solve(goal).proof;
    for (let length = goal.premises.length; length < lines.length; length += 1) {
      const start = createProof(lines.slice(0, length)).proof;
      assert.ok(verifyProof(follow(goal, start), goal, RULES).ok, `${text} (${length})`);
    }
  }
});

test("seguir as dicas desde uma prova vazia escreve primeiro as premissas", () => {
  const goal = goalOf("p, q ⊢ q ∧ p");
  const first = hint(createProof([]).proof, goal);
  assert.equal(first.status, "step");
  assert.equal(first.step.kind, "premise");
  assert.equal(first.levels[0].key, "hints.startFromPremises");
  assert.ok(verifyProof(follow(goal, createProof([]).proof), goal, RULES).ok);
});

test("estado inicial: os três níveis de uma implicação", () => {
  const result = hint(createProof([]).proof, goalOf("⊢ p → p"));
  assert.equal(result.strategy, "assumeAntecedent");
  assert.equal(stepText(result), "1 hypothesis 1 p - ");
  assert.equal(result.step.viaRule, "→I");
  assert.deepEqual(result.levels.map(({ key }) => key), [
    "solver.strategies.assumeAntecedent",
    "hints.rule.hypothesis",
    "hints.exact.hypothesis",
  ]);
  assert.deepEqual(result.levels[1].params, { rule: "→I" });
  assert.deepEqual(result.levels[2].params, { line: 1, formula: "p" });
});

test("estado inicial: um passo cita as linhas da prova do utilizador", () => {
  const goal = goalOf("q, p → q, p ⊢ q ∧ p ∧ q");
  const result = hint(premisesOf(goal), goal);
  assert.equal(stepText(result).split(" ")[0], "4");
  assert.equal(result.levels[1].key, "hints.rule.step");
  assert.equal(result.levels[2].key, "hints.exact.step");
});

test("a meio: dentro de uma subdedução, o objetivo é o consequente", () => {
  const goal = goalOf("p ∧ q ⊢ p → q");
  const proof = proofOf(`
    1 | p ∧ q  premissa
    2 |   p    hipótese`);
  const result = hint(proof, goal);
  assert.equal(format(result.target), "q");
  assert.equal(stepText(result), "3 step 1 q ∧E 1");
  assert.equal(result.strategy, "useConjunction");
});

test("a meio: uma subdedução que chegou ao objetivo fecha-se com a regra certa", () => {
  const goal = goalOf("p → q, q → r ⊢ p → r");
  const proof = proofOf(`
    1 | p → q  premissa
    2 | q → r  premissa
    3 |   p    hipótese
    4 |   q    →E, 3, 1
    5 |   r    →E, 4, 2`);
  const result = hint(proof, goal);
  assert.equal(stepText(result), "6 step 0 p → r →I 3-5");
  assert.equal(result.strategy, "concludeImplication");
  const done = applyHint(proof, result.step).proof;
  assert.equal(hint(done, goal).status, "done");
});

test("a meio: a linha por preencher depois de fechar a subdedução recebe o passo que a usa", () => {
  const goal = goalOf("⊢ p → p");
  const open = proofOf("1 |   p  hipótese");
  const { proof } = closeSubproof(open, 1);
  const result = hint(proof, goal);
  assert.equal(result.step.replaces, true);
  assert.equal(stepText(result), "2 step 0 p → p →I 1-1");
  assert.equal(hint(applyHint(proof, result.step).proof, goal).status, "done");
});

test("a meio: o primeiro caso de um ∨E pede o segundo e o segundo pede o ∨E", () => {
  const goal = goalOf("p ∨ q ⊢ q ∨ p");
  const first = proofOf(`
    1 | p ∨ q  premissa
    2 |   p    hipótese
    3 |   q ∨ p  ∨I, 2`);
  const next = hint(first, goal);
  assert.equal(stepText(next), "4 hypothesis 1 q - ");
  assert.equal(next.step.viaRule, "∨E");

  const both = proofOf(`
    1 | p ∨ q  premissa
    2 |   p    hipótese
    3 |   q ∨ p  ∨I, 2
    4 |   q    hipótese
    5 |   q ∨ p  ∨I, 4`);
  assert.equal(stepText(hint(both, goal)), "6 step 0 q ∨ p ∨E 1,2-3,4-5");
});

test("a meio: redução ao absurdo com RA, e com ¬I + ¬E quando RA não está ativa", () => {
  const goal = goalOf("¬¬p ⊢ p");
  const proof = proofOf(`
    1 | ¬¬p  premissa
    2 |   ¬p  hipótese
    3 |   F   FI, 2, 1`);
  assert.equal(stepText(hint(proof, goal)), "4 step 0 p RA 2-3");

  const rules = ruleSet({ set: "completo", exclude: ["RA"] });
  const result = hint(proof, goal, { rules, known: RULES });
  assert.equal(stepText(result), "4 step 0 ¬¬p ¬I 2-3");
  assert.ok(verifyProof(follow(goal, proof, rules), goal, rules, RULES).ok);
});

test("a meio: repete um facto exterior para acabar a subdedução", () => {
  const goal = goalOf("p ⊢ q → p");
  const proof = proofOf(`
    1 | p  premissa
    2 |   q  hipótese`);
  const result = hint(proof, goal);
  assert.equal(stepText(result), "3 step 1 p R 1");
  assert.equal(result.strategy, "repeatFact");
});

test("a meio: uma hipótese para excluir leva a uma contradição, e o objetivo mantém-se", () => {
  const goal = goalOf("p → q, ¬q ⊢ ¬p ∧ ¬q");
  const proof = proofOf(`
    1 | p → q  premissa
    2 | ¬q     premissa
    3 |   p    hipótese`);
  assert.equal(format(hint(proof, goal).target), "F");
  const finished = follow(goal, proof);
  assert.ok(verifyProof(finished, goal, RULES).ok);
});

test("a meio: uma linha sem regra recebe a justificação", () => {
  const goal = goalOf("p ∧ q ⊢ q");
  const { proof } = insertLine(premisesOf(goal), 1, { formula: formulaOf("q") });
  const result = hint(proof, goal);
  assert.equal(result.step.replaces, true);
  assert.equal(stepText(result), "2 step 0 q ∧E 1");
});

test("a meio: uma linha em branco antes de uma linha escrita prepara essa linha", () => {
  const goal = goalOf("p ∧ q ⊢ q ∧ p");
  const { proof: blank } = insertLine(premisesOf(goal), 1, {});
  const { proof } = insertLine(blank, 2, { formula: formulaOf("q"), rule: "∧E", citations: [{ kind: "line", line: 1 }] });
  const result = hint(proof, goal);
  assert.equal(format(result.target), "q");
  assert.equal(result.step.replaces, true);
  assert.equal(stepText(result), "2 step 0 q ∧E 1");
});

test("sem saída: uma linha errada vem primeiro", () => {
  const goal = goalOf("p ∧ q ⊢ q");
  const proof = proofOf(`
    1 | p ∧ q  premissa
    2 | p ∨ q  ∧E, 1`);
  const result = hint(proof, goal);
  assert.equal(result.status, "fixLine");
  assert.equal(result.line, 2);
  assert.equal(result.levels[1].key, `verify.errors.${result.error.code}`);
});

test("sem saída: uma regra proibida numa linha é um erro a corrigir", () => {
  const goal = goalOf("p → q, ¬q ⊢ ¬p");
  const proof = proofOf(`
    1 | p → q  premissa
    2 | ¬q     premissa
    3 | ¬p     MT, 1, 2`);
  const result = hint(proof, goal, { rules: ruleSet("base"), known: RULES });
  assert.equal(result.status, "fixLine");
  assert.equal(result.error.code, "ruleNotAllowed");
});

test("sem saída: uma premissa fora do sequente", () => {
  const goal = goalOf("p ⊢ p ∨ q");
  const proof = proofOf(`
    1 | p  premissa
    2 | q  premissa`);
  const result = hint(proof, goal);
  assert.equal(result.status, "fixLine");
  assert.equal(result.line, 2);
  assert.equal(result.levels[1].key, "verify.extraPremise");
});

test("sem saída: uma fórmula sem regra que não se segue do que está acima", () => {
  const goal = goalOf("p ⊢ p ∨ q");
  const { proof } = insertLine(premisesOf(goal), 1, { formula: formulaOf("q") });
  const result = hint(proof, goal);
  assert.equal(result.status, "fixLine");
  assert.equal(result.error.code, "notDerivable");
  assert.equal(result.levels[1].key, "hints.notDerivable");
});

test("sem saída: sequente inválido dá o contraexemplo, com ou sem linhas escritas", () => {
  const goal = goalOf("p ⊢ q");
  for (const proof of [createProof([]).proof, premisesOf(goal)]) {
    const result = hint(proof, goal);
    assert.equal(result.status, "invalid");
    assert.equal(result.counterexample.get("q"), false);
  }
});

test("sem saída: sem prova com estas regras, mesmo a meio da prova", () => {
  const goal = goalOf("¬¬p ⊢ p");
  const rules = ruleSet({ set: "completo", exclude: ["¬E", "RA", "TE"] });
  const start = hint(premisesOf(goal), goal, { rules, known: RULES });
  assert.equal(start.status, "noProof");
  assert.ok(start.witness);

  const inner = proofOf(`
    1 | ¬¬p  premissa
    2 |   p  hipótese`);
  assert.equal(hint(inner, goalOf("¬¬p ⊢ p → p"), { rules, known: RULES }).status, "step");
  assert.equal(hint(proofOf("1 | ¬¬p  premissa\n2 |   ¬p  hipótese"), goal, { rules, known: RULES }).status, "noProof");
});

test("sem saída: uma hipótese que não ajuda sugere apagar a subdedução", () => {
  const goal = goalOf("p ⊢ p ∨ q");
  const proof = proofOf(`
    1 | p  premissa
    2 |   r  hipótese`);
  const result = hint(proof, goal);
  assert.equal(result.status, "deadEnd");
  assert.equal(result.reason, "offTrack");
  assert.equal(result.line, 2);
  assert.deepEqual(result.step, { action: "deleteSubproof", line: 2 });
  const back = applyHint(proof, result.step).proof;
  assert.equal(back.lines.length, 1);
  assert.ok(verifyProof(follow(goal, back), goal, RULES).ok);
});

test("sem saída: a hipótese interior é julgada contra o objetivo da exterior", () => {
  const goal = goalOf("⊢ p → p");
  const proof = proofOf(`
    1 |   p  hipótese
    2 |     r  hipótese`);
  const result = hint(proof, goal);
  assert.equal(result.status, "deadEnd");
  assert.equal(result.line, 2);
});

test("sem saída: daqui não há caminho, mas o sequente tem prova por outro lado", () => {
  const goal = goalOf("p → q ⊢ p → q");
  const rules = ruleSet({ set: "restrito", only: ["→I", "R"] });
  const proof = proofOf(`
    1 | p → q  premissa
    2 |   p    hipótese`);
  const result = hint(proof, goal, { rules, known: RULES });
  assert.equal(result.status, "deadEnd");
  assert.equal(result.reason, "noWayOut");
  assert.ok(DEAD_END_REASONS.includes(result.reason));
});

test("uma procura que desiste diz que não sabe, sem afirmar que não há prova", () => {
  const goal = goalOf("⊢ ((p → q) → p) → p");
  const result = hint(createProof([]).proof, goal, { maxSteps: 1 });
  assert.equal(result.status, "unknown");
  assert.equal(result.error.code, "stepLimit");
});

test("demasiadas variáveis na prova escrita não rebentam", () => {
  const names = Array.from({ length: 14 }, (_, index) => `a${index}`);
  const goal = sequent([formulaOf(names.join(" ∧ "))], formulaOf("a0"));
  assert.equal(hint(createProof([]).proof, goal).status, "unknown");
  const small = goalOf("p ⊢ p ∨ p");
  const lines = [{ kind: "premise", depth: 0, formula: formulaOf("p") }, {
    kind: "hypothesis",
    depth: 1,
    formula: formulaOf(names.join(" ∧ ")),
  }];
  assert.equal(hint(createProof(lines).proof, small).status, "unknown");
});

test("prova acabada, com ou sem linha em branco no fim", () => {
  const goal = goalOf("p ⊢ p ∨ q");
  const proof = proofOf(`
    1 | p      premissa
    2 | p ∨ q  ∨I, 1`);
  assert.equal(hint(proof, goal).status, "done");
  assert.equal(hint(insertLine(proof, 2, {}).proof, goal).status, "done");
});

test("as dicas não mudam a prova", () => {
  const goal = goalOf("¬q → ¬p ⊢ p → ¬¬q");
  const proof = premisesOf(goal);
  const before = JSON.stringify(proof);
  hint(proof, goal);
  assert.equal(JSON.stringify(proof), before);
});

test("as dicas ignoram estratégias antigas de uma prova gerada e depois editada", () => {
  const goal = goalOf("p ∧ q ⊢ q");
  const proof = createProof([
    { kind: "premise", depth: 0, formula: formulaOf("p ∧ q") },
    { kind: "step", depth: 0, formula: null, rule: null, strategy: "applyRule" },
  ]).proof;
  assert.equal(hint(proof, goal).strategy, "useConjunction");
});

test("uma hipótese que só voltaria a dar o que já está provado serve antes para um lema", () => {
  const goal = goalOf("(p → q) → p, ¬p ⊢ F");
  const proof = proofOf(`
    1 | (p → q) → p  premissa
    2 | ¬p           premissa
    3 |   p          hipótese`);
  assert.equal(format(hint(proof, goal).target), "q");
  assert.ok(verifyProof(follow(goal, proof), goal, RULES).ok);
});

test("todas as chaves das dicas têm texto em PT e em EN", () => {
  const lookup = (locale, key) => key.split(".").reduce((node, part) => node?.[part], locale);
  const goal = goalOf("p ∧ q ⊢ p → q");
  const results = [
    hint(createProof([]).proof, goal),
    hint(premisesOf(goal), goal),
    hint(proofOf("1 | p ∧ q  premissa\n2 |   p  hipótese\n3 |   q  ∧E, 1"), goal),
    hint(proofOf("1 | p ∧ q  premissa\n2 |   r  hipótese"), goal),
    hint(proofOf("1 | p ∧ q  premissa\n2 | r  ∧E, 1"), goal),
    hint(proofOf("1 | p ∧ q  premissa\n2 | r  premissa"), goal),
    hint(createProof([]).proof, goalOf("⊢ p ∨ ¬p"), { rules: ruleSet("base") }),
  ];
  for (const { levels } of results) {
    assert.equal(levels.length, 3);
    for (const { key } of levels) {
      assert.equal(typeof lookup(pt, key), "string", key);
      assert.equal(typeof lookup(en, key), "string", key);
    }
  }
  for (const key of ["hints.target", "hints.notDerivable", "hints.exact.stepUncited", "hints.deadEnd.noWayOut"]) {
    assert.equal(typeof lookup(pt, key), "string", key);
    assert.equal(typeof lookup(en, key), "string", key);
  }
});
