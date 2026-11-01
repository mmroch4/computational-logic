import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_EXERCISES,
  EXERCISE_SOURCES,
  exerciseDifficulty,
  exerciseGroups,
  exerciseCounts,
  exerciseStatus,
  generatedExercise,
  generatedExerciseId,
  getExercise,
  nextExercise,
  openedRecord,
  finishedRecord,
  exerciseSummary,
  isExerciseId,
  hasExerciseProgress,
} from "../js/core/exercises.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";

test("os 10 exercícios base, sem os extras, com o resultado esperado confirmado pelo DLL", () => {
  assert.equal(BASE_EXERCISES.length, 10);
  for (const exercise of BASE_EXERCISES) {
    assert.ok(EXERCISE_SOURCES.includes(exercise.source), exercise.id);
    assert.equal(solveDLL(exercise.clauses).result.sat, exercise.expected === "sat", exercise.id);
  }
});

test("dificuldade pela profundidade da árvore do DLL", () => {
  assert.equal(exerciseDifficulty(parse("p1, -p1 -p2, p3 p2").clauses), "easy"); // só propagação
  assert.equal(exerciseDifficulty(parse("-p -q, -p q, p -q, p q").clauses), "medium"); // exemplo 2: uma escolha
  assert.equal(getExercise("propagation-chain").difficulty, "easy");
  assert.equal(getExercise("two-branches").difficulty, "medium");
  assert.equal(getExercise("three-vars-a").difficulty, "hard");
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const exercise of BASE_EXERCISES) counts[exercise.difficulty]++;
  assert.deepEqual(counts, { easy: 2, medium: 4, hard: 4 });
});

test("exercícios gerados: a mesma semente dá o mesmo conjunto e o id reabre-o", () => {
  const a = generatedExercise(42);
  const b = getExercise(generatedExerciseId(42));
  assert.equal(a.id, "gen-42");
  assert.equal(a.source, "generated");
  assert.equal(a.input, b.input);
  assert.equal(a.clauses.length, 6);
  assert.equal(a.expected, solveDLL(a.clauses).result.sat ? "sat" : "unsat");
  assert.equal(getExercise("nada"), null);
  assert.equal(getExercise("gen-abc"), null);
});

test("estado a partir do progresso; abrir não desfaz um feito", () => {
  assert.equal(exerciseStatus(null), "todo");
  assert.equal(exerciseStatus({ status: "inProgress" }), "inProgress");
  assert.equal(exerciseStatus({ status: "done" }), "done");
  assert.equal(exerciseStatus({ status: "?" }), "todo");
  assert.deepEqual(openedRecord(null, 5), { status: "inProgress", openedAt: 5 });
  const done = { status: "done", moves: 3 };
  assert.equal(openedRecord(done, 5), done);
});

test("terminar marca como feito e guarda resultado, jogadas e erros", () => {
  const record = finishedRecord({ status: "inProgress", openedAt: 1 }, { result: "unsat", moves: 7, errors: 2 }, 9);
  assert.deepEqual(record, { status: "done", openedAt: 1, result: "unsat", mode: "step", moves: 7, errors: 2, finishedAt: 9 });
  assert.equal(finishedRecord(null, { result: "sat", moves: 3, errors: 1, mode: "sat" }, 9).mode, "sat");
  assert.equal(exerciseStatus(record), "done");
  assert.equal(exerciseStatus(finishedRecord(null, { result: "sat", moves: 1, errors: 0 })), "done");
});

test("grupos por fonte, gerados no fim, contagens e próximo exercício", () => {
  const progress = { "two-branches": { status: "inProgress" }, "propagation-chain": { status: "done" }, "gen-7": { status: "inProgress" }, "learn-quiz": { best: 3 } };
  const groups = exerciseGroups(progress);
  assert.deepEqual(groups.map((g) => g.source), ["propagation", "branching", "generated"]);
  assert.deepEqual(groups[0].exercises.map((e) => e.status), ["done", "todo"]);
  assert.equal(groups[1].exercises[0].status, "inProgress");
  assert.deepEqual(groups[2].exercises.map((e) => e.id), ["gen-7"]);
  assert.deepEqual(exerciseCounts(progress), { todo: 8, inProgress: 1, done: 1, total: 10 });
  assert.equal(nextExercise(progress).id, "two-branches");
  assert.equal(nextExercise({}).id, "propagation-chain");
  const allDone = Object.fromEntries(BASE_EXERCISES.map((e) => [e.id, { status: "done" }]));
  assert.equal(nextExercise(allDone), null);
  assert.equal(exerciseGroups({}).length, 2);
});

test("resumo da última resolução: só para feitos, com campos validados", () => {
  assert.equal(exerciseSummary(null), null);
  assert.equal(exerciseSummary({ status: "inProgress" }), null);
  assert.equal(exerciseSummary({ status: "done" }), null, "sem resultado não há resumo");
  const step = finishedRecord(null, { result: "unsat", moves: 7, errors: 2, hints: 1 }, 9);
  assert.deepEqual(exerciseSummary(step), { result: "unsat", mode: "step", moves: 7, errors: 2, hints: 1, finishedAt: 9 });
  const sat = finishedRecord(null, { result: "sat", moves: 3, errors: 0, mode: "sat" }, 9);
  assert.equal(exerciseSummary(sat).hints, null);
  // Valores estranhos vindos do localStorage contam como 0.
  assert.deepEqual(exerciseSummary({ status: "done", result: "sat", moves: "x", errors: -1, hints: 1.5 }), {
    result: "sat", mode: "step", moves: 0, errors: 0, hints: 0, finishedAt: null,
  });
});

test("resolver outra vez noutro modo não herda as dicas da resolução anterior", () => {
  const first = finishedRecord(null, { result: "unsat", moves: 7, errors: 0, hints: 3 }, 1);
  const again = finishedRecord(first, { result: "unsat", moves: 2, errors: 0, mode: "sat" }, 2);
  assert.equal("hints" in again, false);
  assert.equal(again.mode, "sat");
});

test("ids de exercícios: os base e os gerados; o quiz do Aprender não é exercício", () => {
  assert.equal(isExerciseId("propagation-chain"), true);
  assert.equal(isExerciseId("gen-42"), true);
  assert.equal(isExerciseId("learn-quiz"), false);
  assert.equal(isExerciseId("gen-x"), false);
  assert.equal(hasExerciseProgress({ "learn-quiz": { best: 3 } }), false);
  assert.equal(hasExerciseProgress({ "learn-quiz": { best: 3 }, "gen-1": { status: "inProgress" } }), true);
  const groups = exerciseGroups({ "propagation-chain": finishedRecord(null, { result: "sat", moves: 4, errors: 1, hints: 0 }) });
  assert.equal(groups[0].exercises[0].summary.moves, 4);
  assert.equal(groups[0].exercises[1].summary, null);
});
