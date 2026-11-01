import { test } from "node:test";
import assert from "node:assert/strict";
import { proofModel, renderProof } from "../js/ui/proof-view.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { getExample } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

function traceOf(text) {
  return solveDLL(parse(text).clauses).trace;
}

const states = (model) => model.steps.map((s) => s.state);

test("proofModel: cadeia de propagações tem (1)…(11), F e o resultado no fim", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  const model = proofModel(trace, trace.length - 1);
  assert.deepEqual(model.steps.map((s) => s.n).filter((n) => n !== null), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(model.steps.slice(-2).map((s) => s.kind), ["conflict", "result"]);
  assert.equal(model.steps.at(-1).sat, false);
  assert.equal(model.current, model.steps.length - 1);
});

test("proofModel: passo atual = último passo já feito; os seguintes ficam future", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  const model = proofModel(trace, 2);
  assert.equal(model.current, 2);
  assert.deepEqual(states(model).slice(0, 4), ["done", "done", "current", "future"]);
  assert.equal(model.steps[2].rule, "unit");
  assert.equal(model.steps[0].rule, null);
});

test("proofModel: dois ramos marca o 2.º ramo e dá a profundidade", () => {
  // 0 start, 1 branch p, 2–3 unit, 4 conflict, 5 backtrack, 6 branch ¬p, 7–8 unit, 9 conflict, 10 result
  const trace = traceOf(getExample("two-branches").input);
  const model = proofModel(trace, 6);
  const branches = model.steps.filter((s) => s.kind === "branch");
  assert.deepEqual(branches.map((s) => s.second), [false, true]);
  assert.deepEqual(branches.map((s) => s.depth), [1, 1]);
  assert.equal(model.steps[model.current].kind, "branch");
  assert.equal(model.steps[model.current].second, true);
  assert.equal(model.steps.find((s) => s.kind === "backtrack").rule, "backtrack");
});

test("renderProof: números (n), conjuntos com F, botões com o passo e o atual com aria-current", () => {
  setLang("pt", { silent: true });
  const trace = traceOf(getExample("two-branches").input);
  const html = renderProof(proofModel(trace, 4));
  assert.match(html, /Vista de prova/);
  assert.match(html, /\(1\)/);
  assert.match(html, /\(4\)/);
  assert.match(html, /S contém F ⇒ insatisfazível/);
  assert.match(html, /\{F\}/);
  assert.match(html, /data-step="4" aria-current="step"/);
  assert.equal((html.match(/aria-current/g) ?? []).length, 1);
  assert.match(html, /tentamos o complementar, S ∪ \{<span class="lit">¬p<\/span>\}/);
  assert.match(html, /Resultado: S é insatisfazível\./);
});

test("proofModel: o 2.º ramo parte do mesmo conjunto do 1.º, mesmo com propagações pelo meio", () => {
  const trace = traceOf("s p -q, -p -q -r, -s p -q, -s -p q, -s p -r, -s -q r, s");
  const branches = proofModel(trace, 0, { budget: Infinity }).steps.filter((s) => s.kind === "branch");
  assert.deepEqual(branches.map((s) => [s.n, s.base]), [[3, 2], [7, 2]]);
});

test("renderProof: etiquetas com o evento, cabeçalho do ramo e «(n) ∪ {l}»", () => {
  setLang("pt", { silent: true });
  const trace = traceOf("s p -q, -p -q -r, -s p -q, -s -p q, -s p -r, -s -q r, s");
  const html = renderProof(proofModel(trace, 0));
  assert.match(html, /<span class="proof__ref" aria-hidden="true">\(2\) ∪ \{p\}<\/span>/);
  assert.match(html, /<span class="proof__ref" aria-hidden="true">\(2\) ∪ \{¬p\}<\/span>/);
  assert.match(html, /class="proof__branch"[^>]*aria-hidden="true">.*ramo <span class="lit">p<\/span>/);
  assert.match(html, /proof__tag"><span class="chip ev-unit">/);
  assert.match(html, /proof__tag"><span class="chip ev-branch">/);
});

test("renderProof: satisfazível mostra a valoração com V/F (PT) e T/F (EN)", () => {
  const trace = traceOf("-p q, -p -q r, -p, -r");
  setLang("pt", { silent: true });
  assert.match(renderProof(proofModel(trace, trace.length - 1)), /S vazio ⇒ satisfazível <span class="proof__valuation">\(p = F, r = F\)<\/span>/);
  setLang("en", { silent: true });
  const en = renderProof(proofModel(trace, trace.length - 1));
  assert.match(en, /Proof view/);
  assert.match(en, /S is empty ⇒ satisfiable/);
  setLang("pt", { silent: true });
});
