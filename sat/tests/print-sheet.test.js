import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPrintSheet } from "../js/ui/print-sheet.js";
import { renderProof, proofModel } from "../js/ui/proof-view.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { solveDP } from "../js/core/dp.js";
import { getExample } from "../js/core/examples.js";
import { APP_NAME } from "../js/ui/config.js";
import { setLang } from "../js/ui/i18n.js";

function solve(text) {
  const { clauses } = parse(text);
  return { clauses, ...solveDLL(clauses) };
}

test("renderPrintSheet: título, prova completa (1)–(11) e árvore do cadeia de propagações", () => {
  setLang("pt", { silent: true });
  const { trace } = solve(getExample("propagation-chain").input);
  const html = renderPrintSheet(trace);
  assert.ok(html.includes(APP_NAME));
  assert.match(html, /Resolução pelo algoritmo DLL/);
  assert.match(html, /class="proof__list"/);
  assert.match(html, /class="tree-view__svg"/);
  // A folha mostra sempre a resolução acabada: nenhum passo por fazer e todos os números.
  assert.doesNotMatch(html, /is-future/);
  for (let n = 1; n <= 11; n++) assert.ok(html.includes(`<span class="proof__num">(${n})</span>`), `falta (${n})`);
  assert.match(html, /insatisfazível/);
});

test("renderPrintSheet: ids com prefixo para não repetirem os da página", () => {
  setLang("pt", { silent: true });
  const { trace } = solve("p q, -p");
  const html = renderPrintSheet(trace);
  assert.match(html, /id="print-proof-heading"/);
  assert.match(html, /aria-labelledby="print-proof-heading"/);
  assert.match(html, /id="print-tree-heading"/);
  assert.doesNotMatch(html, / id="(?!print-)/);
  // A vista de prova da página continua com o id original.
  assert.match(renderProof(proofModel(trace, 0)), /id="proof-heading"/);
});

test("renderPrintSheet (DP): título do DP, sequência completa e os pares de cada eliminação", () => {
  setLang("pt", { silent: true });
  const { trace } = solveDP(parse(getExample("two-branches").input).clauses);
  const html = renderPrintSheet(trace, { algorithm: "dp" });
  assert.ok(html.includes(APP_NAME));
  assert.match(html, /Resolução pelo algoritmo DP \(1960\)/);
  assert.doesNotMatch(html, /class="tree-view__svg"/);
  assert.doesNotMatch(html, /is-future/);
  for (let n = 1; n <= 3; n++) assert.ok(html.includes(`<span class="proof__num">(${n})</span>`), `falta (${n})`);
  // A eliminação de p tem os 4 pares por baixo (2 tautologias descartadas), dentro do mesmo passo.
  assert.equal((html.match(/class="resolution-pair[ "]/g) ?? []).length, 4);
  assert.equal((html.match(/resolution-pair--dropped/g) ?? []).length, 2);
  assert.match(html, /Eliminação de .*p.* por resolução:[\s\S]*class="dp-pairs"[\s\S]*<\/li>/);
  assert.match(html, /insatisfazível/);
  // Ids com prefixo, como no DLL.
  assert.match(html, /id="print-dp-seq-heading"/);
  assert.doesNotMatch(html, / id="(?!print-)/);
  setLang("en", { silent: true });
  assert.match(renderPrintSheet(trace, { algorithm: "dp" }), /Solving with the DP algorithm \(1960\)/);
  setLang("pt", { silent: true });
});
