// O Passo a passo: o trace, o link e o HTML de cada passo. No Chrome, com teclas e toques: scripts/check-player.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { format } from "../js/core/formula.js";
import { clampStep, proofAt, proofTrace, stepOfLine } from "../js/core/proof-trace.js";
import { STRATEGY_CODES } from "../js/core/derivation.js";
import { parseSequent } from "../js/core/sequent.js";
import { ruleSet } from "../js/core/rules.js";
import { solve } from "../js/core/solver.js";
import { decodeStepLink, encodeStepLink } from "../js/core/step-link.js";
import { verifyProof } from "../js/core/verify.js";
import { setLang, t } from "../js/ui/i18n.js";
import { keepsKey, keyAction, isTypingTarget, playDelay, renderTimeline, stepLabel, timelineLabels, timelineMarks } from "../js/ui/timeline.js";
import {
  fitchAtStep, solveOutcome, stepAnnouncement, stepCardHtml, stepMarks, treeAtStep, viewSwitchHtml,
} from "../js/ui/step-player.js";

const goalOf = (text) => parseSequent(text).sequent;
const COMPLETO = ruleSet("completo");
const solved = (text) => solve(goalOf(text), { rules: COMPLETO });

const SEQUENT = "p → q, ¬q ⊢ ¬p";
const { proof } = solved(SEQUENT);
const trace = proofTrace(proof);

test("o passo 0 são as premissas e cada outra linha é um evento, pela ordem da prova", () => {
  assert.deepEqual(trace[0], { type: "start", premises: 2 });
  assert.equal(trace.length, proof.lines.length - 2 + 1);
  assert.deepEqual(trace.slice(1).map(({ line }) => line), proof.lines.slice(2).map((_, index) => index + 3));
});

test("os tipos: hipótese, fim de subdedução e conclusão na última linha", () => {
  const { proof: nested } = solved("p → q ⊢ (q → r) → (p → r)");
  const types = proofTrace(nested).map(({ type }) => type);
  assert.equal(types[0], "start");
  assert.equal(types[1], "assume");
  assert.ok(types.includes("discharge"));
  assert.equal(types.at(-1), "conclude");
  assert.equal(types.filter((type) => type === "conclude").length, 1);
});

test("as citações incluem todas as linhas de uma subdedução", () => {
  const { proof: nested } = solved("⊢ p → p ∧ p");
  const closing = proofTrace(nested).at(-1);
  const range = nested.lines.at(-1).citations[0];
  assert.equal(range.kind, "range");
  assert.deepEqual(closing.cited, Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i));
});

test("todas as linhas geradas têm uma estratégia com texto, em cada idioma", () => {
  const sequents = [SEQUENT, "⊢ p ∨ ¬p", "p ∨ q, ¬p ⊢ q", "p ∧ q ⊢ q ∧ p", "¬(p ∧ q) ⊢ ¬p ∨ ¬q", "p → q ∨ r ⊢ (p → q) ∨ (p → r)"];
  for (const text of sequents) {
    const { proof: generated } = solved(text);
    assert.ok(verifyProof(generated, goalOf(text), COMPLETO).ok, text);
    for (const event of proofTrace(generated).slice(1)) {
      assert.ok(STRATEGY_CODES.includes(event.strategy), `${text}, linha ${event.line}`);
      for (const lang of ["pt", "en"]) {
        setLang(lang);
        assert.notEqual(t(`solver.strategies.${event.strategy}`), `solver.strategies.${event.strategy}`);
      }
    }
  }
  setLang("pt");
});

test("clampStep mantém o passo na prova; o que não é número é o início", () => {
  assert.equal(clampStep(-3, trace), 0);
  assert.equal(clampStep(2.9, trace), 2);
  assert.equal(clampStep(999, trace), trace.length - 1);
  assert.equal(clampStep(Number.NaN, trace), 0);
  assert.equal(clampStep(3, [{ type: "start", premises: 1 }]), 0);
});

test("avançar acrescenta uma linha e recuar tira-a", () => {
  for (let step = 0; step < trace.length; step += 1) {
    assert.equal(proofAt(proof, trace, step).lines.length, 2 + step);
  }
  const forward = proofAt(proof, trace, 3).lines;
  const back = proofAt(proof, trace, 2).lines;
  assert.deepEqual(forward.slice(0, -1), back);
});

test("stepOfLine: cada linha é do passo que a escreveu, e as premissas do passo 0", () => {
  assert.equal(stepOfLine(trace, 1), 0);
  assert.equal(stepOfLine(trace, 2), 0);
  trace.slice(1).forEach(({ line }, index) => assert.equal(stepOfLine(trace, line), index + 1));
});

test("uma conclusão que é premissa só tem o passo 0, e o trace mantém-se coerente", () => {
  const { proof: direct } = solved("p ⊢ p");
  const short = proofTrace(direct);
  assert.ok(short.length <= 2);
  assert.equal(short.at(-1).type === "start" || short.at(-1).type === "conclude", true);
  const onlyPremise = proofTrace({ lines: [{ kind: "premise", depth: 0, formula: goalOf("p ⊢ p").premises[0] }] });
  assert.equal(onlyPremise.length, 1);
  setLang("pt");
  assert.match(stepCardHtml({ lines: [] }, onlyPremise, 0), /Prova acabada/);
});

test("o link leva o sequente, o passo e a vista, sem os padrões", () => {
  const goal = goalOf(SEQUENT);
  assert.equal(encodeStepLink(goal), "s=p+-%3E+q,+~q+%7C-+~p");
  assert.equal(encodeStepLink(goal, { step: 0, view: "fitch" }), "s=p+-%3E+q,+~q+%7C-+~p");
  assert.equal(encodeStepLink(goal, { step: 3, view: "tree" }), "s=p+-%3E+q,+~q+%7C-+~p&step=3&view=tree");
});

test("abrir um link devolve o mesmo sequente, passo e vista", () => {
  const goal = goalOf(SEQUENT);
  const read = decodeStepLink(`?${encodeStepLink(goal, { step: 3, view: "tree" })}`);
  assert.equal(read.status, "ok");
  assert.equal(read.step, 3);
  assert.equal(read.view, "tree");
  assert.deepEqual(read.goal, goal);
  assert.equal(decodeStepLink(`?${encodeStepLink(goal, { step: 2, view: "fitch" })}&view=fitch`).view, "fitch");
});

test("sem `s` não há link; `s` estragado é inválido; `step` e `view` estragados valem o padrão", () => {
  assert.deepEqual(decodeStepLink(""), { status: "none" });
  assert.deepEqual(decodeStepLink("?step=3"), { status: "none" });
  assert.equal(decodeStepLink("?s=p%20%7C-%20(").status, "invalid");
  assert.equal(decodeStepLink("?s=p%20%7C-%20(").error.code, "badSequent");
  for (const step of ["abc", "-1", "1.5", "", "9".repeat(400)]) {
    assert.equal(decodeStepLink(`?s=p%20%7C-%20p&step=${step}`).step, 0, step);
  }
  assert.equal(decodeStepLink("?s=p%20%7C-%20p&view=gantt").view, "fitch");
});

test("um link com `p` não abre a prova dele: aqui a prova é sempre a gerada", () => {
  const read = decodeStepLink("?s=p%20%7C-%20p&p=lixo&step=1");
  assert.equal(read.status, "ok");
  assert.equal(read.step, 1);
  assert.equal("proof" in read, false);
});

test("playDelay encolhe com a velocidade e ignora as desconhecidas", () => {
  assert.equal(playDelay(2), playDelay(1) / 2);
  assert.equal(playDelay(3), playDelay(1));
});

test("as teclas da timeline", () => {
  assert.equal(keyAction("ArrowLeft"), "prev");
  assert.equal(keyAction("ArrowRight"), "next");
  assert.equal(keyAction(" "), "toggle");
  assert.equal(keyAction("Home"), "first");
  assert.equal(keyAction("End"), "last");
  assert.equal(keyAction("x"), null);
});

test("a timeline deixa a tecla a quem a usa por si", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "text" }), true);
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "range" }), false);
  assert.equal(keepsKey("toggle", { tagName: "BUTTON" }), true);
  assert.equal(keepsKey("toggle", { tagName: "BODY" }), false);
  assert.equal(keepsKey("next", { tagName: "INPUT", dataset: { role: "range" } }), true);
  const scroller = (scrollWidth) => ({ tagName: "DIV", matches: () => true, scrollWidth, clientWidth: 300 });
  assert.equal(keepsKey("next", scroller(600)), true, "uma prova larga desloca-se com as setas");
  assert.equal(keepsKey("next", scroller(300)), false, "uma prova que cabe não usa as setas");
});

test("as marcas têm um ponto por linha, sem o início, e vão de ponta a ponta", () => {
  const marks = timelineMarks(trace);
  assert.equal(marks.length, trace.length - 1);
  assert.equal(marks.at(-1).left, 100);
  assert.equal(marks.at(-1).type, "conclude");
});

test("os rótulos não se tapam e a conclusão fica sempre", () => {
  const dense = [{ type: "start" }, ...Array.from({ length: 30 }, () => ({ type: "assume" })), { type: "conclude" }];
  const labels = timelineLabels(dense);
  labels.slice(1).forEach((label, index) => assert.ok(label.left - labels[index].left >= 14 || label.type === "conclude"));
  assert.equal(labels.at(-1).type, "conclude");
  assert.equal(labels[0].type, "start");
});

test("a timeline tem o slider até ao último passo e um ponto por linha", () => {
  setLang("pt");
  const html = renderTimeline(trace);
  assert.match(html, new RegExp(`max="${trace.length - 1}"`));
  assert.equal(html.match(/class="tl-dot /g).length, trace.length - 1);
  assert.match(stepLabel(trace, 1), new RegExp(`^Passo 1 de ${trace.length - 1}: `));
});

test("cada passo mostra só as linhas escritas, com a dele e as citadas assinaladas", () => {
  setLang("pt");
  const last = trace.length - 1;
  assert.equal(fitchAtStep(proof, trace, 0).match(/data-line=/g).length, 2);
  assert.doesNotMatch(fitchAtStep(proof, trace, 0), /data-step-mark/);
  assert.equal(fitchAtStep(proof, trace, 2).match(/data-line=/g).length, 4);
  assert.match(fitchAtStep(proof, trace, 2), /data-line="4" data-step-mark="current"/);
  const { line, cited } = trace[last];
  assert.equal(stepMarks(trace, last).get(line), "current");
  cited.forEach((number) => assert.equal(stepMarks(trace, last).get(number), "cited"));
});

test("sem premissas, o passo 0 explica-se em vez de dizer que a prova está vazia", () => {
  setLang("pt");
  const { proof: bare } = solved("⊢ p → p");
  const bareTrace = proofTrace(bare);
  assert.match(fitchAtStep(bare, bareTrace, 0), /Ainda não há linhas/);
  assert.match(stepCardHtml(bare, bareTrace, 0), /Não há premissas/);
});

test("o cartão diz a linha e a estratégia, e só o último passo diz que acabou", () => {
  setLang("pt");
  const event = trace[1];
  const card = stepCardHtml(proof, trace, 1);
  assert.ok(card.includes(`Linha ${event.line}`));
  assert.ok(card.includes(t(`solver.strategies.${event.strategy}`)));
  assert.doesNotMatch(card, /Prova acabada/);
  assert.match(stepCardHtml(proof, trace, trace.length - 1), /Prova acabada/);
  assert.match(stepCardHtml(proof, trace, 0), /só com as premissas/);
  setLang("en");
  assert.ok(stepCardHtml(proof, trace, 1).includes(`Line ${event.line}`));
  setLang("pt");
});

test("o anúncio tem o passo e a fórmula em palavras", () => {
  setLang("pt");
  const event = trace[1];
  const heard = stepAnnouncement(proof, trace, 1);
  assert.match(heard, new RegExp(`^Passo 1 de ${trace.length - 1}\\. Linha ${event.line}`));
  assert.doesNotMatch(heard, /[¬→∧∨]/);
});

test("a árvore de cada passo é a da linha dele, e o início não tem árvore", () => {
  assert.deepEqual(treeAtStep(proof, trace, 0), { status: "note", key: "player.treeStart" });
  for (let step = 1; step < trace.length; step += 1) {
    const shown = treeAtStep(proof, trace, step);
    assert.equal(shown.status, "ready", `passo ${step}`);
    assert.equal(format(shown.tree.formula), format(proof.lines[trace[step].line - 1].formula));
  }
});

test("o seletor de vista marca a atual", () => {
  setLang("pt");
  assert.match(viewSwitchHtml("tree"), /data-view="tree" aria-pressed="true"/);
  assert.match(viewSwitchHtml("tree"), /data-view="fitch" aria-pressed="false"/);
});

test("solveOutcome: só uma prova se reproduz; o resto diz porquê", () => {
  assert.equal(solveOutcome({ ok: true, valid: true, provable: true, proof }), null);
  assert.equal(solveOutcome({ ok: true, valid: false, counterexample: new Map() }).key, "player.invalid");
  assert.equal(solveOutcome({ ok: true, valid: true, provable: false }).key, "solver.noProof");
  assert.equal(solveOutcome({ ok: false, error: { code: "timeout", params: { seconds: 15 } } }).key, "solver.errors.timeout");
  assert.equal(solveOutcome({ ok: false, error: { code: "tooManyVariables", params: {} } }).key, "semantics.errors.tooManyVariables");
});

test("no Chrome: avançar, recuar, abrir um passo por link e trocar de vista", { skip: !existsSync(process.env.CHROME_BIN || "/usr/bin/google-chrome") }, () => {
  const run = spawnSync("node", ["scripts/check-player.mjs"], { encoding: "utf8", timeout: 90000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
