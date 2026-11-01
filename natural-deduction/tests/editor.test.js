// O modo de escrita, sobre o estado puro. No Chrome, com teclas a sério: scripts/check-editor.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  UNDO_LIMIT, addLine, canRedo, canUndo, closeSubproofAtCursor, createEditor, editorStatus, keyAction, moveCursor,
  openSubproofAtCursor, pressKey, redo, removeLine, restartEditor, setText, tidyAll, tidyField, undo,
} from "../js/core/editor.js";
import { formatProof, parseJustification } from "../js/core/proof-text.js";
import { editLine, createProof } from "../js/core/proof.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { verifyProof } from "../js/core/verify.js";
import { atom } from "../js/core/formula.js";
import en from "../js/ui/locales/en.js";
import pt from "../js/ui/locales/pt.js";
import { KEYBOARD_GOAL, KEYBOARD_LINES, KEYBOARD_STEPS } from "./fixtures/keyboard-proof.js";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const rules = { rules: ruleSet("completo"), known: RULES };

const goalOf = (text) => parseSequent(text).sequent;
const start = (text) => createEditor(goalOf(text));

/** Escreve no campo do cursor, como o browser faz a cada `input`. */
const type = (editor, text) => setText(editor, editor.cursor.line, editor.cursor.field, text);
const press = (editor, key) => pressKey(editor, key).editor;
const play = (editor, steps) => steps.reduce(
  (state, step) => (typeof step === "string" ? type(state, step) : press(state, step)),
  editor,
);
const status = (editor) => editorStatus(editor, rules);
const text = ({ proof }) => formatProof(proof);
const fields = ({ drafts }) => drafts.map(({ formula, justification }) => [formula, justification]);

test("uma prova com subdeduções encaixadas e seguidas faz-se só com o teclado", () => {
  const goal = goalOf(KEYBOARD_GOAL);
  const editor = play(createEditor(goal), KEYBOARD_STEPS);
  assert.equal(editor.proof.lines.length, KEYBOARD_LINES);
  assert.deepEqual(editor.proof.lines.map(({ depth }) => depth), [0, 1, 2, 3, 3, 3, 3, 2, 1, 0]);
  assert.ok(verifyProof(editor.proof, goal, ruleSet("completo"), RULES).ok);
  const { complete, rows } = status(editor);
  assert.ok(complete);
  assert.ok(rows.every(({ state, message }) => state === "ok" && message === null));
});

test("a prova começa com as premissas e o cursor na primeira linha livre", () => {
  const editor = start("p, q ⊢ p ∧ q");
  assert.deepEqual(editor.proof.lines.map(({ kind }) => kind), ["premise", "premise", "step"]);
  assert.deepEqual(editor.cursor, { line: 3, field: "formula" });
  assert.deepEqual(fields(editor)[0], ["p", ""]);
  assert.deepEqual(start("⊢ p ∨ ¬p").cursor, { line: 1, field: "formula" });
});

test("as premissas não se editam, nem com o cursor nem com as setas", () => {
  const editor = start("p ⊢ p");
  assert.equal(setText(editor, 1, "formula", "q"), editor);
  assert.equal(moveCursor(editor, 1), editor);
  assert.deepEqual(press(editor, { key: "ArrowUp" }).cursor, editor.cursor);
});

test("verificação imediata: cada tecla escrita muda o estado da linha", () => {
  let editor = start("p ⊢ p ∧ p");
  assert.deepEqual(status(editor).rows[1], { state: "pending", message: null });
  editor = type(editor, "p ∧");
  assert.deepEqual(status(editor).rows[1].state, "error");
  assert.equal(status(editor).rows[1].message.key, "parser.errors.missingOperand");
  editor = type(editor, "p ∧ p");
  assert.deepEqual(status(editor).rows[1], { state: "pending", message: null });
  editor = press(editor, { key: "Enter" });
  assert.deepEqual(editor.cursor, { line: 2, field: "justification" });
  editor = type(editor, "∧I, 1");
  assert.equal(status(editor).rows[1].message.key, "verify.errors.missingCitation");
  assert.equal(status(editor).complete, false);
  editor = type(editor, "∧I, 1, 1");
  assert.deepEqual(status(editor).rows[1], { state: "ok", message: null });
  assert.ok(status(editor).complete);
});

test("uma regra fora do conjunto dá erro claro no modo de escrita", () => {
  const editor = play(start("¬¬p ⊢ p"), ["p", { key: "Enter" }, "RA, 1"]);
  const { rows } = editorStatus(editor, { rules: ruleSet("base"), known: RULES });
  assert.equal(rows[1].message.key, "verify.errors.ruleNotAllowed");
  assert.equal(rows[1].state, "error");
});

test("sem erros nas linhas, diz o que falta para concluir", () => {
  const editor = play(start("p ⊢ p ∧ p"), ["p", { key: "Enter" }, "R, 1"]);
  assert.equal(status(editor).conclusion.key, "verify.conclusion.wrongConclusion");
});

test("erro de escrita na justificação, sem deitar fora o texto", () => {
  let editor = play(start("p ⊢ p"), ["p", { key: "Enter" }, "R, x"]);
  assert.equal(status(editor).rows[1].message.key, "proofText.errors.badCitation");
  assert.equal(editor.drafts[1].justification, "R, x");
  assert.equal(editor.proof.lines[1].rule, null);
  editor = type(editor, "1, 2");
  assert.equal(status(editor).rows[1].message.key, "proofText.errors.missingRuleName");
});

test("parseJustification aceita vírgulas ou espaços, ASCII e intervalos com espaços", () => {
  const cited = (written) => parseJustification(written, 1);
  assert.deepEqual(cited("  "), { ok: true, rule: null, citations: [] });
  const expected = [{ kind: "line", line: 1 }, { kind: "range", from: 2, to: 4 }];
  for (const written of ["->I, 1, 2-4", "->I 1 2–4", "->I,1,2 - 4", "=>I 1, 2—4,"]) {
    const result = cited(written);
    assert.equal(result.rule, "→I", written);
    assert.deepEqual(result.citations, expected, written);
  }
  assert.equal(cited("RAA, 1").rule, "RA");
  assert.equal(cited("~~I, 1").rule, "¬¬I");
  assert.equal(cited("R, 4-2").error.code, "badCitation");
  assert.equal(cited(", 2").error.code, "missingRuleName");
});

test("Enter avança: da fórmula à justificação, e daí a uma linha nova ao mesmo nível", () => {
  let editor = play(start("⊢ p → p"), [{ key: "Enter", ctrl: true }]);
  assert.equal(editor.proof.lines[0].kind, "hypothesis");
  editor = play(editor, ["p", { key: "Enter" }]);
  assert.deepEqual(editor.cursor, { line: 2, field: "formula" });
  assert.equal(editor.proof.lines[1].depth, 1);
  editor = press(editor, { key: "Enter" });
  assert.deepEqual(editor.cursor, { line: 2, field: "justification" });
  editor = press(editor, { key: "Enter" });
  assert.deepEqual(editor.cursor, { line: 3, field: "formula" });
  assert.equal(editor.proof.lines[2].depth, 1);
});

test("abrir numa linha escrita põe a hipótese por baixo, um nível acima", () => {
  const editor = openSubproofAtCursor(type(start("⊢ p"), "p"));
  assert.deepEqual(editor.proof.lines.map(({ kind, depth }) => [kind, depth]), [["step", 0], ["hypothesis", 1]]);
  assert.deepEqual(editor.cursor, { line: 2, field: "formula" });
});

test("fechar numa linha vazia tira-a da subdedução, em vez de deixar outra por preencher", () => {
  let editor = play(start("⊢ p"), [{ key: "Enter", ctrl: true }, "p", { key: "Enter" }]);
  assert.equal(editor.proof.lines.length, 2);
  editor = closeSubproofAtCursor(editor);
  assert.deepEqual(editor.proof.lines.map(({ depth }) => depth), [1, 0]);
  assert.equal(editor.cursor.line, 2);
});

test("fechar a meio deixa as linhas seguintes fora, e numa subdedução fechada abre linha depois dela", () => {
  let editor = play(start("⊢ p"), [{ key: "Enter", ctrl: true }, "p", { key: "Enter" }, "p", { key: "Enter" }, "R, 1"]);
  editor = addLine(editor);
  editor = type(editor, "q");
  editor = closeSubproofAtCursor(moveCursor(editor, 2));
  assert.deepEqual(editor.proof.lines.map(({ depth }) => depth), [1, 1, 0]);
  assert.deepEqual(fields(editor)[2], ["q", ""]);
  assert.equal(editor.cursor.line, 3);

  editor = closeSubproofAtCursor(moveCursor(editor, 2));
  assert.deepEqual(editor.proof.lines.map(({ depth }) => depth), [1, 1, 0, 0]);
  assert.deepEqual(fields(editor)[2], ["", ""]);
  assert.deepEqual(fields(editor)[3], ["q", ""]);
});

test("fechar fora de uma subdedução não muda a prova e deixa um aviso, que sai na tecla seguinte", () => {
  const editor = start("p ⊢ p");
  const refused = closeSubproofAtCursor(editor);
  assert.equal(refused.proof, editor.proof);
  assert.deepEqual(refused.notice, { key: "proof.errors.notInSubproof", params: { line: 2 } });
  assert.equal(canUndo(refused), false);
  assert.equal(type(refused, "p").notice, null);
});

test("inserir ou apagar uma linha renumera as citações escritas, mesmo com a regra como foi escrita", () => {
  let editor = play(start("p, q ⊢ p ∧ q"), ["p ∧ q", { key: "Enter" }, "∧I, 1, 2"]);
  editor = play(moveCursor(editor, 3, "justification"), [{ key: "Enter" }, "p", { key: "Enter" }, "∧E, 3"]);
  assert.equal(editor.drafts[3].justification, "∧E, 3");

  // Uma linha nova antes da 3 empurra-a para 4.
  editor = moveCursor(editor, 3);
  editor = { ...editor, cursor: { line: 2, field: "formula" } };
  editor = addLine(editor);
  assert.equal(editor.proof.lines.length, 5);
  assert.equal(editor.drafts[4].justification, "∧E, 4");
  assert.deepEqual(editor.proof.lines[4].citations, [{ kind: "line", line: 4 }]);

  // Apagar a linha citada não troca a citação por outra: fica em falta.
  editor = removeLine(moveCursor(editor, 4));
  assert.equal(editor.drafts[3].justification, "∧E");
  assert.equal(status(editor).rows[3].message.key, "verify.errors.missingCitation");
});

test("uma justificação com erro de escrita não se renumera, porque não foi lida", () => {
  let editor = play(start("p ⊢ p"), ["p", { key: "Enter" }, "R, x"]);
  editor = addLine(moveCursor(editor, 2));
  assert.equal(editor.drafts[1].justification, "R, x");
});

test("Backspace num campo vazio recua, e numa linha escrita é do campo de texto", () => {
  let editor = play(start("p ⊢ p"), ["p", { key: "Enter" }]);
  assert.equal(editor.cursor.field, "justification");
  editor = press(editor, { key: "Backspace" });
  assert.equal(editor.cursor.field, "formula");
  assert.equal(pressKey(editor, { key: "Backspace" }).handled, false);

  editor = addLine(editor);
  assert.equal(editor.proof.lines.length, 3);
  editor = press(editor, { key: "Backspace" });
  assert.equal(editor.proof.lines.length, 2);
  assert.deepEqual(editor.cursor, { line: 2, field: "formula" });
});

test("Backspace não apaga a única linha nem uma subdedução com conteúdo", () => {
  const editor = start("p ⊢ p");
  assert.equal(pressKey(editor, { key: "Backspace" }).handled, false);

  const opened = play(start("⊢ p"), [{ key: "Enter", ctrl: true }, "p", { key: "Enter" }, "p"]);
  const emptied = type(moveCursor(opened, 1), "");
  assert.equal(pressKey(emptied, { key: "Backspace" }).handled, false);
});

test("apagar uma hipótese apaga a subdedução, e a última linha editável volta vazia", () => {
  let editor = play(start("p ⊢ p"), [{ key: "Enter", ctrl: true }, "q", { key: "Enter" }, "p"]);
  assert.equal(editor.proof.lines.length, 3);
  editor = press(moveCursor(editor, 2), { key: "Backspace", ctrl: true, shift: true });
  assert.equal(editor.proof.lines.length, 2);
  assert.equal(editor.proof.lines[1].kind, "step");
  assert.deepEqual(editor.cursor, { line: 2, field: "formula" });
  assert.deepEqual(fields(editor), [["p", ""], ["", ""]]);
});

test("setas mudam de linha no mesmo campo, e na hipótese passam à fórmula", () => {
  let editor = play(start("⊢ p"), ["p", { key: "Enter" }, "R, 1", { key: "Enter", ctrl: true }]);
  assert.equal(editor.cursor.line, 2);
  editor = press(editor, { key: "ArrowUp" });
  assert.deepEqual(editor.cursor, { line: 1, field: "formula" });
  editor = moveCursor(editor, 1, "justification");
  editor = press(editor, { key: "ArrowDown" });
  assert.deepEqual(editor.cursor, { line: 2, field: "formula" });
});

test("desfazer junta a escrita seguida, e refazer repõe", () => {
  let editor = start("p ⊢ p");
  for (const written of ["p", "p ", "p ∧", "p ∧ p"]) editor = type(editor, written);
  editor = press(editor, { key: "Enter" });
  editor = type(editor, "R");
  editor = press(editor, { key: "z", ctrl: true });
  assert.equal(editor.drafts[1].justification, "");
  assert.equal(editor.drafts[1].formula, "p ∧ p");
  editor = undo(editor);
  assert.equal(editor.drafts[1].formula, "");
  assert.equal(editor.proof.lines[1].formula, null);
  assert.equal(canUndo(editor), false);

  editor = redo(editor);
  assert.equal(editor.drafts[1].formula, "p ∧ p");
  editor = press(editor, { key: "z", ctrl: true, shift: true });
  assert.equal(editor.drafts[1].justification, "R");
  assert.equal(canRedo(editor), false);
});

test("desfazer repõe a estrutura, as citações e o cursor; escrever de novo apaga o refazer", () => {
  const before = play(start("p ⊢ p"), ["p", { key: "Enter" }, "R, 1"]);
  const inserted = addLine(moveCursor(before, 2, "justification"));
  const undone = undo(inserted);
  assert.equal(text(undone), text(before));
  assert.deepEqual(undone.cursor, { line: 2, field: "justification" });
  assert.equal(canRedo(type(undone, "R")), false);
  assert.equal(canRedo(undone), true);
});

test("desfazer tem um limite, para a memória não crescer sem fim", () => {
  let editor = start("p ⊢ p");
  for (let step = 0; step < UNDO_LIMIT + 20; step += 1) {
    editor = moveCursor(type(editor, `p${step}`), editor.cursor.line);
  }
  assert.equal(editor.past.length, UNDO_LIMIT);
});

test("trocar de sequente pode desfazer-se, com a prova que estava aberta", () => {
  const before = type(start("p ⊢ p"), "p");
  const restarted = restartEditor(before, goalOf("q ⊢ q"));
  assert.equal(restarted.proof.lines[0].formula.name, "q");
  const undone = undo(restarted);
  assert.equal(undone.goal, before.goal);
  assert.equal(undone.drafts[1].formula, "p");
});

test("tidyField passa ASCII a símbolos e a regra à sigla do idioma, sem passo a desfazer", () => {
  let editor = play(start("⊢ p ∨ ¬p"), ["p | ~p", { key: "Enter" }, "RA  , 3"]);
  const past = editor.past.length;
  editor = tidyField(editor, 1, "formula");
  assert.equal(editor.drafts[0].formula, "p ∨ ¬p");
  editor = tidyField(editor, 1, "justification", en.rules.labels);
  assert.equal(editor.drafts[0].justification, "RAA, 3");
  assert.equal(editor.past.length, past);
  assert.equal(tidyAll(editor, pt.rules.labels).drafts[0].justification, "RA, 3");
});

test("tidyField deixa como está o que não se conseguiu ler", () => {
  const editor = play(start("p ⊢ p"), ["p ∧", { key: "Enter" }, "R, x"]);
  const tidied = tidyField(tidyField(editor, 2, "formula"), 2, "justification");
  assert.deepEqual(fields(tidied)[1], ["p ∧", "R, x"]);
});

test("keyAction: atalhos, e o resto fica para o campo de texto", () => {
  assert.equal(keyAction({ key: "Enter" }), "advance");
  assert.equal(keyAction({ key: "Enter", ctrl: true }), "open");
  assert.equal(keyAction({ key: "Enter", shift: true }), "close");
  assert.equal(keyAction({ key: "Z", ctrl: true, shift: true }), "redo");
  assert.equal(keyAction({ key: "y", ctrl: true }), "redo");
  assert.equal(keyAction({ key: "Backspace", ctrl: true, shift: true }), "remove");
  assert.equal(keyAction({ key: "Backspace", ctrl: true }), null);
  assert.equal(keyAction({ key: "a" }), null);
  assert.equal(keyAction({ key: "Enter", alt: true }), null);
  assert.equal(pressKey(start("p ⊢ p"), { key: "a" }).handled, false);
});

test("editLine muda o conteúdo sem mexer na estrutura e perde a estratégia", () => {
  const { proof } = createProof([{ kind: "step", depth: 0, formula: atom("p"), rule: "R", strategy: "x" }]);
  const edited = editLine(proof, 1, { formula: atom("q") });
  assert.equal(edited.proof.lines[0].formula.name, "q");
  assert.equal(edited.proof.lines[0].rule, "R");
  assert.equal(edited.proof.lines[0].strategy, undefined);
  assert.equal(editLine(proof, 2, {}).error.code, "noSuchLine");
  assert.equal(editLine(proof, 1, { citations: [{ kind: "line", line: 0 }] }).error.code, "invalidLine");
  assert.equal(editLine(proof, 1, { kind: "premise" }).proof.lines[0].kind, "step");
});

test("cada erro de linha é uma só frase", () => {
  const sentences = (group) => Object.values(group);
  for (const locale of [pt, en]) {
    const messages = [
      ...sentences(locale.parser.errors), ...sentences(locale.proofText.errors), ...sentences(locale.proof.errors),
      ...sentences(locale.verify.errors), ...sentences(locale.verify.conclusion),
    ];
    for (const message of messages) {
      assert.doesNotMatch(message, /[.!?]\s+\p{Lu}/u, message);
      assert.match(message, /\.$/, message);
    }
  }
});

test("no Chrome: a prova só com teclas a sério, em PT e EN, a 390px", { skip: !existsSync(CHROME) }, () => {
  const run = spawnSync("node", ["scripts/check-editor.mjs"], { encoding: "utf8", timeout: 90000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
