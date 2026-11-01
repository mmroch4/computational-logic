// O quiz final: respostas calculadas pelo motor, texto nos dois idiomas e resumo. No Chrome, até ao
// fim em PT e em EN: scripts/check-learn.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUIZ_PROGRESS_ID, initialQuizState, isCorrect, quizQuestions, quizRecord, quizScore } from "../js/core/quiz.js";
import { isExerciseId } from "../js/core/exercises.js";
import { checkSequent, evaluate } from "../js/core/semantics.js";
import { parseSequent } from "../js/core/sequent.js";
import { parseProof } from "../js/core/proof-text.js";
import { hint } from "../js/core/hints.js";
import { BASE_RULES, DERIVED_RULES, ruleGoal, ruleSet } from "../js/core/rules.js";
import { verifyProof } from "../js/core/verify.js";
import { renderQuiz } from "../js/ui/quiz-view.js";
import { LOCALES, setLang } from "../js/ui/i18n.js";
import { createStorage } from "../js/ui/storage.js";
import { COURSE_SEQUENTS } from "./fixtures/course-sequents.js";
import { fingerprint } from "./helpers/fingerprint.js";

const questions = quizQuestions();
const byId = Object.fromEntries(questions.map((question) => [question.id, question]));
const count = (html, re) => (html.match(re) ?? []).length;
const goalOf = ({ sequent }) => parseSequent(sequent).sequent;
const COMPLETE = ruleSet("completo");

test("8 perguntas com ids únicos e uma só resposta certa entre as opções", () => {
  assert.equal(questions.length, 8);
  assert.equal(new Set(questions.map(({ id }) => id)).size, 8);
  for (const { id, options, answer } of questions) {
    const ids = options.map((option) => option.id);
    assert.ok(ids.length >= 3, id);
    assert.equal(new Set(ids).size, ids.length, id);
    assert.equal(ids.filter((option) => option === answer).length, 1, id);
  }
  for (const kind of ["line", "find", "next", "choice"]) assert.ok(questions.some((question) => question.kind === kind), kind);
});

test("nas perguntas de linha, o verificador aceita só a resposta certa", () => {
  for (const question of questions.filter(({ kind }) => kind === "line")) {
    for (const option of question.options) {
      const { lineErrors } = verifyProof(option.proof, goalOf(question), COMPLETE);
      assert.equal(lineErrors.length === 0, option.id === question.answer, `${question.id} ${option.id}`);
    }
  }
});

test("a pergunta do erro aponta a linha que o verificador rejeita", () => {
  const { proof, answer, options } = byId.scope;
  const { lineErrors } = verifyProof(proof, goalOf(byId.scope), COMPLETE);
  assert.deepEqual(lineErrors.map(({ params }) => params.line), [5]);
  assert.equal(options.find(({ id }) => id === answer).line, 5);
});

test("nas perguntas de próximo passo, a resposta é o passo que a dica daria", () => {
  for (const question of questions.filter(({ kind }) => kind === "next")) {
    const { status, step } = hint(question.proof, goalOf(question), { rules: COMPLETE });
    assert.equal(status, "step", question.id);
    const right = question.options.find(({ id }) => id === question.answer);
    assert.equal(right.step.kind, step.kind, question.id);
    assert.equal(step.kind, "hypothesis", question.id);
  }
});

test("as afirmações das perguntas de escolha são verdadeiras", () => {
  const invalid = goalOf(byId.invalid);
  assert.equal(checkSequent(invalid).valid, false);
  assert.equal(byId.invalid.answer, "noProof");
  // A explicação diz: s falso e t verdadeiro.
  const valuation = new Map([["s", false], ["t", true]]);
  assert.ok(invalid.premises.every((premise) => evaluate(premise, valuation)));
  assert.equal(evaluate(invalid.conclusion, valuation), false);
  // Cada regra derivada tem uma prova só com as regras base.
  for (const rule of DERIVED_RULES) {
    const { lineErrors } = verifyProof(parseProof(rule.proof.trim()).proof, ruleGoal(rule), BASE_RULES);
    assert.deepEqual(lineErrors, [], rule.id);
  }
  assert.equal(checkSequent(parseSequent("⊢ a ∨ ¬a").sequent).valid, true);
  // A pergunta do erro diz que o sequente nem é válido: r verdadeiro, s falso.
  assert.equal(checkSequent(goalOf(byId.scope)).valid, false);
});

test("os sequentes são originais", () => {
  const course = new Map(COURSE_SEQUENTS.map((text) => [fingerprint(text), text]));
  for (const { id, sequent } of questions.filter((question) => question.sequent)) {
    assert.equal(course.get(fingerprint(sequent)), undefined, id);
  }
});

test("cada opção tem a sua explicação, nos dois idiomas", () => {
  for (const locale of Object.values(LOCALES)) {
    for (const { id, options } of questions) {
      const { prompt, why } = locale.learn.quiz.questions[id];
      assert.equal(typeof prompt, "string", id);
      assert.deepEqual(Object.keys(why).sort(), options.map((option) => option.id).sort(), id);
      assert.equal(new Set(Object.values(why)).size, options.length, id);
      for (const option of options.filter(({ kind }) => kind === "text")) {
        assert.equal(typeof locale.learn.quiz.questions[id].options[option.id], "string", `${id} ${option.id}`);
      }
    }
  }
});

test("as perguntas e a sua ordem não dependem do idioma", () => {
  assert.deepEqual(Object.keys(LOCALES.pt.learn.quiz.questions), questions.map(({ id }) => id));
  assert.deepEqual(Object.keys(LOCALES.en.learn.quiz.questions), questions.map(({ id }) => id));
});

test("primeira pergunta: contador, prova, opções por responder e um só ponto de entrada com Tab", () => {
  setLang("pt");
  const html = renderQuiz(questions, initialQuizState());
  assert.match(html, /Pergunta 1 de 8/);
  assert.match(html, /class="fitch/);
  assert.equal(count(html, /role="radio"/g), 4);
  assert.equal(count(html.slice(html.indexOf("quiz__options")), /tabindex="0"/g), 1);
  assert.doesNotMatch(html, /disabled/);
  assert.doesNotMatch(html, /quiz__feedback/);
  assert.match(html, /0 certas/);
  assert.match(html, /width:12\.5%/);
});

test("resposta errada: bloqueia as opções, marca a certa e a escolhida e explica essa resposta", () => {
  setLang("pt");
  const state = { index: 0, answers: { combine: "wrongRule" }, finished: false };
  const html = renderQuiz(questions, state);
  assert.equal(count(html, / disabled/g), 4);
  assert.match(html, /quiz__option quiz__option--right" data-option="right"/);
  assert.match(html, /quiz__option quiz__option--wrong" data-option="wrongRule"/);
  assert.match(html, /<span class="quiz__tag">a tua resposta<\/span>/);
  assert.match(html, /msg msg-warn quiz__feedback/);
  assert.match(html, /Não é bem assim\./);
  assert.ok(html.includes(LOCALES.pt.learn.quiz.questions.combine.why.wrongRule));
  assert.match(html, /Próxima pergunta/);
});

test("a resposta certa confirma, e a última pergunta leva ao resultado", () => {
  setLang("en");
  const last = questions.at(-1);
  const html = renderQuiz(questions, { index: 7, answers: { [last.id]: last.answer }, finished: false });
  assert.match(html, /msg msg-ok quiz__feedback/);
  assert.match(html, /See result/);
  assert.match(html, /1 correct/);
  setLang("pt");
});

test("resumo: corretas, precisão, revisão e melhor resultado", () => {
  setLang("pt");
  const answers = Object.fromEntries(questions.map(({ id, answer }) => [id, answer]));
  answers.both = "bothFine";
  const html = renderQuiz(questions, { index: 7, answers, finished: true }, { best: { best: 8, total: 8 } });
  assert.match(html, /Acertaste 7 de 8/);
  assert.match(html, /7\/8/);
  assert.match(html, /88%/);
  assert.match(html, /O teu melhor resultado: 8 de 8\./);
  assert.equal(count(html, /quiz__review-item--wrong/g), 1);
  assert.equal(count(html, /quiz__review-item--right/g), 7);
  assert.match(html, /Resposta certa:/);
  assert.match(html, /data-restart/);
});

test("nenhuma chave em bruto, em nenhuma resposta de nenhuma pergunta", () => {
  for (const lang of ["pt", "en"]) {
    setLang(lang);
    questions.forEach((question, index) => {
      for (const option of question.options) {
        const html = renderQuiz(questions, { index, answers: { [question.id]: option.id }, finished: false });
        assert.doesNotMatch(html, /learn\.quiz\./, `${lang} ${question.id} ${option.id}`);
      }
    });
    const answers = Object.fromEntries(questions.map(({ id, options, answer }) => [id, options.find((option) => option.id !== answer).id]));
    assert.doesNotMatch(renderQuiz(questions, { index: 0, answers, finished: true }), /learn\.quiz\./, lang);
  }
  setLang("pt");
});

test("quizScore conta as certas e ignora as não respondidas", () => {
  const all = Object.fromEntries(questions.map(({ id, answer }) => [id, answer]));
  assert.deepEqual(quizScore(questions, all), { correct: 8, total: 8 });
  assert.deepEqual(quizScore(questions, {}), { correct: 0, total: 8 });
  assert.equal(isCorrect(byId.both, "bothFine"), false);
});

test("quizRecord guarda o último e o melhor, e repor os exercícios não apaga o quiz", () => {
  assert.deepEqual(quizRecord(null, { correct: 5, total: 8 }, 1), { last: 5, best: 5, total: 8, completedAt: 1 });
  assert.deepEqual(quizRecord({ best: 7 }, { correct: 5, total: 8 }, 2), { last: 5, best: 7, total: 8, completedAt: 2 });
  assert.equal(quizRecord({ best: "x" }, { correct: 6, total: 8 }, 3).best, 6);
  const storage = createStorage(null);
  storage.setProgress(QUIZ_PROGRESS_ID, quizRecord(null, { correct: 6, total: 8 }, 4));
  assert.equal(isExerciseId(QUIZ_PROGRESS_ID), false);
  storage.resetProgress(isExerciseId);
  assert.equal(storage.getProgress(QUIZ_PROGRESS_ID).best, 6);
});

test("o quiz fecha a lição, fora das 9 secções", () => {
  const page = readFileSync("aprender.html", "utf8");
  assert.ok(page.indexOf('id="quiz"') > page.indexOf('id="solidez"'));
  assert.doesNotMatch(page, /class="lesson-section" id="quiz"/);
  assert.match(page, /data-lesson-quiz/);
  assert.ok(page.includes(`>${LOCALES.pt.learn.quiz.intro}<`));
  assert.ok(readFileSync("en/learn.html", "utf8").includes(`>${LOCALES.en.learn.quiz.intro}<`));
});
