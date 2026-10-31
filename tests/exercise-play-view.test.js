import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackHtml, hintText, playFeedback, renderPlayBoard, renderPlayShell } from "../js/ui/exercise-play-view.js";
import { hintFor, playMove, startGame, takeHint, toolMove } from "../js/core/exercise-play.js";
import { getExercise } from "../js/core/exercises.js";
import { setLang } from "../js/ui/i18n.js";

const count = (html, re) => (html.match(re) ?? []).length;

// Joga as jogadas da ferramenta até ao fim; devolve [{ result, before }].
function playAll(state) {
  const plays = [];
  while (!state.finished) {
    const result = playMove(state, toolMove(state));
    plays.push({ result, before: state });
    state = result.state;
  }
  return plays;
}

test("tabuleiro inicial: uma cláusula-botão por cláusula de S, literais nos dois sinais e as respostas", () => {
  setLang("pt", { silent: true });
  const exercise = getExercise("two-branches");
  const state = startGame(exercise.clauses);
  const html = renderPlayBoard(state, exercise);
  assert.equal(count(html, /data-clause="/g), exercise.clauses.length);
  assert.equal(count(html, /class="btn play__literal" data-variant="outline"/g), 4); // p, ¬p, q, ¬q
  assert.match(html, /data-play="sat"/);
  assert.match(html, /data-play="unsat"/);
  assert.match(html, /Conjunto S · nó 0/);
  assert.match(html, /Clica numa cláusula unitária/);
  assert.match(html, /Ou escolhe um literal/);
  assert.match(html, /Ou responde/);
  assert.match(html, /data-play="restart"/, "pode recomeçar a meio");
  assert.doesNotMatch(html, /neste ramo/, "ainda não há nada fixado");
  assert.match(renderPlayShell(), /data-play-tree/);
  assert.match(renderPlayShell(), /role="status" data-play-feedback/);
});

test("mensagem da jogada: cor e ícone pelo tipo, com o veredito a negrito", () => {
  setLang("pt", { silent: true });
  const ok = feedbackHtml({ kind: "ok", verdict: "Certo", text: "Propagaste q." });
  assert.match(ok, /class="msg msg-ok play__feedback"/);
  assert.match(ok, /<b>Certo\.<\/b> Propagaste q\./);
  assert.match(feedbackHtml({ kind: "error", verdict: "Ainda não", text: "x" }), /msg-error/);
  assert.match(feedbackHtml({ kind: "warning", verdict: "Certo", text: "x" }), /msg-warn/);
  assert.equal(feedbackHtml(null), "");
});

test("erros explicados: não unitária, ainda há unitárias ({¬p₂}), resposta antes do tempo", () => {
  setLang("pt", { silent: true });
  const exercise = getExercise("propagation-chain"); // p1, -p1 -p2, …
  const state = startGame(exercise.clauses);
  const notUnit = playMove(state, { type: "unit", clauseIndex: 1 });
  const fb = playFeedback(notUnit, state);
  assert.equal(fb.kind, "error");
  assert.equal(fb.verdict, "Ainda não");
  assert.match(fb.text, /¬p₁ ∨ ¬p₂ não é uma cláusula unitária/);
  assert.match(fb.text, /Unitárias em S: \{p₁\}/);

  const after = playMove(state, { type: "unit", clauseIndex: 0 }).state; // propaga p1 → {¬p2} fica unitária
  const still = playMove(after, { type: "branch", literal: { v: "p3", neg: false } });
  assert.match(playFeedback(still, after).text, /Ainda há cláusulas unitárias: \{¬p₂\}/);
  assert.match(playFeedback(playMove(after, { type: "sat" }), after).text, /S ainda tem cláusulas/);
  assert.match(playFeedback(playMove(after, { type: "unsat" }), after).text, /S não contém F/);
  assert.equal(still.state.moves, 1);
  assert.equal(still.state.errors, 1);
});

test("jogadas certas: propagar, escolher (com aviso se o caminho muda), voltar atrás e terminar", () => {
  setLang("pt", { silent: true });
  const exercise = getExercise("two-branches");
  const state = startGame(exercise.clauses);
  const neg = playMove(state, { type: "branch", literal: { v: "p", neg: true } });
  const warn = playFeedback(neg, state);
  assert.equal(warn.kind, "warning");
  assert.match(warn.text, /Escolheste ¬p: o DLL continua com S ∪ \{¬p\}/);
  assert.match(warn.text, /A ferramenta escolheria p/);

  const plays = playAll(state);
  const texts = plays.map(({ result, before }) => playFeedback(result, before).text);
  assert.ok(texts.some((x) => /^Propagaste/.test(x)));
  assert.ok(texts.some((x) => /Este ramo chegou a F\. O DLL volta ao nó 0 e tenta ¬p\./.test(x)));
  assert.match(texts.at(-1), /Todos os ramos chegaram a F/);

  const end = plays.at(-1).result.state;
  const html = renderPlayBoard(end, exercise);
  assert.match(html, /play__done--unsat/);
  assert.match(html, /✕<\/span> Insatisfazível/);
  assert.match(html, /passo-a-passo\?f=/);
  assert.match(html, /data-play="restart"/);
  assert.equal(count(html, /data-clause=/g), 0, "acabado: as cláusulas deixam de ser botões");
  assert.match(html, /neste ramo: <code>p = F<\/code>, <code>q = F<\/code><\/p>/, "¬p escolhido e propagado aparece uma vez");
});

test("satisfazível: valoração V/F e S vazio; EN", () => {
  setLang("pt", { silent: true });
  const exercise = getExercise("three-vars-a") ?? getExercise("propagation-chain");
  const sat = [
    "propagation-chain", "two-branches", "three-vars-a", "three-vars-b", "three-vars-c", "three-vars-d", "three-vars-e",
  ].map(getExercise).filter(Boolean).find((e) => playAll(startGame(e.clauses)).at(-1).result.state.finished === "sat");
  assert.ok(sat, "há pelo menos um exercício satisfazível");
  const plays = playAll(startGame(sat.clauses));
  const last = plays.at(-1);
  const html = renderPlayBoard(last.result.state, sat);
  assert.match(html, /play__done--sat/);
  assert.match(html, /= (V|F|qualquer)/);
  assert.match(html, /S está vazio/);
  setLang("en", { silent: true });
  assert.match(renderPlayBoard(startGame(exercise.clauses), exercise), /Set S · node 0/);
  assert.match(playFeedback(last.result, last.before).text, /S is empty: the set is satisfiable/);
  setLang("pt", { silent: true });
});

test("dicas: três níveis com o custo à vista, a jogada destacada no nível 3 e as dicas no resultado", () => {
  setLang("pt", { silent: true });
  const exercise = getExercise("propagation-chain"); // 1.ª unitária = {p₁}
  let state = startGame(exercise.clauses);
  let html = renderPlayBoard(state, exercise);
  assert.match(html, /data-play="hint"[^>]*>Pedir uma dica \(1\/3\)/);
  assert.match(html, /Cada dica conta no resultado/);
  assert.equal(count(html, /play__target/g), 0);

  state = takeHint(state);
  html = renderPlayBoard(state, exercise);
  assert.match(html, /Dica 1 de 3/);
  assert.match(html, /Dica 1:<\/span> Olha para o tamanho das cláusulas/);
  assert.match(html, /Mais uma dica \(2\/3\)/);
  assert.equal(state.hints, 1);

  state = takeHint(takeHint(state));
  html = renderPlayBoard(state, exercise);
  assert.match(html, /Dica 2:<\/span> Propagação unitária: se S/);
  assert.match(html, /Dica 3:<\/span> Propaga a cláusula \{p₁\}\./);
  assert.doesNotMatch(html, /data-play="hint"/, "depois do nível 3 já não há botão");
  assert.equal(count(html, /play__target/g), 1);
  assert.match(html, /play__clause play__target" data-clause="0"/);

  for (const { result } of playAll(state)) state = result.state;
  html = renderPlayBoard(state, exercise);
  assert.match(html, /dicas usadas: 3\./);
  assert.doesNotMatch(html, /play__hints/);
});

test("dicas: textos das quatro situações (escolher, vazio, F) e EN", () => {
  setLang("pt", { silent: true });
  const choose = startGame(getExercise("two-branches").clauses);
  assert.match(hintText(hintFor(choose), 3, choose), /Escolhe p: a primeira variável/);
  const empty = startGame([]);
  assert.equal(hintText(hintFor(empty), 3, empty), "Responde «Satisfazível».");
  const conflict = startGame([[]]);
  assert.match(hintText(hintFor(conflict), 2, conflict), /se S contém F, return insatisfazível/);
  setLang("en", { silent: true });
  assert.match(hintText(hintFor(choose), 1, choose), /none is a unit clause/);
  assert.match(renderPlayBoard(choose, getExercise("two-branches")), /Get a hint \(1\/3\)/);
  setLang("pt", { silent: true });
});
