import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_GROUPS, findExample } from "../js/core/examples.js";
import { isPropositionalSequent, parseSequent, formatSequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { RULES } from "../js/core/rules.js";
import { verifyProof } from "../js/core/verify.js";
import { LOCALES } from "../js/ui/i18n.js";

const all = EXAMPLE_GROUPS.flatMap((group) => group.examples.map((example) => ({ ...example, group: group.id })));

test("todos os exemplos estão escritos como o site os imprime", () => {
  for (const { sequent } of all) {
    const parsed = parseSequent(sequent);
    assert.ok(parsed.ok, sequent);
    assert.equal(formatSequent(parsed.sequent), sequent);
  }
});

test("os exemplos têm prova verificada, e o inválido tem contraexemplo", () => {
  for (const { sequent, group } of all) {
    const goal = parseSequent(sequent).sequent;
    const result = solve(goal);
    assert.ok(result.ok, sequent);
    if (group === "invalid") {
      assert.equal(result.valid, false, sequent);
      // Em 1.ª ordem, o contraexemplo é uma estrutura (contramodelo).
      assert.ok(isPropositionalSequent(goal) ? result.counterexample : result.structure, sequent);
    } else {
      assert.equal(result.provable, true, sequent);
      assert.equal(verifyProof(result.proof, goal, RULES).ok, true, sequent);
    }
  }
});

test("os grupos com ou sem subdedução dizem a verdade", () => {
  for (const { sequent, group } of all) {
    if (group !== "direct" && group !== "subproofs") continue;
    const { proof } = solve(parseSequent(sequent).sequent);
    const hasSubproof = proof.lines.some((line) => line.kind === "hypothesis");
    assert.equal(hasSubproof, group === "subproofs", sequent);
  }
});

test("o grupo de 1.ª ordem só tem sequentes de 1.ª ordem e mostra caixas, variável nova e instanciação", () => {
  const firstOrder = all.filter(({ group }) => group === "firstOrder");
  assert.ok(firstOrder.length >= 4);
  const rules = new Set();
  let fresh = 0;
  let labels = 0;
  for (const { sequent } of firstOrder) {
    const goal = parseSequent(sequent).sequent;
    assert.equal(isPropositionalSequent(goal), false, sequent);
    for (const line of solve(goal).proof.lines) {
      if (line.rule) rules.add(line.rule);
      if (line.fresh) fresh += 1;
      if (line.label) labels += 1;
    }
  }
  for (const rule of ["∀E", "∀I", "∃E", "∃I", "=E"]) assert.ok(rules.has(rule), rule);
  assert.ok(fresh >= 3 && labels >= 1);
  // Os outros grupos válidos continuam proposicionais.
  for (const { sequent, group } of all) {
    if (group !== "firstOrder" && group !== "invalid") assert.ok(isPropositionalSequent(parseSequent(sequent).sequent), sequent);
  }
});

test("cada exemplo e grupo tem título nos dois idiomas, e os ids são únicos", () => {
  assert.equal(new Set(all.map(({ id }) => id)).size, all.length);
  for (const locale of Object.values(LOCALES)) {
    for (const { id } of all) assert.ok(locale.examples.items[id], id);
    for (const { id } of EXAMPLE_GROUPS) assert.ok(locale.examples.groups[id], id);
  }
});

test("findExample", () => {
  assert.equal(findExample("cases").sequent, "a ∨ b, a → c, b → c ⊢ c");
  assert.equal(findExample("nada"), null);
  assert.equal(findExample(undefined), null);
});
