// O modo guiado, sobre o estado puro. No Chrome, com toques a 390px: scripts/check-guided.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createEditor, editorStatus, moveCursor, setText, undo } from "../js/core/editor.js";
import { format } from "../js/core/formula.js";
import {
  applyOutcome, focusObjective, guidedAnchor, guidedLines, guidedRules, outcomeLabel, toggleSelection,
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
