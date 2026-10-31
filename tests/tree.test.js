// A conversão de Fitch para árvore de Gentzen e o HTML da vista. No Chrome, a 390px: scripts/check-tree.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { equals, format } from "../js/core/formula.js";
import { parseProof } from "../js/core/proof-text.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { checkSequent } from "../js/core/semantics.js";
import { parseSequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { MAX_TREE_NODES, proofTree, treeAt } from "../js/core/tree.js";
import { citationsInRuleOrder, verifyProof } from "../js/core/verify.js";
import { setLang } from "../js/ui/i18n.js";
import { treeBodyHtml, treeHtml } from "../js/ui/tree-view.js";

const read = (text) => {
  const result = parseProof(text);
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.proof;
};

const goalOf = (text) => parseSequent(text).sequent;

const OPTIONS = { rules: ruleSet("completo"), known: RULES };

/** A árvore da última linha. */
function treeOf(proof) {
  const result = treeAt(proof, proof.lines.length);
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.tree;
}

/** Uma árvore em texto: `conclusão <regra> (premissas)`, com [φ]n nas hipóteses. */
function outline(node) {
  if (node.kind === "assumption") {
    const text = format(node.formula);
    return node.label === null ? text : `[${text}]${node.label}`;
  }
  const marks = node.discharges.length > 0 ? `^${node.discharges.join(",")}` : "";
  return `${format(node.formula)} <${node.rule}${marks}> (${node.premises.map(outline).join("; ")})`;
}

const IMPLIES_INTRO = `
  1 | p → q   premissa
  2 |   p     hipótese
  3 |   q     →E, 1, 2
  4 | p → q   →I, 2–3`;

test("→I descarrega a hipótese e põe as premissas pela ordem da regra", () => {
  assert.equal(
    outline(treeOf(read(IMPLIES_INTRO))),
    "p → q <→I^1> (q <→E> ([p]1; p → q))",
  );
});

test("∨E tem a disjunção e as duas subdeduções, cada uma com o seu número, seja qual for a ordem citada", () => {
  const proof = read(`
    1 | p ∨ q   premissa
    2 |   p     hipótese
    3 |   q ∨ p ∨I, 2
    4 |   q     hipótese
    5 |   q ∨ p ∨I, 4
    6 | q ∨ p   ∨E, 4–5, 2–3, 1`);
  assert.equal(
    outline(treeOf(proof)),
    "q ∨ p <∨E^1,2> (p ∨ q; q ∨ p <∨I> ([p]1); q ∨ p <∨I> ([q]2))",
  );
});

test("RA descarrega a hipótese negada", () => {
  const proof = read(`
    1 | ¬¬p    premissa
    2 |   ¬p   hipótese
    3 |   F    FI, 2, 1
    4 | p      RA, 2–3`);
  assert.equal(outline(treeOf(proof)), "p <RA^1> (F <FI> ([¬p]1; ¬¬p))");
});

test("subdeduções encaixadas: uma hipótese exterior leva o número de quem a descarrega", () => {
  const proof = read(`
    1 |   p         hipótese
    2 |     q       hipótese
    3 |     p ∧ q   ∧I, 1, 2
    4 |   q → p ∧ q →I, 2–3
    5 | p → q → p ∧ q →I, 1–4`);
  assert.equal(
    outline(treeOf(proof)),
    "p → q → p ∧ q <→I^1> (q → p ∧ q <→I^2> (p ∧ q <∧I> ([p]1; [q]2)))",
  );
});

test("R não dá nó, e a hipótese repetida continua descarregada", () => {
  const proof = read(`
    1 | q       premissa
    2 |   p     hipótese
    3 |   q     R, 1
    4 |   p     R, 2
    5 |   q ∧ p ∧I, 3, 4
    6 | p → q ∧ p →I, 2–5`);
  assert.equal(outline(treeOf(proof)), "p → q ∧ p <→I^1> (q ∧ p <∧I> (q; [p]1))");
});

test("uma regra sem premissas fica sem nada por cima", () => {
  const tree = treeOf(read("1 | p ∨ ¬p   TE"));
  assert.deepEqual([tree.rule, tree.premises.length], ["TE", 0]);
});

test("uma subdedução de uma linha descarrega a própria hipótese", () => {
  const proof = read(`
    1 |   p   hipótese
    2 | p → p →I, 1–1`);
  assert.equal(outline(treeOf(proof)), "p → p <→I^1> ([p]1)");
});

test("uma linha citada duas vezes aparece duas vezes, com a linha de origem", () => {
  const proof = read(`
    1 | p       premissa
    2 | p ∧ p   ∧I, 1, 1`);
  const tree = treeOf(proof);
  assert.deepEqual(tree.premises.map(({ line }) => line), [1, 1]);
  assert.equal(treeAt(proof, 2).size, 3);
});

test("a mesma subdedução citada duas vezes tem dois números", () => {
  const proof = read(`
    1 |   p            hipótese
    2 | p → p          →I, 1–1
    3 | p → p          →I, 1–1
    4 | (p → p) ∧ (p → p) ∧I, 2, 3`);
  assert.equal(
    outline(treeOf(proof)),
    "(p → p) ∧ (p → p) <∧I> (p → p <→I^1> ([p]1); p → p <→I^2> ([p]2))",
  );
});

test("a meio de uma subdedução, a hipótese ainda aberta fica por descarregar", () => {
  const proof = read(IMPLIES_INTRO);
  const result = treeAt(proof, 3);
  assert.equal(outline(result.tree), "q <→E> (p; p → q)");
  assert.equal(treeAt(proof, 1).tree.source, "premise");
  assert.equal(treeAt(proof, 2).tree.source, "hypothesis");
});

test("linhas que não passam no verificador não dão árvore", () => {
  const forward = read(`
    1 | p       premissa
    2 | q       ∧E, 3
    3 | p ∧ q   ∧I, 1, 2`);
  assert.deepEqual(treeAt(forward, 3), { ok: false, error: { code: "invalidLine", params: { line: 2 } } });
  const wrong = read(`
    1 | p   premissa
    2 | q   R, 1`);
  assert.deepEqual(treeAt(wrong, 2), { ok: false, error: { code: "invalidLine", params: { line: 2 } } });
  const empty = read(`
    1 | p   premissa
    2 | ?   ∧I, 1, 1`);
  assert.equal(treeAt(empty, 2).ok, false);
});

test("uma regra do utilizador tem nó como as outras", () => {
  const swap = RULES.find(({ id }) => id === "MT");
  const known = [...RULES, { ...swap, id: "Minha", user: true }];
  const proof = read(`
    1 | p → q   premissa
    2 | ¬q      premissa
    3 | ¬p      Minha, 1, 2`);
  const result = treeAt(proof, 3, known);
  assert.ok(result.ok);
  assert.equal(result.tree.rule, "Minha");
});

test("uma prova que duplica a cada linha para antes de construir a árvore", () => {
  const doubling = [{ kind: "premise", depth: 0, formula: goalOf("⊢ p").conclusion, rule: null, citations: [] }];
  for (let line = 2; line <= 40; line += 1) {
    doubling.push({
      kind: "step",
      depth: 0,
      formula: { kind: "and", args: [doubling[line - 2].formula, doubling[line - 2].formula] },
      rule: "∧I",
      citations: [{ kind: "line", line: line - 1 }, { kind: "line", line: line - 1 }],
    });
  }
  const proof = { lines: doubling };
  const started = Date.now();
  const result = treeAt(proof, 40);
  assert.deepEqual(result, { ok: false, error: { code: "tooLarge", params: { limit: MAX_TREE_NODES } } });
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(proofTree(proof, { premises: [doubling[0].formula], conclusion: doubling[39].formula }, OPTIONS), {
    status: "tooLarge",
    limit: MAX_TREE_NODES,
  });
});

test("proofTree só dá árvore de uma prova que demonstra o sequente", () => {
  const goal = goalOf("p → q ⊢ p → q");
  assert.equal(proofTree(read(IMPLIES_INTRO), goal, OPTIONS).status, "ready");
  assert.equal(proofTree(read("1 | p → q   premissa"), goalOf("p → q ⊢ q"), OPTIONS).status, "unfinished");
  const unfinished = read(`
    1 | p → q   premissa
    2 |   p     hipótese
    3 |   q     →E, 1, 2`);
  assert.equal(proofTree(unfinished, goal, OPTIONS).status, "unfinished");
});

/** O que está por descarregar na árvore. Uma hipótese descarregada conta enquanto se sobe para ela. */
function openFormulas(node, discharged = new Set()) {
  if (node.kind === "assumption") {
    if (node.label !== null) {
      assert.ok(discharged.has(node.label), `número ${node.label} fora do alcance de quem o descarrega`);
      return [];
    }
    return [node.formula];
  }
  const inner = new Set([...discharged, ...node.discharges]);
  return node.premises.flatMap((premise) => openFormulas(premise, inner));
}

/** As folhas de que o nó depende: as da subárvore que nada descarregou até ele. */
function assumptionsOf(node) {
  if (node.kind === "assumption") return [node];
  return node.premises.flatMap(assumptionsOf).filter(({ label }) => !node.discharges.includes(label));
}

/** Cada nó segue, pela tabela de verdade, das folhas de que depende. Não usa as regras. */
function assertSound(node) {
  if (node.kind === "assumption") return;
  const premises = assumptionsOf(node).map(({ formula }) => formula);
  const result = checkSequent({ premises, conclusion: node.formula });
  assert.ok(result.ok && result.valid, `${format(node.formula)} não segue de ${premises.map(format).join(", ")}`);
  node.premises.forEach(assertSound);
}

test("árvores de provas geradas: sem hipóteses soltas, e cada nó segue do que está por cima", () => {
  const SEQUENTS = [
    "p → q ⊢ ¬q → ¬p",
    "p ∨ q, ¬p ⊢ q",
    "⊢ p ∨ ¬p",
    "¬(p ∧ q) ⊢ ¬p ∨ ¬q",
    "p → q ∨ r ⊢ (p → q) ∨ (p → r)",
    "(p → q) → p ⊢ p",
    "p ∨ (q ∧ r) ⊢ (p ∨ q) ∧ (p ∨ r)",
    "p ∨ q, p → r, q → s ⊢ r ∨ s",
  ];
  for (const text of SEQUENTS) {
    const goal = goalOf(text);
    const solved = solve(goal);
    assert.ok(solved.proof, text);
    assert.ok(verifyProof(solved.proof, goal, ruleSet("completo"), RULES).ok, text);
    const shown = proofTree(solved.proof, goal, OPTIONS);
    assert.equal(shown.status, "ready", text);
    assert.ok(equals(shown.tree.formula, goal.conclusion), text);
    for (const formula of openFormulas(shown.tree)) {
      assert.ok(goal.premises.some((premise) => equals(premise, formula)), `${text}: ${format(formula)} ficou solta`);
    }
    assertSound(shown.tree);
  }
});

test("a árvore da prova de cada regra derivada não tem hipóteses soltas", () => {
  for (const rule of RULES.filter(({ proof }) => proof)) {
    const proof = read(rule.proof);
    const premises = proof.lines.filter(({ kind }) => kind === "premise").map(({ formula }) => formula);
    const result = treeAt(proof, proof.lines.length, RULES);
    assert.ok(result.ok, rule.id);
    for (const formula of openFormulas(result.tree)) {
      assert.ok(premises.some((premise) => equals(premise, formula)), rule.id);
    }
  }
});

test("citationsInRuleOrder devolve a ordem das premissas, ou null", () => {
  const proof = read(`
    1 | p → q   premissa
    2 | p       premissa
    3 | q       →E, 1, 2
    4 | r       →E, 1, 2`);
  assert.deepEqual(citationsInRuleOrder(proof, 3, RULES).map(({ line }) => line), [2, 1]);
  assert.equal(citationsInRuleOrder(proof, 4, RULES), null);
});

for (const [lang, rule, hypothesis] of [["pt", "RA", "hipótese"], ["en", "RAA", "hypothesis"]]) {
  test(`HTML da árvore em ${lang}: sigla do idioma, hipótese entre parênteses e linha de cada nó`, () => {
    setLang(lang, { silent: true });
    const proof = read(`
      1 | ¬¬p₁    premissa
      2 |   ¬p₁   hipótese
      3 |   F     FI, 2, 1
      4 | p₁      RA, 2–3`);
    const html = treeHtml(treeOf(proof), proof);
    assert.ok(html.includes(`${rule}<sup>1</sup>`));
    assert.ok(html.includes("[¬p<sub>1</sub>]<sup>1</sup>"));
    assert.ok(!html.includes("<sup>2</sup>"));
    assert.deepEqual([...html.matchAll(/data-tree-line="(\d)"/g)].map((match) => match[1]), ["2", "1", "3", "4"]);
    assert.ok(html.includes(hypothesis));
    assert.ok(html.includes('tabindex="0"'));
    setLang("pt", { silent: true });
  });

  test(`estados do painel em ${lang}`, () => {
    setLang(lang, { silent: true });
    const proof = read(IMPLIES_INTRO);
    const ready = proofTree(proof, goalOf("p → q ⊢ p → q"), OPTIONS);
    assert.ok(treeBodyHtml(ready, proof).includes("gentzen"));
    assert.ok(treeBodyHtml(ready, proof).includes("tree-panel__caption"));
    assert.ok(treeBodyHtml({ status: "unfinished" }, proof).includes(lang === "pt" ? "estiver completa" : "is complete"));
    const large = treeBodyHtml({ status: "tooLarge", limit: 1000 }, proof);
    assert.ok(large.includes("msg-warn"));
    assert.ok(large.includes("1000"));
    setLang("pt", { silent: true });
  });
}

test("a árvore no Chrome, a 390px", { skip: !existsSync(process.env.CHROME_BIN || "/usr/bin/google-chrome") }, () => {
  const run = spawnSync("node", ["scripts/check-tree.mjs"], { encoding: "utf8", timeout: 120000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
