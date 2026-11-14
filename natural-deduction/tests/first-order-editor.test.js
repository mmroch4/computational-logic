// O editor e a vista de Fitch com caixas de variável (∀I, ∃E). No Chrome: scripts/check-editor.mjs e
// scripts/check-fitch.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEditor, editorStatus, formulaText, loadProof, pressKey, readFormulaField, setText, tidyField,
} from "../js/core/editor.js";
import { parseProof } from "../js/core/proof-text.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { setLang } from "../js/ui/i18n.js";
import { barsHtml, fitchHtml, labelRowHtml } from "../js/ui/fitch-view.js";
import { boxesHintHtml, guidedLineHtml } from "../js/ui/proof-editor.js";
import { FIRST_ORDER_KEYS, SYMBOL_KEYS } from "../js/ui/sequent-input.js";
import { SCHEMA_KEYS } from "../js/ui/user-rules-panel.js";
import en from "../js/ui/locales/en.js";
import pt from "../js/ui/locales/pt.js";

const rules = { rules: ruleSet("completo"), known: RULES };
const goalOf = (text) => parseSequent(text).sequent;
const type = (editor, text) => setText(editor, editor.cursor.line, editor.cursor.field, text);
const press = (editor, key) => pressKey(editor, key).editor;
const play = (editor, steps) => steps.reduce(
  (state, step) => (typeof step === "string" ? type(state, step) : press(state, step)),
  editor,
);
const ENTER = { key: "Enter" };
const CLOSE = { key: "Enter", shift: true };
const OPEN = { key: "Enter", ctrl: true };
const shape = ({ proof }) => proof.lines.map(({ kind, depth, fresh = null, label = null }) => [kind, depth, fresh, label]);
const read = (text) => {
  const result = parseProof(text);
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.proof;
};

const FORALL_GOAL = "∀x(P(x) → Q(x)), ∀x P(x) ⊢ ∀x Q(x)";
const FORALL_STEPS = [
  "[v] P(v) → Q(v)", ENTER, "∀E, 1", ENTER, "P(v)", ENTER, "∀E, 2", ENTER, "Q(v)", ENTER, "→E, 3, 4", CLOSE,
  "∀x Q(x)", ENTER, "∀I, 3–5",
];

test("readFormulaField separa a marca [v] da fórmula", () => {
  assert.deepEqual(readFormulaField("[v] P(v)").fresh, "v");
  assert.equal(readFormulaField("[v] P(v)").error, null);
  assert.deepEqual(readFormulaField("  [u1]").fresh, "u1");
  assert.equal(readFormulaField("[u1]").formula, null);
  assert.equal(readFormulaField("P(v)").fresh, null);
  assert.equal(readFormulaField("[F] P(v)").error.key, "editor.errors.badFresh");
  const broken = readFormulaField("[v] P(");
  assert.equal(broken.fresh, "v");
  assert.ok(broken.error.start >= 4, "a posição do erro conta com a marca");
});

test("o ∀I faz-se só com o teclado: [v] num passo abre a caixa um nível mais dentro", () => {
  const editor = play(createEditor(goalOf(FORALL_GOAL)), FORALL_STEPS);
  assert.deepEqual(shape(editor), [
    ["premise", 0, null, null], ["premise", 0, null, null],
    ["step", 1, "v", null], ["step", 1, null, null], ["step", 1, null, null], ["step", 0, null, null],
  ]);
  assert.equal(editorStatus(editor, rules).complete, true);
  assert.equal(editor.drafts[2].formula, "[v] P(v) → Q(v)");
});

test("Ctrl+Enter numa linha só com [v] abre a linha de etiqueta com a hipótese por dentro", () => {
  const steps = ["[v]", OPEN, "P(v)", CLOSE, "P(v) → P(v)", ENTER, "→I, 1–1", CLOSE, "∀x(P(x) → P(x))", ENTER, "∀I, 1–2"];
  const editor = play(createEditor(goalOf("⊢ ∀x(P(x) → P(x))")), steps);
  assert.deepEqual(shape(editor), [["hypothesis", 2, null, "v"], ["step", 1, null, null], ["step", 0, null, null]]);
  assert.equal(editorStatus(editor, rules).complete, true);
});

test("o ∃E: [u] na hipótese marca a caixa sem mudar a profundidade", () => {
  const steps = [OPEN, "[u] P(u)", ENTER, "∃y P(y)", ENTER, "∃I, 2", CLOSE, "∃y P(y)", ENTER, "∃E, 1, 2–3"];
  const editor = play(createEditor(goalOf("∃x P(x) ⊢ ∃y P(y)")), steps);
  assert.deepEqual(shape(editor)[1], ["hypothesis", 1, "u", null]);
  assert.equal(editorStatus(editor, rules).complete, true);
});

test("apagar o [v] desfaz uma caixa de uma linha; numa caixa com mais linhas fica, com aviso", () => {
  const goal = goalOf(FORALL_GOAL);
  const single = play(createEditor(goal), ["[v] P(a)"]);
  assert.deepEqual(shape(single)[2], ["step", 1, "v", null]);
  const undone = type(single, "P(a)");
  assert.deepEqual(shape(undone)[2], ["step", 0, null, null]);

  const full = play(createEditor(goal), FORALL_STEPS);
  const kept = setText(full, 3, "formula", "P(v) → Q(v)");
  assert.deepEqual(shape(kept), shape(full));
  assert.equal(kept.drafts[2].formulaError.key, "editor.errors.freshBoxNotEmpty");
  assert.equal(editorStatus(kept, rules).rows[2].message.key, "editor.errors.freshBoxNotEmpty");
  assert.equal(setText(kept, 3, "formula", "[w] P(w) → Q(w)").proof.lines[2].fresh, "w");
});

test("a meio de escrever a marca, a caixa não muda", () => {
  const editor = play(createEditor(goalOf(FORALL_GOAL)), ["[v] P(v)"]);
  for (const partial of ["[v P(v)", "[ P(v)", "[1] P(v)"]) {
    assert.deepEqual(shape(type(editor, partial))[2], ["step", 1, "v", null], partial);
  }
});

test("o campo da fórmula mostra a marca ao carregar e ao arrumar", () => {
  const proof = read([
    "1 | ∀x P(x)       premissa",
    "2 |  [v] P(v)     ∀E, 1",
    "3 | ∀y P(y)       ∀I, 2–2",
  ].join("\n"));
  const loaded = loadProof(createEditor(goalOf("∀x P(x) ⊢ ∀y P(y)")), proof);
  assert.deepEqual(loaded.drafts.map(({ formula }) => formula), ["∀x P(x)", "[v] P(v)", "∀y P(y)"]);
  const messy = setText(loaded, 2, "formula", "[v]   P( v )");
  assert.equal(tidyField(messy, 2, "formula").drafts[1].formula, "[v] P(v)");
  assert.equal(formulaText(proof.lines[1]), "[v] P(v)");
});

test("na vista de Fitch, a marca vem antes da fórmula e a linha de etiqueta não tem número", () => {
  setLang("pt");
  const proof = read([
    "  |  [v]",
    "1 |     P(v)            hipótese",
    "2 |   P(v) → P(v)       →I, 1–1",
    "3 | ∀x(P(x) → P(x))     ∀I, 1–2",
  ].join("\n"));
  const html = fitchHtml(proof);
  assert.equal((html.match(/data-line=/g) ?? []).length, 3);
  assert.match(html, /<li class="fitch__line fitch__line--label">/);
  assert.match(html, /aria-label="Linha de etiqueta: caixa da variável v, sem número\."/);
  assert.equal(labelRowHtml(proof.lines[1]), "");

  const opener = read("1 | ∀x P(x)   premissa\n2 |  [u1] P(u1)   ∀E, 1").lines[1];
  assert.match(barsHtml(opener), /fitch__bar--open/);
  const row = fitchHtml(read("1 | ∀x P(x)   premissa\n2 |  [u1] P(u1)   ∀E, 1"));
  assert.match(row, /\[u<sub>1<\/sub>\]/);
  assert.match(row, /aria-label="Caixa da variável u1\."/);
  const second = row.slice(row.indexOf('data-line="2"'));
  assert.ok(second.indexOf("fitch__fresh") < second.indexOf("fitch__formula"));
});

test("no modo guiado, a linha de etiqueta e a marca também aparecem", () => {
  setLang("en");
  const proof = read("1 | ∀x P(x)   premise\n2 |  [v] P(v)   ∀E, 1");
  const html = guidedLineHtml(proof.lines[1], 1, {
    row: { role: "locked" }, status: { state: "ok", message: null }, assumption: false, target: null,
  });
  assert.match(html, /aria-label="Box for variable v\."/);
  setLang("pt");
});

test("a dica das caixas só aparece num sequente de 1.ª ordem", () => {
  assert.equal(boxesHintHtml(goalOf("p ⊢ p")), "");
  assert.match(boxesHintHtml(goalOf(FORALL_GOAL)), /\[v\]/);
});

test("as teclas de ∀, ∃ e = escrevem um sequente que se lê; as regras do utilizador não as têm", () => {
  const key = Object.fromEntries(SYMBOL_KEYS.map(({ name, insert }) => [name, insert]));
  const typed = [key.forall, "x", key.open, "P(x)", key.implies, key.exists, "y", " y", key.eq, "x", key.close, key.turnstile, "a", key.eq, "a"].join("");
  assert.equal(typed, "∀x(P(x) → ∃y y = x) ⊢ a = a");
  assert.ok(parseSequent(typed).ok);
  const schemaNames = SCHEMA_KEYS.map(({ name }) => name);
  for (const name of FIRST_ORDER_KEYS) {
    assert.ok(name in key, name);
    assert.ok(!schemaNames.includes(name), name);
  }
});

test("as strings novas existem nos dois idiomas", () => {
  for (const locale of [pt, en]) {
    for (const name of FIRST_ORDER_KEYS) assert.ok(locale.sequentInput.symbols[name], name);
    assert.ok(locale.editor.boxes);
    assert.ok(locale.editor.errors.badFresh.includes("{name}"));
    assert.ok(locale.editor.errors.freshBoxNotEmpty.includes("{name}"));
    assert.ok(locale.fitch.fresh.includes("{variable}"));
    assert.ok(locale.fitch.labelLine.includes("{variable}"));
  }
});
