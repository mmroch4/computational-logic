// O que um leitor de ecrã recebe da prova: fórmulas em palavras, estados anunciados e a árvore com uma
// só paragem de Tab. O comportamento no browser está em scripts/check-keyboard.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFormula } from "../js/core/parser.js";
import { parseProof } from "../js/core/proof-text.js";
import { speakFormula, speakJustification, speakProse } from "../js/core/speech.js";
import { fitchHtml, spokenFormula } from "../js/ui/fitch-view.js";
import { LOCALES, setLang, t } from "../js/ui/i18n.js";
import { announcementText, guidedPanelHtml } from "../js/ui/proof-editor.js";
import { treeHtml, treeKeyTarget } from "../js/ui/tree-view.js";
import { stateQuery } from "../scripts/prove-states.mjs";

const pt = LOCALES.pt.speech;
const en = LOCALES.en.speech;

test("speakFormula diz todos os conectivos, e não salta negações", () => {
  assert.equal(speakFormula("¬p ∧ q", pt), "não p e q");
  assert.equal(speakFormula("(p ∨ q) → F", pt), "abre parêntese p ou q fecha parêntese implica falso");
  assert.equal(speakFormula("¬¬p ⊢ p", en), "not not p therefore p");
});

test("speakFormula: F só é o falso sozinho, e os subscritos leem-se como número", () => {
  assert.equal(speakFormula("F1 ∧ p₁₂", pt), "F1 e p 12");
  assert.equal(speakFormula("φ → ψ", pt), "φ implica ψ");
});

test("speakProse só troca os símbolos e speakJustification lê a sigla e o intervalo", () => {
  assert.equal(speakProse("Objetivo da linha 3: p → q", pt), "Objetivo da linha 3: p implica q");
  assert.equal(speakJustification("→E, 1, 3", pt), "implicação E, 1, 3");
  assert.equal(speakJustification("¬I, 3–5", en), "negation I, 3 to 5");
});

test("cada linha da prova tem a fórmula e a justificação em palavras, e a lista mantém-se lista", () => {
  setLang("pt");
  const { proof } = parseProof("1 | p → q   premissa\n2 |   p     hipótese\n3 |   q     →E, 1, 2");
  const html = fitchHtml(proof);
  assert.match(html, /<ol class="fitch__lines" role="list">/);
  assert.match(html, /role="img" aria-label="p implica q">p → q</);
  assert.match(html, /role="img" aria-label="implicação E, 1, 2">→E, 1, 2</);
});

test("spokenFormula: uma linha vazia também se ouve", () => {
  setLang("pt");
  assert.equal(spokenFormula(null), t("fitch.emptyFormula"));
  assert.equal(spokenFormula(parseFormula("~p").formula), "não p");
});

const row = (state, message = null) => ({ state, message });

test("announcementText só fala do que mudou, em palavras", () => {
  setLang("pt");
  const before = [row("ok"), row("pending")];
  assert.equal(announcementText(before, [row("ok"), row("pending")]), "");
  assert.equal(announcementText(before, [row("ok"), row("ok")]), "Linha 2 certa.");
  assert.match(
    announcementText(before, [row("ok"), row("error", { key: "editor.complete", params: {} })]),
    /^Linha 2 com erro\. A prova está completa/,
  );
});

test("announcementText cala-se ao abrir ou ao mudar o número de linhas", () => {
  setLang("pt");
  assert.equal(announcementText(null, [row("error")]), "");
  assert.equal(announcementText([row("ok")], [row("ok"), row("error")]), "");
});

test("announcementText não despeja a prova toda depois de um desfazer", () => {
  setLang("en");
  const before = Array.from({ length: 5 }, () => row("ok"));
  const after = Array.from({ length: 5 }, () => row("error"));
  const text = announcementText(before, after);
  assert.equal(text.match(/has an error/g).length, 3);
  assert.match(text, /2 more lines changed\.$/);
  setLang("pt");
});

test("com a prova completa, o painel guiado não diz que falta um objetivo", () => {
  setLang("pt");
  const panel = (complete) => guidedPanelHtml({ anchor: { line: 6, target: null }, rules: [], choice: null, reason: null, complete });
  assert.ok(panel(true).includes(t("guided.noneLeft")));
  assert.ok(panel(false).includes(t("guided.noObjective")));
});

test("treeKeyTarget anda entre as fórmulas sem sair das pontas", () => {
  assert.equal(treeKeyTarget("ArrowLeft", 2, 5), 1);
  assert.equal(treeKeyTarget("ArrowDown", 2, 5), 3);
  assert.equal(treeKeyTarget("ArrowUp", 0, 5), 0);
  assert.equal(treeKeyTarget("ArrowRight", 4, 5), 4);
  assert.equal(treeKeyTarget("Home", 3, 5), 0);
  assert.equal(treeKeyTarget("End", 1, 5), 4);
  assert.equal(treeKeyTarget("a", 1, 5), null);
});

test("as fórmulas da árvore saem do Tab e leem-se em palavras", () => {
  setLang("pt");
  const { proof } = parseProof("1 | p → q   premissa\n2 | p       premissa\n3 | q       →E, 1, 2");
  const html = treeHtml({ kind: "assumption", formula: proof.lines[0].formula, line: 1, label: null }, proof);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /aria-label="Linha 1: p implica q \(premissa\)"/);
});

test("os estados usados pelas verificações de browser ainda se leem", () => {
  assert.match(stateQuery("mixed"), /^s=.*&p=1\./);
  assert.match(stateQuery("complete"), /^s=.*&p=1\./);
});
