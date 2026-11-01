import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countersHtml,
  exerciseHref,
  exerciseTitle,
  renderExerciseDetail,
  renderExerciseList,
  renderExercisesHead,
  renderNextCard,
} from "../js/ui/exercise-list.js";
import { BASE_EXERCISES, generatedExercise, getExercise } from "../js/core/exercises.js";
import { setLang } from "../js/ui/i18n.js";

const count = (html, re) => (html.match(re) ?? []).length;

test("lista: 10 exercícios em 2 grupos, com dificuldade e estado (ícone + texto)", () => {
  setLang("pt", { silent: true });
  const html = renderExerciseList({ "propagation-chain": { status: "done" } });
  assert.equal(count(html, /class="exercise-item"/g), 10);
  assert.equal(count(html, /class="exercise-group"/g), 2);
  assert.match(html, /Com ramificação/);
  assert.equal(count(html, /sr-only">Feito:/g), 1, "o estado também se diz por texto");
  assert.equal(count(html, /sr-only">Por fazer:/g), 9);
  assert.equal(count(html, /exercise-status--todo/g), 9);
  assert.match(html, /title="Fácil · só propagação"/);
  assert.match(html, /<\/span> Fácil<\/span>/);
  assert.match(html, /11 cláusulas · 10 variáveis/);
  assert.match(html, /<code>\{p<sub>1<\/sub>, ¬p<sub>1<\/sub> ∨ ¬p<sub>2<\/sub>, .*, …\}<\/code>/, "só o início da fórmula");
  assert.match(html, /Só propagação<span class="exercise-group__count">2<\/span>/);
  assert.match(html, /Com ramificação<span class="exercise-group__count">8<\/span>/);
  assert.match(html, /data-generate/);
  assert.doesNotMatch(html, /class="btn"(?! data-variant)/, "o primário é só o do cartão do próximo exercício");
});

test("filtros: só os do estado pedido; aviso quando não há nenhum", () => {
  setLang("pt", { silent: true });
  const progress = { "two-branches": { status: "inProgress" } };
  const html = renderExerciseList(progress, { filter: "inProgress" });
  assert.equal(count(html, /class="exercise-item"/g), 1);
  assert.match(html, /data-filter="inProgress" aria-pressed="true"/);
  assert.match(html, /exercise-group__count">1</, "a contagem é a do filtro");
  assert.match(html, /<i><\/i> Em curso/);
  assert.match(renderExerciseList({}, { filter: "done" }), /Não há exercícios com este estado/);
  assert.equal(count(renderExerciseList({}, { filter: "xpto" }), /class="exercise-item"/g), 10);
});

test("«Continuar»: uma linha sem a fórmula; começar, continuar e todos feitos", () => {
  setLang("pt", { silent: true });
  const first = renderNextCard({});
  assert.match(first, /Cadeia de propagações até F/);
  assert.match(first, /Começar · por fazer/);
  assert.match(first, /href="\?ex=propagation-chain"/);
  assert.match(first, /11 cláusulas · 10 variáveis/);
  assert.doesNotMatch(first, /¬|∨/, "não repete a fórmula");
  const doing = renderNextCard({ "two-branches": { status: "inProgress" } });
  assert.match(doing, /Continuar · em curso/);
  assert.match(doing, /Dois ramos/);
  const allDone = Object.fromEntries(BASE_EXERCISES.map((e) => [e.id, { status: "done" }]));
  const done = renderNextCard(allDone);
  assert.match(done, /Fizeste os exercícios todos/);
  assert.match(done, /data-generate/);
});

test("progresso: feitos e em curso na barra, com o valor para leitores de ecrã", () => {
  setLang("pt", { silent: true });
  const html = renderExercisesHead({
    "propagation-chain": { status: "done" },
    "units-only": { status: "done" },
    "two-branches": { status: "inProgress" },
  });
  assert.match(html, /<h1>Exercícios de DPLL<\/h1>/);
  assert.match(html, /<b>2 de 10 feitos<\/b>/);
  assert.match(html, /aria-valuenow="2"/);
  assert.match(html, /aria-valuetext="2 de 10 feitos, 1 em curso"/);
  assert.match(html, /__done" style="width: 20%"/);
  assert.match(html, /__doing" style="width: 10%"/);
  setLang("en", { silent: true });
  assert.match(renderExercisesHead({}), /0 of 10 done, 0 in progress/);
  setLang("pt", { silent: true });
});

test("detalhe: voltar, grupo + dificuldade, título, modos, contadores e a solução", () => {
  setLang("pt", { silent: true });
  const html = renderExerciseDetail(getExercise("two-branches"), {});
  assert.match(html, /href="\/exercicios"/);
  assert.match(html, /<span>Com ramificação<\/span><span class="diff"/);
  assert.match(html, /<h1>Dois ramos, ambos em F<\/h1>/);
  assert.match(html, /<b>0<\/b> <span>jogadas<\/span>/);
  assert.match(html, /<b>0<\/b> <span>dicas<\/span>/);
  assert.equal(count(html, /Ver a solução no Passo a passo/g), 2, "no cabeçalho e, para o mobile, no fim");
  assert.doesNotMatch(renderExerciseDetail(getExercise("two-branches"), {}, "pt", "sat"), /dicas/);
});

test("contadores: plural, erros em destaque só quando há e sem dicas no Satisfazível?", () => {
  setLang("pt", { silent: true });
  const one = countersHtml({ moves: 1, errors: 1, hints: 1 });
  assert.match(one, /<b>1<\/b> <span>jogada<\/span>/);
  assert.match(one, /<b class="is-bad">1<\/b> <span>erro<\/span>/);
  assert.match(one, /<b>1<\/b> <span>dica<\/span>/);
  assert.match(countersHtml({ moves: 3, errors: 0 }), /<b>0<\/b> <span>erros<\/span>/);
  assert.doesNotMatch(countersHtml({ moves: 3, errors: 0 }), /dica/);
  setLang("en", { silent: true });
  assert.match(countersHtml({ moves: 2, errors: 1, hints: 0 }), /moves.*mistake<.*hints/);
  setLang("pt", { silent: true });
});

test("detalhe, títulos dos gerados e EN", () => {
  setLang("en", { silent: true });
  const gen = generatedExercise(9);
  assert.equal(exerciseTitle(gen), "Generated · seed 9");
  assert.equal(exerciseHref(gen.id), "?ex=gen-9");
  const detail = renderExerciseDetail(getExercise("two-branches"), {});
  assert.match(detail, /Two branches, both end in F/);
  assert.match(detail, /\/en\/step-by-step\?f=/);
  assert.match(detail, /data-play-mount/);
  assert.match(renderExerciseList({ [gen.id]: { status: "inProgress" } }), /Generated/);
  setLang("pt", { silent: true });
});

test("resumo guardado na lista e no cartão do exercício", () => {
  setLang("pt", { silent: true });
  const progress = {
    "two-branches": { status: "done", result: "unsat", mode: "step", moves: 7, errors: 1, hints: 2, finishedAt: 1 },
    "propagation-chain": { status: "done", result: "sat", mode: "sat", moves: 2, errors: 0, finishedAt: 1 },
  };
  const list = renderExerciseList(progress);
  assert.match(list, /Insatisfazível · Jogadas: 7 · erros: 1 · dicas: 2/);
  assert.match(list, /Satisfazível · Jogadas: 2 · erros: 0</, "o Satisfazível? não tem dicas");
  const detail = renderExerciseDetail(getExercise("two-branches"), progress);
  assert.match(detail, /Última resolução · Próximo passo/);
  assert.match(detail, /class="exercise-summary"/);
  assert.ok(!renderExerciseDetail(getExercise("three-vars-a"), progress).includes("exercise-summary"));
  setLang("en", { silent: true });
  assert.match(renderExerciseDetail(getExercise("propagation-chain"), progress), /Last solution · Satisfiable\?/);
  setLang("pt", { silent: true });
});

test("repor progresso: só aparece com progresso de exercícios, confirma antes de apagar", () => {
  setLang("pt", { silent: true });
  assert.ok(!renderExerciseList({}).includes("data-reset"));
  assert.ok(!renderExerciseList({ "learn-quiz": { best: 2 } }).includes("data-reset"), "o quiz não conta");
  const progress = { "gen-5": { status: "inProgress" } };
  assert.match(renderExerciseList(progress), /data-reset="ask">Repor progresso/);
  const confirm = renderExerciseList(progress, { reset: "confirm" });
  assert.match(confirm, /data-reset="yes">Sim, apagar/);
  assert.match(confirm, /data-reset="no">Cancelar/);
  assert.ok(!confirm.includes('data-reset="ask"'));
  assert.match(renderExerciseList({}, { reset: "done" }), /role="status">Progresso reposto/);
});
