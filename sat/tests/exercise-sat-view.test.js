import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSatBoard, renderSatShell, satCheckHtml, satFeedback } from "../js/ui/exercise-sat-view.js";
import { satMove, startSatGame } from "../js/core/exercise-sat.js";
import { getExercise } from "../js/core/exercises.js";
import { exerciseMode, renderExerciseDetail } from "../js/ui/exercise-list.js";
import { setLang } from "../js/ui/i18n.js";

const count = (html, re) => (html.match(re) ?? []).length;

test("fase da resposta: S, a pergunta e os dois botões; sem valoração nem verificação", () => {
  setLang("pt", { silent: true });
  const exercise = getExercise("two-branches");
  const html = renderSatBoard(startSatGame(exercise.clauses), exercise);
  assert.match(html, /S é satisfazível\?/);
  assert.match(html, /data-sat="sat"/);
  assert.match(html, /data-sat="unsat"/);
  assert.doesNotMatch(html, /data-var=/);
  assert.match(html, /<button type="button" data-sat="sat" aria-pressed="false">Sim<\/button>/);
  assert.match(html, /data-seg-keys="off"/, "uma seta não pode dar uma resposta sem querer");
  assert.match(satCheckHtml(startSatGame(exercise.clauses)), /quando carregares em Verificar/);
  assert.match(renderSatShell(), /Satisfazível\?/);
  assert.match(renderSatShell(), /role="status" data-sat-feedback/);
});

test("fase da valoração: segmented V/F por variável, o escolhido fica premido e o resto «sem valor»", () => {
  setLang("pt", { silent: true });
  const exercise = getExercise("three-vars-a");
  const state = satMove(startSatGame(exercise.clauses), { type: "answer", answer: "sat" }).state;
  const vars = new Set(exercise.clauses.flat().map((l) => l.v)).size;
  const html = renderSatBoard(state, exercise, { draft: { [exercise.clauses[0][0].v]: true } });
  assert.equal(count(html, /data-var="/g), 2 * vars);
  assert.equal(count(html, /data-value="(true|false)" aria-pressed="true"/g), 1);
  assert.equal(count(html, /sem valor/g), vars - 1);
  assert.match(html, /data-sat="sat" aria-pressed="true"/, "a resposta dada é o Sim");
  assert.match(html, /aria-label="Valor de p"/);
  assert.match(html, /data-sat="check"/);
  assert.match(html, /Mudar a resposta/);
});

test("feedback: insatisfazível certo/errado, valoração que falha (cita as cláusulas falsas), por decidir e certa", () => {
  setLang("pt", { silent: true });
  const unsat = getExercise("two-branches");
  const right = satFeedback(satMove(startSatGame(unsat.clauses), { type: "answer", answer: "unsat" }));
  assert.equal(right.kind, "ok");
  assert.match(right.text, /insatisfazível/);

  const S = [[{ v: "p", neg: false }], [{ v: "p", neg: true }, { v: "q", neg: false }]]; // p, ¬p ∨ q
  const exercise = { id: "t", clauses: S };
  const wrong = satMove(startSatGame(S), { type: "answer", answer: "unsat" });
  assert.equal(satFeedback(wrong).kind, "error");
  assert.match(satFeedback(wrong).text, /S é satisfazível/);

  const falsifies = satMove(wrong.state, { type: "check", assignment: { p: true, q: false } });
  const fb = satFeedback(falsifies);
  assert.equal(fb.verdict, "Ainda não");
  assert.match(fb.text, /\{¬p ∨ q\}/);
  const board = satCheckHtml(falsifies.state, { showCheck: true });
  assert.match(board, /Verificação cláusula a cláusula/);
  assert.match(board, /sat-check__row--bad/);
  assert.match(board, /falsa<\/span>/);
  assert.match(board, /satisfeita: <\/span>p = V/, "a linha certa diz o literal que a satisfaz");
  assert.equal(falsifies.state.moves, 2);
  assert.equal(falsifies.state.errors, 2);
  // Sem showCheck (o aluno mudou a valoração) a tabela antiga não aparece.
  assert.doesNotMatch(satCheckHtml(falsifies.state), /sat-check__row/);

  const partial = satMove(wrong.state, { type: "check", assignment: { p: true } });
  const undecided = satFeedback(partial);
  assert.equal(undecided.kind, "warning");
  assert.match(undecided.text, /\{¬p ∨ q\}/);
  assert.match(satCheckHtml(partial.state, { showCheck: true }), /sat-check__row--open.*por decidir: falta q/);

  const done = satMove(wrong.state, { type: "check", assignment: { p: true, q: true } });
  assert.equal(satFeedback(done).kind, "ok");
  const end = renderSatBoard(done.state, exercise);
  assert.match(end, /play__done--sat/);
  assert.match(end, /data-sat="restart"/);
  assert.doesNotMatch(end, /data-sat="check"/);
  assert.match(satCheckHtml(done.state), /sat-check__row/, "no fim a verificação fica à vista");
});

test("EN: strings do modo traduzidas", () => {
  setLang("en", { silent: true });
  const exercise = getExercise("two-branches");
  assert.match(renderSatBoard(startSatGame(exercise.clauses), exercise), /Is S satisfiable\?/);
  setLang("pt", { silent: true });
});

test("seletor de modo: lido do URL e marcado no cabeçalho do exercício", () => {
  setLang("pt", { silent: true });
  assert.equal(exerciseMode("?ex=two-branches"), "step");
  assert.equal(exerciseMode("?ex=two-branches&mode=sat"), "sat");
  assert.equal(exerciseMode("?mode=zzz"), "step");
  const html = renderExerciseDetail(getExercise("two-branches"), {}, "pt", "sat");
  assert.match(html, /data-mode="sat" aria-pressed="true"/);
  assert.match(html, /data-mode="step" aria-pressed="false"/);
});

test("contador e fim sem dicas: nenhum marcador {…} fica por preencher (PT e EN)", () => {
  const exercise = getExercise("two-branches");
  const unfilled = /\{[a-z]+\}/;
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    const start = startSatGame(exercise.clauses);
    const board = renderSatBoard(start, exercise);
    assert.doesNotMatch(board, unfilled, `${lang}: tabuleiro`);
    assert.doesNotMatch(board, /dicas|hints/, `${lang}: este modo não tem dicas`);
    const done = satMove(start, { type: "answer", answer: "unsat" });
    const end = renderSatBoard(done.state, exercise);
    assert.equal(satCheckHtml(done.state), "", `${lang}: insatisfazível acaba sem valoração para verificar`);
    assert.match(end, /play__done-stats/);
    assert.doesNotMatch(end, unfilled, `${lang}: fim`);
    assert.doesNotMatch(end, /dicas|hints/, `${lang}: fim sem dicas`);
  }
  setLang("pt", { silent: true });
});
