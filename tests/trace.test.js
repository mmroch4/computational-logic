import { test } from "node:test";
import assert from "node:assert/strict";

import { hasEmptyClause, propagateOne, solveDLL, units } from "../js/core/dll.js";
import { formatSet } from "../js/core/clauses.js";
import { sameLiteral } from "../js/core/literals.js";
import { getExample } from "../js/core/examples.js";
import { parse } from "../js/core/parser.js";
import { buildTree, proofSteps, valuationAt } from "../js/core/trace.js";

function set(text) {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
}

const show = (S) => formatSet(S, "compact");
const litText = (l) => show([[l]]);
const traceOf = (text) => solveDLL(set(text)).trace;

test("proofSteps: cadeia de propagações tem os literais certos (ordem pela posição no conjunto)", () => {
  const steps = proofSteps(traceOf(getExample("propagation-chain").input));
  const literals = steps.filter((s) => s.kind === "unit").map((s) => litText(s.literal));

  // À mão: p1, ¬p2, p3, ¬p7, depois p4, p5, ¬r, p, depois q, ¬p6 → F.
  // Até ao conjunto (4) a ordem é a mesma; depois a regra "primeira unitária pela ordem do
  // conjunto" escolhe p antes de ¬r (p está antes de ¬r em (4)) e a propagação de p torna q
  // unitária. À mão podem agrupar-se; aqui aplicamos um literal de cada vez: p4, p5, p, q, p6, r.
  assert.deepEqual(literals.slice(0, 6), ["p1", "-p2", "p3", "-p7", "p4", "p5"]);
  assert.deepEqual(literals, ["p1", "-p2", "p3", "-p7", "p4", "p5", "p", "q", "p6", "r"]);

  // Os conjuntos (1), (2), (3) e (4) aparecem tal e qual nos passos.
  const sets = steps.filter((s) => s.n !== null).map((s) => show(s.S));
  assert.equal(sets[0], show(set(getExample("propagation-chain").input)));
  assert.equal(sets[1], "-p2, p3 p2, -p7 p2, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7");
  assert.equal(sets[2], "p3, -p7, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7");
  assert.equal(sets[4], "p4, p5, -p4 -p q, -p5 -p6 r, -p -q p6, p, -r");

  // Acaba em F, sem ramificações (só propagação).
  assert.equal(steps.at(-1).kind, "conflict");
  assert.ok(hasEmptyClause(steps.at(-1).S));
  assert.equal(steps.filter((s) => s.kind === "branch").length, 0);
  assert.deepEqual(steps.map((s) => s.n).filter((n) => n !== null), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test("outra ordem válida (p4, p5, ¬r, p, q, ¬p6) também chega a F a partir de (4)", () => {
  // Confirma que as duas ordens são válidas: cada literal é unitário quando é aplicado.
  let S = set("p4, p5, -p4 -p q, -p5 -p6 r, -p -q p6, p, -r");
  for (const text of ["p4", "p5", "-r", "p", "q", "-p6"]) {
    const l = set(text)[0][0];
    assert.ok(units(S).some((u) => sameLiteral(u.literal, l)), `${text} não é unitária em ${show(S)}`);
    S = propagateOne(S, l).after;
  }
  assert.ok(hasEmptyClause(S));
});

test("proofSteps: cada passo unitário usa a primeira unitária do conjunto anterior", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  for (const e of trace.filter((e) => e.type === "unit")) {
    assert.ok(sameLiteral(units(e.before)[0].literal, e.literal));
  }
});

test("proofSteps: dois ramos (ramos, retrocesso, profundidade)", () => {
  const steps = proofSteps(traceOf("-p -q, -p q, p -q, p q"));
  const summary = steps.map((s) =>
    [s.n ?? "-", s.kind, s.literal ? litText(s.literal) : null, s.depth].filter((x) => x !== null).join(" "),
  );
  assert.deepEqual(summary, [
    "1 start 0",
    "2 branch p 1",
    "3 unit p 1", // S ∪ {p} tem a unitária {p}, que é propagada primeiro
    "4 unit -q 1",
    "- conflict 1",
    "- backtrack -p 0",
    "5 branch -p 1",
    "6 unit -p 1",
    "7 unit -q 1", // {¬q, q} ⇒ {F}
    "- conflict 1",
  ]);
  // Ramo ¬p: S ∪ {¬p} e, depois de propagar ¬p, {¬q, q}.
  assert.equal(show(steps[6].S), "-p -q, -p q, p -q, p q, -p");
  assert.equal(show(steps[7].S), "-q, q");
  // O índice aponta para o evento certo do trace.
  const trace = traceOf("-p -q, -p q, p -q, p q");
  for (const s of steps) assert.equal(trace[s.index].type, s.kind);
});

test("proofSteps: satisfazível termina em sat com a valoração", () => {
  const steps = proofSteps(traceOf("-p q, -p -q r, -p, -r"));
  const last = steps.at(-1);
  assert.equal(last.kind, "sat");
  assert.equal(last.S.length, 0);
  assert.deepEqual(last.assignment, { p: false, r: false });
});

test("proofSteps: limite de passos aparece como passo sem número", () => {
  const { trace } = solveDLL(set("-p -q, -p q, p -q, p q"), { maxSteps: 2 });
  const steps = proofSteps(trace);
  assert.equal(steps.at(-1).kind, "limit");
  assert.equal(steps.at(-1).n, null);
});

test("buildTree: dois ramos tem raiz com dois filhos em conflito", () => {
  const { root, nodes } = buildTree(traceOf("-p -q, -p q, p -q, p q"));
  assert.equal(root.id, 0);
  assert.equal(root.literal, null);
  assert.deepEqual(root.children, [1, 2]);
  assert.equal(litText(nodes[1].literal), "p");
  assert.equal(litText(nodes[2].literal), "-p");
  assert.equal(nodes[1].parent, 0);
  assert.equal(nodes[1].depth, 1);
  assert.deepEqual(nodes[1].units.map(litText), ["p", "-q"]);
  assert.equal(show(nodes[1].final), "F");
  assert.equal(nodes[1].status, "conflict");
  assert.equal(nodes[2].status, "conflict");
  assert.equal(root.status, "conflict");
});

test("buildTree: ramo p falha, no ¬p escolhe q e os dois falham", () => {
  const { root, nodes } = buildTree(traceOf(getExample("three-vars-a").input));
  const [p, notP] = root.children.map((id) => nodes[id]);
  assert.equal(litText(p.literal), "p");
  assert.equal(p.status, "conflict");
  assert.equal(litText(notP.literal), "-p");
  assert.equal(notP.children.length, 2);
  assert.deepEqual(notP.children.map((id) => litText(nodes[id].literal)), ["q", "-q"]);
  assert.ok(notP.children.every((id) => nodes[id].status === "conflict"));
  assert.equal(notP.status, "conflict");
  assert.equal(root.status, "conflict");
});

test("buildTree: satisfazível marca o caminho até à folha sat", () => {
  const { root, nodes } = buildTree(traceOf("-p q r, p q r, p q -r, p -q r, p -q -r"));
  assert.equal(root.status, "sat");
  const satLeaves = nodes.filter((n) => n.children.length === 0 && n.status === "sat");
  assert.equal(satLeaves.length, 1);
  // Do nó sat até à raiz, todos estão "sat".
  for (let node = satLeaves[0]; node; node = node.parent === null ? null : nodes[node.parent]) {
    assert.equal(node.status, "sat");
  }
});

test("buildTree: só propagação dá uma árvore com um nó", () => {
  const { root, nodes } = buildTree(traceOf(getExample("propagation-chain").input));
  assert.equal(nodes.length, 1);
  assert.equal(root.units.length, 10);
  assert.equal(root.status, "conflict");
});

test("buildTree(trace, upTo): árvore parcial com nós ainda abertos", () => {
  const trace = traceOf("-p -q, -p q, p -q, p q");
  // Até ao branch p (índice 1): raiz aberta, filho p aberto.
  let tree = buildTree(trace, 1);
  assert.equal(tree.nodes.length, 2);
  assert.equal(tree.root.status, "open");
  assert.equal(tree.nodes[1].status, "open");
  // Até ao 1.º conflito: o filho p falhou, mas a raiz ainda está aberta.
  const firstConflict = trace.findIndex((e) => e.type === "conflict");
  tree = buildTree(trace, firstConflict);
  assert.equal(tree.nodes[1].status, "conflict");
  assert.equal(tree.root.status, "open");
  // Os eventos de cada nó apontam para o trace.
  assert.deepEqual(tree.nodes[1].events, [1, 2, 3, 4]);
});

test("buildTree e proofSteps: casos extremos {} e {F}", () => {
  let tree = buildTree(traceOf("{}"));
  assert.equal(tree.root.status, "sat");
  assert.deepEqual(proofSteps(traceOf("{}")).map((s) => s.kind), ["start", "sat"]);
  tree = buildTree(traceOf("{F}"));
  assert.equal(tree.root.status, "conflict");
  assert.deepEqual(proofSteps(traceOf("{F}")).map((s) => s.kind), ["start", "conflict"]);
});

// --- valuationAt ---

const MIXED = "s p -q, -p -q -r, -s p -q, -s -p q, -s p -r, -s -q r, s";
const compact = (entries) => entries.map((e) => `${e.variable}=${e.value === null ? "?" : e.value ? "V" : "F"}${e.isNew ? "*" : ""}`).join(" ");

test("valuationAt: sem valores no passo 0, por ordem alfabética natural", () => {
  assert.equal(compact(valuationAt(traceOf("p11 p2, -p2"), 0)), "p2=? p11=?");
});

test("valuationAt: propagação e ramificação acumulam, e o último valor é o novo", () => {
  const trace = traceOf(MIXED);
  const at = (type, n = 0) => trace.map((e, i) => [e, i]).filter(([e]) => e.type === type)[n][1];
  assert.equal(compact(valuationAt(trace, at("unit"))), "p=? q=? r=? s=V*");
  assert.equal(compact(valuationAt(trace, at("branch"))), "p=V* q=? r=? s=V");
});

test("valuationAt: o retrocesso desfaz o ramo que falhou, e o 2.º ramo não herda os valores dele", () => {
  const trace = traceOf(MIXED);
  const back = trace.findIndex((e) => e.type === "backtrack");
  assert.equal(compact(valuationAt(trace, back - 1)).includes("q=V"), true);
  assert.equal(compact(valuationAt(trace, back)), "p=? q=? r=? s=V");
  assert.equal(compact(valuationAt(trace, back + 1)), "p=F* q=? r=? s=V");
});

test("valuationAt: no fim satisfazível fica a valoração do ramo, igual à do DLL", () => {
  const { trace, result } = solveDLL(parse(MIXED).clauses);
  const last = valuationAt(trace, trace.length - 1);
  for (const { variable, value } of last) assert.equal(value, result.assignment[variable], variable);
  assert.equal(last.filter((e) => e.isNew).length, 1);
});

test("valuationAt: no fim insatisfazível sobra só o caminho da raiz, e nenhum valor é novo", () => {
  const trace = traceOf("p q, -p q, p -q, -p -q");
  assert.equal(compact(valuationAt(trace, trace.length - 1)), "p=? q=?");
});

test("valuationAt: em todos os passos, o caminho atual nunca dá dois valores à mesma variável", () => {
  for (const text of [MIXED, "p q, -p q, p -q, -p -q", "a b c, -a b, -b c, -c a, -a -b -c"]) {
    const trace = traceOf(text);
    trace.forEach((_, i) => {
      const entries = valuationAt(trace, i);
      assert.equal(new Set(entries.map((e) => e.variable)).size, entries.length);
      assert.ok(entries.filter((e) => e.isNew).length <= 1, `passo ${i}`);
    });
  }
});
