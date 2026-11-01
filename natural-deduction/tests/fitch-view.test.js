// O HTML da vista de Fitch, em snapshots. A medição a 390px está no scripts/check-fitch.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setLang } from "../js/ui/i18n.js";
import { atom, not } from "../js/core/formula.js";
import { createProof } from "../js/core/proof.js";
import { parseProof } from "../js/core/proof-text.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { verifyProof } from "../js/core/verify.js";
import { fitchHtml, formulaHtml, justificationText, lineStates } from "../js/ui/fitch-view.js";
import { assertSnapshot } from "./helpers/snapshot.js";
import { CASES, CASES_GOAL, NESTED, NESTED_GOAL, STATES, STATES_GOAL, WIDE, WIDE_GOAL } from "./fixtures/fitch-proofs.js";

const read = (text) => {
  const result = parseProof(text);
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.proof;
};

const verified = (text, goal) => {
  const proof = read(text);
  return { proof, result: verifyProof(proof, parseSequent(goal).sequent, ruleSet("completo"), RULES) };
};

/** Uma linha por `<li>`, para um snapshot que mude se ler como diferença de linhas. */
const pretty = (html) => `${html.replaceAll("<li", "\n<li").replace("</ol>", "\n</ol>")}\n`;

for (const lang of ["pt", "en"]) {
  test(`snapshots em ${lang}`, () => {
    setLang(lang, { silent: true });
    const nested = verified(NESTED, NESTED_GOAL);
    const cases = verified(CASES, CASES_GOAL);
    const states = verified(STATES, STATES_GOAL);
    assert.ok(nested.result.ok);
    assert.ok(cases.result.ok);
    assert.ok(!states.result.ok);

    assertSnapshot(`fitch-view/nested.${lang}.html`, pretty(fitchHtml(nested.proof)));
    assertSnapshot(`fitch-view/cases.${lang}.html`, pretty(fitchHtml(cases.proof, {
      states: lineStates(cases.proof, cases.result),
    })));
    assertSnapshot(`fitch-view/states.${lang}.html`, pretty(fitchHtml(states.proof, {
      states: lineStates(states.proof, states.result),
    })));
    setLang("pt", { silent: true });
  });
}

test("a prova larga do scripts/check-fitch.mjs também é válida", () => {
  assert.ok(verified(WIDE, WIDE_GOAL).result.ok);
});

test("lineStates distingue linha errada, linha por acabar e premissa a mais", () => {
  const { proof, result } = verified(STATES, STATES_GOAL);
  assert.deepEqual(lineStates(proof, result), ["ok", "ok", "error", "ok", "error", "pending", "pending"]);
});

test("uma linha que cita outra por preencher está por acabar, não errada", () => {
  const { proof, result } = verified(`
1 | ?          premissa
2 | p          R, 1
`, "p ⊢ p");
  assert.deepEqual(lineStates(proof, result), ["pending", "pending"]);
});

test("justificationText usa as siglas e as palavras de cada idioma", () => {
  const line = { kind: "step", rule: "RA", citations: [{ kind: "range", from: 2, to: 4 }, { kind: "line", line: 1 }] };
  assert.equal(justificationText(line), "RA, 2–4, 1");
  assert.equal(justificationText({ kind: "premise" }), "premissa");
  setLang("en", { silent: true });
  assert.equal(justificationText(line), "RAA, 2–4, 1");
  assert.equal(justificationText({ kind: "hypothesis" }), "hypothesis");
  setLang("pt", { silent: true });
  assert.equal(justificationText({ kind: "step", rule: null, citations: [] }), "");
});

test("formulaHtml põe subscritos em <sub>, sem deixar o símbolo Unicode", () => {
  assert.equal(formulaHtml(not(atom("p11"))), "¬p<sub>11</sub>");
  assert.equal(formulaHtml(null), "?");
});

test("uma regra do utilizador é escapada", () => {
  const { ok, proof } = createProof([{ kind: "step", depth: 0, formula: atom("p"), rule: "<b>", citations: [] }]);
  assert.ok(ok);
  const html = fitchHtml(proof);
  assert.ok(html.includes("&lt;b&gt;"));
  assert.ok(!html.includes("<b>"));
});

test("as barras são uma por escopo, mais a da prova, e a hipótese abre a última", () => {
  const html = fitchHtml(read(NESTED));
  const line = (n) => html.split("<li").find((item) => item.includes(`data-line="${n}"`));
  assert.equal(line(6).match(/fitch__bar\b/g).length, 5);
  assert.equal(line(1).match(/fitch__bar\b/g).length, 1);
  assert.equal(line(5).match(/fitch__bar--open/g).length, 1);
  assert.equal(line(6).match(/fitch__bar--open/g), null);
});

test("o traço fica na última premissa e nas hipóteses", () => {
  const html = fitchHtml(read(CASES));
  const marked = html.split("<li").filter((item) => item.includes("fitch__formula--assumption"));
  assert.deepEqual(marked.map((item) => item.match(/data-line="(\d+)"/)[1]), ["3", "4", "6"]);
});

test("sem estados não há marcas de estado", () => {
  const html = fitchHtml(read(CASES));
  assert.ok(!html.includes("data-state"));
  assert.ok(!html.includes("fitch__state"));
});

test("uma prova sem linhas diz isso mesmo, sem lista vazia", () => {
  assert.equal(fitchHtml(createProof().proof), '<p class="fitch-empty">A prova ainda não tem linhas.</p>');
});

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";

test("no Chrome a 390px: 4 níveis com scroll próprio", { skip: !existsSync(CHROME) }, () => {
  const run = spawnSync("node", ["scripts/check-fitch.mjs"], { encoding: "utf8", timeout: 60000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
