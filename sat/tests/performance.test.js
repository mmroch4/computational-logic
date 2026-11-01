// M8.5: fórmulas grandes não podem prender a página. A vista de prova mostra só uma janela de
// passos quando a prova é enorme e a árvore corta o conjunto no rótulo de cada nó.
import { test } from "node:test";
import assert from "node:assert/strict";
import { proofModel, proofWindow, renderProof, PROOF_CLAUSE_BUDGET, PROOF_MIN_WINDOW } from "../js/ui/proof-view.js";
import { treeModel, renderTree, NODE_TITLE_MAX } from "../js/ui/tree-view.js";
import { proofSteps } from "../js/core/trace.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { mulberry32 } from "../js/core/generator.js";
import { EXAMPLES } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

/** 3-SAT aleatório com n variáveis e m cláusulas (sempre o mesmo para a mesma semente). */
function random3Sat(n, m, seed) {
  const random = mulberry32(seed);
  const clauses = [];
  for (let i = 0; i < m; i++) {
    const clause = [];
    for (let k = 0; k < 3; k++) clause.push(`${random() < 0.5 ? "-" : ""}p${1 + Math.floor(random() * n)}`);
    clauses.push(clause.join(" "));
  }
  return parse(clauses.join(", ")).clauses;
}

// 100 variáveis e 430 cláusulas: chega ao limite de 5000 passos do DLL.
const BIG = solveDLL(random3Sat(100, 430, 1)).trace;

test("proofWindow: tudo quando cabe; senão uma janela que contém sempre o passo atual com margem", () => {
  assert.deepEqual(proofWindow(10, 3, 20), { from: 0, to: 10 });
  const size = 20;
  let changes = 0;
  let previous = null;
  for (let current = 0; current < 500; current++) {
    const { from, to } = proofWindow(500, current, size);
    assert.equal(to - from, size);
    assert.ok(from >= 0 && to <= 500);
    assert.ok(current >= from && current < to, `passo ${current} fora de [${from}, ${to})`);
    // Pelo menos ¼ da janela antes e depois do passo atual, exceto nas pontas da lista.
    if (from > 0) assert.ok(current - from >= size / 4, `pouca margem antes do passo ${current}`);
    if (to < 500) assert.ok(to - 1 - current >= size / 4, `pouca margem depois do passo ${current}`);
    if (previous !== null && previous !== from) changes++;
    previous = from;
  }
  // A janela avança aos saltos de meia janela (e não a cada passo).
  assert.ok(changes <= 500 / (size / 2), `${changes} mudanças de janela`);
});

test("proofModel: numa prova enorme só desenha a janela, dentro do orçamento de cláusulas", () => {
  const total = proofSteps(BIG).length + 1; // + o resultado
  const setSize = BIG[0].S.length + 1;
  for (const index of [0, 1000, 2500, BIG.length - 1]) {
    const model = proofModel(BIG, index);
    assert.equal(model.hiddenBefore + model.steps.length + model.hiddenAfter, total);
    assert.ok(model.steps.length <= Math.max(PROOF_MIN_WINDOW, Math.floor(PROOF_CLAUSE_BUDGET / setSize)));
    assert.equal(model.steps[model.current].state, "current");
    assert.equal(model.steps.filter((s) => s.state === "current").length, 1);
  }
  // A folha de impressão pede a prova inteira.
  const all = proofModel(BIG, BIG.length - 1, { budget: Infinity });
  assert.equal(all.steps.length, total);
  assert.equal(all.hiddenBefore + all.hiddenAfter, 0);
});

test("proofModel: os exemplos base cabem sempre inteiros", () => {
  for (const example of EXAMPLES) {
    const trace = solveDLL(parse(example.input).clauses).trace;
    const model = proofModel(trace, 0);
    assert.equal(model.hiddenBefore + model.hiddenAfter, 0, example.id);
  }
});

test("renderProof: marca os passos de fora da janela (PT e EN)", () => {
  setLang("pt", { silent: true });
  const model = proofModel(BIG, 2500);
  const html = renderProof(model);
  assert.match(html, new RegExp(`… ${model.hiddenBefore} passos anteriores`));
  assert.match(html, new RegExp(`… ${model.hiddenAfter} passos seguintes`));
  setLang("en", { silent: true });
  assert.match(renderProof(model), /later steps \(go forward on the timeline/);
  setLang("pt", { silent: true });
  assert.doesNotMatch(renderProof(proofModel(BIG, 0)), /passos anteriores/);
});

test("renderTree: o conjunto no rótulo de cada nó é cortado em NODE_TITLE_MAX caracteres", () => {
  setLang("pt", { silent: true });
  const html = renderTree(treeModel(BIG, 10));
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  assert.ok(titles.length > 300, `${titles.length} nós`);
  // O título tem o conjunto (≤ NODE_TITLE_MAX) mais o "Nó n:" e o estado.
  for (const title of titles) assert.ok(title.length < NODE_TITLE_MAX + 120, title.slice(0, 60));
  // Com as propagações na árvore há ~12 vezes mais nós (372 chamadas e 4271 propagações): o que
  // conta é o peso de cada nó, com o conjunto uma só vez (no <title>, sem aria-label repetido).
  const nodes = (html.match(/class="tree-node /g) ?? []).length;
  assert.ok(nodes > 4000, `${nodes} nós`);
  assert.ok(html.length / nodes < 1000, `${Math.round(html.length / nodes)} caracteres por nó`);
  // Com milhares de nós a árvore não anima a opacidade (as transições pesavam ~100 ms por passo).
  assert.match(html, /class="tree-view__svg tree-view__svg--large"/);
});

test("DLL no limite de passos com 100 variáveis: menos de 2 s (antes do M8.5 ~1 s, agora ~0,35 s)", () => {
  const S = random3Sat(100, 430, 1);
  const start = performance.now();
  const { result } = solveDLL(S);
  const elapsed = performance.now() - start;
  assert.equal(result.limited, true);
  assert.ok(elapsed < 2000, `${Math.round(elapsed)} ms`);
});
