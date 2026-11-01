import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "../js/core/parser.js";
import { solveDP } from "../js/core/dp.js";
import { bruteForceSat } from "../js/core/verify.js";
import { DP_PLAYER_EXAMPLES, dpPlayerRun, pigeonFormula, renderDpPlayer } from "../js/ui/dp-player.js";
import { setLang } from "../js/ui/i18n.js";

test("pigeonFormula(3, 2) é o conjunto dos pombos, 3 em 2", () => {
  const ours = parse(pigeonFormula(3, 2)).clauses.map((c) => c.join(" ")).sort();
  const run = dpPlayerRun("pigeons-3-2");
  assert.deepEqual(run.S.map((c) => c.join(" ")).sort(), ours);
});

test("os três conjuntos do player são insatisfazíveis e o DP chega a F sem limite", () => {
  for (const { id } of DP_PLAYER_EXAMPLES) {
    const run = dpPlayerRun(id);
    const result = run.trace.at(-1);
    assert.equal(result.type, "result", id);
    assert.equal(result.sat, false, id);
    assert.equal(bruteForceSat(run.S).sat, false, id);
    assert.ok(run.trace.some((e) => e.type === "conflict"), id);
  }
});

test("a história que o player conta: o exemplo 2 em 2 passos, os pombos 3→2 não crescem, os 4→3 explodem", () => {
  const twoBranches = dpPlayerRun("two-branches").out;
  assert.equal(twoBranches.dp.steps, 2);
  const small = dpPlayerRun("pigeons-3-2").out;
  assert.equal(small.dp.maxSize, small.dp.sizes[0]);
  assert.ok(small.dp.steps < small.dll.steps);
  const big = dpPlayerRun("pigeons-4-3").out;
  assert.equal(big.dp.sizes[0], 22);
  assert.ok(big.dp.maxSize > 2.5 * big.dp.sizes[0], `DP chega a ${big.dp.maxSize}`);
  assert.ok(big.dp.maxSize > 2 * big.dll.maxSize);
});

test("dpPlayerRun: id desconhecido volta ao exemplo 2", () => {
  assert.equal(dpPlayerRun("nada").id, "two-branches");
});

test("renderDpPlayer: controlos, conjunto escolhido, vista do DP com h3, gráfico com o passo atual e link para o DP", () => {
  setLang("pt");
  const run = dpPlayerRun("two-branches");
  const first = renderDpPlayer(run, 0);
  assert.match(first, /data-action="prev" aria-disabled="true"/);
  assert.match(first, /data-example="two-branches" aria-pressed="true"/);
  assert.match(first, /data-example="pigeons-4-3" aria-pressed="false"/);
  assert.match(first, /<h3 class="pseudocode__heading"/);
  assert.doesNotMatch(first, /<h2/);
  assert.match(first, /compare-chart__marker--dp/);
  assert.match(first, /href="\/passo-a-passo\?f=[^"]*&amp;a=dp"/);
  assert.match(first, /Passo 1 de/);

  // No passo da eliminação aparecem os pares resolvidos, com as duas tautologias.
  const resolveIndex = run.trace.findIndex((e) => e.type === "resolve");
  const html = renderDpPlayer(run, resolveIndex);
  assert.equal((html.match(/resolution-pair--dropped/g) || []).length, 2);
  const last = renderDpPlayer(run, run.trace.length - 1);
  assert.match(last, /data-action="next" aria-disabled="true"/);
});

test("renderDpPlayer: sem chaves de tradução por preencher em PT e EN, em todos os conjuntos", () => {
  for (const lang of ["pt", "en"]) {
    setLang(lang);
    for (const { id } of DP_PLAYER_EXAMPLES) {
      const run = dpPlayerRun(id);
      for (const i of [0, run.trace.length - 1]) {
        const html = renderDpPlayer(run, i);
        assert.doesNotMatch(html, /learn\.history\.|\{[a-z]{2,}\}|undefined/, `${lang} ${id} ${i}`);
      }
    }
  }
  setLang("pt");
});

test("aprender.html tem o player do DP na §6", () => {
  const html = readFileSync(new URL("../aprender.html", import.meta.url), "utf8");
  const section = html.slice(html.indexOf('id="historia"'), html.indexOf('id="quiz"'));
  assert.match(section, /id="dp-player"/);
});

test("o trace do player é o do solveDP (o mesmo do Passo a passo)", () => {
  const run = dpPlayerRun("pigeons-4-3");
  assert.deepEqual(run.trace, solveDP(run.S).trace);
});
