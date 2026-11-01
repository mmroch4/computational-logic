import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { FLOW_NODES, FLOW_EDGES, flowchartModel, callOf } from "../js/core/flowchart.js";
import { playerTrace, renderDllPlayer, renderFlowchart } from "../js/ui/dll-player.js";
import { renderPseudocode } from "../js/ui/pseudocode-view.js";
import { setLang } from "../js/ui/i18n.js";

const traceOf = (text) => solveDLL(parse(text).clauses).trace;
const NODE_IDS = FLOW_NODES.map((n) => n.id);
const EDGE_IDS = FLOW_EDGES.map((e) => e.id);

test("flowchartModel: dois ramos, caixa atual em cada passo", () => {
  const { trace } = playerTrace();
  const current = trace.map((_, i) => flowchartModel(trace, i).current);
  // start, ramo p, propaga p, propaga ¬q, F, backtrack, ramo ¬p, propaga ¬p, propaga ¬q, F, result
  assert.deepEqual(current, [
    "call", "tryL", "propagate", "propagate", "unsat", "tryL", "tryNotL", "propagate", "propagate", "unsat", "tryNotL",
  ]);
  // O resultado final é insatisfazível, devolvido pelo else da raiz.
  assert.equal(flowchartModel(trace, trace.length - 1).rule, "conflict");
});

test("flowchartModel: só usa caixas e setas que existem, e a atual está no caminho", () => {
  for (const text of ["-p -q, -p q, p -q, p q", "p q, -p, -q r", "p, -p", "p q r, -p -q -r, p -q -r, p q -r, -p q, -p r, p -q r"]) {
    const trace = traceOf(text);
    trace.forEach((_, i) => {
      const m = flowchartModel(trace, i);
      for (const n of m.nodes) assert.ok(NODE_IDS.includes(n), n);
      for (const e of m.edges) assert.ok(EDGE_IDS.includes(e), e);
      if (m.current) assert.ok(m.nodes.includes(m.current));
    });
  }
});

test("flowchartModel: ramificação acende o caminho desde a propagação até DLL(S ∪ {l}) e a recursão", () => {
  const trace = traceOf("-p -q, -p q, p -q, p q");
  const m = flowchartModel(trace, 1);
  assert.deepEqual(m.edges, ["propagate-isEmpty", "isEmpty-hasF", "hasF-select", "select-tryL", "tryL-call"]);
  assert.deepEqual(flowchartModel(trace, 6).edges, ["tryNotL-call"]);
});

test("flowchartModel: resultado sem ramificar sai pelas caixas do topo; com 1.º ramo sat pelo then", () => {
  const empty = traceOf("p, -p q");
  assert.equal(flowchartModel(empty, empty.length - 1).current, "sat");
  const conflict = traceOf("p, -p");
  assert.equal(flowchartModel(conflict, conflict.length - 1).current, "unsat");
  const firstBranch = traceOf("p q, -p q");
  assert.equal(flowchartModel(firstBranch, firstBranch.length - 1).current, "thenSat");
  assert.deepEqual(flowchartModel([], 0), { current: null, nodes: [], edges: [], rule: null });
});

test("callOf: profundidade e literais do caminho", () => {
  const { trace } = playerTrace();
  assert.deepEqual(callOf(trace, 0), { node: 0, depth: 0, literals: [] });
  assert.deepEqual(callOf(trace, 2).literals, [{ v: "p", neg: false }]);
  assert.equal(callOf(trace, 5).depth, 0); // backtrack: voltámos à raiz
  assert.deepEqual(callOf(trace, 8).literals, [{ v: "p", neg: true }]);
  assert.equal(callOf(trace, trace.length - 1).depth, 0);
  // Dois níveis: ramo ¬p e depois q.
  const deep = traceOf("p q r, -p -q -r, p -q -r, p q -r, -p q, -p r, p -q r");
  assert.equal(Math.max(...deep.map((_, i) => callOf(deep, i).depth)), 2);
});

test("renderFlowchart: todas as caixas e setas, atual marcada, cor da regra", () => {
  setLang("pt", { silent: true });
  const { trace } = playerTrace();
  const svg = renderFlowchart(flowchartModel(trace, 4));
  assert.equal((svg.match(/data-node=/g) || []).length, FLOW_NODES.length);
  assert.equal((svg.match(/data-edge=/g) || []).length, FLOW_EDGES.length);
  assert.match(svg, /class="flow rule-conflict"/);
  assert.match(svg, /flow__node--terminal is-path is-current" data-node="unsat"/);
  assert.match(svg, /S contém F\?/);
  // O ∪ vem num <tspan> próprio: o que importa é o texto que se lê.
  assert.match(svg.replace(/<\/?tspan[^>]*>/g, ""), /return DLL\(S ∪ \{l̃\}\)/);
});

test("renderDllPlayer: controlos, contador, explicação e cartões; EN traduz", () => {
  setLang("pt", { silent: true });
  const { S, trace } = playerTrace();
  const first = renderDllPlayer({ S, trace, index: 0 });
  assert.match(first, /data-action="prev" aria-disabled="true"/);
  assert.match(first, /Passo 1 de 11/);
  assert.match(first, /Chamada inicial DLL\(S\)/);
  const branch = renderDllPlayer({ S, trace, index: 1 });
  assert.match(branch, /Chamada recursiva \(profundidade 1\), ramo/);
  assert.match(branch, /clause new/);
  const last = renderDllPlayer({ S, trace, index: trace.length - 1 });
  assert.match(last, /data-action="next" aria-disabled="true"/);
  setLang("en", { silent: true });
  assert.match(renderDllPlayer({ S, trace, index: 0 }), /Step 1 of 11/);
  assert.match(renderFlowchart(flowchartModel(trace, 0)), /S contains F\?/);
  setLang("pt", { silent: true });
});

test("renderPseudocode: headingLevel muda o título (h3 no Aprender)", () => {
  setLang("pt", { silent: true });
  const html = renderPseudocode({ rule: null, lines: [], explanation: null }, { headingLevel: 3 });
  assert.match(html, /<h3 class="pseudocode__heading"/);
  assert.doesNotMatch(html, /is-current/);
});
