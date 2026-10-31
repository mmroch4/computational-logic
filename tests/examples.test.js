import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_GROUPS, findExample } from "../js/core/examples.js";
import { parseSequent, formatSequent } from "../js/core/sequent.js";
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
      assert.ok(result.counterexample, sequent);
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
