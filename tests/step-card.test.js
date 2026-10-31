import { test } from "node:test";
import assert from "node:assert/strict";
import { stepCardModel, renderStepCard, renderValuation, stepAnnouncementHtml } from "../js/ui/step-card.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { solveDP } from "../js/core/dp.js";
import { setLang } from "../js/ui/i18n.js";

const MIXED = "s p -q, -p -q -r, -s p -q, -s -p q, -s p -r, -s -q r, s";
const dll = (text) => solveDLL(parse(text).clauses).trace;
const dp = (text) => solveDP(parse(text).clauses).trace;
const card = (trace, index, algorithm) => renderStepCard(trace, stepCardModel(trace, index, algorithm));
const stripped = (html) => html.replace(/<[^>]+>/g, "");

test("cartão: propagação com chip, contador, ramo, título e frase", () => {
  setLang("pt", { silent: true });
  const trace = dll(MIXED);
  const index = trace.findIndex((e, i) => e.type === "unit" && trace.slice(0, i).some((p) => p.type === "branch"));
  const html = card(trace, index);
  assert.match(html, /class="chip ev-unit"/);
  assert.match(html, /Propagação unitária/);
  assert.match(stripped(html), new RegExp(`Passo ${index} de ${trace.length - 1} · ramo p`));
  assert.match(html, /<h2 class="step-card__title">Propagar <code class="step-card__mark text-ev-unit">/);
  assert.match(stripped(html), /é a primeira cláusula unitária/);
});

test("cartão: o retrocesso e o 2.º ramo tentam o literal complementar", () => {
  setLang("pt", { silent: true });
  const trace = dll(MIXED);
  const back = trace.findIndex((e) => e.type === "backtrack");
  assert.match(stripped(card(trace, back)), /Tentar ¬p/);
  assert.match(card(trace, back), /class="chip ev-back"/);
  assert.match(stripped(card(trace, back)), /O ramo p chegou a F/);
  assert.match(stripped(card(trace, back + 1)), /Escolher ¬p/);
  assert.match(stripped(card(trace, back + 1)), /O ramo p falhou/);
});

test("cartão: o último passo diz o resultado, com o ramo que o deu", () => {
  setLang("pt", { silent: true });
  const sat = dll(MIXED);
  const html = stripped(card(sat, sat.length - 1));
  assert.match(html, /S ficou vazio/);
  assert.match(html, /no ramo ¬p: o conjunto é satisfazível/);

  const unsat = dll("p q, -p q, p -q, -p -q");
  const last = card(unsat, unsat.length - 1);
  assert.match(last, /class="chip ev-conflict"/);
  assert.match(stripped(last), /Insatisfazível/);
  assert.match(stripped(last), /S contém F/);
});

test("cartão: sem ramos não há «ramo», e o passo 0 não tem chip", () => {
  setLang("pt", { silent: true });
  const trace = dll("p, -p q");
  assert.doesNotMatch(stripped(card(trace, 1)), /ramo/);
  assert.doesNotMatch(card(trace, 0), /class="chip/);
  assert.match(stripped(card(trace, 0)), /Conjunto inicial/);
});

test("cartão: no DP, resolução em magenta e o ano no lugar do ramo", () => {
  setLang("pt", { silent: true });
  const trace = dp(MIXED);
  const index = trace.findIndex((e) => e.type === "resolve" && e.pairs.length > 0);
  const html = card(trace, index, "dp");
  assert.match(html, /class="chip ev-res"/);
  assert.match(html, /text-ev-res/);
  assert.match(stripped(html), /Eliminar p/);
  assert.match(stripped(html), /DP \(1960\)/);
  assert.match(stripped(html), /cada cláusula com ¬p/);
});

test("cartão: todos os passos têm título e frase em PT e EN, sem chaves por traduzir", () => {
  const traces = [
    [dll(MIXED), "dll"], [dll("p q, -p q, p -q, -p -q"), "dll"],
    [dp(MIXED), "dp"], [dp("p q, -p q, p -q, -p -q"), "dp"],
  ];
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    for (const [trace, algorithm] of traces) {
      trace.forEach((_, i) => {
        const text = stripped(stepAnnouncementHtml(trace, i, algorithm));
        assert.doesNotMatch(text, /undefined|stepCard\.|\.\s*\.$/, `${lang} ${algorithm} ${i}: ${text}`);
        assert.ok(stripped(card(trace, i, algorithm)).length > 20, `${lang} ${algorithm} ${i}`);
      });
    }
  }
  setLang("pt", { silent: true });
});

test("anúncio: contador, título e frase, sem aria-live no cartão", () => {
  setLang("pt", { silent: true });
  const trace = dll(MIXED);
  assert.match(stripped(stepAnnouncementHtml(trace, 0)), /^Passo 0 de \d+\. Conjunto inicial\. O DLL começa/);
  assert.doesNotMatch(card(trace, 1), /aria-live/);
});

test("renderValuation: V/F (T/F em EN) com cor, ? sem valor e o novo realçado com texto", () => {
  setLang("pt", { silent: true });
  const entries = [
    { variable: "p", value: true, isNew: false },
    { variable: "q", value: false, isNew: true },
    { variable: "r11", value: null, isNew: false },
  ];
  const html = renderValuation(entries);
  assert.match(html, /Valoração até aqui/);
  assert.match(html, /<li class="val">p = <b>V<\/b><\/li>/);
  assert.match(html, /<li class="val new">q = <b class="f">F<\/b><span class="val__new">novo<\/span><\/li>/);
  assert.match(html, /<li class="val val--free">r<sub>11<\/sub> = \?<\/li>/);
  setLang("en", { silent: true });
  assert.match(renderValuation(entries), /Valuation so far.*p = <b>T<\/b>/);
  setLang("pt", { silent: true });
});
