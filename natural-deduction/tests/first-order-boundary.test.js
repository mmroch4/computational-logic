// A fronteira proposicional: o que só sabe lógica proposicional responde a um sequente de 1.ª ordem com
// um resultado explícito, sem lançar; o solver, as dicas e as páginas mostram o contramodelo finito ou
// «não encontrei prova nem contramodelo». No Chrome: scripts/check-page.sh "/passo-a-passo?s=…".
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE, errorKey, panelFromResult } from "../js/core/assist.js";
import { completeProof } from "../js/core/complete.js";
import { countermodel } from "../js/core/countermodel.js";
import { createEditor } from "../js/core/editor.js";
import { isPropositional } from "../js/core/formula.js";
import { hint } from "../js/core/hints.js";
import { homeDemo } from "../js/core/home-demo.js";
import { parseFormula } from "../js/core/parser.js";
import { parseProof } from "../js/core/proof-text.js";
import { quizQuestions } from "../js/core/quiz.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { checkSequent, checkTautology, SEMANTICS_ERROR_CODES, truthTable } from "../js/core/semantics.js";
import { isPropositionalSequent, parseSequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { runSolverTask } from "../js/core/solver-task.js";
import { COUNTERMODEL_LIMITS, findCountermodel, isCountermodel } from "../js/core/structures.js";
import { verifyProof } from "../js/core/verify.js";
import { createUserRule, loadUserRules } from "../js/core/user-rules.js";
import { assistBodyHtml, createAssist } from "../js/ui/assist-panel.js";
import { structureHtml } from "../js/ui/counterexample.js";
import { outcomeHtml, solveOutcome } from "../js/ui/step-player.js";
import { setLang, t } from "../js/ui/i18n.js";
import { ruleErrorText } from "../js/ui/user-rules-panel.js";

const formulaOf = (text) => {
  const read = parseFormula(text, { metavariables: true });
  assert.ok(read.ok, `${text}: ${JSON.stringify(read.error)}`);
  return read.formula;
};
const goalOf = (text) => {
  const read = parseSequent(text);
  assert.ok(read.ok, `${text}: ${JSON.stringify(read.error)}`);
  return read.sequent;
};

const FIRST_ORDER_SEQUENTS = [
  "∀x(P(x) → Q(x)), ∀x P(x) ⊢ ∀x Q(x)",
  "P(a) ⊢ ∃x P(x)",
  "⊢ a = a",
  "P(a) → Q(a), P(a) ⊢ Q(a)",
  "p ⊢ p ∧ R(f(c))",
];
const NOT_PROPOSITIONAL = { ok: false, error: { code: "notPropositional", params: {} } };
// Inválido (só tem modelos infinitos: R é uma ordem estrita sem máximo) e esgota o orçamento.
const EXHAUSTING = "∀x ¬R(x, x), ∀x∀y∀z(R(x, y) ∧ R(y, z) → R(x, z)), ∀x∃y R(x, y), S(a, b) ⊢ F";

test("isPropositional: só conectivos, F, metavariáveis e átomos sem argumentos", () => {
  for (const text of ["p", "F", "¬p ∧ (q ∨ r) → s", "φ → ψ", "constructor"]) {
    assert.equal(isPropositional(formulaOf(text)), true, text);
  }
  for (const text of ["P(a)", "a = b", "∀x P(x)", "∃y p", "¬(a = b)", "p ∧ Q(x)", "φ → ∀x ψ", "forall x (p → p)"]) {
    assert.equal(isPropositional(formulaOf(text)), false, text);
  }
});

test("isPropositionalSequent olha para as premissas e para a conclusão", () => {
  assert.equal(isPropositionalSequent(goalOf("p → q, p ⊢ q")), true);
  assert.equal(isPropositionalSequent(goalOf("P(a), p ⊢ p")), false);
  assert.equal(isPropositionalSequent(goalOf("p ⊢ ∃x P(x)")), false);
});

test("a semântica responde notPropositional em vez de lançar", () => {
  assert.ok(SEMANTICS_ERROR_CODES.includes("notPropositional"));
  for (const text of FIRST_ORDER_SEQUENTS) {
    const goal = goalOf(text);
    assert.deepEqual(checkSequent(goal), NOT_PROPOSITIONAL, text);
    assert.deepEqual(truthTable([...goal.premises, goal.conclusion]), NOT_PROPOSITIONAL, text);
  }
  assert.deepEqual(checkTautology(formulaOf("∀x(P(x) ∨ ¬P(x))")), NOT_PROPOSITIONAL);
  assert.equal(checkSequent(goalOf("p ⊢ p ∨ q")).valid, true);
});

// Desde a M2, o solver, a solução e as dicas procuram um contramodelo finito (structures.js). Sem ele, o
// solver procura uma prova (M3) e, sem nenhum dos dois, dá `undecided`; as dicas seguem as heurísticas da E2.
const INVALID_FIRST_ORDER = "p ⊢ p ∧ R(f(c))";
const UNDECIDED = { ok: false, error: { code: "undecided", params: { maxSize: COUNTERMODEL_LIMITS.maxSize } } };

test("o solver e a solução dão o contramodelo ou, sem ele, nunca dizem que não há prova", () => {
  const rules = ruleSet("completo");
  for (const text of FIRST_ORDER_SEQUENTS) {
    const goal = goalOf(text);
    const result = solve(goal, { rules });
    const proof = createEditor(goal).proof;
    const completed = completeProof(proof, goal, { rules, known: RULES });
    assert.equal(countermodel(goal, rules), null, text);
    if (text === INVALID_FIRST_ORDER) {
      assert.equal(result.ok && result.valid, false, text);
      assert.equal(isCountermodel(goal, result.structure), true, text);
      assert.deepEqual(completed, { status: "invalid", structure: result.structure });
    } else {
      // Desde a M3, os válidos daqui têm prova, e a solução a partir do zero é a do solver.
      assert.equal(result.provable, true, text);
      assert.equal(verifyProof(result.proof, goal, rules).ok, true, text);
      assert.equal(completed.status, "solved", text);
      assert.equal(verifyProof(completed.proof, goal, rules, RULES).ok, true, text);
    }
  }
});

test("um sequente sem contramodelo pequeno, que esgota o orçamento, fica por decidir", () => {
  const goal = goalOf(EXHAUSTING);
  assert.equal(findCountermodel(goal).steps > COUNTERMODEL_LIMITS.budget, true);
  assert.deepEqual(solve(goal, { rules: ruleSet("completo") }), UNDECIDED);
});

// Desde a E2, as dicas têm estratégias de 1.ª ordem (testadas em hints.test.js): dão um passo ou dizem
// que não o encontraram. Desde a M2, um sequente com contramodelo finito é inválido.
test("as dicas de 1.ª ordem dão o contramodelo, um passo, ou não encontram nenhum", () => {
  const rules = ruleSet("completo");
  for (const text of FIRST_ORDER_SEQUENTS) {
    const goal = goalOf(text);
    const result = hint(createEditor(goal).proof, goal, { rules, known: RULES });
    if (text !== INVALID_FIRST_ORDER) assert.equal(result.status, "step", text);
    else {
      assert.equal(result.status, "invalid", text);
      assert.equal(isCountermodel(goal, result.structure), true, text);
    }
  }
});

test("uma prova de 1.ª ordem escrita à mão com regras proposicionais é verificada", () => {
  const goal = goalOf("P(a) → Q(a), P(a) ⊢ Q(a)");
  const read = parseProof("1 | P(a) → Q(a)   premissa\n2 | P(a)   premissa\n3 | Q(a)   →E, 1, 2");
  assert.ok(read.ok, JSON.stringify(read.error));
  assert.equal(verifyProof(read.proof, goal, ruleSet("completo")).ok, true);
});

const STRUCTURE = {
  size: 3,
  constants: [{ name: "a1", value: 0 }],
  functions: [{ name: "f", arity: 1, table: [{ args: [0], value: 1 }, { args: [1], value: 2 }, { args: [2], value: 0 }] }],
  predicates: [
    { name: "p", arity: 0, extension: [[]] },
    { name: "P", arity: 1, extension: [] },
    { name: "R", arity: 2, extension: [[0, 1], [2, 2]] },
  ],
};

test("o painel de ajuda mostra a estrutura do contramodelo, em PT e em EN", () => {
  const goal = goalOf(INVALID_FIRST_ORDER);
  const panel = panelFromResult({ status: "invalid", structure: STRUCTURE }, goal);
  assert.deepEqual(panel, { view: "invalid", structure: STRUCTURE, hasPremises: true });
  const noPremises = panelFromResult({ status: "invalid", structure: STRUCTURE }, goalOf("⊢ ∀x P(x)"));
  assert.equal(noPremises.hasPremises, false);
  const texts = {};
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    try {
      const html = assistBodyHtml(panel);
      assert.doesNotMatch(html + assistBodyHtml(noPremises), /assist\.|undefined/);
      for (const part of ["D = {1, 2, 3}", "a₁ = 1", "f(1) = 2", "f(3) = 1", "P = ∅", "R = {(1, 2), (3, 3)}"]) {
        assert.ok(html.includes(part), lang + ": " + part);
      }
      assert.ok(html.includes("p = " + t("assist.values.true")), lang);
      assert.ok(html.includes(t("assist.structure.label")), lang);
      assert.notEqual(assistBodyHtml(noPremises), html);
      texts[lang] = html;
    } finally {
      setLang("pt", { silent: true });
    }
  }
  assert.notEqual(texts.pt, texts.en);
  assert.match(texts.pt, /Contramodelo/);
  assert.match(texts.en, /Countermodel/);
});

test("uma estrutura sem constantes nem funções só mostra o domínio e os predicados", () => {
  const html = structureHtml({ size: 1, constants: [], functions: [], predicates: [{ name: "P", arity: 1, extension: [[0]] }] });
  assert.ok(html.includes("D = {1}"));
  assert.ok(html.includes("P = {1}"));
  assert.doesNotMatch(html, new RegExp(t("assist.structure.constants") + "|" + t("assist.structure.functions")));
});

test("«não encontrei prova nem contramodelo» diz o limite e não decide, em PT e em EN", () => {
  assert.equal(errorKey(UNDECIDED.error), "solver.errors.undecided");
  const texts = {};
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    try {
      const html = assistBodyHtml(panelFromResult({ status: "unknown", error: UNDECIDED.error }, goalOf(EXHAUSTING)));
      assert.ok(html.includes(String(COUNTERMODEL_LIMITS.maxSize)), lang);
      assert.doesNotMatch(html, /\{maxSize\}|solver\.errors/);
      texts[lang] = html;
    } finally {
      setLang("pt", { silent: true });
    }
  }
  assert.match(texts.pt, /Não encontrei prova nem contramodelo/);
  assert.match(texts.en, /neither a proof nor a countermodel/);
});

test("o painel de 1.ª ordem chama o Worker e mostra o resultado; reset volta ao estado inicial", async () => {
  const goal = goalOf("P(a) ⊢ ∃x P(x)");
  const calls = [];
  const answer = (type) => {
    calls.push(type);
    return { promise: Promise.resolve({ status: "invalid", structure: STRUCTURE }), cancel() {} };
  };
  const worker = { hint: () => answer("hint"), complete: () => answer("complete") };
  const source = { getProof: () => createEditor(goal).proof, getGoal: () => goal, getRules: () => ({}), useProof() {} };
  const assist = createAssist({ source, worker, onChange() {} });
  assist.reset();
  assert.equal(assist.getPanel(), IDLE);
  assist.askSolution();
  assert.deepEqual(assist.getPanel(), { view: "searching", task: "solve" });
  await Promise.resolve();
  assert.deepEqual(assist.getPanel(), { view: "invalid", structure: STRUCTURE, hasPremises: true });
  assist.askHint();
  assert.deepEqual(calls, ["complete", "hint"]);
  assist.reset();
  assert.equal(assist.getPanel(), IDLE);
});

test("o Passo a passo mostra a estrutura ou a mensagem sem veredicto", () => {
  const goal = goalOf("∃x P(x) ⊢ ∀x P(x)");
  const invalid = solve(goal, { rules: ruleSet("completo") });
  const html = outcomeHtml(invalid, goal);
  assert.ok(html.includes(t("player.invalid")));
  assert.ok(html.includes(t("player.countermodel")));
  assert.ok(html.includes("assist__structure"));
  assert.ok(html.includes("D = {1, 2}"));
  assert.ok(outcomeHtml(solve(goalOf("⊢ ∀x P(x)")), goalOf("⊢ ∀x P(x)")).includes(t("player.countermodelNoPremises")));
  assert.deepEqual(solveOutcome(UNDECIDED), { kind: "warn", key: "solver.errors.undecided", params: UNDECIDED.error.params });
  assert.match(outcomeHtml(UNDECIDED, goalOf(EXHAUSTING)), /Não encontrei prova nem contramodelo/);
});

test("o Worker leva a estrutura e o undecided sem mudar o contrato", () => {
  const rules = ruleSet("completo");
  const goal = goalOf("∀x∃y R(x, y) ⊢ ∃y∀x R(x, y)");
  const solved = structuredClone(runSolverTask({ type: "solve", goal, options: { rules } }));
  assert.equal(solved.valid, false);
  assert.equal(isCountermodel(goal, solved.structure), true);
  const proof = createEditor(goal).proof;
  for (const type of ["hint", "complete"]) {
    const result = structuredClone(runSolverTask({ type, goal, proof, options: { rules, known: RULES } }));
    assert.deepEqual(result, { status: "invalid", structure: solved.structure }, type);
  }
  const undecided = structuredClone(runSolverTask({ type: "solve", goal: goalOf(EXHAUSTING), options: { rules } }));
  assert.deepEqual(undecided, UNDECIDED);
});

test("as regras do utilizador recusam esquemas com quantificadores, termos ou =", () => {
  const drafts = [
    { name: "Q1", premises: ["∀x φ"], conclusion: "φ" },
    { name: "Q2", premises: [], conclusion: "∃x φ → φ" },
    { name: "T1", premises: ["P(a)"], conclusion: "P(a)" },
    { name: "E1", premises: [{ hypothesis: "φ", conclusion: "a = b" }], conclusion: "φ" },
  ];
  for (const draft of drafts) {
    const result = createUserRule(draft);
    assert.equal(result.ok, false, draft.name);
    assert.equal(result.error.code, "firstOrder", draft.name);
    assert.doesNotMatch(ruleErrorText(result.error), /\.errors\./);
  }
  const loaded = loadUserRules(drafts);
  assert.equal(loaded.rules.length, 0);
  assert.deepEqual(loaded.rejected.map(({ error }) => error.code), ["firstOrder", "firstOrder", "firstOrder", "firstOrder"]);
});

test("uma regra proposicional continua a servir numa prova de 1.ª ordem", () => {
  const made = createUserRule({ name: "Contra", premises: ["¬ψ → ¬φ"], conclusion: "φ → ψ" });
  assert.ok(made.ok);
  const goal = goalOf("¬Q(a) → ¬P(a) ⊢ P(a) → Q(a)");
  const read = parseProof("1 | ¬Q(a) → ¬P(a)   premissa\n2 | P(a) → Q(a)   Contra, 1");
  assert.ok(read.ok, JSON.stringify(read.error));
  const rules = [...ruleSet("completo"), made.rule];
  assert.equal(verifyProof(read.proof, goal, rules).ok, true);
});

test("o quiz e a demonstração da página inicial ficam proposicionais", () => {
  assert.equal(isPropositionalSequent(homeDemo().goal), true);
  const invalid = quizQuestions().find(({ id }) => id === "invalid");
  assert.equal(invalid.answer, "noProof");
});
