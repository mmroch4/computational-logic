import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HEURISTICS,
  POLARITIES,
  chooseVariable,
  compareBranchOrder,
  makeSelectLiteral,
  occurrences,
  scores,
} from "../js/core/heuristics.js";
import { selectLiteral, solveDLL } from "../js/core/dll.js";
import { EXAMPLES } from "../js/core/examples.js";
import { generateFormula } from "../js/core/generator.js";
import { bruteForceSat, evaluate } from "../js/core/verify.js";
import { lit } from "../js/core/literals.js";
import { parse } from "../js/core/parser.js";

function set(text) {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
}

const example = (id) => set(EXAMPLES.find((ex) => ex.id === id).input);

test("occurrences conta p e ¬p em separado (e só um tamanho, se pedido)", () => {
  const S = set("p q, -p q r, -q");
  assert.deepEqual(occurrences(S), { p: { pos: 1, neg: 1 }, q: { pos: 2, neg: 1 }, r: { pos: 1, neg: 0 } });
  assert.deepEqual(occurrences(S, 2), { p: { pos: 1, neg: 0 }, q: { pos: 1, neg: 0 }, r: { pos: 0, neg: 0 } });
});

test("os critérios escolhem a variável certa", () => {
  // q ocorre mais vezes (3); p tem o produto máximo (2·1 = 2 contra 2·0 de r); r está na cláusula mais curta.
  const S = set("p q s, p q -s, -p q t, r u, -s -t -u");
  assert.equal(chooseVariable(S, "alphabetical"), "p");
  assert.equal(chooseVariable(S, "occurrences"), "p"); // p e q com 3: empate → alfabética
  assert.equal(chooseVariable(set("q a, q b, -q c, p d"), "occurrences"), "q");
  // Produto: q tem 2·1 = 2; p e r só aparecem com um sinal (produto 0).
  assert.equal(chooseVariable(set("p q, p r, -q r, q s"), "product"), "q");
  assert.equal(chooseVariable(S, "shortest"), "r");
  assert.deepEqual(scores(S, "product").find((s) => s.v === "s"), { v: "s", score: 2 });
});

test("empates ficam com a primeira variável por ordem alfabética natural (p2 < p11)", () => {
  const S = set("p11 p2, -p11 -p2");
  for (const h of HEURISTICS) assert.equal(chooseVariable(S, h), "p2");
  assert.equal(chooseVariable([], "occurrences"), null);
});

test("makeSelectLiteral dá o sinal do ramo; alfabética + positivo = select_literal da ferramenta", () => {
  const S = example("three-vars-b");
  assert.deepEqual(makeSelectLiteral("alphabetical", "negative")(S), lit("p", true));
  assert.deepEqual(makeSelectLiteral("alphabetical", "positive")(S), selectLiteral(S));
  for (const ex of EXAMPLES) {
    const S = set(ex.input);
    assert.deepEqual(
      solveDLL(S, { selectLiteral: makeSelectLiteral() }).trace,
      solveDLL(S).trace,
      ex.id,
    );
  }
});

test("dois ramos: ¬p primeiro ou p primeiro dá a mesma árvore de 3 nós", () => {
  const { negative, positive, smaller } = compareBranchOrder(example("two-branches"));
  assert.equal(smaller, "same");
  assert.equal(negative.result.stats.nodes, 3);
  assert.equal(positive.result.stats.nodes, 3);
  // O primeiro ramo é ¬p e o segundo p.
  const branches = negative.trace.filter((e) => e.type === "branch").map((e) => e.literal);
  assert.deepEqual(branches, [lit("p", true), lit("p", false)]);
});

test("exemplos da lição: o sinal e o critério mudam o tamanho da árvore", () => {
  const nodes = (id, h) => {
    const c = compareBranchOrder(example(id), h);
    return [c.negative.result.stats.nodes, c.positive.result.stats.nodes, c.smaller];
  };
  assert.deepEqual(nodes("three-vars-b", "alphabetical"), [6, 3, "positive"]);
  assert.deepEqual(nodes("three-vars-e", "alphabetical"), [3, 6, "negative"]);
  assert.deepEqual(nodes("extra-8-vars", "alphabetical"), [4, 6, "negative"]);
  assert.deepEqual(nodes("extra-8-vars", "shortest"), [4, 3, "positive"]);
});

test("qualquer critério e sinal dá a resposta certa (força bruta) e uma valoração que satisfaz", () => {
  const sets = EXAMPLES.map((ex) => set(ex.input));
  for (let seed = 1; seed <= 150; seed++) sets.push(generateFormula({ seed, vars: 4, clauses: 8 }).clauses);
  for (const S of sets) {
    const expected = bruteForceSat(S).sat;
    for (const h of HEURISTICS) {
      for (const p of POLARITIES) {
        const { result } = solveDLL(S, { selectLiteral: makeSelectLiteral(h, p) });
        assert.equal(result.sat, expected);
        // A valoração do DLL só tem as variáveis fixadas, mas já chega para satisfazer todas as cláusulas.
        if (result.sat) assert.equal(evaluate(S, result.assignment), true);
      }
    }
  }
});

test("num conjunto insatisfazível o sinal não muda o tamanho da árvore (só a ordem)", () => {
  let checked = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const S = generateFormula({ seed, vars: 4, clauses: 12 }).clauses;
    if (bruteForceSat(S).sat) continue;
    checked++;
    for (const h of HEURISTICS) assert.equal(compareBranchOrder(S, h).smaller, "same");
  }
  assert.ok(checked > 10, `poucos insatisfazíveis: ${checked}`);
});
