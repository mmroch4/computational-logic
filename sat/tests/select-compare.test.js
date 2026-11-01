import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPARE_EXAMPLES, renderSelectCompare } from "../js/ui/select-compare.js";
import { compactTreeSvg, treeModel, COMPACT_TREE_SIZES } from "../js/ui/tree-view.js";
import { HEURISTICS } from "../js/core/heuristics.js";
import { getExample } from "../js/core/examples.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { setLang } from "../js/ui/i18n.js";

const count = (html, re) => (html.match(re) ?? []).length;

test("os conjuntos do interativo existem nos exemplos", () => {
  for (const id of COMPARE_EXAMPLES) assert.ok(getExample(id), id);
});

test("dois ramos: dois lados com 3 nós e nenhum mais pequeno", () => {
  setLang("pt");
  const html = renderSelectCompare({ exampleId: "two-branches" });
  assert.equal(count(html, /class="select-compare__side/g), 2);
  assert.match(html, /Ramo ¬ primeiro/);
  assert.match(html, /Positivo primeiro \(como a ferramenta\)/);
  assert.equal(count(html, /<strong>3 nós<\/strong>/g), 2);
  assert.doesNotMatch(html, /select-compare__badge/);
  assert.match(html, /As duas árvores têm 3 nós/);
  // Cada árvore tem 3 caixas (as chamadas DLL), as propagações em pontos e duas folhas ✗.
  assert.equal(count(html, /tree-node__box/g), 6);
  assert.ok(count(html, /tree-node__dot/g) > 0);
  assert.equal(count(html, /✗<\/text>/g), 4);
});

test("o ramo positivo dá a árvore mais pequena (3 nós contra 6)", () => {
  setLang("pt");
  const html = renderSelectCompare({ exampleId: "three-vars-b" });
  assert.equal(count(html, /select-compare__badge/g), 1);
  assert.match(html, /select-compare__side select-compare__side--winner" aria-label="Positivo primeiro/);
  assert.match(html, /Com o ramo positivo primeiro a árvore tem 3 nós em vez de 6\./);
  assert.equal(count(html, /satisfazível<\/p>/g), 2);
});

test("o critério escolhido fica selecionado e todos aparecem no select", () => {
  setLang("en");
  const html = renderSelectCompare({ exampleId: "extra-8-vars", heuristic: "shortest" });
  for (const h of HEURISTICS) assert.match(html, new RegExp(`<option value="${h}"`));
  assert.match(html, /<option value="shortest" selected>/);
  assert.match(html, /With the positive branch first the tree has 3 nodes instead of 4\./);
  setLang("pt");
});

test("compactTreeSvg: nós estáticos (sem tabindex), com o conjunto no aria-label", () => {
  setLang("pt");
  const { trace } = solveDLL(parse("-p -q, -p q, p -q, p q").clauses);
  const svg = compactTreeSvg(treeModel(trace, trace.length - 1, COMPACT_TREE_SIZES), "Árvore");
  assert.doesNotMatch(svg, /tabindex/);
  assert.match(svg, /<title>Raiz: /);
  // Propagações: pontos na linha tracejada, com o literal na aresta e o nome no title.
  assert.equal((svg.match(/tree-node__dot/g) || []).length, 4);
  assert.match(svg, /<title>Propagação de ¬q no nó 1: /);
  assert.match(svg, />raiz<\/text>/);
  assert.equal(compactTreeSvg({ nodes: [], edges: [], width: 0, height: 0 }), "");
});

test("os nomes dos conjuntos estão traduzidos (nenhuma chave em bruto)", () => {
  for (const lang of ["pt", "en"]) {
    setLang(lang);
    for (const id of COMPARE_EXAMPLES) assert.doesNotMatch(renderSelectCompare({ exampleId: id }), /learn\./);
  }
  setLang("pt");
});
