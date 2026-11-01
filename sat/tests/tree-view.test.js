import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TREE_SIZES,
  truncate,
  currentNodeOf,
  layoutTree,
  treeModel,
  treeChanges,
  renderTree,
  ZOOM,
  clampZoom,
  zoomStep,
  wheelZoom,
  fitZoom,
  treeLegendMenuHtml,
} from "../js/ui/tree-view.js";
import { buildTree } from "../js/core/trace.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { getExample } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

function traceOf(text) {
  return solveDLL(parse(text).clauses).trace;
}

// p q, -p q, p -q, -p -q: insatisfazível, 3 chamadas DLL(S). No desenho cada propagação é um nó:
//   0 ─p→ 1 ┄p┄ 2 ┄q┄ 3 (F)      0 ─¬p→ 4 ┄¬p┄ 5 ┄q┄ 6 (F)
// (─ ramificação, ┄ propagação; o primeiro literal propagado é a própria cláusula unitária {l})
const FOUR = "p q, -p q, p -q, -p -q";

test("truncate: corta com reticências só acima do máximo", () => {
  assert.equal(truncate("{p, q}"), "{p, q}");
  assert.equal(truncate("abcdefghij", 5), "abcd…");
  assert.equal(truncate("abcde", 5), "abcde");
});

test("layoutTree: folhas lado a lado e o pai centrado por cima dos filhos", () => {
  const tree = buildTree(traceOf(FOUR));
  const { pos, width, height } = layoutTree(tree);
  const { nodeWidth, nodeHeight, gapX, gapY, padding } = TREE_SIZES;
  const [root, a, b] = tree.root.children.length ? [0, ...tree.root.children] : [];
  assert.equal(pos[a].y, pos[b].y);
  assert.equal(pos[a].y - pos[root].y, nodeHeight + gapY);
  assert.ok(pos[a].x < pos[b].x, "o ramo l fica à esquerda do ramo l̃");
  assert.equal(pos[root].x, (pos[a].x + pos[b].x) / 2);
  assert.equal(width, 2 * padding + 2 * nodeWidth + gapX);
  assert.equal(height, 2 * padding + 2 * nodeHeight + gapY);
});

test("layoutTree: um só nó (sem ramificações)", () => {
  const tree = buildTree(traceOf("p1, -p1 -p2, p3 p2"));
  const { pos, width } = layoutTree(tree);
  assert.equal(tree.nodes.length, 1);
  assert.deepEqual(pos[0], { x: TREE_SIZES.padding, y: TREE_SIZES.padding });
  assert.equal(width, 2 * TREE_SIZES.padding + TREE_SIZES.nodeWidth);
});

test("currentNodeOf: start → raiz, backtrack → o nó para onde se volta, result → último nó", () => {
  const trace = traceOf(FOUR);
  assert.equal(currentNodeOf(trace, 0), 0);
  const back = trace.findIndex((e) => e.type === "backtrack");
  assert.equal(currentNodeOf(trace, back), trace[back].to);
  const branch = trace.findIndex((e) => e.type === "branch");
  assert.equal(currentNodeOf(trace, branch), trace[branch].node);
  const last = trace.length - 1;
  assert.equal(trace[last].type, "result");
  assert.equal(currentNodeOf(trace, last), trace[last - 1].node);
});

test("treeModel: no início só a raiz está visitada; os ramos futuros ficam esbatidos", () => {
  const trace = traceOf(FOUR);
  const model = treeModel(trace, 0);
  assert.equal(model.nodes.length, 7);
  assert.deepEqual(model.nodes.map((n) => n.kind), ["call", "call", "unit", "unit", "call", "unit", "unit"]);
  assert.deepEqual(model.nodes.map((n) => n.visited), [true, false, false, false, false, false, false]);
  assert.deepEqual(model.nodes.map((n) => n.status), ["open", ...Array(6).fill("future")]);
  assert.ok(model.nodes[0].current);
  assert.ok(model.edges.every((e) => !e.visited));
});

test("treeModel: no fim as folhas são ✗ e a raiz insatisfazível; o clique salta para a ramificação", () => {
  const trace = traceOf(FOUR);
  const model = treeModel(trace, trace.length - 1);
  assert.ok(model.nodes.every((n) => n.status === "conflict"));
  assert.ok(model.nodes.every((n) => n.visited));
  // Nós das chamadas → a ramificação; nós de propagação → o evento unit desse literal.
  for (const node of model.nodes.slice(1)) {
    const event = trace[node.step];
    assert.equal(event.type, node.kind === "call" ? "branch" : "unit");
    assert.equal(event.node, node.call);
    assert.deepEqual(event.literal, node.literal);
  }
  assert.equal(model.nodes[0].step, 0);
  // O nó da chamada mostra S ∪ {l}; as folhas mostram o conjunto depois da última propagação: F.
  assert.deepEqual(model.nodes[1].S.at(-1), [{ v: "p", neg: false }]);
  assert.ok(model.nodes.filter((n) => n.leaf).every((n) => n.S.some((c) => c.length === 0)));
  assert.deepEqual(model.nodes.filter((n) => n.leaf).map((n) => n.id), [3, 6]);
  assert.equal(model.current, 6);
  const branches = model.edges.filter((e) => e.kind === "call");
  assert.deepEqual(branches.map((e) => [e.from, e.to, e.literal]), [
    [0, 1, { v: "p", neg: false }],
    [0, 4, { v: "p", neg: true }],
  ]);
  assert.deepEqual(model.edges.filter((e) => e.kind === "unit").map((e) => [e.from, e.to]), [[1, 2], [2, 3], [4, 5], [5, 6]]);
});

test("treeModel: cada propagação acende o seu nó; o nó atual acompanha a cadeia e o retrocesso", () => {
  const trace = traceOf(FOUR);
  const at = (index) => treeModel(trace, index);
  // 1 branch p · 2 unit p · 3 unit q · 4 conflict · 5 backtrack · 6 branch ¬p
  assert.equal(at(1).current, 1);
  assert.deepEqual(at(1).nodes.slice(1, 4).map((n) => n.visited), [true, false, false]);
  assert.equal(at(2).current, 2);
  assert.equal(at(3).current, 3);
  assert.equal(at(4).nodes[3].status, "conflict");
  assert.equal(at(4).current, 3);
  assert.equal(at(5).current, 0); // o retrocesso volta ao fim da cadeia da raiz (que não propagou nada)
  assert.equal(at(6).current, 4);
  // As arestas das propagações só ficam visitadas quando o literal é propagado.
  assert.deepEqual(at(2).edges.filter((e) => e.kind === "unit").map((e) => e.visited), [true, false, false, false]);
});

test("treeModel: propagações na raiz ficam numa cadeia antes da primeira ramificação", () => {
  const trace = traceOf("p1, -p1 -p2, p3 p2");
  const model = treeModel(trace, trace.length - 1);
  assert.deepEqual(model.nodes.map((n) => n.kind), ["call", "unit", "unit", "unit"]);
  assert.ok(model.nodes.every((n) => n.call === 0));
  assert.deepEqual(model.nodes.map((n) => n.y), [...new Set(model.nodes.map((n) => n.y))]); // um por nível
  assert.equal(new Set(model.nodes.map((n) => n.x)).size, 1); // em coluna
  assert.ok(model.nodes[3].leaf && model.nodes[3].status === "sat");
});

test("treeModel: exemplo de três variáveis (satisfazível, com retrocessos) tem uma folha sat e a raiz sat no fim", () => {
  const trace = traceOf(getExample("three-vars-e").input);
  const model = treeModel(trace, trace.length - 1);
  assert.equal(model.nodes[0].status, "sat");
  assert.ok(model.nodes.some((n) => n.leaf && n.status === "sat"));
  assert.ok(model.nodes.some((n) => n.leaf && n.status === "conflict"));
  // As folhas nunca se sobrepõem.
  const leaves = model.nodes.filter((n) => n.leaf).map((n) => n.x);
  assert.equal(new Set(leaves).size, leaves.length);
});

test("renderTree: SVG com nós clicáveis, nó atual marcado e ícones ✗ nas folhas", () => {
  setLang("pt", { silent: true });
  const trace = traceOf(FOUR);
  const html = renderTree(treeModel(trace, trace.length - 1));
  assert.match(html, /<svg class="tree-view__svg"/); // árvore pequena: com transições (sem --large)
  assert.equal((html.match(/role="button"/g) || []).length, 7);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.equal((html.match(/✗/g) || []).length, 2);
  assert.match(html, /Árvore de decisão/);
  assert.match(html, />¬p</);
  assert.match(html, /<title>Raiz: \{p ∨ q/);
  // Ramificações com pílula; propagações tracejadas, sem pílula, e nós "propagação".
  assert.equal((html.match(/tree-edge__pill/g) || []).length, 2);
  assert.equal((html.match(/class="tree-edge tree-edge--unit"/g) || []).length, 4);
  assert.equal((html.match(/>propagação<\/text>/g) || []).length, 4);
  assert.match(html, /<title>Propagação de q no nó 1: \{F\}, insatisfazível<\/title>/);
});

test("renderTree: textos em EN e trace vazio sem SVG", () => {
  setLang("en", { silent: true });
  const trace = traceOf(FOUR);
  const html = renderTree(treeModel(trace, 0));
  assert.match(html, /Decision tree/);
  assert.match(html, /not visited yet/);
  assert.match(html, /<title>Propagation of p in node 1: /);
  assert.match(html, />propagation<\/text>/);
  assert.doesNotMatch(renderTree(treeModel([], 0)), /<svg/);
  setLang("pt", { silent: true });
});

test("zoom: limites, passos de +/−, roda e ajustar à vista", () => {
  assert.equal(clampZoom(10), ZOOM.max);
  assert.equal(clampZoom(0.01), ZOOM.min);
  assert.equal(zoomStep(1, 1), 1.25);
  assert.equal(zoomStep(1.25, -1), 1);
  assert.equal(zoomStep(ZOOM.max, 1), ZOOM.max);
  assert.ok(wheelZoom(1, 100) < 1, "roda para baixo afasta");
  assert.ok(wheelZoom(1, -100) > 1, "roda para cima aproxima");
  assert.equal(wheelZoom(1, 0), 1);
  // Árvore 1000×400 numa vista 500×600: cabe a 0.5; uma árvore pequena nunca passa do tamanho real.
  assert.equal(fitZoom(1000, 400, 500, 600), 0.5);
  assert.equal(fitZoom(200, 100, 500, 600), 1);
  assert.equal(fitZoom(10000, 100, 500, 600), ZOOM.min);
  assert.equal(fitZoom(0, 0, 500, 600), 1);
});

test("renderTree: o zoom muda o tamanho do SVG mas não o viewBox; controlos desativados nos limites", () => {
  setLang("pt");
  const model = treeModel(traceOf(FOUR), 0);
  const html = renderTree(model, TREE_SIZES, 0.5);
  assert.match(html, new RegExp(`width="${model.width * 0.5}" height="${model.height * 0.5}"`));
  assert.match(html, new RegExp(`viewBox="0 0 ${model.width} ${model.height}"`));
  assert.match(html, /data-zoom="in" aria-label="Aproximar"/);
  assert.match(html, /data-zoom="fit" aria-label="Centrar a árvore"/);
  assert.doesNotMatch(html, /data-zoom="out"[^>]*disabled/);
  assert.match(renderTree(model, TREE_SIZES, ZOOM.min), /data-zoom="out"[^>]*disabled/);
  assert.match(renderTree(model, TREE_SIZES, ZOOM.max), /data-zoom="in"[^>]*disabled/);
});

test("treeLegendMenuHtml: botão só com o ícone que abre a legenda, com nós e arestas", () => {
  setLang("pt", { silent: true });
  const html = treeLegendMenuHtml();
  assert.match(html, /<details class="dd end tree-legend-menu" data-sheet-title="Legenda da árvore">/);
  assert.match(html, /<summary class="btn" data-variant="ghost" data-size="icon" aria-label="Legenda da árvore"/);
  for (const label of ["em curso", "passo atual", "conflito", "satisfazível", "por visitar", "literal escolhido", "propagação"]) {
    assert.ok(html.includes(label), label);
  }
});

test("treeModel: um ramo em F fica esbatido, menos quando tudo falhou; treeChanges diz o que mudou", () => {
  const trace = traceOf(getExample("two-branches").input);
  const conflict = trace.findIndex((e) => e.type === "conflict");
  const at = (index) => treeModel(trace, index);
  const before = at(conflict - 1);
  const after = at(conflict);
  assert.ok(!before.nodes.some((n) => n.faded));
  assert.ok(after.nodes.some((n) => n.faded));
  const changes = treeChanges(before, after);
  assert.deepEqual(changes.faded, after.nodes.filter((n) => n.faded).map((n) => n.id));
  assert.deepEqual(changes.fadedEdges.map((i) => after.edges[i].to), after.edges.filter((e) => e.faded).map((e) => e.to));
  const last = at(trace.length - 1);
  assert.equal(last.nodes[0].status, "conflict");
  assert.ok(!last.nodes.some((n) => n.faded) && !last.edges.some((e) => e.faded));
});

test("treeChanges: um passo acende um nó e uma aresta; o caminho até satisfazível é só o que dá sat", () => {
  const trace = traceOf("p q, -p q, p -q");
  const branch = trace.findIndex((e) => e.type === "branch");
  const entered = treeChanges(treeModel(trace, branch - 1), treeModel(trace, branch));
  assert.equal(entered.entered.length, 1);
  assert.equal(entered.enteredEdges.length, 1);
  const sat = trace.findIndex((e) => e.type === "sat");
  const end = treeModel(trace, sat);
  const path = treeChanges(treeModel(trace, sat - 1), end).pathEdges.map((i) => end.edges[i]);
  assert.ok(path.length > 0);
  // Da raiz à folha, sem saltos: cada aresta sai de onde a anterior chegou.
  path.reduce((from, edge) => {
    assert.equal(edge.from, from);
    return edge.to;
  }, 0);
  assert.equal(end.nodes[path.at(-1).to].status, "sat");
});
