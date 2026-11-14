// Escolher a regra de uma linha no modo de escrita, sobre o estado puro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createEditor, openProof } from "../js/core/editor.js";
import { format } from "../js/core/formula.js";
import { guidedRules } from "../js/core/guided.js";
import { citeLine, citeRange } from "../js/core/proof.js";
import { parseProof } from "../js/core/proof-text.js";
import { applyPick, pickState, pickableRules } from "../js/core/rule-pick.js";
import { defineRule, ruleSet } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { verifyProof } from "../js/core/verify.js";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const rules = ruleSet("completo");
const options = { rules };

function opened(sequent, lines) {
  const goal = parseSequent(sequent).sequent;
  const read = parseProof(lines.join("\n"));
  assert.equal(read.ok, true);
  return openProof(goal, read.proof);
}

const CONJUNCTION = ["1 | a   premissa", "2 | b   premissa", "3 | ?"];

test("a lista traz cada regra uma vez, mesmo com várias formas", () => {
  const ids = pickableRules(rules);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("DM") && ids.includes("∧I"));
});

test("∧I pede as duas linhas, uma de cada vez, e escreve a fórmula da linha vazia", () => {
  let editor = opened("a, b ⊢ a ∧ b", CONJUNCTION);
  const first = pickState(editor, 3, "∧I", [], options);
  assert.equal(first.status, "select");
  assert.deepEqual([first.step, first.total, first.premise.text], [1, 2, "φ"]);
  assert.deepEqual(first.candidates, [citeLine(1), citeLine(2)]);

  const second = pickState(editor, 3, "∧I", [citeLine(1)], options);
  assert.equal(second.step, 2);
  assert.deepEqual(second.candidates, [citeLine(2)]);

  const done = pickState(editor, 3, "∧I", [citeLine(1), citeLine(2)], options);
  assert.equal(done.status, "done");
  assert.deepEqual(done.results.map(format), ["a ∧ b"]);

  editor = applyPick(editor, 3, { id: "∧I", citations: done.citations, formula: done.results[0] });
  assert.equal(editor.drafts[2].justification, "∧I, 1, 2");
  assert.equal(verifyProof(editor.proof, editor.goal, rules).ok, true);
});

test("a fórmula já escrita restringe as linhas que a regra aceita", () => {
  const editor = opened("a ∧ b → c, a, b ⊢ c", [
    "1 | a ∧ b → c   premissa", "2 | a   premissa", "3 | b   premissa", "4 | a ∧ b   ∧I, 2, 3", "5 | c",
  ]);
  const state = pickState(editor, 5, "→E", [], options);
  assert.deepEqual(state.candidates, [citeLine(1), citeLine(4)]);
  const refused = pickState(editor, 5, "∧I", [], options);
  assert.equal(refused.status, "refused");
  assert.equal(refused.conclusions, "φ ∧ ψ");
});

test("∧E com a linha vazia deixa escolher o lado", () => {
  const editor = opened("a ∧ b ⊢ b", ["1 | a ∧ b   premissa", "2 | ?"]);
  const done = pickState(editor, 2, "∧E", [citeLine(1)], options);
  assert.deepEqual(done.results.map(format), ["a", "b"]);
});

test("→I pede a subdedução e cita o intervalo", () => {
  const editor = opened("⊢ a → a", ["1 |   a   hipótese", "2 | a → a"]);
  const state = pickState(editor, 2, "→I", [], options);
  assert.equal(state.premise.kind, "range");
  assert.equal(state.premise.text, "[a] … a");
  assert.deepEqual(state.candidates, [citeRange(1, 1)]);
});

test("sem nada que sirva, o pedido fica sem candidatas", () => {
  const editor = createEditor(parseSequent("⊢ a → a").sequent);
  assert.deepEqual(pickState(editor, 1, "→E", [], options).candidates, []);
});

test("∨I com a linha vazia cita, mas é o utilizador que escreve a fórmula", () => {
  let editor = opened("a ⊢ a ∨ b", ["1 | a   premissa", "2 | ?"]);
  const done = pickState(editor, 2, "∨I", [citeLine(1)], options);
  assert.deepEqual(done.results, [null]);
  editor = applyPick(editor, 2, { id: "∨I", citations: done.citations, formula: null });
  assert.equal(editor.drafts[1].justification, "∨I, 1");
  assert.deepEqual(editor.cursor, { line: 2, field: "formula" });
});

test("uma regra sem premissas fica logo pronta", () => {
  const editor = opened("⊢ a ∨ ¬a", ["1 | a ∨ ¬a"]);
  const done = pickState(editor, 1, "TE", [], options);
  assert.equal(done.status, "done");
  assert.deepEqual(done.results.map(format), ["a ∨ ¬a"]);
});

test("no Chrome: escolher a regra e as linhas com toques", { skip: !existsSync(CHROME) }, () => {
  const run = spawnSync("node", ["scripts/check-rule-pick.mjs"], { encoding: "utf8", timeout: 120000 });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});

test("uma regra própria que nunca se completa não bloqueia a página numa prova longa", () => {
  const premises = Array.from({ length: 150 }, (_, index) => `a${index}`).join(", ");
  const editor = createEditor(parseSequent(`${premises} ⊢ z`).sequent);
  const line = editor.proof.lines.length;
  const stuck = defineRule("X", ["φ", "ψ", "θ", "¬¬¬¬¬φ"], "θ");
  const active = { rules: [stuck], known: [stuck] };

  const started = performance.now();
  const state = pickState(editor, line, "X", [], active);
  guidedRules(editor, [], active);

  assert.equal(state.status, "select");
  assert.ok(performance.now() - started < 10000);
});

// --- 1.ª ordem -------------------------------------------------------------------------------------

const formulas = (results) => results.map((formula) => (formula ? format(formula) : null));

test("1.ª ordem: o ∀E numa linha vazia escolhe o termo entre os da prova, ou deixa escrever outro", () => {
  const editor = opened("∀x P(x), Q(f(c)) ⊢ q", ["1 | ∀x P(x)   premissa", "2 | Q(f(c))   premissa", "3 | ?"]);
  const first = pickState(editor, 3, "∀E", [], options);
  assert.equal(first.status, "select");
  assert.equal(first.premise.text, "∀x φ");
  assert.deepEqual(first.candidates, [citeLine(1)]);
  const done = pickState(editor, 3, "∀E", [citeLine(1)], options);
  assert.equal(done.status, "done");
  assert.deepEqual(formulas(done.results), ["P(f(c))", "P(c)", null]);
  const next = applyPick(editor, 3, { id: "∀E", citations: done.citations, formula: done.results[1] });
  assert.equal(format(next.proof.lines[2].formula), "P(c)");
  assert.equal(verifyProof(next.proof, next.goal, rules).lineErrors.some(({ line }) => line === 3), false);
  // O null: só a justificação, e o cursor fica na fórmula para escrever outro termo.
  const typed = applyPick(editor, 3, { id: "∀E", citations: done.citations, formula: null });
  assert.equal(typed.drafts[2].justification, "∀E, 1");
  assert.equal(typed.cursor.field, "formula");
});

test("1.ª ordem: com a fórmula escrita, o ∀E e o ∃I dão só ela", () => {
  const editor = opened("∀x P(x) ⊢ ∃x P(x)", ["1 | ∀x P(x)   premissa", "2 | P(a)", "3 | ∃x P(x)"]);
  assert.deepEqual(formulas(pickState(editor, 2, "∀E", [citeLine(1)], options).results), ["P(a)"]);
  assert.deepEqual(formulas(pickState(editor, 3, "∃I", [citeLine(2)], options).results), ["∃x P(x)"]);
});

test("1.ª ordem: o ∃I e o =E numa linha vazia escolhem entre as conclusões possíveis", () => {
  const editor = opened("a = b, R(a, a) ⊢ q", ["1 | a = b     premissa", "2 | R(a, a)   premissa", "3 | ?"]);
  const exists = pickState(editor, 3, "∃I", [citeLine(2)], options);
  assert.deepEqual(formulas(exists.results), ["∃x R(x, x)", "∃x R(x, a)", "∃x R(a, x)"]);
  const rewrite = pickState(editor, 3, "=E", [citeLine(1), citeLine(2)], options);
  assert.deepEqual(formulas(rewrite.results), ["R(b, b)", "R(b, a)", "R(a, b)"]);
  const half = pickState(editor, 3, "=E", [citeLine(1)], options);
  assert.equal(half.status, "select");
  assert.equal(half.premise.text, "φ[a/x]");
  assert.deepEqual(formulas(pickState(editor, 3, "=I", [], options).results), ["a = a", "b = b", null]);
});

test("1.ª ordem: o ∀I cita a caixa [v] e generaliza todas as ocorrências de v", () => {
  const editor = opened("∀x R(x, x) ⊢ ∀y R(y, y)", [
    "1 | ∀x R(x, x)   premissa", "2 |  [v] R(v, v)   ∀E, 1", "3 | ?",
  ]);
  const first = pickState(editor, 3, "∀I", [], options);
  assert.equal(first.premise.text, "[v] … φ[v/x]");
  assert.deepEqual(first.candidates, [citeRange(2, 2)]);
  const done = pickState(editor, 3, "∀I", [citeRange(2, 2)], options);
  assert.deepEqual(formulas(done.results), ["∀x R(x, x)"]);
});
