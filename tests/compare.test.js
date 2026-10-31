import { test } from "node:test";
import assert from "node:assert/strict";

import { compareAlgorithms, runSummary, setSizes } from "../js/core/compare.js";
import { solveDLL } from "../js/core/dll.js";
import { solveDP } from "../js/core/dp.js";
import { EXAMPLES } from "../js/core/examples.js";
import { parse } from "../js/core/parser.js";

function set(text) {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
}

/** Relógio falso: cada leitura avança 1 ms. */
function fakeClock() {
  let t = 0;
  return () => (t += 1);
}

test("dois ramos: o DLL ramifica e volta atrás, o DP resolve p de uma vez", () => {
  const out = compareAlgorithms(set("-p -q, -p q, p -q, p q"), { timing: false });
  // DLL: S ∪ {p} (5), propaga ¬q e chega a F; depois S ∪ {¬p} (5), propaga ¬q e chega a F.
  assert.deepEqual(out.dll.sizes, [4, 5, 2, 1, 5, 2, 1]);
  assert.equal(out.dll.steps, 6);
  assert.equal(out.dll.maxSize, 5);
  // DP: elimina p → {¬q, q}; propaga ¬q → {F}.
  assert.deepEqual(out.dp.sizes, [4, 2, 1]);
  assert.equal(out.dp.steps, 2);
  assert.equal(out.dp.maxSize, 4);
  assert.equal(out.dll.result.sat, false);
  assert.equal(out.dp.result.sat, false);
  assert.equal(out.dll.ms, null);
});

test("cadeia de propagações: só propagações, os dois fazem os mesmos passos", () => {
  const out = compareAlgorithms(set(EXAMPLES.find((e) => e.id === "propagation-chain").input), { timing: false });
  assert.deepEqual(out.dll.sizes, out.dp.sizes);
  assert.equal(out.dll.steps, 10);
});

test("os passos contam as operações que mudam S e batem com as estatísticas dos dois algoritmos", () => {
  for (const example of EXAMPLES) {
    const S = set(example.input);
    const dll = solveDLL(S);
    const dp = solveDP(S);
    const a = runSummary(dll.trace, dll.result, "dll");
    const b = runSummary(dp.trace, dp.result, "dp");
    const { units, branches } = dll.result.stats;
    assert.equal(a.steps, units + branches, example.id);
    assert.equal(b.steps, dp.result.stats.steps, example.id);
    assert.equal(b.maxSize, dp.result.stats.maxSize, example.id);
    assert.equal(a.sizes[0], S.length, example.id);
    assert.ok(a.maxSize >= S.length, example.id);
  }
});

test("conjunto vazio e {F}: zero passos", () => {
  assert.deepEqual(setSizes(solveDLL([]).trace, "dll"), [0]);
  assert.deepEqual(setSizes(solveDP([[]]).trace, "dp"), [1]);
  const out = compareAlgorithms([], { timing: false });
  assert.equal(out.dll.steps, 0);
  assert.equal(out.dp.steps, 0);
});

test("o tempo é a média de várias resoluções medidas com o relógio dado", () => {
  const out = compareAlgorithms(set("p q, -p, -q r"), { now: fakeClock() });
  // Com um relógio que avança 1 ms por leitura, cada resolução "demora" 1 ms.
  assert.equal(out.dll.ms, 1);
  assert.equal(out.dp.ms, 1);
});

test("quando o DP chega ao limite, o resumo fica com o resultado limitado", () => {
  const pigeons = [];
  for (let i = 1; i <= 5; i++) pigeons.push([1, 2, 3, 4].map((j) => `p${i}${j}`).join(" "));
  for (let j = 1; j <= 4; j++)
    for (let a = 1; a <= 5; a++) for (let b = a + 1; b <= 5; b++) pigeons.push(`-p${a}${j} -p${b}${j}`);
  const out = compareAlgorithms(set(pigeons.join(", ")), { timing: false });
  assert.equal(out.dll.result.sat, false);
  assert.equal(out.dp.result.limited, true);
  assert.ok(out.dp.maxSize > out.dll.maxSize, "a resolução faz o conjunto crescer mais do que o DLL");
});
