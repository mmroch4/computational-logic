import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXERCISES,
  checkAttempt,
  exerciseGoal,
  exerciseSolution,
  findExercise,
  isExerciseId,
  progressStatus,
  progressSummary,
  recordMark,
  validateExercise,
  validateExercises,
} from "../js/core/exercises.js";
import { FIND_ERROR_PUZZLES } from "../js/core/find-error.js";
import { parseProof } from "../js/core/proof-text.js";
import { DERIVED_RULES, RULES, ruleGoal, ruleSet } from "../js/core/rules.js";
import { formatSequent, parseSequent } from "../js/core/sequent.js";
import { createUserRule, userRulesEnabled } from "../js/core/user-rules.js";
import { verifyProof } from "../js/core/verify.js";
import { LOCALES } from "../js/ui/i18n.js";
import { createStorage } from "../js/ui/storage.js";
import { COURSE_SEQUENTS } from "./fixtures/course-sequents.js";

const GOOD = Object.freeze({
  id: "ex-fixture",
  level: 1,
  sequent: "a ∧ b ⊢ a",
  rules: "base",
  solution: "1 | a ∧ b   premissa\n2 | a       ∧E, 1",
});

const proofOf = (text) => {
  const parsed = parseProof(text);
  assert.ok(parsed.ok, text);
  return parsed.proof;
};

const CONTRA = createUserRule({ name: "Contra", premises: ["φ → ψ"], conclusion: "¬ψ → ¬φ" }, []).rule;

// Com a regra Contra: não usa SD, MT nem subdeduções.
const OWN_RULE_ATTEMPT = {
  ...GOOD,
  id: "ex-own-rule",
  sequent: "a → b ⊢ ¬b → ¬a",
  rules: "completo",
  solution: "1 | a → b     premissa\n2 | ¬b → ¬a   Contra, 1",
};

const CLEAN_ATTEMPT = `
1 | a → b     premissa
2 |   ¬b      hipótese
3 |   ¬a      MT, 1, 2
4 | ¬b → ¬a   →I, 2–3`.trim();

test("todas as soluções são aceites pelo verificador com o conjunto do exercício", () => {
  assert.ok(EXERCISES.length > 0);
  for (const exercise of EXERCISES) {
    const parsed = parseProof(exercise.solution.trim());
    assert.ok(parsed.ok, exercise.id);
    const result = verifyProof(parsed.proof, exerciseGoal(exercise), ruleSet(exercise.rules), RULES);
    assert.equal(result.ok, true, exercise.id);
    assert.equal(result.usesUserRules, false, exercise.id);
  }
});

test("o catálogo passa em todas as validações", () => {
  assert.deepEqual(validateExercises(EXERCISES), {});
});

test("cada exercício se resolve com a própria solução e conta como resolvido", () => {
  for (const exercise of EXERCISES) {
    const { result, mark } = checkAttempt(exercise, exerciseSolution(exercise), [CONTRA]);
    assert.equal(result.ok, true, exercise.id);
    assert.equal(mark, "solved", exercise.id);
  }
});

test("há exemplos de todas as formas de conjunto", () => {
  const specs = EXERCISES.map(({ rules }) => rules);
  assert.ok(specs.includes("base"));
  assert.ok(specs.includes("completo"));
  assert.ok(specs.some((spec) => spec.set === "base" && spec.plus));
  assert.ok(specs.some((spec) => spec.set === "restrito"));
  assert.ok(specs.some((spec) => spec.exclude));
});

test("as dicas têm texto nos dois idiomas", () => {
  const keys = EXERCISES.flatMap(({ hints = [] }) => hints);
  assert.ok(keys.length > 0);
  for (const locale of Object.values(LOCALES)) {
    for (const key of keys) assert.ok(locale.exercises.hints[key], key);
  }
});

const atomsOf = (formula) => (
  formula.kind === "atom" ? [formula.name] : formula.args.flatMap(atomsOf)
);

const SIGNS = { and: "∧", or: "∨" };

/** A fórmula em texto, com os nomes de `names` e os dois lados de ∧ e ∨ por ordem fixa. */
function shape(formula, names) {
  if (formula.kind === "atom") return names.get(formula.name);
  if (formula.kind === "falsum") return "F";
  if (formula.kind === "not") return `¬${shape(formula.args[0], names)}`;
  const [left, right] = formula.args.map((arg) => shape(arg, names));
  if (formula.kind === "implies") return `(${left}→${right})`;
  return `(${[left, right].sort().join(SIGNS[formula.kind])})`;
}

function* orderings(items) {
  if (items.length < 2) yield items;
  for (const [index, item] of items.entries()) {
    if (items.length < 2) break;
    for (const rest of orderings(items.toSpliced(index, 1))) yield [item, ...rest];
  }
}

/**
 * A forma de um sequente a menos de letras, da ordem das premissas, dos lados de ∧ e ∨ e de passar um
 * antecedente da conclusão para as premissas: A ⊢ B → C e A, B ⊢ C são o mesmo enunciado.
 */
function fingerprint(text) {
  const parsed = parseSequent(text);
  assert.ok(parsed.ok, text);
  const premises = [...parsed.sequent.premises];
  let { conclusion } = parsed.sequent;
  while (conclusion.kind === "implies") {
    premises.push(conclusion.args[0]);
    [, conclusion] = conclusion.args;
  }
  const atoms = [...new Set([...premises, conclusion].flatMap(atomsOf))];
  let best = null;
  for (const order of orderings(atoms)) {
    const names = new Map(order.map((name, index) => [name, `x${index}`]));
    const text = `${premises.map((premise) => shape(premise, names)).sort().join(",")}⊢${shape(conclusion, names)}`;
    if (best === null || text < best) best = text;
  }
  return best;
}

const isRuleProof = ({ rules }) => (rules.exclude ?? []).length > 0;

test("a impressão digital ignora letras, ordem e antecedentes, mas não a estrutura", () => {
  assert.equal(fingerprint("a ∧ b, c ⊢ d → b"), fingerprint("x, w, z ∧ y ⊢ z"));
  assert.equal(fingerprint("⊢ p → (q → p)"), fingerprint("x, y ⊢ x"));
  assert.notEqual(fingerprint("a ∧ b ⊢ a"), fingerprint("a ∨ b ⊢ a"));
  assert.notEqual(fingerprint("a → b ⊢ a"), fingerprint("b → a ⊢ a"));
});

test("nenhum enunciado coincide com os materiais da cadeira", () => {
  const course = new Map(COURSE_SEQUENTS.map((text) => [fingerprint(text), text]));
  assert.ok(course.size > 90);
  for (const exercise of EXERCISES.filter((item) => !isRuleProof(item))) {
    const copied = course.get(fingerprint(exercise.sequent));
    assert.equal(copied, undefined, `${exercise.id} coincide com ${copied}`);
  }
});

test("nenhum desafio de encontrar o erro coincide com os materiais da cadeira", () => {
  const course = new Map(COURSE_SEQUENTS.map((text) => [fingerprint(text), text]));
  for (const { id, sequent } of FIND_ERROR_PUZZLES) {
    const copied = course.get(fingerprint(sequent));
    assert.equal(copied, undefined, `${id} coincide com ${copied}`);
  }
});

test("os enunciados são todos diferentes, a menos de letras e de ordem", () => {
  // As duas formas de SD só diferem na ordem da disjunção, e cada uma tem o seu exercício.
  const seen = new Map();
  for (const exercise of EXERCISES) {
    const print = fingerprint(exercise.sequent);
    const earlier = seen.get(print);
    const sameRule = earlier && String(earlier.rules.exclude) === String(exercise.rules.exclude);
    assert.ok(!earlier || (isRuleProof(exercise) && sameRule), `${exercise.id} repete ${earlier?.id}`);
    seen.set(print, exercise);
  }
});

test("o catálogo tem cerca de 50 exercícios em cinco níveis seguidos", () => {
  assert.ok(EXERCISES.length >= 45 && EXERCISES.length <= 55, String(EXERCISES.length));
  const levels = [...new Set(EXERCISES.map(({ level }) => level))].sort();
  assert.deepEqual(levels, [1, 2, 3, 4, 5]);
  for (const level of levels) {
    assert.ok(EXERCISES.filter((item) => item.level === level).length >= 5, `nível ${level}`);
  }
});

test("cada forma de cada derivada tem um exercício que a prova só com regras base", () => {
  for (const [index, rule] of DERIVED_RULES.entries()) {
    const goal = fingerprint(formatSequent(ruleGoal(rule)));
    const exercise = EXERCISES.find((item) => isRuleProof(item) && fingerprint(item.sequent) === goal);
    assert.ok(exercise, `${rule.id}, forma ${index}`);
    assert.deepEqual(exercise.rules, { set: "base", exclude: [rule.id] });
    assert.equal(userRulesEnabled(exercise), false, exercise.id);
    assert.equal(ruleSet(exercise.rules).some(({ id }) => id === rule.id), false, exercise.id);
  }
  assert.equal(EXERCISES.filter(isRuleProof).length, DERIVED_RULES.length);
});

test("o nível 1 não precisa de subdeduções", () => {
  for (const exercise of EXERCISES.filter(({ level }) => level === 1)) {
    const { lines } = exerciseSolution(exercise);
    assert.ok(lines.every(({ depth }) => depth === 0), exercise.id);
  }
});

test("o nível 4 pratica as derivadas: as soluções usam-nas e o conjunto deixa", () => {
  const derived = new Set(DERIVED_RULES.map(({ id }) => id));
  for (const exercise of EXERCISES.filter(({ level }) => level === 4)) {
    const used = exerciseSolution(exercise).lines.filter(({ rule }) => derived.has(rule));
    assert.ok(used.length > 0, exercise.id);
  }
});

test("as variáveis não usam nomes reservados nem as metavariáveis", () => {
  for (const { id, sequent } of EXERCISES) {
    const { premises, conclusion } = parseSequent(sequent).sequent;
    const atoms = [...premises, conclusion].flatMap(atomsOf);
    assert.ok(atoms.every((name) => /^[a-z]$/.test(name) && name !== "v"), id);
  }
});

test("findExercise encontra pelo id", () => {
  assert.equal(findExercise("ex-prove-mt").level, 3);
  assert.equal(findExercise("ex-nada"), null);
});

test("um exercício que pede para provar uma regra não a deixa usar", () => {
  const exercise = findExercise("ex-prove-mt");
  assert.equal(userRulesEnabled(exercise), false);
  const { result, mark } = checkAttempt(exercise, proofOf("1 | p → q   premissa\n2 | ¬q      premissa\n3 | ¬p      MT, 1, 2"));
  assert.equal(result.ok, false);
  assert.equal(result.lineErrors[0].code, "ruleNotAllowed");
  assert.equal(mark, null);
});

test("uma regra fora do conjunto restrito é recusada", () => {
  const exercise = findExercise("ex-pick-and-pair");
  const attempt = proofOf("1 | m ∧ n   premissa\n2 | k       premissa\n3 | n       ∧E, 1\n4 | n       R, 3\n5 | k ∧ n   ∧I, 2, 4");
  assert.equal(checkAttempt(exercise, attempt).result.lineErrors[0].code, "ruleNotAllowed");
});

test("uma prova de outro sequente não resolve o exercício", () => {
  const { result, mark } = checkAttempt(findExercise("ex-two-links"), proofOf("1 | r   premissa\n2 | r   R, 1"));
  assert.equal(result.ok, false);
  assert.equal(mark, null);
});

test("uma regra própria dá «resolvido com regras próprias» onde está ativa", () => {
  const { mark } = checkAttempt(OWN_RULE_ATTEMPT, exerciseSolution(OWN_RULE_ATTEMPT), [CONTRA]);
  assert.equal(mark, "solvedWithUserRules");
  assert.equal(checkAttempt(OWN_RULE_ATTEMPT, proofOf(CLEAN_ATTEMPT), [CONTRA]).mark, "solved");
});

test("uma regra própria é recusada onde está desligada", () => {
  const disabled = [
    { ...OWN_RULE_ATTEMPT, userRules: false },
    { ...OWN_RULE_ATTEMPT, rules: "base" },
    { ...OWN_RULE_ATTEMPT, rules: { set: "restrito", only: ["MT"] } },
    { ...OWN_RULE_ATTEMPT, rules: { set: "completo", exclude: ["MT"] } },
  ];
  for (const exercise of disabled) {
    const { result, mark } = checkAttempt(exercise, exerciseSolution(exercise), [CONTRA]);
    assert.equal(result.lineErrors[0].code, "ruleNotAllowed");
    assert.equal(mark, null);
  }
});

test("a validação aceita um exercício bem escrito", () => {
  assert.deepEqual(validateExercise(GOOD), []);
  assert.deepEqual(validateExercise({ ...GOOD, hints: ["uma"], userRules: false }), []);
});

test("a validação apanha os erros do autor", () => {
  const cases = [
    [{ id: "fixture" }, "badId"],
    [{ id: "ex-Maiúsculas" }, "badId"],
    [{ id: undefined }, "badId"],
    [{ level: 0 }, "badLevel"],
    [{ level: "1" }, "badLevel"],
    [{ rules: "tudo" }, "badRules"],
    [{ rules: { set: "base", plus: ["XYZ"] } }, "badRules"],
    [{ userRules: true }, "userRulesConflict"],
    [{ sequent: "a ∧ ⊢ a" }, "badSequent"],
    [{ sequent: undefined }, "badSequent"],
    [{ sequent: "a & b |- a" }, "sequentNotCanonical"],
    [{ solution: undefined }, "badSolution"],
    [{ solution: "isto não é uma prova" }, "badSolution"],
    [{ sequent: "a ∧ b ⊢ b" }, "solutionRejected"],
    [{ rules: { set: "restrito", only: ["∧I"] } }, "solutionRejected"],
    [{ hints: "uma" }, "badHints"],
    [{ hints: [""] }, "badHints"],
  ];
  for (const [change, code] of cases) {
    assert.ok(validateExercise({ ...GOOD, ...change }).includes(code), code);
  }
});

test("a validação recusa ids repetidos", () => {
  assert.deepEqual(validateExercises([GOOD, GOOD]), { "ex-fixture": ["duplicateId"] });
  assert.deepEqual(validateExercises([GOOD, { ...GOOD, id: "ex-other" }]), {});
});

test("o progresso regista «resolvido» e «resolvido com regras próprias»", () => {
  assert.equal(progressStatus(recordMark(null, "solved")), "solved");
  assert.equal(progressStatus(recordMark(null, "solvedWithUserRules")), "solvedWithUserRules");
});

test("o progresso nunca desce", () => {
  const solved = recordMark(null, "solved");
  assert.equal(progressStatus(recordMark(solved, "solvedWithUserRules")), "solved");
  const own = recordMark(null, "solvedWithUserRules");
  assert.equal(progressStatus(recordMark(own, "solved")), "solved");
});

test("uma tentativa falhada não muda o progresso", () => {
  assert.equal(recordMark(undefined, null), null);
  const own = recordMark(null, "solvedWithUserRules");
  assert.equal(recordMark(own, null), own);
});

test("recordMark guarda o resto da entrada e ignora entradas estragadas", () => {
  assert.deepEqual(recordMark({ draft: "x" }, "solved"), { draft: "x", status: "solved" });
  assert.deepEqual(recordMark("lixo", "solved"), { status: "solved" });
  assert.deepEqual(recordMark([1], "solved"), { status: "solved" });
});

test("um estado desconhecido conta como por resolver", () => {
  for (const entry of [null, undefined, "solved", 1, {}, { status: "feito" }, { status: "toString" }]) {
    assert.equal(progressStatus(entry), null);
  }
});

test("o resumo conta cada estado à parte", () => {
  const list = [{ id: "ex-a" }, { id: "ex-b" }, { id: "ex-c" }, { id: "constructor" }];
  const progress = {
    "ex-a": { status: "solved" },
    "ex-b": { status: "solvedWithUserRules" },
    "ex-outro": { status: "solved" },
  };
  assert.deepEqual(progressSummary(list, progress), { total: 4, solved: 1, solvedWithUserRules: 1, pending: 2 });
  assert.deepEqual(progressSummary([], {}), { total: 0, solved: 0, solvedWithUserRules: 0, pending: 0 });
});

test("o progresso sobrevive ao storage e repor só apaga exercícios", () => {
  const data = new Map();
  const backend = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const id = "ex-rule-out-a-case";
  const exercise = findExercise(id);
  const first = createStorage(backend);
  const { mark } = checkAttempt(exercise, exerciseSolution(exercise));
  first.setProgress(id, recordMark(first.getProgress(id), mark));
  first.setProgress("quiz-1", { answered: true });

  const second = createStorage(backend);
  assert.equal(progressStatus(second.getProgress(id)), "solved");
  assert.deepEqual(progressSummary([exercise], second.getAllProgress()).solved, 1);

  second.resetProgress(isExerciseId);
  assert.equal(second.getProgress(id), null);
  assert.deepEqual(second.getProgress("quiz-1"), { answered: true });
});
