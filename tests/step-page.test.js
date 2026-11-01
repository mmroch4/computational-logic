// A página Passo a passo: o contraexemplo e o HTML. No Chrome, em PT e EN: scripts/check-step.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { EXAMPLE_GROUPS } from "../js/core/examples.js";
import { ruleSet } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { LOCALES, setLang } from "../js/ui/i18n.js";
import { outcomeHtml } from "../js/ui/step-player.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const goalOf = (text) => parseSequent(text).sequent;
const outcomeOf = (text) => {
  const goal = goalOf(text);
  return outcomeHtml(solve(goal, { rules: ruleSet("completo") }), goal);
};

test("com prova não há mensagem", () => {
  assert.equal(outcomeOf("a → b, a ⊢ b"), "");
});

test("um sequente inválido mostra o contraexemplo com os valores do idioma", () => {
  const html = outcomeOf("a → b, b ⊢ a");
  assert.ok(html.includes(LOCALES.pt.player.invalid));
  assert.ok(html.includes(LOCALES.pt.player.counterexample));
  assert.ok(html.includes("<li>a = F</li>"));
  assert.ok(html.includes("<li>b = V</li>"));
  setLang("en", { silent: true });
  assert.ok(outcomeOf("a → b, b ⊢ a").includes("<li>b = T</li>"));
  setLang("pt", { silent: true });
});

test("sem premissas, a frase não fala delas; com variáveis livres, avisa", () => {
  const html = outcomeOf("⊢ a");
  assert.ok(html.includes(LOCALES.pt.player.counterexampleNoPremises));
  assert.ok(!html.includes(LOCALES.pt.player.counterexample));
  assert.ok(outcomeOf("a ∨ b ⊢ c").includes(LOCALES.pt.assist.otherValues));
});

test("quando qualquer valoração serve, não há frase sobre «estes valores»", () => {
  const html = outcomeOf("⊢ F");
  assert.ok(html.includes(LOCALES.pt.assist.anyValuation));
  assert.ok(!html.includes(LOCALES.pt.player.counterexampleNoPremises));
});

test("uma falha da procura não mostra contraexemplo", () => {
  const html = outcomeHtml({ ok: false, error: { code: "timeout", params: { seconds: 15 } } }, goalOf("a ⊢ a"));
  assert.ok(html.includes(LOCALES.pt.solver.errors.timeout.slice(0, 10)));
  assert.ok(!html.includes("assist__valuation"));
});

test("os exemplos válidos têm prova e o inválido tem contraexemplo", () => {
  for (const { id, examples } of EXAMPLE_GROUPS) {
    for (const { sequent } of examples) {
      const html = outcomeOf(sequent);
      if (id === "invalid") assert.ok(html.includes("assist__valuation"), sequent);
      else assert.equal(html, "", sequent);
    }
  }
});

test("a página tem a escolha do sequente, o estado vazio e o botão de mudar, em PT e EN", () => {
  for (const file of ["passo-a-passo.html", "en/step-by-step.html"]) {
    const html = read(file);
    for (const id of ["step-choose", "examples-menu", "sequent-input", "step-start", "step-empty", "step-change", "step-message", "step-player"]) {
      assert.ok(html.includes(`id="${id}"`), `${file}: ${id}`);
    }
  }
  assert.ok(read("en/step-by-step.html").includes(LOCALES.en.step.start));
  assert.ok(!read("passo-a-passo.html").includes("emptyState.heading"));
});

test("os textos da página existem nos dois idiomas", () => {
  for (const key of ["emptyHeading", "empty", "start", "change"]) {
    assert.ok(LOCALES.pt.step[key], key);
    assert.ok(LOCALES.en.step[key], key);
    assert.notEqual(LOCALES.pt.step[key], LOCALES.en.step[key], key);
  }
});

test("o check-step.sh é executável", () => {
  assert.ok(statSync(new URL("../scripts/check-step.sh", import.meta.url)).mode & 0o100);
});

test("no Chrome: a página em PT e EN", { skip: !existsSync(process.env.CHROME_BIN || "/usr/bin/google-chrome") }, () => {
  const run = spawnSync("bash", ["scripts/check-step.sh"], { encoding: "utf8", timeout: 400000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
