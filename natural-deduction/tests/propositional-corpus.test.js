// Regressão da 1.ª ordem: todo o texto proposicional que o site já lia (provas, sequentes, esquemas
// e fórmulas de `js/` e `tests/`, guardados antes da L2) lê-se e imprime-se como antes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectTexts, readCorpus } from "./helpers/corpus.js";

const BASELINE = JSON.parse(readFileSync(new URL("./fixtures/propositional-corpus.json", import.meta.url), "utf8"));

test("o corpus guardado cobre exercícios, exemplos, lição, derivadas e regras dos testes", () => {
  const count = (kind) => BASELINE.filter((entry) => entry.kind === kind).length;
  assert.ok(count("proof") >= 170, `provas: ${count("proof")}`);
  assert.ok(count("sequent") >= 300, `sequentes: ${count("sequent")}`);
  assert.ok(count("formula") >= 1000, `fórmulas: ${count("formula")}`);
  const texts = new Set(BASELINE.map(({ text }) => text));
  for (const sample of ["m ∧ n, k ⊢ n ∧ (k ∧ m)", "a → b, b → c, a ⊢ c", "¬ψ → ¬φ", "φ ∨ ¬φ", "¬¬φ", "φ → ψ"]) {
    assert.ok(texts.has(sample), sample);
  }
});

test("cada texto do corpus lê-se e imprime-se como antes da 1.ª ordem", () => {
  const now = readCorpus(BASELINE.map(({ text }) => text));
  const byText = new Map(now.map((entry) => [entry.text, entry]));
  for (const { kind, text, printed } of BASELINE) {
    const entry = byText.get(text);
    assert.ok(entry, `deixou de se ler: ${JSON.stringify(text)}`);
    assert.equal(entry.kind, kind, text);
    assert.equal(entry.printed, printed, text);
  }
});

test("o texto proposicional atual do código também está no corpus", () => {
  // Um texto novo sem nada de 1.ª ordem tem de se ler como um que já existia: este teste só garante que
  // a recolha continua a encontrar o conteúdo, e que nada do que já existia desapareceu do código.
  const current = new Set(collectTexts());
  const missing = BASELINE.filter(({ kind, text }) => kind !== "formula" && !current.has(text));
  assert.deepEqual(missing.map(({ text }) => text), []);
});
