// A fronteira proposicional: o que só sabe lógica proposicional responde a um sequente de 1.ª ordem com
// um resultado explícito, sem lançar. No Chrome, a página Provar com um link de 1.ª ordem:
// scripts/check-page.sh "/provar?s=…".
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_ORDER, IDLE, assistSupports, errorKey, idlePanel, panelFromResult } from "../js/core/assist.js";
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
import { verifyProof } from "../js/core/verify.js";
import { createUserRule, loadUserRules } from "../js/core/user-rules.js";
import { assistBodyHtml, createAssist } from "../js/ui/assist-panel.js";
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

test("o solver e a solução devolvem o erro sem procurar; o countermodel devolve null", () => {
  const rules = ruleSet("completo");
  for (const text of FIRST_ORDER_SEQUENTS) {
    const goal = goalOf(text);
    assert.deepEqual(solve(goal, { rules }), NOT_PROPOSITIONAL, text);
    assert.equal(countermodel(goal, rules), null, text);
    const proof = createEditor(goal).proof;
    assert.deepEqual(completeProof(proof, goal, { rules, known: RULES }), { status: "unknown", error: NOT_PROPOSITIONAL.error });
  }
});

// Desde a E2, as dicas têm estratégias de 1.ª ordem (testadas em hints.test.js): dão um passo ou dizem
// que não o encontraram, mas nunca que o sequente é inválido ou que não tem prova.
test("as dicas de 1.ª ordem dão um passo ou não encontram nenhum, sem tabela de verdade", () => {
  const rules = ruleSet("completo");
  for (const text of FIRST_ORDER_SEQUENTS) {
    const goal = goalOf(text);
    const result = hint(createEditor(goal).proof, goal, { rules, known: RULES });
    const valid = text !== "p ⊢ p ∧ R(f(c))";
    if (valid) assert.equal(result.status, "step", text);
    else assert.deepEqual(result, { status: "unknown", error: { code: "searchExhausted", params: {} } }, text);
  }
});

test("uma prova de 1.ª ordem escrita à mão com regras proposicionais é verificada", () => {
  const goal = goalOf("P(a) → Q(a), P(a) ⊢ Q(a)");
  const read = parseProof("1 | P(a) → Q(a)   premissa\n2 | P(a)   premissa\n3 | Q(a)   →E, 1, 2");
  assert.ok(read.ok, JSON.stringify(read.error));
  assert.equal(verifyProof(read.proof, goal, ruleSet("completo")).ok, true);
});

test("o painel de ajuda mostra a 1.ª ordem como ainda não suportada, em PT e em EN", () => {
  const goal = goalOf(FIRST_ORDER_SEQUENTS[0]);
  assert.equal(assistSupports(goal), false);
  assert.equal(assistSupports(goalOf("p ⊢ p")), true);
  assert.equal(idlePanel(goal), FIRST_ORDER);
  assert.equal(idlePanel(goalOf("p ⊢ p")), IDLE);
  assert.equal(idlePanel(null), IDLE);
  assert.equal(panelFromResult({ status: "unknown", error: NOT_PROPOSITIONAL.error }, goal), FIRST_ORDER);
  assert.equal(errorKey(NOT_PROPOSITIONAL.error), "semantics.errors.notPropositional");
  const texts = {};
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    try {
      const html = assistBodyHtml(FIRST_ORDER);
      assert.doesNotMatch(html, /assist\.firstOrder/);
      texts[lang] = html;
      assert.doesNotMatch(t("semantics.errors.notPropositional"), /\.errors\./);
    } finally {
      setLang("pt", { silent: true });
    }
  }
  assert.notEqual(texts.pt, texts.en);
});

test("o painel de 1.ª ordem não chama o Worker e volta ao estado inicial com reset", () => {
  const goal = goalOf("P(a) ⊢ ∃x P(x)");
  const calls = [];
  const worker = { hint: () => calls.push("hint"), complete: () => calls.push("complete") };
  const views = [];
  const source = { getProof: () => createEditor(goal).proof, getGoal: () => goal, getRules: () => ({}), useProof() {} };
  const assist = createAssist({ source, worker, onChange: ({ view }) => views.push(view) });
  assist.reset();
  assert.equal(assist.getPanel(), FIRST_ORDER);
  assist.askHint();
  assist.askSolution();
  assert.deepEqual(calls, []);
  assert.equal(assist.getPanel().view, "firstOrder");
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
