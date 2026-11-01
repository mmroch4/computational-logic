// Provas legíveis: comprimento máximo por exemplo, sem linhas inúteis e com a estratégia de cada passo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assumption, node, STRATEGY_CODES, subderivation, tidy, writeProof } from "../js/core/derivation.js";
import { and, atom, FALSUM, format, implies, not, or } from "../js/core/formula.js";
import { citeLine, createProof, deleteLine } from "../js/core/proof.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { formatSequent, parseSequent, sequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { verifyProof } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

const parse = (text) => {
  const result = parseSequent(text);
  assert.ok(result.ok, text);
  return result.sequent;
};

const proofOf = (text, rules = RULES) => {
  const result = solve(parse(text), { rules });
  assert.equal(result.provable, true, text);
  return result.proof;
};

// Sequente → [linhas com o catálogo completo, linhas só com as regras base]. Quem subir um destes
// números está a piorar as provas. As regras clássicas custam linhas em `base`: RA vira ¬I + ¬E.
const BENCHMARK = new Map([
  ["p ⊢ p", [1, 1]],
  ["p, q ⊢ p", [3, 3]],
  ["⊢ p → p", [2, 2]],
  ["p ⊢ q → p", [4, 4]],
  ["p ∧ q ⊢ q ∧ p", [4, 4]],
  ["p ∧ (q ∧ r) ⊢ (p ∧ q) ∧ r", [7, 7]],
  ["p → q, q → r ⊢ p → r", [6, 6]],
  ["p → (q → r) ⊢ (p ∧ q) → r", [7, 7]],
  ["(p ∧ q) → r ⊢ p → (q → r)", [7, 7]],
  ["⊢ (p → (q → r)) → ((p → q) → (p → r))", [9, 9]],
  ["p ∨ q ⊢ q ∨ p", [6, 6]],
  ["p ∨ (q ∨ r) ⊢ (p ∨ q) ∨ r", [12, 12]],
  ["p ∧ (q ∨ r) ⊢ (p ∧ q) ∨ (p ∧ r)", [10, 10]],
  ["(p ∧ q) ∨ (p ∧ r) ⊢ p ∧ (q ∨ r)", [14, 14]],
  ["p ∨ (q ∧ r) ⊢ (p ∨ q) ∧ (p ∨ r)", [14, 14]],
  ["(p ∨ q) ∧ (p ∨ r) ⊢ p ∨ (q ∧ r)", [13, 13]],
  ["p → r, q → r, p ∨ q ⊢ r", [8, 8]],
  ["p ∨ q, ¬p ⊢ q", [7, 7]],
  ["p, ¬p ⊢ q", [4, 4]],
  ["p → q, ¬q ⊢ ¬p", [6, 6]],
  ["p ⊢ ¬¬p", [4, 4]],
  ["¬¬p ⊢ p", [2, 2]],
  ["¬q → ¬p ⊢ p → ¬¬q", [7, 7]],
  ["p → q ⊢ ¬q → ¬p", [7, 7]],
  ["⊢ ¬(p ∧ ¬p)", [5, 5]],
  ["p → ¬p ⊢ ¬p", [5, 5]],
  ["⊢ p ∨ ¬p", [8, 10]],
  ["¬q → ¬p ⊢ p → q", [7, 8]],
  ["¬(p ∧ q) ⊢ ¬p ∨ ¬q", [13, 16]],
  ["¬p ∨ ¬q ⊢ ¬(p ∧ q)", [10, 10]],
  ["¬(p ∨ q) ⊢ ¬p ∧ ¬q", [10, 10]],
  ["¬p ∧ ¬q ⊢ ¬(p ∨ q)", [10, 10]],
  ["⊢ ((p → q) → p) → p", [10, 11]],
  ["p → q ⊢ ¬p ∨ q", [10, 12]],
  ["¬p ∨ q ⊢ p → q", [8, 8]],
  ["¬(p → q) ⊢ p ∧ ¬q", [15, 16]],
  ["⊢ (p → q) ∨ (q → p)", [12, 13]],
  ["(p → q) → q ⊢ (q → p) → p", [12, 13]],
  ["(¬p → q) ∧ (¬p → ¬q) ⊢ p", [8, 9]],
  ["p → q ∨ r ⊢ (p → q) ∨ (p → r)", [26, 28]],
  ["(p → q) ∧ (q → p), (q → r) ∧ (r → q) ⊢ p → r", [8, 8]],
  ["p → F ⊢ ¬p", [4, 4]],
]);

for (const [text, [complete, base]] of BENCHMARK) {
  test(`comprimento de ${text}`, () => {
    const inFull = proofOf(text);
    const inBase = proofOf(text, ruleSet("base"));
    assert.ok(inFull.lines.length <= complete, `completo: ${inFull.lines.length}`);
    assert.ok(inBase.lines.length <= base, `base: ${inBase.lines.length}`);
  });
}

test("¬q → ¬p ⊢ p → ¬¬q tem a prova de 7 linhas que se faria à mão", () => {
  const { lines } = proofOf("¬q → ¬p ⊢ p → ¬¬q");
  assert.deepEqual(lines.map(({ formula }) => format(formula)), [
    "¬q → ¬p", "p", "¬q", "¬p", "F", "¬¬q", "p → ¬¬q",
  ]);
  assert.deepEqual(lines.map(({ depth }) => depth), [0, 1, 2, 2, 2, 1, 0]);
});

test("uma distribuição não passa pelo absurdo só porque a premissa já implica o objetivo", () => {
  for (const text of ["p ∧ (q ∨ r) ⊢ (p ∧ q) ∨ (p ∧ r)", "(p ∨ q) ∧ (p ∨ r) ⊢ p ∨ (q ∧ r)", "p ∨ (q ∨ r) ⊢ (p ∨ q) ∨ r"]) {
    const rules = proofOf(text).lines.map(({ rule }) => rule);
    assert.ok(rules.includes("∨E") && !rules.includes("RA"), text);
  }
});

// Linhas inúteis: tudo o que não é premissa tem de chegar à conclusão pelas citações.

function unusedLines({ lines }) {
  const used = new Set();
  const pending = [lines.length];
  while (pending.length > 0) {
    const n = pending.pop();
    if (used.has(n)) continue;
    used.add(n);
    for (const citation of lines[n - 1].citations) {
      if (citation.kind === "line") pending.push(citation.line);
      else for (let line = citation.from; line <= citation.to; line += 1) pending.push(line);
    }
  }
  return lines.flatMap(({ kind }, index) => (
    kind === "premise" || used.has(index + 1) ? [] : [index + 1]
  ));
}

test("a auditoria de linhas inúteis apanha uma linha solta", () => {
  const p = atom("p");
  const { proof } = createProof([
    { kind: "premise", depth: 0, formula: and(p, p) },
    { kind: "step", depth: 0, formula: p, rule: "∧E", citations: [citeLine(1)] },
    { kind: "step", depth: 0, formula: p, rule: "∧E", citations: [citeLine(1)] },
  ]);
  assert.deepEqual(unusedLines(proof), [2]);
});

test("os exemplos não têm linhas nem subdeduções inúteis", () => {
  for (const text of BENCHMARK.keys()) {
    assert.deepEqual(unusedLines(proofOf(text)), [], text);
    assert.deepEqual(unusedLines(proofOf(text, ruleSet("base"))), [], text);
  }
});

function createRandom(seed) {
  let state = seed;
  return (limit) => {
    state = (Math.imul(state, 48271) >>> 0) % 2147483647;
    return state % limit;
  };
}

function randomFormula(random, size, names) {
  if (size <= 0) return atom(names[random(names.length)]);
  const choice = random(9);
  if (choice === 0) return FALSUM;
  if (choice <= 2) return not(randomFormula(random, size - 1, names));
  const left = randomFormula(random, random(size), names);
  const right = randomFormula(random, size - 1 - random(size), names);
  return [and, or, implies][choice % 3](left, right);
}

test("em sequentes aleatórios não há linhas inúteis e todos os passos têm estratégia", () => {
  let proved = 0;
  for (const seed of [0x4333, 32452843]) {
    const random = createRandom(seed);
    for (let round = 0; round < 400; round += 1) {
      const names = ["p", "q", "r", "s"].slice(0, 2 + random(3));
      const premises = Array.from({ length: random(4) }, () => randomFormula(random, 3, names));
      const goal = sequent(premises, randomFormula(random, 4, names));
      const result = solve(goal);
      if (!result.provable) continue;
      proved += 1;
      assert.deepEqual(unusedLines(result.proof), [], formatSequent(goal));
      for (const line of result.proof.lines) {
        if (line.kind !== "premise") assert.ok(STRATEGY_CODES.includes(line.strategy), formatSequent(goal));
      }
    }
  }
  assert.ok(proved > 100, String(proved));
});

// Arrumação da árvore, com derivações escritas à mão.

const entries = new Map();
const entry = (text) => {
  if (!entries.has(text)) {
    const { sequent: parsed } = parseSequent(`⊢ ${text}`);
    entries.set(text, { id: entries.size, formula: parsed.conclusion });
  }
  return entries.get(text);
};

test("sai o ∨E com um caso que não usa a hipótese", () => {
  const major = assumption(entry("a ∨ b"));
  const fact = assumption(entry("c"));
  const left = assumption(entry("a"));
  const right = assumption(entry("b"));
  const pointless = node(entry("c"), "∨E", [
    major,
    subderivation(left, fact, "assumeCase"),
    subderivation(right, fact, "assumeCase"),
  ]);
  assert.equal(tidy(pointless), fact);
});

test("fica o ∨E em que ambos os casos usam a hipótese", () => {
  const major = assumption(entry("a ∨ b"));
  const left = assumption(entry("a"));
  const right = assumption(entry("b"));
  const target = entry("a ∨ b ∨ c");
  const useful = node(target, "∨E", [
    major,
    subderivation(left, node(target, "∨I", [node(entry("a ∨ b"), "∨I", [left])]), "assumeCase"),
    subderivation(right, node(target, "∨I", [node(entry("a ∨ b"), "∨I", [right])]), "assumeCase"),
  ]);
  assert.equal(tidy(useful).rule, "∨E");
});

test("sai o RA que só contradiz o que já estava provado", () => {
  const fact = assumption(entry("a"));
  const hypothesis = assumption(entry("¬a"));
  const absurd = node(entry("F"), "FI", [fact, hypothesis]);
  const detour = node(entry("a"), "RA", [subderivation(hypothesis, absurd, "assumeNegation")]);
  assert.equal(tidy(detour), fact);
});

test("o nó que depende de uma hipótese descarregada não substitui nada", () => {
  const inner = assumption(entry("a"));
  const other = assumption(entry("a"));
  const repeated = node(entry("a → a"), "→I", [subderivation(inner, inner, "assumeAntecedent")]);
  const conclusion = node(entry("a"), "∨E", [
    assumption(entry("a ∨ a")),
    subderivation(inner, inner, "assumeCase"),
    subderivation(other, other, "assumeCase"),
  ]);
  assert.equal(tidy(repeated), repeated);
  assert.equal(tidy(conclusion), conclusion);
});

test("o que os dois ramos derivam sem as hipóteses deles é escrito uma só vez, antes dos ramos", () => {
  const major = assumption(entry("a ∨ b"));
  const premise = assumption(entry("c ∧ d"));
  const c = node(entry("c"), "∧E", [premise]);
  const left = assumption(entry("a"));
  const right = assumption(entry("b"));
  const target = entry("(a ∧ c) ∨ (b ∧ c)");
  const arm = (hypothesis, conjunction) => subderivation(
    hypothesis,
    node(target, "∨I", [node(entry(conjunction), "∧I", [hypothesis, c])]),
    "assumeCase",
  );
  const derivation = node(target, "∨E", [major, arm(left, "a ∧ c"), arm(right, "b ∧ c")]);
  const goal = parse("a ∨ b, c ∧ d ⊢ (a ∧ c) ∨ (b ∧ c)");

  const plain = writeProof(derivation, [major, premise]);
  const shared = writeProof(derivation, [major, premise], { share: true });
  assert.equal(plain.lines.length - shared.lines.length, 1);
  assert.deepEqual(shared.lines[2].depth, 0);
  assert.equal(format(shared.lines[2].formula), "c");
  assert.ok(verifyProof(shared, goal, RULES).ok);
});

test("o solver reutiliza um facto em vez de o repetir em cada caso", () => {
  const { lines } = proofOf("a ∨ b, c ∧ d ⊢ (a ∧ c) ∨ (b ∧ c)");
  assert.equal(lines.filter(({ rule }) => rule === "∧E").length, 1);
  assert.equal(lines.filter(({ rule }) => rule === "∧E")[0].depth, 0);
});

// Estratégias

const strategiesOf = ({ lines }) => lines.map(({ strategy }) => strategy);

test("as provas guardam a estratégia de cada passo e as premissas não têm nenhuma", () => {
  assert.deepEqual(strategiesOf(proofOf("¬q → ¬p ⊢ p → ¬¬q")), [
    undefined,
    "assumeAntecedent",
    "assumeToNegate",
    "useImplication",
    "reachContradiction",
    "concludeNegation",
    "concludeImplication",
  ]);
});

test("a estratégia distingue os casos, o absurdo, a repetição e o encadeamento", () => {
  assert.ok(strategiesOf(proofOf("p ∨ q ⊢ q ∨ p")).includes("assumeCase"));
  assert.ok(strategiesOf(proofOf("p ∨ q ⊢ q ∨ p")).includes("joinCases"));
  assert.ok(strategiesOf(proofOf("⊢ p ∨ ¬p")).includes("assumeNegation"));
  assert.ok(strategiesOf(proofOf("⊢ p ∨ ¬p")).includes("concludeByAbsurd"));
  assert.ok(strategiesOf(proofOf("⊢ p ∨ ¬p", ruleSet("base"))).includes("concludeByAbsurd"));
  assert.ok(strategiesOf(proofOf("p ⊢ q → p")).includes("repeatFact"));
  assert.ok(strategiesOf(proofOf("(p → q) → r, q ⊢ r")).includes("chainImplication"));
  const noClassical = ruleSet({ set: "completo", exclude: ["RA", "¬E"] });
  assert.ok(strategiesOf(proofOf("⊢ p ∨ ¬p", noClassical)).includes("excludedMiddle"));
  assert.deepEqual(
    strategiesOf(proofOf("p ∨ q, ¬p ⊢ q", ruleSet({ set: "restrito", only: ["SD"] }))),
    [undefined, undefined, "applyRule"],
  );
});

test("toda a estratégia tem texto nos dois idiomas, e nenhum texto fica por usar", () => {
  assert.deepEqual(Object.keys(pt.solver.strategies).sort(), [...STRATEGY_CODES].sort());
  assert.deepEqual(Object.keys(en.solver.strategies).sort(), [...STRATEGY_CODES].sort());
});

test("a estratégia não conta para o verificador nem atrapalha a edição da prova", () => {
  const goal = parse("p ∧ q ⊢ q ∧ p");
  const proof = proofOf("p ∧ q ⊢ q ∧ p");
  assert.ok(verifyProof(proof, goal, RULES).ok);
  const edited = deleteLine(proof, 2);
  assert.ok(edited.ok);
  assert.equal(edited.proof.lines[1].strategy, proof.lines[2].strategy);

  const { proof: plain } = createProof([{ kind: "premise", depth: 0, formula: atom("p") }]);
  assert.deepEqual(Object.keys(plain.lines[0]), ["kind", "depth", "formula", "rule", "citations"]);
});
