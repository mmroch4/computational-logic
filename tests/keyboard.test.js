// Teclado (M8.2.2): setas na árvore, tabindex roving, setas no menu de exemplos e anéis de foco só
// com :focus-visible. Os eventos reais (keydown no DOM) testam-se no Chrome com o check-page (EVAL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { treeModel, treeNeighbor, renderTree } from "../js/ui/tree-view.js";
import { menuKeyTarget } from "../js/ui/menu.js";
import { segTarget } from "../js/ui/segmented.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { setLang } from "../js/ui/i18n.js";

// As 8 cláusulas com p, q, r: insatisfazível, com 7 chamadas DLL(S):
//   0 ─p→ 1 ─q→ 2, 1 ─¬q→ 3;   0 ─¬p→ 4 ─q→ 5, 4 ─¬q→ 6.
// No desenho cada chamada é seguida da cadeia das suas propagações (┄): 1 ┄p┄ •, 2 ┄q┄ • ┄r┄ •, …
// e as ramificações saem do fim da cadeia, por isso há 17 nós.
const EIGHT = "p q r, p q -r, p -q r, p -q -r, -p q r, -p q -r, -p -q r, -p -q -r";
const traceOf = (text) => solveDLL(parse(text).clauses).trace;

test("treeNeighbor: ↑ pai, ↓ primeiro filho (ramo l), ←/→ no mesmo nível, Home raiz, End nó atual", () => {
  const trace = traceOf(EIGHT);
  const model = treeModel(trace, trace.length - 1);
  assert.equal(model.nodes.length, 17);
  const parentOf = (id) => model.edges.find((e) => e.to === id)?.from ?? null;
  const callNode = (call) => model.nodes.find((n) => n.kind === "call" && n.call === call).id;
  const lastOf = (call) => model.nodes.filter((n) => n.call === call).at(-1).id;
  const [p, notP, pq, pNotQ, notPq] = [1, 4, 2, 3, 5].map(callNode);

  assert.equal(treeNeighbor(model, 0, "ArrowUp"), null);
  assert.equal(treeNeighbor(model, 0, "ArrowDown"), p); // o ramo positivo, à esquerda
  assert.equal(treeNeighbor(model, p, "ArrowUp"), 0);
  assert.equal(treeNeighbor(model, p, "ArrowRight"), notP);
  // ↓ desce pela cadeia de propagações: p ┄p┄ • e daí para o ramo q.
  const unitP = treeNeighbor(model, p, "ArrowDown");
  assert.equal(model.nodes[unitP].kind, "unit");
  assert.equal(treeNeighbor(model, unitP, "ArrowUp"), p);
  assert.equal(treeNeighbor(model, unitP, "ArrowDown"), pq);
  assert.equal(treeNeighbor(model, notP, "ArrowLeft"), p);
  assert.equal(treeNeighbor(model, notP, "ArrowRight"), null);
  // ←/→ atravessam subárvores: depois de p∧¬q vem ¬p∧q (primo, não irmão).
  assert.equal(treeNeighbor(model, pNotQ, "ArrowRight"), notPq);
  assert.equal(treeNeighbor(model, lastOf(2), "ArrowDown"), null); // folha
  assert.equal(parentOf(parentOf(notPq)), notP);
  assert.equal(treeNeighbor(model, pq, "Home"), 0);
  assert.equal(treeNeighbor(model, 0, "End"), model.current);
  assert.equal(treeNeighbor(model, 0, "Enter"), null);
  assert.equal(treeNeighbor(model, 99, "ArrowUp"), null);
});

test("renderTree: só o nó atual está na ordem do Tab (tabindex roving)", () => {
  setLang("pt", { silent: true });
  const trace = traceOf(EIGHT);
  for (const index of [0, 3, trace.length - 1]) {
    const model = treeModel(trace, index);
    const html = renderTree(model);
    const zero = [...html.matchAll(/data-node="(\d+)"[^>]*tabindex="0"/g)].map((m) => Number(m[1]));
    assert.deepEqual(zero, [model.current], `passo ${index}`);
    assert.equal((html.match(/tabindex="-1"/g) ?? []).length, model.nodes.length - 1);
  }
});

test("as dicas da árvore falam das setas (PT e EN)", () => {
  setLang("pt", { silent: true });
  assert.match(renderTree(treeModel(traceOf(EIGHT), 0)), /setas e Enter/);
  setLang("en", { silent: true });
  assert.match(renderTree(treeModel(traceOf(EIGHT), 0)), /arrow keys and Enter/);
  setLang("pt", { silent: true });
});

test("menuKeyTarget: ↓/↑ dão a volta, entram pelo primeiro/último, Home/End, outras teclas null", () => {
  assert.equal(menuKeyTarget(5, -1, "ArrowDown"), 0);
  assert.equal(menuKeyTarget(5, -1, "ArrowUp"), 4);
  assert.equal(menuKeyTarget(5, 2, "ArrowDown"), 3);
  assert.equal(menuKeyTarget(5, 4, "ArrowDown"), 0);
  assert.equal(menuKeyTarget(5, 0, "ArrowUp"), 4);
  assert.equal(menuKeyTarget(5, 3, "Home"), 0);
  assert.equal(menuKeyTarget(5, 1, "End"), 4);
  assert.equal(menuKeyTarget(5, 1, "Enter"), null);
  assert.equal(menuKeyTarget(0, -1, "ArrowDown"), null);
});

test("CSS: os anéis de foco usam :focus-visible; :focus sozinho nunca desenha um anel", () => {
  const dir = new URL("../css/", import.meta.url);
  // Só o CSS escrito à mão: o css/app.css é gerado e traz o reset do Tailwind e o Basecoat.
  const files = [...readdirSync(dir).filter((f) => f.endsWith(".css") && f !== "app.css"), "src/app.css"];
  const problems = [];
  for (const file of files) {
    const css = readFileSync(new URL(file, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const plainFocus = selectors.split(",").some((s) => /:focus(?![-\w])/.test(s));
      if (!plainFocus) continue;
      // Permitido: tirar o outline (outline: none) e mudar a cor da borda dos campos.
      const ring = body.match(/(?:^|;)\s*(outline(?:-\w+)?\s*:(?!\s*none)[^;]+|box-shadow\s*:[^;]+)/);
      // O skip-link só aparece com o foco (é esse o objetivo dele): não é um anel.
      if (ring && !/skip-link/.test(selectors)) problems.push(`${file}: ${selectors.trim()} { ${ring[1].trim()} }`);
    }
  }
  assert.deepEqual(problems, []);
});

test("segmented: ←/→ muda de segmento e dá a volta nas pontas", () => {
  assert.equal(segTarget(0, 3, "ArrowRight"), 1);
  assert.equal(segTarget(1, 3, "ArrowLeft"), 0);
  assert.equal(segTarget(2, 3, "ArrowRight"), 0);
  assert.equal(segTarget(0, 3, "ArrowLeft"), 2);
  assert.equal(segTarget(0, 3, "ArrowDown"), null);
  assert.equal(segTarget(0, 3, "Enter"), null);
});
