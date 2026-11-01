import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_MAX_STEPS, solveDLL } from "../js/core/dll.js";
import { formatSet } from "../js/core/clauses.js";
import { lit } from "../js/core/literals.js";
import { parse } from "../js/core/parser.js";

function set(text) {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
}

const show = (S) => formatSet(S, "compact");
const litText = (l) => show([[l]]);

/** Todas as cláusulas têm um literal verdadeiro na valoração? */
function satisfies(S, assignment) {
  return S.every((clause) => clause.some((l) => l.v in assignment && assignment[l.v] === !l.neg));
}

/** Resumo legível do trace: "unit p1@0", "branch p@1<0", … */
function summary(trace) {
  return trace.map((e) => {
    switch (e.type) {
      case "unit":
        return `unit ${litText(e.literal)}@${e.node}`;
      case "branch":
        return `branch ${litText(e.literal)}@${e.node}<${e.parent}`;
      case "backtrack":
        return `backtrack ${litText(e.literal)}@${e.node}>${e.to}`;
      case "conflict":
      case "sat":
        return `${e.type}@${e.node}`;
      default:
        return e.type;
    }
  });
}

// Os 10 conjuntos de referência com o resultado esperado.
const RESUME = [
  ["p1, -p1 -p2, p3 p2, -p7 p2, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7", false],
  ["-p -q, -p q, p -q, p q", false],
  ["p q r, -p -q -r, p -q -r, p q -r, -p q, -p r, p -q r", false],
  ["-p q r, p q r, p q -r, p -q r, p -q -r", true],
  ["p -q -r, -p q r, -p q r, -p q, -p r", true],
  ["p -q r, -p q r, p -q -r, -p q -r, -p -q -r", true],
  ["p -q -r, -p q r, -p -q -r, -p -q r, -p q -r, p q -r", true],
  ["p11 p12, p21 p22, p31 p32, -p11 -p21, -p11 -p31, -p21 -p31, -p12 -p22, -p12 -p32, -p22 -p32", false],
  ["-p q, -p -q r, -p, -r", true],
  ["s p -q, -p -q -r, -s p -q, -s -p q, -s p -r, -s -q r, s", true],
];

test("os 10 conjuntos de referência: resultado certo e modelo válido", () => {
  for (const [text, expected] of RESUME) {
    const S = set(text);
    const { trace, result } = solveDLL(S);
    assert.equal(result.sat, expected, text);
    assert.equal(trace[0].type, "start");
    assert.equal(trace.at(-1), result);
    if (expected) assert.ok(satisfies(S, result.assignment), `modelo inválido: ${text}`);
    else assert.equal(result.assignment, null);
  }
});

test("cadeia de propagações: só propagação (primeira unitária) até F, sem ramificar", () => {
  const { trace, result } = solveDLL(set(RESUME[0][0]));
  assert.deepEqual(summary(trace), [
    "start",
    ...["p1", "-p2", "p3", "-p7", "p4", "p5", "p", "q", "p6", "r"].map((l) => `unit ${l}@0`),
    "conflict@0",
    "result",
  ]);
  assert.deepEqual(result.stats, { units: 10, branches: 0, conflicts: 1, nodes: 1, maxDepth: 0 });
  // O 1.º passo é o (1) → (2).
  const first = trace[1];
  assert.equal(first.clauseIndex, 0);
  assert.deepEqual(first.removed, [0]);
  assert.equal(first.shortened[0].idx, 1);
  assert.equal(show(first.after).startsWith("-p2, p3 p2"), true);
});

test("dois ramos: ramo p falha, backtrack, ramo ¬p falha", () => {
  const { trace, result } = solveDLL(set(RESUME[1][0]));
  assert.deepEqual(summary(trace), [
    "start",
    "branch p@1<0",
    "unit p@1",
    "unit -q@1",
    "conflict@1",
    "backtrack -p@1>0",
    "branch -p@2<0",
    "unit -p@2",
    "unit -q@2",
    "conflict@2",
    "result",
  ]);
  assert.equal(result.sat, false);
  assert.deepEqual(result.stats, { units: 4, branches: 2, conflicts: 2, nodes: 3, maxDepth: 1 });
  const branchP = trace[1];
  assert.equal(branchP.depth, 1);
  assert.equal(show(branchP.after), "-p -q, -p q, p -q, p q, p");
  assert.equal(branchP.before, trace[0].S);
});

test("três variáveis: ids em pré-ordem e backtrack aponta o primeiro filho", () => {
  const { trace, result } = solveDLL(set(RESUME[2][0]));
  const shape = summary(trace).filter((s) => !s.startsWith("unit"));
  assert.deepEqual(shape, [
    "start",
    "branch p@1<0",
    "conflict@1",
    "backtrack -p@1>0",
    "branch -p@2<0",
    "branch q@3<2",
    "conflict@3",
    "backtrack -q@3>2",
    "branch -q@4<2",
    "conflict@4",
    "result",
  ]);
  assert.equal(trace.find((e) => e.node === 3 && e.type === "branch").depth, 2);
  assert.equal(result.stats.maxDepth, 2);
  assert.equal(result.stats.nodes, 5);
});

test("modelo único: o modelo é o único (s V, p F, q F, r F)", () => {
  const { result } = solveDLL(set(RESUME[9][0]));
  assert.deepEqual(result.assignment, { s: true, p: false, q: false, r: false });
});

test("só propagação até ao conjunto vazio", () => {
  const { trace, result } = solveDLL(set(RESUME[8][0]));
  assert.deepEqual(summary(trace), ["start", "unit -p@0", "unit -r@0", "sat@0", "result"]);
  assert.deepEqual(result.assignment, { p: false, r: false });
  assert.deepEqual(trace.at(-2).S, []);
});

test("cada evento encadeia: o before de um passo é o after/S do anterior no mesmo ramo", () => {
  const { trace } = solveDLL(set(RESUME[7][0]));
  const current = new Map(); // nó → conjunto atual
  for (const e of trace) {
    if (e.type === "start") current.set(e.node, e.S);
    if (e.type === "branch") {
      assert.equal(e.before, current.get(e.parent));
      current.set(e.node, e.after);
    }
    if (e.type === "unit") {
      assert.equal(e.before, current.get(e.node));
      current.set(e.node, e.after);
    }
    if (e.type === "conflict" || e.type === "sat") assert.equal(e.S, current.get(e.node));
  }
});

test("casos limite: {} é satisfazível, {F} é insatisfazível, sem passos", () => {
  let { trace, result } = solveDLL([]);
  assert.deepEqual(summary(trace), ["start", "sat@0", "result"]);
  assert.equal(result.sat, true);
  assert.deepEqual(result.assignment, {});

  ({ trace, result } = solveDLL([[]]));
  assert.deepEqual(summary(trace), ["start", "conflict@0", "result"]);
  assert.equal(result.sat, false);
});

test("tautologias não são removidas: p ∨ ¬p obriga a ramificar", () => {
  const { trace, result } = solveDLL(set("p -p"));
  assert.equal(result.sat, true);
  assert.deepEqual(summary(trace), ["start", "branch p@1<0", "unit p@1", "sat@1", "result"]);
});

test("limite de passos: evento limit e resultado indeterminado", () => {
  const S = set(RESUME[7][0]);
  const full = solveDLL(S);
  const { trace, result } = solveDLL(S, { maxSteps: 5 });
  assert.equal(trace.length, 1 + 5 + 2);
  assert.deepEqual(trace.at(-2), { type: "limit", steps: 5 });
  assert.equal(result.sat, null);
  assert.equal(result.limited, true);
  assert.deepEqual(trace.slice(0, 6), full.trace.slice(0, 6));
  assert.ok(DEFAULT_MAX_STEPS >= 1000);
  // Com limite igual ao nº exato de passos não há corte.
  const exact = full.trace.length - 2;
  assert.equal(solveDLL(S, { maxSteps: exact }).result.limited, undefined);
});

test("determinista e sem alterar S", () => {
  const S = set(RESUME[2][0]);
  const copy = structuredClone(S);
  const a = solveDLL(S);
  const b = solveDLL(S);
  assert.deepEqual(a, b);
  assert.deepEqual(S, copy);
  assert.deepEqual(a.trace[1].literal, lit("p"));
});
