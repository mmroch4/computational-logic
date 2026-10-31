import { test } from "node:test";
import assert from "node:assert/strict";
import { quizQuestions, nextAction, isCorrect, quizScore } from "../js/core/quiz.js";
import { renderQuiz, initialQuizState, quizRecord, optionLabelHtml, QUIZ_PROGRESS_ID } from "../js/ui/quiz-view.js";
import { createStorage } from "../js/ui/storage.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { lit } from "../js/core/literals.js";
import { setLang } from "../js/ui/i18n.js";

const clauses = (text) => parse(text).clauses;
const count = (html, re) => (html.match(re) ?? []).length;

test("o quiz tem de 6 a 8 perguntas, com ids únicos e uma só resposta certa entre as opções", () => {
  const questions = quizQuestions();
  assert.ok(questions.length >= 6 && questions.length <= 8);
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  for (const q of questions) {
    const ids = q.options.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, q.id);
    assert.equal(ids.filter((id) => id === q.answer).length, 1, q.id);
  }
  assert.ok(questions.some((q) => q.kind === "next"), "tem perguntas de próximo passo");
  assert.ok(questions.some((q) => q.kind === "choice"), "tem perguntas de escolha múltipla");
});

test("nextAction segue as convenções: vazio, F, primeira unitária, select_literal positivo", () => {
  assert.deepEqual(nextAction([]), { type: "sat" });
  assert.deepEqual(nextAction([[lit("p")], []]), { type: "unsat" });
  assert.deepEqual(nextAction(clauses("p q, -q, r")), { type: "unit", literal: lit("q", true) });
  assert.deepEqual(nextAction(clauses("q r, -q -r, p2 p11")), { type: "branch", literal: lit("p2") });
});

test("as perguntas de próximo passo têm como resposta a jogada do DLL", () => {
  for (const q of quizQuestions().filter((q) => q.kind === "next")) {
    const right = q.options.find((o) => o.id === q.answer);
    assert.deepEqual(right.action, nextAction(q.set), q.id);
  }
});

test("as respostas satisfazível/insatisfazível concordam com o solver", () => {
  for (const q of quizQuestions()) {
    if (!q.set || !q.options.some((o) => o.id === "sat") || q.kind !== "choice") continue;
    const sat = solveDLL(q.set).result.sat;
    assert.equal(q.answer, sat ? "sat" : "unsat", q.id);
  }
  const byId = Object.fromEntries(quizQuestions().map((q) => [q.id, q]));
  assert.equal(byId.emptySet.answer, "sat");
  assert.equal(byId.containsF.answer, "unsat");
  assert.equal(byId.example2.answer, "unsat");
  // Propagar p em {p ∨ q, ¬p ∨ r, p} deixa {r}.
  assert.deepEqual(byId.afterPropagation.options.find((o) => o.id === byId.afterPropagation.answer).clauses, clauses("r"));
});

test("quizScore conta as certas e ignora as não respondidas", () => {
  const questions = quizQuestions();
  const all = Object.fromEntries(questions.map((q) => [q.id, q.answer]));
  assert.deepEqual(quizScore(questions, all), { correct: questions.length, total: questions.length });
  assert.deepEqual(quizScore(questions, {}), { correct: 0, total: questions.length });
  assert.equal(isCorrect(questions[0], "unsat"), false);
});

test("primeira pergunta em PT: contador, opções clicáveis e sem feedback", () => {
  setLang("pt");
  const questions = quizQuestions();
  const html = renderQuiz(questions, initialQuizState());
  assert.match(html, /Pergunta 1 de 8/);
  assert.match(html, /O DLL recebe o conjunto vazio/);
  assert.match(html, /S = <span class="quiz__math">\{\}<\/span>/);
  assert.equal(count(html, /data-option=/g), 3);
  assert.doesNotMatch(html, /disabled/);
  assert.doesNotMatch(html, /quiz__feedback/);
  // Um só ponto de entrada com Tab; as outras opções chegam-se com as setas.
  assert.match(html, /role="radiogroup"/);
  assert.equal(count(html, /role="radio"/g), 3);
  assert.equal(count(html, /tabindex="0"/g), 1);
  assert.match(html, /0 certas/);
  assert.match(html, /width:12\.5%/);
});

test("resposta errada: bloqueia as opções, marca a certa e a escolhida e explica", () => {
  setLang("pt");
  const questions = quizQuestions();
  const state = { index: 2, answers: { nextUnit: "unitQ" }, finished: false };
  const html = renderQuiz(questions, state);
  assert.equal(count(html, / disabled/g), 4);
  assert.match(html, /quiz__option quiz__option--right" data-option="unitNotQ"/);
  assert.match(html, /quiz__option quiz__option--wrong" data-option="unitQ"/);
  assert.match(html, /<span class="quiz__tag">certa<\/span>/);
  assert.match(html, /<span class="quiz__tag">a tua resposta<\/span>/);
  assert.equal(count(html, /aria-checked="true"/g), 1);
  assert.match(html, /<p class="msg msg-info quiz__feedback quiz__feedback--wrong">/);
  assert.match(html, /quiz__feedback--wrong/);
  assert.match(html, /Não é bem assim\./);
  assert.match(html, /regras da propagação unitária/);
  assert.match(html, /Propagar a cláusula unitária <span class="quiz__math">¬q<\/span>/);
  assert.match(html, /Próxima pergunta/);
});

test("a ação de escolher mostra S ∪ {l} com o literal em HTML (subscritos)", () => {
  setLang("pt");
  const label = optionLabelHtml({ id: "x", kind: "action", action: { type: "branch", literal: lit("p11") } });
  assert.equal(
    label,
    'Escolher o literal <span class="quiz__math">p<sub>11</sub></span> e tentar S ∪ {<span class="quiz__math">p<sub>11</sub></span>}',
  );
});

test("resumo: corretas, precisão, revisão e melhor resultado", () => {
  setLang("pt");
  const questions = quizQuestions();
  const answers = Object.fromEntries(questions.map((q) => [q.id, q.answer]));
  answers.example2 = "dependsOnLiteral";
  const html = renderQuiz(questions, { index: 7, answers, finished: true }, { best: { best: 8, total: 8 } });
  assert.match(html, /Acertaste 7 de 8/);
  assert.match(html, /7\/8/);
  assert.match(html, /88%/);
  assert.match(html, /O teu melhor resultado: 8 de 8\./);
  assert.equal(count(html, /quiz__review-item--wrong/g), 1);
  assert.match(html, /Resposta certa: Insatisfazível/);
  assert.match(html, /data-restart/);
  // Cada item da revisão mostra o conjunto, para distinguir as perguntas com o mesmo enunciado.
  assert.equal(count(html, /quiz__review-line">S = /g), questions.filter((q) => q.set).length);
});

test("PT e EN têm todas as strings do quiz (nenhuma chave em bruto)", () => {
  const questions = quizQuestions();
  for (const lang of ["pt", "en"]) {
    setLang(lang);
    for (let index = 0; index < questions.length; index++) {
      const q = questions[index];
      for (const option of q.options) {
        const html = renderQuiz(questions, { index, answers: { [q.id]: option.id }, finished: false });
        assert.doesNotMatch(html, /learn\.quiz\./, `${lang} ${q.id} ${option.id}`);
      }
    }
    const answers = Object.fromEntries(questions.map((q) => [q.id, q.options.find((o) => o.id !== q.answer).id]));
    const summary = renderQuiz(questions, { index: 0, answers, finished: true }, { best: { best: 3, total: 8 } });
    assert.doesNotMatch(summary, /learn\.quiz\./, `${lang} resumo`);
  }
  setLang("pt");
});

test("quizRecord guarda o último e o melhor; o progress aceita o registo sem localStorage", () => {
  assert.deepEqual(quizRecord(null, { correct: 5, total: 8 }, 1), { last: 5, best: 5, total: 8, completedAt: 1 });
  assert.deepEqual(quizRecord({ best: 7 }, { correct: 5, total: 8 }, 2), { last: 5, best: 7, total: 8, completedAt: 2 });
  assert.deepEqual(quizRecord({ best: "x" }, { correct: 6, total: 8 }, 3).best, 6);
  const storage = createStorage(null);
  storage.setProgress(QUIZ_PROGRESS_ID, quizRecord(null, { correct: 6, total: 8 }, 4));
  assert.equal(storage.getProgress(QUIZ_PROGRESS_ID).best, 6);
});
