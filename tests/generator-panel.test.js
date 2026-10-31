import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GENERATOR_UI_LIMITS,
  generatorFromParams,
  normalizeGeneratorOptions,
  renderGeneratorForm,
  runGenerator,
} from "../js/ui/generator-panel.js";
import { generateFormula } from "../js/core/generator.js";
import { solveDLL } from "../js/core/dll.js";
import { decodeShare, encodeShare } from "../js/core/share.js";
import { setLang } from "../js/ui/i18n.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

test("normalizeGeneratorOptions: 2–8 variáveis, 1–60 cláusulas, want conhecido", () => {
  assert.deepEqual(normalizeGeneratorOptions({}), { vars: 3, clauses: 6, want: "any" });
  assert.deepEqual(normalizeGeneratorOptions({ vars: "1", clauses: "0", want: "x" }), { vars: 2, clauses: 1, want: "any" });
  assert.deepEqual(normalizeGeneratorOptions({ vars: 99, clauses: 500, want: "unsat" }), {
    vars: GENERATOR_UI_LIMITS.maxVars,
    clauses: GENERATOR_UI_LIMITS.maxClauses,
    want: "unsat",
  });
});

test("generatorFromParams: só com seed; texto da URL passa a número", () => {
  assert.equal(generatorFromParams({}), null);
  assert.equal(generatorFromParams({ seed: " " }), null);
  assert.deepEqual(generatorFromParams({ seed: "42", vars: "4", clauses: "9", want: "sat" }), {
    seed: 42,
    vars: 4,
    clauses: 9,
    want: "sat",
  });
});

test("runGenerator: os parâmetros do link voltam a gerar exatamente o mesmo conjunto", () => {
  for (const want of ["any", "sat", "unsat"]) {
    const out = runGenerator({ seed: 123, vars: 3, clauses: 8, want });
    assert.equal(out.found, true);
    if (want !== "any") assert.equal(solveDLL(out.clauses).result.sat, want === "sat");
    // Ida e volta pela URL: encodeShare → decodeShare → generatorFromParams → runGenerator.
    const query = encodeShare(out.clauses, { params: out.params });
    const { params } = decodeShare(query);
    assert.deepEqual(runGenerator(generatorFromParams(params)).clauses, out.clauses);
    assert.deepEqual(generateFormula({ seed: out.seed, vars: 3, clauses: 8 }).clauses, out.clauses);
  }
});

test("literais por cláusula: tamanho fixo em todas as cláusulas, e a mistura não vai para a URL", () => {
  for (const [size, length] of [["2", 2], ["3", 3]]) {
    const out = runGenerator({ seed: 7, vars: 5, clauses: 10, want: "any", size });
    assert.ok(out.clauses.every((clause) => clause.length === length), size);
    assert.equal(out.params.size, size);
    const { params } = decodeShare(encodeShare(out.clauses, { params: out.params }));
    assert.deepEqual(runGenerator(generatorFromParams(params)).clauses, out.clauses);
  }
  assert.equal("size" in runGenerator({ seed: 7, vars: 5, clauses: 10, want: "any", size: "mix" }).params, false);
  assert.equal("size" in normalizeGeneratorOptions({ size: "9" }), false);
});

test("um link antigo, sem size, continua a gerar o conjunto de sempre", () => {
  const options = { seed: 123, vars: 4, clauses: 9, want: "any" };
  assert.deepEqual(runGenerator(options).clauses, runGenerator({ ...options, size: "mix" }).clauses);
  assert.deepEqual(runGenerator(options).clauses, generateFormula({ seed: 123, vars: 4, clauses: 9 }).clauses);
});

test("renderGeneratorForm: literais por cláusula com a mistura marcada por omissão", () => {
  setLang("pt", { silent: true });
  assert.match(renderGeneratorForm({}), /data-size="mix" aria-pressed="true"/);
  const html = renderGeneratorForm({ size: "2" });
  assert.match(html, /data-size="2" aria-pressed="true"/);
  assert.match(html, /data-size="mix" aria-pressed="false"/);
  assert.ok(html.includes(pt.generator.size));
});

test("renderGeneratorForm: campos com limites, want marcado, semente, erro, PT e EN", () => {
  setLang("pt", { silent: true });
  let html = renderGeneratorForm({ vars: 5, clauses: 12, want: "unsat", lastSeed: 777 });
  assert.match(html, /name="vars"[^>]*min="2" max="8" value="5"/);
  assert.match(html, /name="clauses"[^>]*min="1" max="60" value="12"/);
  assert.match(html, /data-want="unsat" aria-pressed="true"/);
  assert.match(html, /data-want="sat" aria-pressed="false"/);
  for (const key of ["vars", "clauses", "want", "seed", "submit"]) assert.ok(html.includes(pt.generator[key]), key);
  assert.ok(html.includes(pt.generator.wants.unsat));
  assert.ok(html.includes("semente 777"));
  assert.ok(!html.includes('role="alert"'));
  html = renderGeneratorForm({ error: "Não encontrei <nada>" });
  assert.ok(html.includes("Não encontrei &lt;nada&gt;"));
  setLang("en", { silent: true });
  html = renderGeneratorForm({});
  assert.ok(html.includes(en.generator.submit));
  assert.ok(html.includes(en.generator.wants.sat));
  setLang("pt", { silent: true });
});
