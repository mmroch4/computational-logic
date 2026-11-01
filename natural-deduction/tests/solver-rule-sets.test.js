// O solver com conjuntos de regras: toda a prova respeita o conjunto, e «sem prova» só sai demonstrado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { countermodel, refutes, respects } from "../js/core/countermodel.js";
import { and, atom, FALSUM, implies, not, or } from "../js/core/formula.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { formatSequent, parseSequent, sequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { activeRules, createUserRule } from "../js/core/user-rules.js";
import { verifyProof } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

const parse = (text) => {
  const result = parseSequent(text);
  assert.ok(result.ok, text);
  return result.sequent;
};

const SOME_CLASSICAL = { set: "completo", exclude: ["¬E", "RA", "TE"] };
const usedRules = ({ lines }) => [...new Set(lines.filter(({ kind }) => kind === "step").map(({ rule }) => rule))];

function assertProvedWith(text, spec) {
  const goal = parse(text);
  const rules = ruleSet(spec);
  const result = solve(goal, { rules });
  assert.equal(result.provable, true, `${text}: ${JSON.stringify(result.error ?? result.witness?.lattice)}`);
  assert.ok(verifyProof(result.proof, goal, rules, RULES).ok, text);
  return result.proof;
}

function assertNoProof(text, spec) {
  const goal = parse(text);
  const rules = ruleSet(spec);
  const result = solve(goal, { rules });
  assert.equal(result.ok, true, `${text}: ${JSON.stringify(result.error)}`);
  assert.equal(result.valid, true, text);
  assert.equal(result.provable, false, text);
  assert.equal(result.proof, undefined);
  for (const rule of rules) assert.ok(respects(result.witness, rule), `${text}: ${rule.id}`);
  assert.ok(refutes(result.witness, goal), text);
  return result.witness;
}

test("¬¬p ⊢ p não tem prova sem ¬E, RA e TE, com o catálogo ou só com as regras base", () => {
  assertNoProof("¬¬p ⊢ p", SOME_CLASSICAL);
  assertNoProof("¬¬p ⊢ p", { set: "base", exclude: ["¬E"] });
});

test("o modelo de ¬¬p ⊢ p é uma cadeia de três valores, com a conta feita à mão", () => {
  const witness = assertNoProof("¬¬p ⊢ p", SOME_CLASSICAL);
  assert.equal(witness.lattice, "chain");
  // Com 0 < 1 < 2 e p = 1, ¬p = 0 e ¬¬p = 2, por isso a premissa vale 2 e a conclusão 1.
  assert.deepEqual(witness.connectives.not, [2, 0, 0]);
  assert.deepEqual([...witness.valuation], [["p", 1]]);
});

test("basta uma das três regras para ¬¬p ⊢ p voltar a ter prova", () => {
  assert.ok(usedRules(assertProvedWith("¬¬p ⊢ p", { set: "completo", exclude: ["RA", "TE"] })).includes("¬E"));
  assert.ok(usedRules(assertProvedWith("¬¬p ⊢ p", { set: "completo", exclude: ["¬E", "TE"] })).includes("RA"));
  assert.ok(usedRules(assertProvedWith("¬¬p ⊢ p", { set: "completo", exclude: ["¬E", "RA"] })).includes("TE"));
});

test("sem RA, o passo clássico faz-se com ¬I e ¬E, e sem ¬E com TE", () => {
  for (const text of ["⊢ p ∨ ¬p", "¬(p ∧ q) ⊢ ¬p ∨ ¬q", "⊢ ((p → q) → p) → p"]) {
    const base = usedRules(assertProvedWith(text, "base"));
    assert.ok(!base.includes("RA"), text);
    assert.ok(usedRules(assertProvedWith(text, { set: "completo", exclude: ["RA", "¬E"] })).includes("TE"), text);
  }
});

test("as regras excluídas nunca aparecem na prova", () => {
  const proof = assertProvedWith("p → q, ¬q ⊢ ¬p", { set: "completo", exclude: ["→E", "FI"] });
  assert.deepEqual(usedRules(proof), ["MT"]);
});

test("as outras regras do conjunto são usadas quando faltam as base", () => {
  assert.deepEqual(usedRules(assertProvedWith("p ∨ q, ¬p ⊢ q", { set: "restrito", only: ["SD"] })), ["SD"]);
  assert.deepEqual(usedRules(assertProvedWith("p → q, q → r ⊢ p → r", { set: "restrito", only: ["SH"] })), ["SH"]);
});

test("sem as regras de um conectivo, o sequente não tem prova", () => {
  assertNoProof("p ⊢ p ∨ q", { set: "base", exclude: ["∨I", "¬E", "FE"] });
  assertNoProof("p ∧ q ⊢ p", { set: "restrito", only: ["∧I", "→I", "→E", "R"] });
  assertNoProof("p, q ⊢ p ∧ q", { set: "restrito", only: ["∧E", "R"] });
  assertNoProof("p, ¬p ⊢ q", { set: "base", exclude: ["FE", "¬E"] });
  assertNoProof("⊢ p → p", { set: "restrito", only: ["→E"] });
});

test("os modelos separam a lógica intuicionista e a do terceiro excluído fraco da clássica", () => {
  const noClassical = { set: "base", exclude: ["¬E"] };
  assertNoProof("⊢ p ∨ ¬p", noClassical);
  assertNoProof("⊢ ¬p ∨ ¬¬p", noClassical);
  assertNoProof("⊢ (p → q) ∨ (q → p)", noClassical);
  assertNoProof("⊢ ((p → q) → p) → p", noClassical);
  assertNoProof("⊢ (p → q) ∨ (q → p)", SOME_CLASSICAL);
});

test("um sequente inválido dá sempre o contraexemplo, mesmo sem regras para o provar", () => {
  const result = solve(parse("p ⊢ q"), { rules: ruleSet({ set: "restrito", only: ["R"] }) });
  assert.equal(result.valid, false);
  assert.equal(result.provable, undefined);
  assert.ok(result.counterexample);
});

test("com o limite atingido num sequente com prova, não se afirma que não há prova", () => {
  const rules = ruleSet("base");
  const result = solve(parse("⊢ ((p → q) → p) → p"), { rules, maxSteps: 2 });
  assert.deepEqual(result, { ok: false, error: { code: "stepLimit", params: { max: 2 } } });
});

test("o limite atingido não apaga uma demonstração de que não há prova", () => {
  const rules = ruleSet(SOME_CLASSICAL);
  const result = solve(parse("¬¬p ⊢ p"), { rules, maxSteps: 2 });
  assert.equal(result.provable, false);
});

test("sem prova encontrada nem modelo, o resultado é inconclusivo", () => {
  // Tem prova, por uma instância de DM que a procura não encontra.
  const withProof = solve(parse("⊢ ¬p ∨ ¬¬p"), { rules: ruleSet(SOME_CLASSICAL) });
  assert.deepEqual(withProof, { ok: false, error: { code: "searchExhausted", params: {} } });
  // Sem R, a subdedução interior não pode acabar em p, mas isto não se vê num modelo.
  const withoutR = solve(parse("⊢ p → (q → p)"), { rules: ruleSet({ set: "restrito", only: ["→I"] }) });
  assert.deepEqual(withoutR, { ok: false, error: { code: "searchExhausted", params: {} } });
});

test("uma regra do utilizador conta como ativa, na procura e no modelo", () => {
  const created = createUserRule({ name: "Dupla", premises: ["¬¬φ"], conclusion: "φ" }, []);
  assert.ok(created.ok);
  const allowed = ruleSet(SOME_CLASSICAL);
  const goal = parse("¬¬p ⊢ p");
  assert.equal(solve(goal, { rules: allowed }).provable, false);

  const rules = [...allowed, created.rule];
  assert.equal(countermodel(goal, rules), null);
  const result = solve(goal, { rules });
  assert.equal(result.provable, true);
  const verdict = verifyProof(result.proof, goal, rules, [...RULES, created.rule]);
  assert.ok(verdict.ok && verdict.usesUserRules);
});

test("uma regra do utilizador com um átomo literal entra no modelo como metavariável", () => {
  const created = createUserRule({ name: "Fixa", premises: ["¬¬a"], conclusion: "a" }, []);
  assert.ok(created.ok);
  const rules = [...ruleSet(SOME_CLASSICAL), created.rule];
  const result = solve(parse("¬¬a ⊢ a"), { rules });
  assert.equal(result.provable, true);
});

test("o conjunto de `activeRules` chega ao solver", () => {
  const created = createUserRule({ name: "Dupla", premises: ["¬¬φ"], conclusion: "φ" }, []);
  const { rules } = activeRules({ rules: { set: "base", plus: ["MT"] } }, [created.rule]);
  assert.ok(rules.includes(created.rule));
  assert.equal(solve(parse("¬¬p ⊢ p"), { rules }).provable, true);
});

test("as mensagens só falam em «não há prova» quando isso está demonstrado", () => {
  assert.match(pt.solver.noProof, /não tem prova com estas regras/);
  assert.match(en.solver.noProof, /no proof with these rules/);
  for (const code of ["stepLimit", "searchExhausted"]) {
    assert.match(pt.solver.errors[code], /não quer dizer que não haja prova/);
    assert.match(en.solver.errors[code], /does not mean there is no proof/);
  }
});

// Nenhum modelo pode refutar o que tem prova: é a garantia de que «sem prova» é verdade.

const PROVED = [
  "p ⊢ ¬¬p", "¬¬p ⊢ p", "⊢ p ∨ ¬p", "⊢ ¬¬(p ∨ ¬p)", "p → q, ¬q ⊢ ¬p", "¬(p ∧ q) ⊢ ¬p ∨ ¬q",
  "¬p ∧ ¬q ⊢ ¬(p ∨ q)", "p ∨ q, ¬p ⊢ q", "⊢ (p → q) ∨ (q → p)", "⊢ ((p → q) → p) → p",
  "p ∧ (q ∨ r) ⊢ (p ∧ q) ∨ (p ∧ r)", "F ⊢ p", "p, ¬p ⊢ q", "⊢ p → (q → p)",
];

function assertNoCountermodel(goal, proof) {
  const rules = RULES.filter(({ id }) => usedRules(proof).includes(id));
  const found = countermodel(goal, rules);
  assert.equal(found, null, `${formatSequent(goal)} com ${usedRules(proof)}: ${found?.lattice}`);
}

test("o que tem prova não tem modelo que o refute, só com as regras usadas nessa prova", () => {
  for (const text of PROVED) {
    const goal = parse(text);
    assertNoCountermodel(goal, solve(goal).proof);
    assertNoCountermodel(goal, solve(goal, { rules: ruleSet("base") }).proof);
  }
});

test("as provas guardadas das regras derivadas também não têm modelo que as refute", async () => {
  const { parseProof } = await import("../js/core/proof-text.js");
  const { ruleGoal } = await import("../js/core/rules.js");
  for (const rule of RULES.filter(({ proof }) => proof)) {
    const parsed = parseProof(rule.proof);
    assert.ok(parsed.ok, rule.id);
    assertNoCountermodel(ruleGoal(rule), parsed.proof);
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

const SEEDS = [0x4332, 15485863];
const TRIES_PER_SEED = 300;
const REMOVABLE = ["¬E", "RA", "TE", "FE", "¬I", "∨E", "→I", "MT", "DM", "SD"];

test("em sequentes e conjuntos aleatórios, nada contradiz o verificador", () => {
  const outcomes = { proved: 0, noProof: 0, inconclusive: 0 };
  for (const seed of SEEDS) {
    const random = createRandom(seed);
    for (let round = 0; round < TRIES_PER_SEED; round += 1) {
      const names = ["p", "q", "r"].slice(0, 1 + random(3));
      const premises = Array.from({ length: random(3) }, () => randomFormula(random, 2, names));
      const goal = sequent(premises, randomFormula(random, 3, names));
      const exclude = REMOVABLE.filter(() => random(3) === 0);
      const rules = ruleSet({ set: "completo", exclude });
      const result = solve(goal, { rules });
      const text = `${formatSequent(goal)} sem ${exclude}`;
      if (result.ok && !result.valid) continue;
      if (result.provable) {
        outcomes.proved += 1;
        assert.ok(verifyProof(result.proof, goal, rules, RULES).ok, text);
        assert.equal(countermodel(goal, rules), null, text);
        for (const id of usedRules(result.proof)) assert.ok(!exclude.includes(id), text);
      } else if (result.provable === false) {
        outcomes.noProof += 1;
        // A mesma afirmação com as regras todas seria falsa: o catálogo completo prova o sequente.
        assert.ok(solve(goal).provable, text);
      } else {
        outcomes.inconclusive += 1;
        assert.ok(["searchExhausted", "stepLimit"].includes(result.error.code), text);
      }
    }
  }
  assert.ok(outcomes.proved > 50, JSON.stringify(outcomes));
  assert.ok(outcomes.noProof > 5, JSON.stringify(outcomes));
});
