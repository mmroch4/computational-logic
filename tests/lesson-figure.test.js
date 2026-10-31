import { test } from "node:test";
import assert from "node:assert/strict";
import { setLang } from "../js/ui/i18n.js";
import { lessonFigureHtml } from "../js/ui/lesson-figure.js";
import { renderSatExplorer, barHeight } from "../js/ui/sat-explorer.js";
import { renderNotationConverter } from "../js/ui/notation-converter.js";
import { renderPropagationLab, labExampleClauses } from "../js/ui/propagation-lab.js";
import { renderDllPlayer, playerTrace } from "../js/ui/dll-player.js";
import { renderSelectCompare } from "../js/ui/select-compare.js";
import { renderDpPlayer, dpPlayerRun } from "../js/ui/dp-player.js";
import { MAX_VARS } from "../js/core/sat-cost.js";

test("lessonFigureHtml: figure com título, ícone decorativo e rótulo, com o título escapado", () => {
  setLang("pt");
  const html = lessonFigureHtml({ classes: "x", icon: "tree", title: "a < b", body: "<p>corpo</p>" });
  assert.match(html, /^<figure class="lesson-figure x"><figcaption class="lesson-figure__head">/);
  assert.match(html, /<svg class="ic"[^>]*aria-hidden="true"/);
  assert.match(html, /<b class="lesson-figure__title">a &lt; b<\/b>/);
  assert.match(html, /<span class="lesson-figure__tag">Interativo<\/span><\/figcaption><p>corpo<\/p><\/figure>$/);
  setLang("en");
  assert.match(lessonFigureHtml({ classes: "x", icon: "play", title: "t", body: "" }), />Interactive</);
  setLang("pt");
});

test("os 6 interativos usam o bloco", () => {
  setLang("pt");
  const { S, trace } = playerTrace();
  const pages = {
    "sat-explorer": renderSatExplorer(),
    "notation-converter": renderNotationConverter(),
    "propagation-lab": renderPropagationLab({ exampleId: "chain", S: labExampleClauses("chain") }),
    "dll-player": renderDllPlayer({ S, trace, index: 0 }),
    "select-compare": renderSelectCompare(),
    "dp-player": renderDpPlayer(dpPlayerRun(), 0),
  };
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, new RegExp(`^<figure class="lesson-figure [^"]*${name}"`), name);
    assert.equal(html.match(/lesson-figure__tag/g).length, 1, name);
  }
});

test("barras do explorador: uma por valor do slider, crescentes, e só as de n ficam cheias", () => {
  setLang("pt");
  const heights = Array.from({ length: MAX_VARS }, (_, i) => barHeight(i + 1));
  assert.equal(heights.at(-1), 80);
  assert.ok(heights.every((h, i) => h >= 4 && (i === 0 || h >= heights[i - 1])));
  const html = renderSatExplorer({ n: 12 });
  assert.equal(html.match(/sat-explorer__bar[" ]/g).length, MAX_VARS);
  assert.equal(html.match(/sat-explorer__bar is-on/g).length, 12);
});
