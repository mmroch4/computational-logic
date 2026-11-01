import { test } from "node:test";
import assert from "node:assert/strict";
import { dpSequenceModel, dpStepModel, renderDp } from "../js/ui/dp-view.js";
import { renderResultCard } from "../js/ui/result-card.js";
import { ruleOf } from "../js/ui/timeline.js";
import { parse } from "../js/core/parser.js";
import { solveDP } from "../js/core/dp.js";
import { getExample } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

const solve = (text, options) => solveDP(parse(text).clauses, options);

test("dpSequenceModel: dois ramos = (1) S, (2) eliminar p, (3) propagar ¬q, F e resultado", () => {
  const { trace } = solve(getExample("two-branches").input);
  const model = dpSequenceModel(trace, trace.length - 1);
  assert.deepEqual(model.steps.map((s) => s.kind), ["start", "resolve", "unit", "conflict", "result"]);
  assert.deepEqual(model.steps.map((s) => s.n), [1, 2, 3, null, null]);
  assert.equal(model.steps[1].variable, "p");
  assert.equal(model.steps[1].rule, "resolution");
  assert.equal(model.steps.at(-1).sat, false);
  assert.equal(model.current, model.steps.length - 1);
});

test("dpSequenceModel: passo atual e seguintes esbatidos", () => {
  const { trace } = solve(getExample("two-branches").input);
  const model = dpSequenceModel(trace, 1);
  assert.deepEqual(model.steps.map((s) => s.state), ["done", "current", "future", "future", "future"]);
});

test("dpStepModel: linha do pseudocódigo e pares resolvidos na eliminação", () => {
  const { trace } = solve(getExample("two-branches").input);
  const resolveIndex = trace.findIndex((e) => e.type === "resolve");
  const model = dpStepModel(trace, resolveIndex);
  assert.deepEqual(model.lines, ["else"]);
  assert.equal(model.rule, "resolution");
  assert.equal(model.explanation.key, "resolve");
  assert.equal(model.explanation.params.pairs, 4);
  assert.equal(model.explanation.params.tautologies, 2);
  assert.equal(model.resolve, trace[resolveIndex]);
  assert.deepEqual(dpStepModel(trace, 0).lines, ["call"]);
  assert.deepEqual(dpStepModel(trace, resolveIndex + 1).lines, ["ifUnit"]);
  assert.deepEqual(dpStepModel(trace, trace.length - 2).lines, ["ifFalse"]);
  assert.deepEqual(dpStepModel(trace, trace.length - 1).lines, ["ifFalse"]); // o return do resultado
  assert.equal(dpStepModel(trace, trace.length - 1).returns, true);
});

test("dpStepModel: variável só com um sinal (literal puro) → sem pares", () => {
  const { trace } = solve("p q, p -q");
  const index = trace.findIndex((e) => e.type === "resolve");
  const model = dpStepModel(trace, index);
  assert.equal(model.explanation.key, "resolvePure");
  assert.equal(trace.at(-1).sat, true);
});

test("renderDp: pares com tautologia descartada, linha atual e textos PT/EN sem {…} por preencher", () => {
  const { trace } = solve(getExample("two-branches").input);
  const index = trace.findIndex((e) => e.type === "resolve");
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    for (let i = 0; i < trace.length; i++) {
      const html = renderDp(trace, i);
      // {l} é texto do pseudocódigo (como no DLL); qualquer outro {nome} seria um marcador por preencher.
      assert.doesNotMatch(html, /\{(?!l\})[a-z]+\}/, `${lang} passo ${i}`);
    }
    const html = renderDp(trace, index);
    assert.equal((html.match(/resolution-pair--dropped/g) ?? []).length, 2);
    assert.equal((html.match(/class="resolution-pair[ "]/g) ?? []).length, 4);
    assert.match(html, /is-current"[^>]*><span class="pseudocode__num" aria-hidden="true">6</);
    assert.match(html, lang === "pt" ? /Eliminação de <span class="lit">p<\/span> por resolução/ : /Eliminating <span class="lit">p<\/span> by resolution/);
  }
  setLang("pt", { silent: true });
});

test("renderDp: limite de cláusulas mostra o aviso didático preenchido", () => {
  // Pombos 4 → 3 (o exemplo base é 3 → 2 e é pequeno demais para o limite).
  const pigeons = [];
  for (let i = 1; i <= 4; i++) pigeons.push([1, 2, 3].map((j) => `p${i}${j}`).join(" "));
  for (let j = 1; j <= 3; j++)
    for (let a = 1; a <= 4; a++) for (let b = a + 1; b <= 4; b++) pigeons.push(`-p${a}${j} -p${b}${j}`);
  const { trace } = solve(pigeons.join(", "), { maxClauses: 20 });
  assert.equal(trace.at(-2).type, "limit");
  const html = renderDp(trace, trace.length - 2);
  assert.match(html, /A resolução explodiu/);
  assert.doesNotMatch(html, /\{(variable|size|max)\}/);
});

test("renderResultCard com algorithm dp: frases e estatísticas do DP", () => {
  const S = parse(getExample("two-branches").input).clauses;
  const html = renderResultCard(S, solveDP(S).result, { algorithm: "dp" });
  assert.match(html, /sem ramificar/);
  assert.match(html, /1 eliminação/);
  assert.match(html, /no máximo 4 cláusulas/);
  assert.doesNotMatch(html, /ramificaç/);
  const sat = parse("p q, -p").clauses;
  assert.match(renderResultCard(sat, solveDP(sat).result, { algorithm: "dp" }), /reconstruída/);
});

test("timeline: a eliminação por resolução tem a cor resolution", () => {
  assert.equal(ruleOf({ type: "resolve" }), "resolution");
});

test("renderDp: a sequência não mostra o índice de cada passo por baixo do botão", () => {
  setLang("pt", { silent: true });
  const trace = solveDP(parse("p, -p q").clauses).trace;
  assert.doesNotMatch(renderDp(trace, 0), /<\/button>\s*\d/);
});

test("pares resolvidos: tabela com as três colunas e a conta, com tautologias e repetidos marcados", () => {
  setLang("pt", { silent: true });
  const { trace } = solve("p q, p r, -p q, -p r -q, s t, -s t");
  const index = trace.findIndex((e) => e.type === "resolve" && e.pairs.length > 0);
  const html = renderDp(trace, index);
  assert.match(html, /Pares resolvidos em <span class="lit">p<\/span> · 2 × 2 = 4/);
  assert.match(html, /<th scope="col">com <span class="lit">p<\/span><\/th>/);
  assert.match(html, /<th scope="col">com <span class="lit">¬p<\/span><\/th>/);
  assert.match(html, /<th scope="col">resolvente<\/th>/);

  const { trace: withRepeated } = solve("p q, p r, -p q, -p r");
  const repeated = renderDp(withRepeated, withRepeated.findIndex((e) => e.type === "resolve"));
  assert.equal((repeated.match(/resolution-pair--repeated/g) ?? []).length, 1);
  assert.match(repeated, /resolution-pair--repeated">.*<span class="resolution-pair__tag">repetida<\/span>/);
  assert.doesNotMatch(repeated, /resolution-pair--dropped/);
});

test("renderDp: compact tira a frase do passo e a dica da sequência", () => {
  setLang("pt", { silent: true });
  const { trace } = solve(getExample("two-branches").input);
  const compact = renderDp(trace, 1, { compact: true });
  assert.doesNotMatch(compact, /pseudocode__explain|proof__hint/);
  assert.match(renderDp(trace, 1), /pseudocode__explain/);
});
