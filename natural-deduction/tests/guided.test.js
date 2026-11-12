// O modo guiado, sobre o estado puro. No Chrome, com toques a 390px: scripts/check-guided.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createEditor, editorStatus, moveCursor, setText, undo } from "../js/core/editor.js";
import { format } from "../js/core/formula.js";
import {
  applyOutcome, focusObjective, guidedAnchor, guidedLines, guidedRules, outcomeLabel, reviseOutcome, toggleSelection,
} from "../js/core/guided.js";
import { citeRange, citeLine } from "../js/core/proof.js";
import { formatProof } from "../js/core/proof-text.js";
import { RULES, defineRule, ruleSet } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { verifyProof } from "../js/core/verify.js";
import { GUIDED_STEPS } from "./fixtures/guided-proof.js";
import { KEYBOARD_GOAL, KEYBOARD_LINES } from "./fixtures/keyboard-proof.js";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const options = { rules: ruleSet("completo"), known: RULES };

const goalOf = (text) => parseSequent(text).sequent;
const start = (text) => createEditor(goalOf(text));
const ruleOf = (editor, selection, id, active = options) => (
  guidedRules(editor, selection, active).find((rule) => rule.id === id)
);

/** Aplica a regra `id`; `pick` escolhe entre os passos, pelo texto que o botão mostra. */
function apply(editor, selection, id, pick = null) {
  const { outcomes, reason } = ruleOf(editor, selection, id);
  assert.ok(outcomes.length > 0, `${id}: ${JSON.stringify(reason)}`);
  const outcome = pick ? outcomes.find((item) => outcomeLabel(item) === pick) : outcomes[0];
  if (!pick) assert.equal(outcomes.length, 1, `${id} pede uma escolha`);
  assert.ok(outcome, `${id} sem o passo ${pick}: ${outcomes.map(outcomeLabel)}`);
  return applyOutcome(editor, outcome);
}

const lines = (...numbers) => numbers.map((number) => citeLine(number));
const finished = (editor) => verifyProof(editor.proof, editor.goal, options.rules, options.known);
const assertDone = (editor) => assert.deepEqual(editorStatus(editor, options).complete, true);

test("a prova da D3 faz-se sem escrever fórmulas", () => {
  let editor = start(KEYBOARD_GOAL);
  for (const { select, rule } of GUIDED_STEPS) {
    editor = apply(editor, lines(...select), rule);
    assert.deepEqual(finished(editor).lineErrors.filter(({ code }) => code !== "missingRule" && code !== "emptyFormula"), []);
  }
  assert.equal(editor.proof.lines.length, KEYBOARD_LINES);
  assert.equal(formatProof(editor.proof), [
    " 1 | p ∨ q                   premissa",
    " 2 |   p → r                 hipótese",
    " 3 |     q → r               hipótese",
    " 4 |       p                 hipótese",
    " 5 |       r                 →E, 4, 2",
    " 6 |       q                 hipótese",
    " 7 |       r                 →E, 6, 3",
    " 8 |     r                   ∨E, 1, 4–5, 6–7",
    " 9 |   (q → r) → r           →I, 3–8",
    "10 | (p → r) → (q → r) → r   →I, 2–9",
  ].join("\n"));
  assertDone(editor);
});

test("o texto das linhas acompanha a prova gerada, com a sigla do idioma", () => {
  const editor = start("p, q ⊢ p ∧ q");
  const next = applyOutcome(editor, ruleOf(editor, [], "∧I").outcomes[0], { "∧I": "∧I" });
  assert.equal(next.drafts[2].formula, "p ∧ q");
  assert.equal(next.drafts[2].justification, "∧I, 1, 2");
  const contradiction = start("¬¬p ⊢ p");
  const labelled = applyOutcome(contradiction, ruleOf(contradiction, [], "RA").outcomes[0], { RA: "RAA" });
  assert.equal(labelled.drafts.at(-1).justification, "RAA, 2–3");
});

test("a partir do objetivo: o que falta passa a objetivos, e o que já existe é citado", () => {
  const editor = start("p ⊢ p ∧ q");
  const next = apply(editor, [], "∧I");
  assert.equal(next.proof.lines.length, 3);
  assert.equal(format(next.proof.lines[1].formula), "q");
  assert.equal(next.proof.lines[1].rule, null);
  assert.deepEqual(next.proof.lines[2].citations, lines(1, 2));
  assert.equal(next.cursor.line, 2);
});

test("para a frente: o passo fica acima do objetivo e a seleção é citada", () => {
  let editor = start("p ∧ q ⊢ q ∧ p");
  editor = apply(editor, lines(1), "∧E", "p");
  assert.equal(editor.proof.lines[1].rule, "∧E");
  assert.equal(editor.cursor.line, 3);
  assert.equal(editor.proof.lines[2].formula, null);
  editor = apply(editor, lines(1), "∧E", "q");
  editor = apply(editor, lines(3, 2), "∧I");
  assertDone(editor);
  assert.equal(editor.proof.lines.length, 4);
});

test("selecionar uma linha com regra que dá o objetivo preenche-o", () => {
  let editor = start("p → q, p ⊢ q");
  editor = apply(editor, lines(1), "→E");
  assert.deepEqual(editor.proof.lines[2].citations, lines(2, 1));
  assertDone(editor);
});

test("uma subdedução fechada seleciona-se a partir de qualquer linha dela", () => {
  const cases = start("a ∨ b, a → c, b → c ⊢ c");
  const split = apply(cases, lines(1), "∨E");
  const closed = apply(apply(split, lines(2), "→E"), lines(3), "→E");
  const last = closed.proof.lines.length;
  const open = moveCursor(closed, last);
  assert.equal(guidedAnchor(open).pending, false);
  const roles = guidedLines(open, []);
  assert.deepEqual(roles[3].item, citeRange(4, 5));
  assert.deepEqual(roles[4].item, citeRange(4, 5));
  assert.equal(guidedLines(open, [citeRange(4, 5)])[4].selected, true);

  const implication = apply(open, [citeRange(4, 5)], "→I");
  assert.equal(format(implication.proof.lines.at(-1).formula), "a → c");
  assert.deepEqual(implication.proof.lines.at(-1).citations, [citeRange(4, 5)]);
});

test("linhas dentro de uma subdedução alheia ficam bloqueadas", () => {
  const editor = apply(start("a ∨ b, a → c, b → c ⊢ c"), lines(1), "∨E");
  const firstCase = guidedLines(editor, []);
  assert.equal(firstCase[4].role, "current");
  assert.equal(firstCase[6].role, "objective");
  assert.equal(firstCase[5].role, "locked");
  const secondCase = guidedLines(moveCursor(editor, 7), []);
  assert.deepEqual(secondCase[3].item, citeRange(4, 5));
  assert.equal(secondCase[6].role, "current");
  assert.equal(secondCase[5].role, "citable");
});

test("tocar outra vez numa linha tira-a da seleção", () => {
  const once = toggleSelection([], citeLine(1));
  assert.deepEqual(once, [citeLine(1)]);
  assert.deepEqual(toggleSelection(once, citeLine(1)), []);
  assert.deepEqual(toggleSelection(once, citeRange(2, 3)), [citeLine(1), citeRange(2, 3)]);
});

test("regras inaplicáveis ficam sem passos e dizem porquê", () => {
  const editor = start("p ∧ q ⊢ r");
  assert.equal(ruleOf(editor, [], "∧I").reason.key, "guided.reasons.targetMismatch");
  assert.equal(ruleOf(editor, [], "∧I").reason.params.conclusions, "φ ∧ ψ");
  assert.equal(ruleOf(editor, [], "→E").reason.key, "guided.reasons.needsSelection");
  assert.equal(ruleOf(editor, [], "→E").reason.params.premises, "φ, φ → ψ");
  assert.equal(ruleOf(editor, [], "∨E").reason.params.premises, "φ ∨ ψ, [φ] … θ, [ψ] … θ");
  assert.equal(ruleOf(editor, lines(1), "¬I").reason.key, "guided.reasons.selectionMismatch");
  assert.equal(ruleOf(editor, lines(1), "¬I").reason.params.premises, "[φ] … F");
  assert.match(ruleOf(editor, [], "DM").reason.params.conclusions, / · /);
});

test("uma regra proibida fica desativada, mesmo que servisse", () => {
  const active = { rules: ruleSet({ set: "base", exclude: ["∧I"] }), known: RULES };
  const editor = start("p, q ⊢ p ∧ q");
  const { outcomes, reason } = ruleOf(editor, [], "∧I", active);
  assert.deepEqual(outcomes, []);
  assert.deepEqual(reason, { key: "guided.reasons.notAllowed", params: { rule: "∧I" } });
  assert.equal(ruleOf(editor, [], "MT", active).reason.key, "guided.reasons.notAllowed");
  assert.ok(guidedRules(editor, [], active).length === new Set(RULES.map(({ id }) => id)).size);
});

test("regras do utilizador aparecem no modo guiado", () => {
  const swap = { ...defineRule("Troca", ["φ ∧ ψ"], "ψ ∧ φ"), user: true };
  const active = { rules: [...options.rules, swap], known: [...RULES, swap] };
  const editor = start("p ∧ q ⊢ q ∧ p");
  const next = applyOutcome(editor, ruleOf(editor, lines(1), "Troca", active).outcomes[0]);
  assert.equal(next.proof.lines[1].rule, "Troca");
  assert.equal(verifyProof(next.proof, next.goal, active.rules, active.known).usesUserRules, true);
});

test("um objetivo igual ao atual não é um passo", () => {
  const editor = start("p ⊢ q");
  assert.deepEqual(ruleOf(editor, [], "R").outcomes, []);
  assert.deepEqual(ruleOf(start("p ⊢ p"), [], "R").outcomes.length, 1);
});

test("escolhe-se entre as formas de ∨I, e FI prefere o objetivo mais simples", () => {
  const disjunction = ruleOf(start("q ⊢ p ∨ r"), [], "∨I");
  assert.deepEqual(disjunction.outcomes.map(outcomeLabel), ["p", "r"]);

  let editor = start("¬p ⊢ F");
  editor = apply(editor, lines(1), "FI");
  assert.equal(format(editor.proof.lines[1].formula), "p");
});

test("sem objetivo, uma metavariável livre escolhe-se entre as subfórmulas", () => {
  let editor = start("p ⊢ (p ∨ q) ∧ r");
  editor = apply(editor, [], "∧I", "p ∨ q, r");
  editor = moveCursor(editor, 2);
  assert.equal(format(guidedAnchor(editor).target), "p ∨ q");
  const left = apply(editor, lines(1), "∨I");
  assert.equal(format(left.proof.lines[1].formula), "p ∨ q");

  const blank = setText(start("p ⊢ q ∨ p"), 2, "formula", "r");
  const forward = ruleOf(blank, lines(1), "∨I");
  assert.ok(forward.outcomes.some((outcome) => outcomeLabel(outcome) === "p ∨ q"));
  assert.ok(forward.outcomes.some((outcome) => outcomeLabel(outcome) === "q ∨ p"));
});

test("TE e RA provam o terceiro excluído sem escrever", () => {
  let editor = start("⊢ p ∨ ¬p");
  editor = apply(editor, [], "TE");
  assertDone(editor);

  editor = start("⊢ p ∨ ¬p");
  editor = apply(editor, [], "RA");
  editor = apply(editor, lines(1), "FI");
  editor = apply(editor, [], "∨I", "¬p");
  editor = apply(editor, [], "¬I");
  editor = apply(editor, lines(1), "FI");
  editor = apply(editor, lines(2), "∨I");
  assertDone(editor);
  assert.equal(finished(editor).ok, true);
});

test("desfazer tira o passo inteiro e citações antigas seguem a numeração nova", () => {
  const before = start(KEYBOARD_GOAL);
  const after = apply(apply(before, [], "→I"), [], "→I");
  assert.equal(after.proof.lines.length, 6);
  assert.equal(undo(after).proof.lines.length, 4);
  assert.equal(undo(undo(after)).proof.lines.length, 2);

  const later = apply(after, lines(1), "∨E");
  assert.deepEqual(later.proof.lines[8].citations, [citeRange(3, 8)]);
  assert.equal(later.drafts[8].justification, "→I, 3–8");
  assert.equal(later.drafts[9].justification, "→I, 2–9");
});

test("entrar no modo guiado leva o cursor ao primeiro objetivo", () => {
  const editor = apply(start("p ⊢ p ∧ p ∧ q"), [], "∧I", "p ∧ p, q");
  const done = apply(editor, [], "∧I");
  const moved = { ...done, cursor: { line: done.proof.lines.findIndex(({ rule }) => rule) + 1, field: "formula" } };
  const focused = focusObjective(moved);
  assert.equal(focused.proof.lines[focused.cursor.line - 1].rule, null);
});

test("em cada passo gerado, a linha da regra passa no verificador", () => {
  const sequents = [
    "p → q, ¬q ⊢ ¬p", "p ∨ q, ¬p ⊢ q", "p → q, q → r ⊢ p → r", "¬(p ∧ q) ⊢ ¬p ∨ ¬q", "¬p ∧ ¬q ⊢ ¬(p ∨ q)",
    "p ∧ q ⊢ q ∧ p", "p ⊢ ¬¬p", "¬¬p ⊢ p", "F ⊢ p",
  ];
  for (const text of sequents) {
    const editor = start(text);
    const selection = editor.goal.premises.map((_, index) => citeLine(index + 1));
    for (const { id, outcomes } of guidedRules(editor, selection, options)) {
      for (const outcome of outcomes) {
        const next = applyOutcome(editor, outcome);
        const { lineErrors } = finished(next);
        const wrong = lineErrors.filter(({ code }) => !["missingRule", "emptyFormula"].includes(code));
        assert.deepEqual(wrong, [], `${text} com ${id}`);
      }
    }
  }
});

test("no Chrome: a prova só com toques, em PT e EN, a 390px", { skip: !existsSync(CHROME) }, () => {
  const run = spawnSync("node", ["scripts/check-guided.mjs"], { encoding: "utf8", timeout: 90000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test("sem seleção, ∧I e →E encontram sozinhos o que citar e fecham o objetivo", () => {
  const text = "a ∧ b → c ⊢ a → b → c";
  let editor = apply(apply(start(text), [], "→I"), [], "→I");
  assert.equal(format(guidedAnchor(editor).target), "c");

  const conjunction = ruleOf(editor, [], "∧I");
  assert.deepEqual(conjunction.outcomes.map(({ formula }) => format(formula)), ["a ∧ b"]);
  editor = applyOutcome(editor, conjunction.outcomes[0]);
  assert.equal(format(guidedAnchor(editor).target), "c");

  const elimination = ruleOf(editor, [], "→E");
  assert.equal(elimination.outcomes.length, 1);
  editor = applyOutcome(editor, elimination.outcomes[0]);
  assert.equal(verifyProof(editor.proof, goalOf(text), options.rules, options.known).ok, true);
});

test("sem seleção, só se oferecem fórmulas novas que já aparecem na prova", () => {
  const editor = apply(start("a ⊢ a → a"), [], "→I");
  assert.equal(ruleOf(editor, [], "∧I").outcomes.length, 0);
});

// --- 1.ª ordem -------------------------------------------------------------------------------------

const textOf = (editor) => formatProof(editor.proof);
const asked = (rule) => rule.outcomes.map((outcome) => (
  [outcomeLabel(outcome), outcome.ask?.kind ?? null, outcome.ask ? format(outcome.ask.value) : null]
));

test("1.ª ordem: o ∀I abre a caixa [v] e o ∀E escolhe o termo, com a marca a passar para a primeira linha", () => {
  let editor = start("∀x(P(x) → Q(x)), ∀x P(x) ⊢ ∀x Q(x)");
  const box = ruleOf(editor, [], "∀I");
  assert.deepEqual(asked(box), [["[v] … Q(v)", "variable", "v"]]);
  editor = applyOutcome(editor, box.outcomes[0]);
  assert.equal(editor.proof.lines[2].fresh, "v");
  assert.equal(editor.drafts[2].formula, "[v] Q(v)");
  assert.equal(format(guidedAnchor(editor).target), "Q(v)");

  const instance = ruleOf(editor, lines(1), "∀E");
  assert.deepEqual(asked(instance), [["P(v) → Q(v)", "term", "v"]]);
  editor = applyOutcome(editor, instance.outcomes[0]);
  assert.equal(editor.proof.lines[2].fresh, "v");
  assert.equal(editor.proof.lines[3].fresh ?? null, null);
  assert.equal(editor.drafts[2].formula, "[v] P(v) → Q(v)");
  assert.equal(editor.drafts[3].formula, "Q(v)");
  editor = apply(editor, lines(2), "∀E", "P(v)");
  editor = apply(editor, [], "→E");
  assert.equal(textOf(editor), [
    "1 | ∀x(P(x) → Q(x))    premissa",
    "2 | ∀x P(x)            premissa",
    "3 |  [v] P(v) → Q(v)   ∀E, 1",
    "4 |   P(v)             ∀E, 2",
    "5 |   Q(v)             →E, 4, 3",
    "6 | ∀x Q(x)            ∀I, 3–5",
  ].join("\n"));
  assertDone(editor);
});

test("1.ª ordem: uma hipótese no início da caixa do ∀I leva a marca para a linha de etiqueta", () => {
  let editor = apply(start("⊢ ∀x(P(x) → P(x))"), [], "∀I", "[v] … P(v) → P(v)");
  editor = apply(editor, [], "→I");
  assert.equal(editor.proof.lines[0].label, "v");
  assert.equal(editor.proof.lines[1].fresh ?? null, null);
  editor = apply(editor, lines(1), "R");
  assert.equal(textOf(editor), [
    "  |  [v]",
    "1 |     P(v)          hipótese",
    "2 |     P(v)          R, 1",
    "3 |   P(v) → P(v)     →I, 1–2",
    "4 | ∀x(P(x) → P(x))   ∀I, 1–3",
  ].join("\n"));
  assertDone(editor);
});

test("1.ª ordem: o ∃E sugere a variável nova, que se pode mudar, e recusa uma que não é nova", () => {
  let editor = start("∃x P(x), ∀x(P(x) → Q(x)) ⊢ ∃x Q(x)");
  const witness = ruleOf(editor, lines(1), "∃E");
  assert.deepEqual(asked(witness), [["[v] P(v) … ∃x Q(x)", "variable", "v"]]);
  const [outcome] = witness.outcomes;
  assert.deepEqual(reviseOutcome(editor, outcome, "x").reason, { key: "guided.reasons.notFresh", params: { variable: "x" } });
  assert.equal(reviseOutcome(editor, outcome, "P(").reason.key, "guided.reasons.badVariable");
  assert.equal(reviseOutcome(editor, outcome, "forall").reason.key, "guided.reasons.badVariable");
  const revised = reviseOutcome(editor, outcome, " w2 ");
  assert.equal(revised.ok, true);
  assert.equal(outcomeLabel(revised.outcome), "[w₂] P(w₂) … ∃x Q(x)");
  editor = applyOutcome(editor, revised.outcome);
  assert.equal(editor.drafts[2].formula, "[w2] P(w₂)");

  const exists = ruleOf(editor, [], "∃I");
  assert.deepEqual(asked(exists), [["Q(w₂)", "term", "w₂"]]);
  editor = applyOutcome(editor, exists.outcomes[0]);
  editor = apply(editor, lines(2), "∀E", "P(w₂) → Q(w₂)");
  editor = apply(editor, [], "→E");
  assert.equal(finished(editor).ok, true);
});

test("1.ª ordem: o termo escrito à mão muda o passo, e um termo que seria capturado é recusado", () => {
  const editor = start("∀x∃y R(x, y), Q(f(c)) ⊢ q");
  const instance = ruleOf(editor, lines(1), "∀E");
  assert.deepEqual(asked(instance), [
    ["∃y R(f(c), y)", "term", "f(c)"], ["∃y R(c, y)", "term", "c"],
  ]);
  const typed = reviseOutcome(editor, instance.outcomes[0], "g(a, b)");
  assert.equal(outcomeLabel(typed.outcome), "∃y R(g(a, b), y)");
  assert.equal(format(typed.outcome.ask.value), "g(a, b)");
  assert.deepEqual(reviseOutcome(editor, instance.outcomes[0], "y").reason, {
    key: "guided.reasons.notSubstitutable", params: { term: "y" },
  });
  assert.equal(reviseOutcome(editor, instance.outcomes[0], "g(a").reason.key, "guided.reasons.badTerm");
  assert.equal(reviseOutcome(editor, instance.outcomes[0], "P(a) ∧ q").reason.key, "guided.reasons.badTerm");
  const next = applyOutcome(editor, typed.outcome);
  assert.equal(format(next.proof.lines[2].formula), "∃y R(g(a, b), y)");
  assert.deepEqual(finished(next).lineErrors.filter(({ line }) => line === 3), []);
});

test("1.ª ordem: o ∃I e o =E para a frente escolhem entre as conclusões possíveis", () => {
  const editor = start("a = b, R(a, a) ⊢ q");
  assert.deepEqual(ruleOf(editor, lines(2), "∃I").outcomes.map(outcomeLabel), ["∃x R(x, x)", "∃x R(x, a)", "∃x R(a, x)"]);
  assert.deepEqual(ruleOf(editor, lines(1, 2), "=E").outcomes.map(outcomeLabel), ["R(b, b)", "R(b, a)", "R(a, b)"]);
  assert.equal(ruleOf(editor, lines(2), "∃I").outcomes.some(({ ask }) => ask), false);
  assert.deepEqual(asked(ruleOf(start("⊢ q"), [], "=I")), [["a = a", "term", "a"]]);
});

test("1.ª ordem: a partir do objetivo, o =E e o ∃I citam o que já existe ou deixam o que falta", () => {
  const editor = apply(start("a = b, R(a, a) ⊢ R(b, a)"), lines(1), "=E");
  assertDone(editor);
  const witness = ruleOf(start("P(a, a) ⊢ ∃x P(x, a)"), [], "∃I");
  assert.deepEqual(asked(witness), [["P(a, a)", "term", "a"]]);
  assert.deepEqual(witness.outcomes[0].citations, lines(1));
  assert.deepEqual(asked(ruleOf(start("∀x P(x) ⊢ ∃x P(x)"), [], "∃I")), [["P(a)", "term", "a"]]);
});

test("1.ª ordem: duas caixas do ∀I não abrem na mesma linha", () => {
  const editor = apply(start("∀x∀y R(x, y) ⊢ ∀y∀x R(x, y)"), [], "∀I");
  const inner = ruleOf(editor, [], "∀I");
  assert.deepEqual(inner.outcomes, []);
  assert.deepEqual(inner.reason, { key: "guided.reasons.boxClash", params: { variable: "v" } });
  // Com outra linha no início da caixa de fora, a de dentro já abre.
  const repeated = apply(editor, lines(1), "R", "∀x∀y R(x, y)");
  const nested = ruleOf(repeated, [], "∀I");
  assert.equal(nested.outcomes.length, 1);
  let done = applyOutcome(repeated, nested.outcomes[0]);
  done = apply(done, lines(2), "∀E", "∀y R(u, y)");
  done = apply(done, [], "∀E");
  assertDone(done);
});

test("1.ª ordem: em cada passo gerado, a linha da regra passa no verificador", () => {
  const sequents = [
    "∀x(P(x) → Q(x)), ∀x P(x) ⊢ ∀x Q(x)", "∃x P(x), ∀x(P(x) → Q(x)) ⊢ ∃x Q(x)", "a = b, R(a, a) ⊢ R(b, b)",
    "∀x∃y R(x, y) ⊢ ∃y R(c, y)", "P(a, f(a)) ⊢ ∃x∃y P(x, y)", "∃x∀y R(x, y) ⊢ ∀y∃x R(x, y)",
  ];
  for (const text of sequents) {
    const editor = start(text);
    const selections = [[], ...editor.goal.premises.map((_, index) => [citeLine(index + 1)])];
    for (const selection of selections) {
      for (const { id, outcomes } of guidedRules(editor, selection, options)) {
        for (const outcome of outcomes) {
          const next = applyOutcome(editor, outcome);
          const wrong = finished(next).lineErrors.filter(({ code }) => !["missingRule", "emptyFormula"].includes(code));
          // Sem templates com interpolação: o recolhedor do corpus (tests/helpers/corpus.js) perde-se neles.
          assert.deepEqual(wrong, [], text + " com " + id + ": " + outcomeLabel(outcome));
        }
      }
    }
  }
});

test("1.ª ordem: o campo do pedido traz a sugestão, e as mensagens novas existem nos dois idiomas", async () => {
  const { askHtml } = await import("../js/ui/proof-editor.js");
  const { LOCALES } = await import("../js/ui/i18n.js");
  const editor = start("⊢ ∀x P(x)");
  const choice = { id: "∀I", outcomes: ruleOf(editor, [], "∀I").outcomes };
  const html = askHtml(choice, "lab");
  assert.match(html, /id="lab-ask"/);
  assert.match(html, /value="v"/);
  assert.match(askHtml({ ...choice, typed: "w<" }), /value="w&lt;"/);
  assert.equal(askHtml({ id: "∧I", outcomes: ruleOf(start("p, q ⊢ p ∧ q"), [], "∧I").outcomes }), "");
  for (const lang of ["pt", "en"]) {
    const { guided, rulePick } = LOCALES[lang];
    for (const key of ["boxClash", "badTerm", "badVariable", "notFresh", "notSubstitutable"]) {
      assert.ok(guided.reasons[key], lang + ": " + key);
    }
    for (const key of ["term", "variable", "apply"]) assert.ok(guided.ask[key], lang + ": ask." + key);
    assert.ok(rulePick.other);
  }
});
