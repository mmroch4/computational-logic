import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MIN_VARS,
  MAX_VARS,
  COST_EXAMPLE_IDS,
  truthTableRows,
  clampVars,
  dllCost,
  exampleCosts,
} from "../js/core/sat-cost.js";
import { parse } from "../js/core/parser.js";
import { getExample } from "../js/core/examples.js";
import { renderSatExplorer, rowsSummaryHtml, formatCount } from "../js/ui/sat-explorer.js";
import { setLang } from "../js/ui/i18n.js";

test("truthTableRows: 2ⁿ linhas", () => {
  assert.equal(truthTableRows(1), 2);
  assert.equal(truthTableRows(10), 1024);
  assert.equal(truthTableRows(MAX_VARS), 1073741824);
});

test("clampVars: inteiro entre MIN_VARS e MAX_VARS", () => {
  assert.equal(clampVars("7"), 7);
  assert.equal(clampVars(0), MIN_VARS);
  assert.equal(clampVars(99), MAX_VARS);
  assert.equal(clampVars("abc"), MIN_VARS);
});

test("dllCost: passos = trace.length - 1 (o contador do Passo a passo)", () => {
  const { clauses } = parse(getExample("two-branches").input);
  const cost = dllCost(clauses);
  assert.deepEqual(cost, { vars: 2, rows: 4, steps: 10, nodes: 3, sat: false });
});

test("exampleCosts: os exemplos da tabela batem com o resultado esperado e estão por nº de variáveis", () => {
  const costs = exampleCosts();
  assert.deepEqual(costs.map((c) => c.example.id), COST_EXAMPLE_IDS);
  for (const cost of costs) assert.equal(cost.sat, cost.example.expected === "sat", cost.example.id);
  const vars = costs.map((c) => c.vars);
  assert.deepEqual(vars, [...vars].sort((a, b) => a - b));
});

test("a nota do interativo cita números verdadeiros do cadeia de propagações (10 variáveis, 1024 linhas, 12 passos)", () => {
  const chain = exampleCosts(["propagation-chain"])[0];
  assert.equal(chain.vars, 10);
  assert.equal(chain.rows, 1024);
  assert.equal(chain.steps, 12);
  for (const lang of ["pt", "en"]) {
    const src = readFileSync(new URL(`../js/ui/locales/${lang}.js`, import.meta.url), "utf8");
    assert.match(src, /10 (variáveis|variables) (dão|give) 1024 (linhas|rows)/);
    assert.match(src, /12 (passos|steps)/);
  }
});

test("rowsSummaryHtml: singular/plural, expoente em <sup> e separadores do idioma", () => {
  setLang("pt", { silent: true });
  assert.equal(rowsSummaryHtml(1), "1 variável → 2<sup>1</sup> = 2 linhas na tabela de verdade");
  assert.equal(formatCount(1048576, "pt"), "1 048 576");
  assert.match(rowsSummaryHtml(20), /^20 variáveis → 2<sup>20<\/sup> = 1 048 576 linhas/);
  setLang("en", { silent: true });
  assert.equal(rowsSummaryHtml(20, "en"), "20 variables → 2<sup>20</sup> = 1,048,576 rows in the truth table");
  setLang("pt", { silent: true });
});

test("renderSatExplorer: slider, tabela com links para o Passo a passo e linha destacada para o n atual", () => {
  setLang("pt", { silent: true });
  const html = renderSatExplorer({ n: 6 });
  assert.match(html, /<input class="sat-explorer__range" id="sat-vars" type="range" min="1" max="30" step="1" value="6">/);
  assert.match(html, /<label class="sat-explorer__label" for="sat-vars">Número de variáveis<\/label>/);
  assert.equal(html.match(/<tr class="sat-explorer__row/g).length, COST_EXAMPLE_IDS.length);
  // Só a linha dos pombos (6 variáveis) fica destacada.
  assert.equal(html.match(/sat-explorer__row--match/g).length, 1);
  assert.match(html, /sat-explorer__row--match" data-vars="6"><th scope="row"><a href="\/passo-a-passo\?f=/);
  assert.match(html, /data-set-vars="10" aria-label="Pôr 10 variáveis no slider">10<\/button>/);
  assert.match(html, /<td>1024<\/td><td>12<\/td>/);
  assert.match(html, /Linhas \(2<sup>n<\/sup>\)/);
  setLang("en", { silent: true });
  assert.match(renderSatExplorer({ n: 3, lang: "en" }), /Truth table vs DLL/);
  setLang("pt", { silent: true });
});

test("aprender.html: a §1 tem o texto (sem a nota provisória) e o contentor do interativo", () => {
  const html = readFileSync(new URL("../aprender.html", import.meta.url), "utf8");
  const section = html.slice(html.indexOf('id="sat"'), html.indexOf('id="clausulas"'));
  assert.doesNotMatch(section, /learn\.soon/);
  for (const key of ["p1", "p2", "p3", "p4"]) assert.match(section, new RegExp(`data-i18n="learn\\.sat\\.${key}"`));
  assert.match(section, /<div class="lesson-interactive" id="sat-explorer"><\/div>/);
  assert.match(section, /href="\/passo-a-passo\?f=p1,\+-p1\+-p2,/);
});
