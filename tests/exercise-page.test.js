// A lógica e o HTML da página Exercícios. No Chrome, os dois modos até ao fim: scripts/check-exercises.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  EXERCISE_MODES, entryStatus, findEntry, hasProgress, levelGroups, listMode, nextExercise, overallSummary, ruleDetails,
  ruleSummary,
} from "../js/core/exercise-page.js";
import { EXERCISES } from "../js/core/exercises.js";
import { FIND_ERROR_PUZZLES } from "../js/core/find-error.js";
import { detailHeadHtml, authorHintsHtml, notFoundHtml, resultHtml, rulesHtml } from "../js/ui/exercise-detail.js";
import { exerciseHref, exerciseListHtml, nextHtml, progressHtml, ruleSummaryText } from "../js/ui/exercise-list.js";
import { LOCALES, setLang } from "../js/ui/i18n.js";

const FIRST = EXERCISES[0];
const LAST = EXERCISES.at(-1);
const PUZZLE = FIND_ERROR_PUZZLES[0];
const TOTAL = EXERCISES.length + FIND_ERROR_PUZZLES.length;
const solvedAll = (list) => Object.fromEntries(list.map(({ id }) => [id, { status: "solved" }]));

test("findEntry encontra os dois modos e recusa o que não existe", () => {
  assert.deepEqual(findEntry(FIRST.id), { mode: "proof", exercise: FIRST });
  assert.deepEqual(findEntry(PUZZLE.id), { mode: "findError", exercise: PUZZLE });
  assert.equal(findEntry("ex-nothing"), null);
  assert.equal(findEntry("constructor"), null);
});

test("listMode só aceita os modos que existem", () => {
  assert.deepEqual(EXERCISE_MODES, ["proof", "findError"]);
  assert.equal(listMode(""), "proof");
  assert.equal(listMode("?mode=findError"), "findError");
  assert.equal(listMode("?mode=other"), "proof");
});

test("levelGroups dá todos os exercícios por ordem de nível", () => {
  for (const [mode, list] of [["proof", EXERCISES], ["findError", FIND_ERROR_PUZZLES]]) {
    const groups = levelGroups(mode);
    const levels = groups.map(({ level }) => level);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
    assert.equal(groups.flatMap(({ items }) => items).length, list.length);
  }
});

test("levelGroups filtra por estado e tira os níveis vazios", () => {
  const progress = { [FIRST.id]: { status: "solved" }, [LAST.id]: { status: "solvedWithUserRules" } };
  const done = levelGroups("proof", progress, "done");
  assert.deepEqual(done.flatMap(({ items }) => items.map(({ status }) => status)), ["solved", "solvedWithUserRules"]);
  assert.deepEqual(done.map(({ level }) => level), [FIRST.level, LAST.level]);
  const todo = levelGroups("proof", progress, "todo").flatMap(({ items }) => items);
  assert.equal(todo.length, EXERCISES.length - 2);
  assert.ok(todo.every(({ status }) => status === "todo"));
  assert.deepEqual(levelGroups("proof", solvedAll(EXERCISES), "todo"), []);
});

test("uma entrada estranha no progresso conta como por fazer", () => {
  assert.equal(entryStatus(null), "todo");
  assert.equal(entryStatus({ status: "maybe" }), "todo");
  assert.equal(levelGroups("proof", { [FIRST.id]: "lixo" })[0].items[0].status, "todo");
});

test("overallSummary junta os dois modos, com as regras próprias à parte", () => {
  const progress = { [FIRST.id]: { status: "solved" }, [PUZZLE.id]: { status: "solved" }, [LAST.id]: { status: "solvedWithUserRules" } };
  assert.deepEqual(overallSummary(progress), { total: TOTAL, solved: 2, solvedWithUserRules: 1, pending: TOTAL - 3 });
});

test("hasProgress ignora o quiz do Aprender, que partilha a chave", () => {
  assert.equal(hasProgress({}), false);
  assert.equal(hasProgress({ "quiz-1": { score: 2 } }), false);
  assert.equal(hasProgress({ [FIRST.id]: { status: "solved" } }), true);
});

test("nextExercise segue a lista, salta os resolvidos e volta ao início", () => {
  assert.equal(nextExercise("proof").id, FIRST.id);
  assert.equal(nextExercise("proof", { [FIRST.id]: { status: "solved" } }).id, EXERCISES[1].id);
  assert.equal(nextExercise("proof", {}, FIRST.id).id, EXERCISES[1].id);
  assert.equal(nextExercise("proof", {}, LAST.id).id, FIRST.id);
  assert.equal(nextExercise("findError", {}, PUZZLE.id).id, FIND_ERROR_PUZZLES[1].id);
});

test("nextExercise nunca sugere o que se acabou de fazer e acaba em null", () => {
  const allButOne = solvedAll(EXERCISES.slice(1));
  assert.equal(nextExercise("proof", allButOne, FIRST.id), null);
  assert.equal(nextExercise("proof", allButOne).id, FIRST.id);
  assert.equal(nextExercise("proof", solvedAll(EXERCISES)), null);
});

test("ruleSummary descreve cada forma de conjunto", () => {
  assert.deepEqual(ruleSummary({ rules: "base" }), { kind: "base", rules: [] });
  assert.deepEqual(ruleSummary({ rules: "completo" }), { kind: "all", rules: [] });
  assert.deepEqual(ruleSummary({ rules: { set: "restrito", only: ["∧I"] } }), { kind: "only", rules: ["∧I"] });
  assert.deepEqual(ruleSummary({ rules: { set: "base", plus: ["MT"] } }), { kind: "plus", rules: ["MT"] });
  assert.deepEqual(ruleSummary({ rules: { set: "base", exclude: ["SH"] } }), { kind: "prove", rules: ["SH"] });
});

test("ruleSummaryText funciona em todos os exercícios e usa as siglas do idioma", () => {
  for (const exercise of [...EXERCISES, ...FIND_ERROR_PUZZLES]) {
    assert.doesNotMatch(ruleSummaryText(exercise), /exercises\.|\{/, exercise.id);
  }
  setLang("en", { silent: true });
  assert.equal(ruleSummaryText({ rules: { set: "base", exclude: ["RA"] } }), "Prove RAA with base rules only");
  setLang("pt", { silent: true });
  assert.equal(ruleSummaryText({ rules: { set: "base", exclude: ["RA"] } }), "Prova RA só com regras base");
});

test("ruleDetails diz o que se pode usar em cada caso", () => {
  const proving = ruleDetails({ rules: { set: "base", exclude: ["MT"] } });
  assert.ok(!proving.allowed.includes("MT"));
  assert.deepEqual(proving.proves, ["MT"]);
  assert.equal(proving.userRules, false);
  assert.deepEqual(ruleDetails({ rules: { set: "restrito", only: ["∧I", "∧E"] } }).allowed, ["∧I", "∧E"]);
  assert.equal(ruleDetails({ rules: "completo" }).userRules, true);
  assert.equal(ruleDetails({ rules: { set: "base", plus: ["MT"] } }).allowed.includes("MT"), true);
});

test("os níveis das provas têm título nos dois idiomas", () => {
  for (const { level } of levelGroups("proof")) {
    assert.equal(typeof LOCALES.pt.exercises.levels[level], "string");
    assert.equal(typeof LOCALES.en.exercises.levels[level], "string");
  }
});

test("a lista mostra os níveis, os modos, os filtros e cada exercício com ligação", () => {
  const html = exerciseListHtml({});
  assert.equal((html.match(/class="exercise-item"/g) ?? []).length, EXERCISES.length);
  assert.equal((html.match(/class="exercise-group"/g) ?? []).length, levelGroups("proof").length);
  assert.ok(html.includes(`href="${exerciseHref(FIRST.id)}"`));
  assert.ok(html.includes('data-list-mode="findError" aria-pressed="false"'));
  assert.ok(html.includes('data-filter="all" aria-pressed="true"'));
  assert.ok(html.includes("Nível 1 · Sem subdeduções"));
  assert.ok(!html.includes("data-reset"), "sem progresso não há nada a repor");
});

test("a lista do outro modo só traz os desafios", () => {
  const html = exerciseListHtml({}, { mode: "findError" });
  assert.equal((html.match(/class="exercise-item"/g) ?? []).length, FIND_ERROR_PUZZLES.length);
  assert.ok(html.includes(`href="${exerciseHref(PUZZLE.id)}"`));
  assert.ok(!html.includes(`href="${exerciseHref(LAST.id)}"`));
});

test("o estado de cada exercício tem texto, e «com regras próprias» fica à parte", () => {
  const html = exerciseListHtml({ [FIRST.id]: { status: "solved" }, [LAST.id]: { status: "solvedWithUserRules" } });
  assert.ok(html.includes('<span class="sr-only">Resolvido:</span>'));
  assert.ok(html.includes('<span class="sr-only">Resolvido com regras próprias:</span>'));
  assert.equal((html.match(/exercise-status--own/g) ?? []).length, 1);
});

test("um filtro sem resultados diz-o", () => {
  const html = exerciseListHtml({}, { filter: "done" });
  assert.ok(html.includes(LOCALES.pt.exercises.emptyFilter));
  assert.ok(!html.includes('class="exercise-item"'));
});

test("o repor pede confirmação e diz quando acabou", () => {
  const progress = { [FIRST.id]: { status: "solved" } };
  assert.ok(exerciseListHtml(progress).includes('data-reset="ask"'));
  const confirm = exerciseListHtml(progress, { reset: "confirm" });
  assert.ok(confirm.includes('data-reset="yes"') && confirm.includes('data-reset="no"'));
  assert.ok(exerciseListHtml({}, { reset: "done" }).includes(LOCALES.pt.exercises.reset.done));
});

test("a barra de progresso conta os dois modos e separa as regras próprias", () => {
  const html = progressHtml({ [FIRST.id]: { status: "solved" }, [LAST.id]: { status: "solvedWithUserRules" } });
  assert.ok(html.includes(`aria-valuenow="2"`));
  assert.ok(html.includes(`aria-valuemax="${TOTAL}"`));
  assert.ok(html.includes(`2 de ${TOTAL} resolvidos, 1 com regras próprias`));
  assert.ok(!progressHtml({}).includes("com regras próprias"));
});

test("o cartão de cima começa, continua e acaba", () => {
  assert.ok(nextHtml("proof", {}).includes(LOCALES.pt.exercises.nextLabel.start));
  assert.ok(nextHtml("proof", { [FIRST.id]: { status: "solved" } }).includes(LOCALES.pt.exercises.nextLabel.continue));
  assert.ok(nextHtml("proof", solvedAll(EXERCISES)).includes(LOCALES.pt.exercises.allDone));
});

test("as regras permitidas ficam à vista, com a regra a provar e as siglas do idioma", () => {
  const exercise = { rules: { set: "base", exclude: ["RA"] } };
  const html = rulesHtml(exercise, false);
  assert.ok(html.includes("<li>∧I</li>"));
  assert.ok(!html.includes("<li>RA</li>"));
  assert.ok(html.includes("exercise-rules__note"));
  setLang("en", { silent: true });
  assert.ok(rulesHtml({ rules: "completo" }, false).includes("<li>RAA</li>"));
  setLang("pt", { silent: true });
});

test("a nota das regras próprias só aparece a quem as tem, e diz se valem", () => {
  const { on, off } = LOCALES.pt.exercises.userRules;
  assert.ok(!rulesHtml({ rules: "completo" }, false).includes(on));
  assert.ok(rulesHtml({ rules: "completo" }, true).includes(on));
  assert.ok(rulesHtml({ rules: "base" }, true).includes(off));
});

test("as pistas do autor saem das chaves e só existem se o exercício as tiver", () => {
  assert.equal(authorHintsHtml({}), "");
  const withHints = EXERCISES.find(({ hints }) => hints?.length > 0);
  const html = authorHintsHtml(withHints);
  assert.ok(html.startsWith("<details"));
  assert.ok(!html.includes("exercises.hints."));
});

test("o cabeçalho do exercício mostra o nível, o estado e, nas provas, o sequente e as regras", () => {
  const proof = detailHeadHtml({ mode: "proof", exercise: FIRST, status: "solved", hasUserRules: false });
  assert.ok(proof.includes("<h1"));
  assert.ok(proof.includes('data-status="solved"'));
  assert.ok(proof.includes("exercise-rules"));
  const puzzle = detailHeadHtml({ mode: "findError", exercise: PUZZLE, status: "todo", hasUserRules: false });
  assert.ok(puzzle.includes(LOCALES.pt.exercises.modes.findError));
  assert.ok(!puzzle.includes("exercise-rules"), "o desafio mostra as regras dele");
  assert.ok(puzzle.includes("?mode=findError"), "voltar regressa à mesma lista");
});

test("o resultado diz o que contou e oferece o próximo, ou o regresso à lista", () => {
  const next = resultHtml("proof", "solved", EXERCISES[1]);
  assert.ok(next.includes(LOCALES.pt.exercises.result.solved));
  assert.ok(next.includes(exerciseHref(EXERCISES[1].id)));
  assert.ok(resultHtml("proof", "solvedWithUserRules", null).includes(LOCALES.pt.exercises.back));
  assert.ok(resultHtml("proof", "assisted", null).includes(LOCALES.pt.exercises.result.assisted));
});

test("um exercício que não existe tem mensagem e caminho de volta", () => {
  const html = notFoundHtml();
  assert.ok(html.includes(LOCALES.pt.exercises.notFound));
  assert.ok(html.includes("exercise-detail__back"));
});

test("no Chrome, os dois modos fazem-se até ao fim", { timeout: 300000 }, () => {
  const run = spawnSync("bash", ["scripts/check-exercises.sh"], { encoding: "utf8", timeout: 280000 });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});
