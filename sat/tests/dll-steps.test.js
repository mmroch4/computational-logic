import { test } from "node:test";
import assert from "node:assert/strict";

import { branch, hasEmptyClause, propagateOne, selectLiteral, units } from "../js/core/dll.js";
import { formatSet } from "../js/core/clauses.js";
import { lit } from "../js/core/literals.js";
import { parse } from "../js/core/parser.js";

function set(text) {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
}

const show = (S) => formatSet(S, "compact");

/** Propaga a primeira cláusula unitária (regra do CLAUDE.md). */
function propagateFirst(S) {
  const [first] = units(S);
  assert.ok(first, "devia haver uma cláusula unitária");
  return { literal: first.literal, ...propagateOne(S, first.literal) };
}

// Conjunto (1) da cadeia de propagações
const CHAIN_SET =
  "p1, -p1 -p2, p3 p2, -p7 p2, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7";

test("units: cláusulas unitárias pela ordem do conjunto", () => {
  assert.deepEqual(units(set("p q, -r, s, -p")), [
    { index: 1, literal: lit("r", true) },
    { index: 2, literal: lit("s") },
    { index: 3, literal: lit("p", true) },
  ]);
  assert.deepEqual(units(set("p q, -p -q")), []);
  assert.deepEqual(units([]), []);
});

test("(1) → (2) propagando p1", () => {
  const S1 = set(CHAIN_SET);
  const step = propagateFirst(S1);
  assert.deepEqual(step.literal, lit("p1"));
  assert.equal(
    show(step.after),
    "-p2, p3 p2, -p7 p2, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7",
  );
  assert.deepEqual(step.removed, [0]);
  assert.deepEqual(step.shortened, [{ idx: 1, from: S1[1], to: [lit("p2", true)] }]);
  assert.deepEqual(step.merged, []);
});

test("(2) → (3) → (4) → (5) → (6) só com propagação", () => {
  let S = propagateFirst(set(CHAIN_SET)).after;

  // (2) → (3) com ¬p2
  let step = propagateFirst(S);
  assert.deepEqual(step.literal, lit("p2", true));
  S = step.after;
  assert.equal(show(S), "p3, -p7, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7");
  assert.deepEqual(step.removed, [0]);
  assert.deepEqual(step.shortened.map((s) => s.idx), [1, 2]);

  // (3) → (4) com p3 e depois ¬p7
  const used = [];
  for (let i = 0; i < 2; i++) {
    step = propagateFirst(S);
    used.push(show([[step.literal]]));
    S = step.after;
  }
  assert.deepEqual(used, ["p3", "-p7"]);
  assert.equal(show(S), "p4, p5, -p4 -p q, -p5 -p6 r, -p -q p6, p, -r");

  // (4) → (5) com outra ordem válida (p4, p5, ¬r, p).
  // À mão pode escolher-se livremente; a regra "primeira unitária" usaria q antes de ¬r.
  const S4 = S;
  for (const l of [lit("p4"), lit("p5"), lit("r", true), lit("p")]) S = propagateOne(S, l).after;
  assert.equal(show(S), "q, -p6, -q p6");

  // Com a regra da ferramenta (primeira unitária) o caminho é outro, mas também acaba em {F}.
  let T = S4;
  used.length = 0;
  while (units(T).length > 0 && !hasEmptyClause(T)) {
    step = propagateFirst(T);
    used.push(show([[step.literal]]));
    T = step.after;
  }
  assert.deepEqual(used, ["p4", "p5", "p", "q", "p6", "r"]);
  assert.deepEqual(T, [[]]);
  assert.equal(hasEmptyClause(S), false);

  // (5) → (6) com q e ¬p6
  S = propagateFirst(S).after;
  S = propagateFirst(S).after;
  assert.deepEqual(S, [[]]);
  assert.equal(formatSet(S), "{F}");
  assert.equal(hasEmptyClause(S), true);
});

test("propagateOne: cláusula encurtada que fica igual a outra colapsa (merged)", () => {
  const S = set("q, -p q, p r");
  const step = propagateOne(S, lit("p"));
  assert.equal(show(step.after), "q");
  assert.deepEqual(step.removed, [2]);
  assert.deepEqual(step.shortened.map((s) => s.idx), [1]);
  assert.deepEqual(step.merged, [1]);
});

test("propagateOne: não altera S e as outras cláusulas ficam na mesma ordem", () => {
  const S = set("a b, -p c, d");
  const copy = structuredClone(S);
  const step = propagateOne(S, lit("p"));
  assert.deepEqual(S, copy);
  assert.equal(show(step.after), "a b, c, d");
  assert.deepEqual(step.removed, []);
});

test("propagateOne: l̃ sozinho dá F", () => {
  const step = propagateOne(set("p, -p"), lit("p"));
  assert.deepEqual(step.after, [[]]);
  assert.ok(hasEmptyClause(step.after));
});

test("hasEmptyClause", () => {
  assert.equal(hasEmptyClause([]), false);
  assert.equal(hasEmptyClause(set("p, F")), true);
  assert.equal(hasEmptyClause(set("p q")), false);
});

test("selectLiteral: ordem alfabética natural, positivo primeiro", () => {
  assert.deepEqual(selectLiteral(set("-p11 q, -p2")), lit("p2"));
  assert.deepEqual(selectLiteral(set("-q -r, -r s")), lit("q"));
  assert.deepEqual(selectLiteral(set("-x10, x9 y")), lit("x9"));
  assert.equal(selectLiteral([]), null);
  assert.equal(selectLiteral([[]]), null);
});

test("branch: S ∪ {l} acrescenta {l} no fim ", () => {
  const S7 = set("-p -q, -p q, p -q, p q");
  const withNotP = branch(S7, lit("p", true));
  assert.equal(show(withNotP), "-p -q, -p q, p -q, p q, -p");
  assert.equal(show(S7), "-p -q, -p q, p -q, p q", "S não é alterado");
  assert.equal(show(branch(withNotP, lit("p", true))), show(withNotP), "{l} já presente");
});

test("(7) com ¬p e com p acaba em {¬q, q} ⇒ {F}", () => {
  const S7 = set("-p -q, -p q, p -q, p q");
  for (const l of [lit("p", true), lit("p")]) {
    let S = branch(S7, l);
    S = propagateFirst(S).after;
    assert.deepEqual(S.map((c) => show([c])).sort(), ["-q", "q"]);
    S = propagateFirst(S).after;
    assert.deepEqual(S, [[]]);
  }
});
