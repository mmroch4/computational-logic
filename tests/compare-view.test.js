import { test } from "node:test";
import assert from "node:assert/strict";
import { chartSvg, formatMs, lineText, renderCompare, summaryText } from "../js/ui/compare-view.js";
import { compareAlgorithms, stepNumberAt } from "../js/core/compare.js";
import { solveDLL } from "../js/core/dll.js";
import { parse } from "../js/core/parser.js";
import { getExample } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

const compare = (text) => compareAlgorithms(parse(text).clauses, { timing: false });

function pigeons(n, holes) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(Array.from({ length: holes }, (_, j) => `p${i}${j + 1}`).join(" "));
  for (let j = 1; j <= holes; j++)
    for (let a = 1; a <= n; a++) for (let b = a + 1; b <= n; b++) out.push(`-p${a}${j} -p${b}${j}`);
  return out.join(", ");
}

test("renderCompare: colapsável, fechada por omissão, com o título sempre visível no resumo", () => {
  setLang("pt", { silent: true });
  const out = compare(getExample("two-branches").input);
  assert.match(renderCompare(out, { open: true }), /<details class="compare__details" open>/);
  const closed = renderCompare(out);
  assert.match(closed, /<details class="compare__details">/);
  assert.match(closed, /<summary class="compare__toggle">\s*<h2[^>]*>\s*<span class="compare__if-closed">Comparar com o DP<\/span>/);
  assert.match(closed, /<span class="compare__if-open">DLL × DP no mesmo conjunto<\/span>/);
  assert.match(closed, /<span class="compare__if-open">Recolher<\/span>/);
  assert.match(renderCompare(out, { current: "dp" }), /Comparar com o DLL/);
});

test("lineText: passos dos dois, o algoritmo visto primeiro, e a resposta quando coincide", () => {
  setLang("pt", { silent: true });
  const out = compare(getExample("two-branches").input);
  assert.equal(lineText(out), "DLL 6 passos · DP 2 passos · os dois dão insatisfazível");
  assert.equal(lineText(out, "dp"), "DP 2 passos · DLL 6 passos · os dois dão insatisfazível");
  assert.match(lineText(compare("p")), /^DLL 1 passo · DP 1 passo · os dois dão satisfazível$/);
  const limited = compareAlgorithms(parse(pigeons(5, 4)).clauses, { timing: false });
  assert.doesNotMatch(lineText(limited), /os dois/);
  setLang("en", { silent: true });
  assert.equal(lineText(out), "DLL 6 steps · DP 2 steps · both give unsatisfiable");
  setLang("pt", { silent: true });
});

test("renderCompare: tabela lado a lado com resultado, passos, maior S e tempo, em PT e EN", () => {
  setLang("pt", { silent: true });
  const out = compare(getExample("two-branches").input);
  const html = renderCompare(out, { current: "dp" });
  assert.match(html, /DLL \(1962\)/);
  assert.match(html, /DP \(1960\)/);
  assert.match(html, /Passos<\/th><td class="">6<\/td><td class="compare__col--current">2<\/td>/);
  assert.match(html, /5 cláusulas/);
  assert.match(html, /insatisfazível/);
  assert.match(html, /<svg class="compare-chart"/);
  assert.doesNotMatch(html, /\{\w+\}/, "nada por preencher");

  setLang("en", { silent: true });
  const en = renderCompare(out);
  assert.match(en, /Largest S/);
  assert.match(en, /unsatisfiable/);
  assert.doesNotMatch(en, /\{\w+\}/);
  setLang("pt", { silent: true });
});

test("summaryText: escolhe a frase certa para cada caso", () => {
  setLang("pt", { silent: true });
  assert.match(summaryText(compare(getExample("propagation-chain").input)), /Só houve propagações/);
  assert.match(summaryText(compare(getExample("two-branches").input)), /o DP fez menos passos \(2 contra 6\)/);
  const limited = compareAlgorithms(parse(pigeons(5, 4)).clauses, { timing: false });
  assert.match(summaryText(limited), new RegExp(`a eliminação seguinte daria ${limited.dp.limitSize}: o DP parou sem resposta`));
  assert.ok(limited.dp.limitSize > 400);
});

test("chartSvg: uma linha por algoritmo e o passo atual marcado", () => {
  const out = compare(getExample("two-branches").input);
  const svg = chartSvg(out, { algorithm: "dll", step: 1 });
  assert.equal((svg.match(/<polyline/g) || []).length, 2);
  // DLL tem 7 pontos e DP 3 (com círculos, porque são poucos).
  assert.equal((svg.match(/<circle cx/g) || []).length, 7 + 3);
  assert.match(svg, /compare-chart__marker--dll/);
  assert.equal(chartSvg(out, null).includes("compare-chart__marker"), false);
});

test("stepNumberAt: conta só os eventos que mudam S até ao índice dado", () => {
  const { trace } = solveDLL(parse(getExample("two-branches").input).clauses);
  assert.equal(stepNumberAt(trace, "dll", 0), 0);
  assert.equal(stepNumberAt(trace, "dll", trace.length - 1), 6);
});

test("formatMs: tempos pequenos, decimais e sem medição", () => {
  setLang("pt", { silent: true });
  assert.equal(formatMs(0.001), "< 0,01 ms");
  assert.equal(formatMs(0.054), "0,05 ms");
  assert.equal(formatMs(123.4), "123 ms");
  assert.equal(formatMs(null), "—");
  setLang("en", { silent: true });
  assert.equal(formatMs(0.054), "0.05 ms");
  setLang("pt", { silent: true });
});
