import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPEEDS, playDelay, ruleOf, timelineMarks, timelineLabels, clampStep, keyAction, stepLabel, renderTimeline,
} from "../js/ui/timeline.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { getExample } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

function traceOf(text) {
  return solveDLL(parse(text).clauses).trace;
}

test("velocidades 0.5×–2× (as mesmas das prefs) e o tempo entre passos encolhe com a velocidade", () => {
  assert.deepEqual(SPEEDS, [0.5, 1, 1.5, 2]);
  assert.equal(playDelay(1), 900);
  assert.equal(playDelay(2), 450);
  assert.equal(playDelay(0.5), 1800);
  assert.equal(playDelay(3), 900); // velocidade inválida → 1×
});

test("cor de cada evento: as regras do DLL; o result tem a cor do resultado", () => {
  assert.equal(ruleOf({ type: "start" }), null);
  assert.equal(ruleOf({ type: "unit" }), "unit");
  assert.equal(ruleOf({ type: "branch" }), "branch");
  assert.equal(ruleOf({ type: "conflict" }), "conflict");
  assert.equal(ruleOf({ type: "sat" }), "sat");
  assert.equal(ruleOf({ type: "backtrack" }), "backtrack");
  assert.equal(ruleOf({ type: "limit" }), null);
  assert.equal(ruleOf({ type: "result", sat: true }), "sat");
  assert.equal(ruleOf({ type: "result", sat: false }), "conflict");
  assert.equal(ruleOf({ type: "result", sat: null }), null);
});

test("cadeia de propagações: 10 unitárias, F e o resultado insatisfazível como marcas", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  const marks = timelineMarks(trace);
  assert.equal(marks.length, trace.length - 1); // só o start não tem marca
  assert.deepEqual(marks.map((m) => m.rule), [...Array(10).fill("unit"), "conflict", "conflict"]);
  assert.equal(marks[0].left, (1 / (trace.length - 1)) * 100);
  assert.equal(marks.at(-1).left, 100);
});

test("as marcas seguem a ordem do trace e incluem ramificações e retrocessos", () => {
  const trace = traceOf("p q, -p q, p -q, -p -q");
  const rules = timelineMarks(trace).map((m) => m.rule);
  assert.ok(rules.includes("branch"));
  assert.ok(rules.includes("backtrack"));
  assert.equal(rules.at(-1), "conflict");
});

test("clampStep mantém o passo dentro do trace", () => {
  const trace = traceOf("p q");
  const last = trace.length - 1;
  assert.equal(clampStep(-3, trace), 0);
  assert.equal(clampStep(999, trace), last);
  assert.equal(clampStep(NaN, trace), 0);
  assert.equal(clampStep(1.7, trace), 1);
});

test("atalhos: ← → espaço Home End", () => {
  assert.equal(keyAction("ArrowLeft"), "prev");
  assert.equal(keyAction("ArrowRight"), "next");
  assert.equal(keyAction(" "), "toggle");
  assert.equal(keyAction("Home"), "first");
  assert.equal(keyAction("End"), "last");
  assert.equal(keyAction("a"), null);
});

test("contador e texto do slider: «Passo 7 de N» com o tipo do evento (PT/EN)", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  const n = trace.length - 1;
  setLang("pt", { silent: true });
  assert.equal(stepLabel(trace, 0), `Passo 0 de ${n}: conjunto inicial`);
  assert.equal(stepLabel(trace, 1), `Passo 1 de ${n}: propagação unitária`);
  setLang("en", { silent: true });
  assert.equal(stepLabel(trace, 11), `Step 11 of ${n}: conflict (S contains F)`);
  setLang("pt", { silent: true });
});

test("renderTimeline: botões, slider com max = último passo, marcas e velocidade escolhida", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  const html = renderTimeline(trace, { speed: 1.5 });
  for (const role of ["prev", "play", "next", "range", "speed", "counter"]) {
    assert.match(html, new RegExp(`data-role="${role}"`));
  }
  assert.match(html, new RegExp(`max="${trace.length - 1}"`));
  assert.equal((html.match(/tl-dot d-unit/g) ?? []).length, 10);
  assert.match(html, /data-speed="1.5" aria-pressed="true">1.5×</);
  assert.match(html, /data-role="speed" aria-label="Velocidade: 1.5×"/);
});

test("timelineLabels: início, momentos-chave e resultado, sem rótulos colados", () => {
  const unsat = traceOf("p q, p -q, -p q, -p -q");
  const labels = timelineLabels(unsat);
  assert.equal(labels[0].kind, "start");
  assert.equal(labels.at(-1).kind, "unsat");
  assert.ok(labels.some((l) => l.kind === "branch" && l.literal.v === "p"));
  labels.slice(1).forEach((l, i) => assert.ok(l.left - labels[i].left >= 10 || l.kind === "unsat"));
  assert.ok(!timelineLabels(traceOf("p, -p q")).some((l) => l.kind === "unit"));
});

test("timelineLabels: o resultado nunca se perde, mesmo colado ao rótulo anterior", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  assert.ok(["sat", "unsat"].includes(timelineLabels(trace, { minGap: 200 }).at(-1).kind));
});
