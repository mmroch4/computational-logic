import { test } from "node:test";
import assert from "node:assert/strict";
import { pseudocodeModel, renderPseudocode, PSEUDOCODE_LINES } from "../js/ui/pseudocode-view.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { getExample } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

function traceOf(text) {
  return solveDLL(parse(text).clauses).trace;
}

const linesOf = (trace) => trace.map((_, i) => pseudocodeModel(trace, i).lines);

test("o pseudocódigo tem as 10 linhas, pela ordem certa", () => {
  assert.deepEqual(
    PSEUDOCODE_LINES.map((l) => l.id),
    ["call", "input", "output", "propagate", "ifEmpty", "ifFalse", "select", "ifBranch", "then", "else"],
  );
});

test("cadeia de propagações: start → DLL(S), propagações → propagate, F → if S contém F", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  const lines = linesOf(trace);
  assert.deepEqual(lines[0], ["call"]);
  for (let i = 1; i <= 10; i++) assert.deepEqual(lines[i], ["propagate"]);
  assert.deepEqual(lines[11], ["ifFalse"]);
  assert.deepEqual(lines[12], ["ifFalse"]); // result: sem ramos, a chamada inicial devolve aqui
  assert.equal(pseudocodeModel(trace, 11).rule, "conflict");
});

test("dois ramos: 1.º ramo → select + if, backtrack → if, 2.º ramo → else", () => {
  // 0 start, 1 branch p, 2–3 unit, 4 conflict, 5 backtrack ¬p, 6 branch ¬p, 7–8 unit, 9 conflict, 10 result
  const trace = traceOf(getExample("two-branches").input);
  const lines = linesOf(trace);
  assert.deepEqual(lines[1], ["select", "ifBranch"]);
  assert.deepEqual(lines[5], ["ifBranch"]);
  assert.deepEqual(lines[6], ["else"]);
  assert.equal(pseudocodeModel(trace, 1).explanation.key, "branchFirst");
  assert.equal(pseudocodeModel(trace, 5).rule, "backtrack");
  assert.equal(pseudocodeModel(trace, 6).explanation.key, "branchSecond");
  assert.equal(pseudocodeModel(trace, 10).explanation.key, "resultUnsat");
});

test("S vazio → if S vazio, regra sat, e o resultado diz satisfazível", () => {
  const trace = traceOf("p q");
  const satIndex = trace.findIndex((e) => e.type === "sat");
  assert.deepEqual(pseudocodeModel(trace, satIndex).lines, ["ifEmpty"]);
  assert.equal(pseudocodeModel(trace, satIndex).rule, "sat");
  assert.equal(pseudocodeModel(trace, trace.length - 1).explanation.key, "resultSat");
});

test("backtrack: a explicação nomeia o ramo que falhou (l) e o que se vai tentar (l̃)", () => {
  const trace = traceOf(getExample("two-branches").input);
  const { params } = pseudocodeModel(trace, 5).explanation;
  assert.deepEqual(params.failed, { v: "p", neg: false });
  assert.deepEqual(params.literal, { v: "p", neg: true });
});

test("limite de passos: sem linha realçada e explicação com o nº de passos", () => {
  const trace = solveDLL(parse(getExample("two-branches").input).clauses, { maxSteps: 3 }).trace;
  const limitIndex = trace.findIndex((e) => e.type === "limit");
  const model = pseudocodeModel(trace, limitIndex);
  assert.deepEqual(model.lines, []);
  assert.deepEqual(model.explanation, { key: "limit", params: { steps: 3 } });
  assert.equal(pseudocodeModel(trace, limitIndex + 1).explanation.key, "resultLimited");
});

test("índice fora do trace: modelo vazio", () => {
  assert.deepEqual(pseudocodeModel([], 0), { type: null, rule: null, lines: [], explanation: null });
});

test("render (PT): explicação da unitária como no plano, linha atual com aria-current e cor da regra", () => {
  setLang("pt", { silent: true });
  // Cadeia de propagações, passo 2: a unitária {¬p2}.
  const trace = traceOf(getExample("propagation-chain").input);
  const html = renderPseudocode(pseudocodeModel(trace, 2));
  assert.match(html, /class="pseudocode rule-unit"/);
  assert.match(html, /Há uma cláusula unitária .*¬p<sub>2<\/sub>.*: removemos as cláusulas com .*¬p<sub>2<\/sub>.* e apagamos .*p<sub>2<\/sub>.* das restantes\./);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.match(html, /is-current" aria-current="step" style="--indent: 1"><span class="pseudocode__num" aria-hidden="true">4<\/span><code class="pseudocode__code">S := propagate\(S\)/);
  assert.match(html, /<span class="pseudocode__kw">if<\/span> S vazio <span class="pseudocode__kw">then<\/span>/);
});

test("render (EN): as linhas e a explicação mudam de idioma", () => {
  setLang("en", { silent: true });
  const trace = traceOf(getExample("two-branches").input);
  const html = renderPseudocode(pseudocodeModel(trace, 5));
  assert.match(html, /if<\/span> S contains F/);
  assert.match(html, /was unsatisfiable: we go back/);
  setLang("pt", { silent: true });
});

test("render: o start não tem regra e o result realça a linha do return", () => {
  setLang("pt", { silent: true });
  const trace = traceOf("p q");
  assert.match(renderPseudocode(pseudocodeModel(trace, 0)), /class="pseudocode"/);
  const last = renderPseudocode(pseudocodeModel(trace, trace.length - 1));
  assert.match(last, /c-sat is-current" aria-current="step"/);
  assert.match(last, /code__tag" aria-hidden="true">return</);
});

test("result: a linha do return é a da chamada inicial", () => {
  const lastLine = (text) => {
    const trace = traceOf(text);
    return pseudocodeModel(trace, trace.length - 1).lines;
  };
  assert.deepEqual(lastLine("p q"), ["ifEmpty"]);
  assert.deepEqual(lastLine("p, -p"), ["ifFalse"]);
  assert.deepEqual(lastLine("p q, -p q, p -q, -p -q"), ["else"]);
});

test("painel recolhível: com `open` as linhas ficam num <details>; a linha atual leva a classe do evento", () => {
  setLang("pt", { silent: true });
  const trace = solveDLL(parse("p, -p q").clauses).trace;
  const model = pseudocodeModel(trace, 1);
  assert.match(renderPseudocode(model, { open: true }), /<details class="code-panel" open>/);
  assert.match(renderPseudocode(model, { open: false }), /<details class="code-panel">/);
  assert.doesNotMatch(renderPseudocode(model), /<details/);
  assert.match(renderPseudocode(model), /class="pseudocode__line c-unit is-current"/);
  assert.match(renderPseudocode(model), /<span class="code__tag" aria-hidden="true">este passo<\/span>/);
});
