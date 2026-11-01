// Escolher a regra de uma linha no modo de escrita, sobre o estado puro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createEditor, openProof } from "../js/core/editor.js";
import { format } from "../js/core/formula.js";
import { citeLine, citeRange } from "../js/core/proof.js";
import { parseProof } from "../js/core/proof-text.js";
import { applyPick, pickState, pickableRules } from "../js/core/rule-pick.js";
import { ruleSet } from "../js/core/rules.js";
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
