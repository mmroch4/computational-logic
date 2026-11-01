// Acessibilidade (M8.2): os textos anunciados aos leitores de ecrã e as regiões de estado fixas.
// A auditoria do DOM (SVG, nomes dos controlos, ids) corre no Chrome headless: scripts/a11y-audit.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resultAnnouncement } from "../js/ui/result-card.js";
import { stepExplanationHtml as dllExplanation, renderPseudocode, pseudocodeModel } from "../js/ui/pseudocode-view.js";
import { stepExplanationHtml as dpExplanation, renderDp } from "../js/ui/dp-view.js";
import { playerAnnouncementHtml } from "../js/ui/dll-player.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { solveDP } from "../js/core/dp.js";
import { EXAMPLES } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

const clausesOf = (text) => parse(text).clauses;
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("resultAnnouncement: estado e frase curta, em PT e EN, no DLL e no DP", () => {
  const sat = clausesOf("p1, -p1 -p2, p3 p2");
  const unsat = clausesOf("p, -p");
  setLang("pt", { silent: true });
  assert.match(resultAnnouncement(sat, solveDLL(sat).result), /^Satisfazível\. O DLL chegou ao conjunto vazio/);
  assert.match(resultAnnouncement(unsat, solveDLL(unsat).result), /^Insatisfazível\. /);
  assert.match(resultAnnouncement([], solveDLL([]).result), /^Satisfazível\. O conjunto vazio/);
  assert.match(resultAnnouncement(sat, { sat: null, stats: {} }), /^Limite de passos atingido\. /);
  // No DP as frases são as do DP (não falam do DLL).
  const dp = resultAnnouncement(sat, solveDP(sat).result, { algorithm: "dp" });
  assert.match(dp, /^Satisfazível\. /);
  assert.doesNotMatch(dp, /DLL/);
  setLang("en", { silent: true });
  assert.match(resultAnnouncement(unsat, solveDLL(unsat).result), /^Unsatisfiable\. /);
  setLang("pt", { silent: true });
});

test("stepExplanationHtml: o texto anunciado é a explicação mostrada no painel, em todos os passos", () => {
  setLang("pt", { silent: true });
  for (const example of EXAMPLES) {
    const S = clausesOf(example.input);
    const dll = solveDLL(S).trace;
    for (let i = 0; i < dll.length; i++) {
      const text = dllExplanation(dll, i);
      if (pseudocodeModel(dll, i).explanation) {
        assert.ok(text, `${example.id} passo ${i}: explicação vazia`);
        assert.ok(renderPseudocode(pseudocodeModel(dll, i)).includes(text), `${example.id} passo ${i}`);
      } else {
        assert.equal(text, "");
      }
    }
    const dp = solveDP(S, { maxClauses: 200 }).trace;
    for (let i = 0; i < dp.length; i++) {
      const text = dpExplanation(dp, i);
      if (text) assert.ok(renderDp(dp, i).includes(text), `${example.id} DP passo ${i}`);
    }
  }
});

test("os painéis redesenhados já não têm aria-live (o anúncio vive numa região fixa)", () => {
  const S = clausesOf("p1, -p1 -p2, p3 p2");
  const dll = solveDLL(S).trace;
  const dp = solveDP(S).trace;
  for (let i = 0; i < dll.length; i++) assert.doesNotMatch(renderPseudocode(pseudocodeModel(dll, i)), /aria-live/);
  for (let i = 0; i < dp.length; i++) assert.doesNotMatch(renderDp(dp, i), /aria-live/);
});

test("playerAnnouncementHtml: contador do player e explicação", () => {
  setLang("pt", { silent: true });
  assert.equal(playerAnnouncementHtml(0, 5, ""), "Passo 1 de 5");
  assert.equal(playerAnnouncementHtml(1, 5, "Propagação"), "Passo 2 de 5. Propagação");
  setLang("en", { silent: true });
  assert.match(playerAnnouncementHtml(4, 5, ""), /5/);
  setLang("pt", { silent: true });
});

test("HTML: região de estado fixa no Passo a passo, fora da app escondida; resultados sem aria-live", () => {
  const step = read("passo-a-passo.html");
  const status = step.indexOf('id="step-status"');
  assert.ok(status > 0, "falta #step-status");
  assert.match(step, /<p id="step-status" class="sr-only" role="status"><\/p>/);
  assert.ok(status < step.indexOf('id="step-app"'), "#step-status tem de ficar fora do #step-app (que começa hidden)");
  for (const file of ["passo-a-passo.html", "resolver.html"]) {
    assert.match(read(file), /<div class="solve-result" id="result" hidden><\/div>/, file);
  }
});
