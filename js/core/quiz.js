// Quiz da §7 do Aprender: perguntas de escolha múltipla e de "qual o próximo passo?".
// O texto (enunciados, opções e explicações) está nos locales; aqui ficam só os conjuntos, as
// opções e a resposta certa. Sempre que possível a resposta é calculada pelo próprio DLL
// (nextAction, propagateOne, solveDLL), para o quiz nunca contradizer o algoritmo.
// Módulo puro (sem DOM).
import { lit } from "./literals.js";
import { parse } from "./parser.js";
import { propagateOne, selectLiteral, solveDLL, units } from "./dll.js";
import { propagationStatus } from "./propagation.js";
import { getExample } from "./examples.js";

function clausesOf(text) {
  const result = parse(text);
  if (!result.ok) throw new Error(`Conjunto inválido no quiz: ${text}`);
  return result.clauses;
}

/**
 * O que o DLL da ferramenta faz a seguir com S (convenções do CLAUDE.md):
 *   { type: "sat" } se S está vazio; { type: "unsat" } se S contém F;
 *   { type: "unit", literal } com a primeira cláusula unitária pela ordem do conjunto;
 *   { type: "branch", literal } com select_literal (primeira variável, ramo positivo).
 */
export function nextAction(S) {
  const status = propagationStatus(S);
  if (status === "sat" || status === "unsat") return { type: status };
  if (status === "units") return { type: "unit", literal: units(S)[0].literal };
  return { type: "branch", literal: selectLiteral(S) };
}

const sameAction = (a, b) =>
  a.type === b.type && (a.literal == null || (a.literal.v === b.literal?.v && a.literal.neg === b.literal?.neg));

/** Opções de texto: { id, kind: "text" } (o rótulo é learn.quiz.options.<id>). */
const textOption = (id) => ({ id, kind: "text" });
/** Opções de ação: { id, kind: "action", action } (propagar l, escolher l, responder). */
const actionOption = (id, action) => ({ id, kind: "action", action });
/** Opções de conjunto: { id, kind: "set", clauses }. */
const setOption = (id, text) => ({ id, kind: "set", clauses: text === "" ? [] : clausesOf(text) });

/** Marca como certa a única opção de ação igual à jogada do DLL. */
function answerByAction(options, action) {
  const right = options.filter((option) => sameAction(option.action, action));
  if (right.length !== 1) throw new Error("O quiz tem de ter exatamente uma opção certa.");
  return right[0].id;
}

/**
 * As perguntas, pela ordem do quiz. Cada uma tem { id, kind: "choice" | "next", set?, options, answer }.
 * `set` é o conjunto mostrado no enunciado (ou null).
 */
export function quizQuestions() {
  const questions = [];

  // 1. Conjunto vazio (pseudocódigo): não há nada a satisfazer.
  questions.push({
    id: "emptySet",
    kind: "choice",
    set: [],
    options: [textOption("sat"), textOption("unsat"), textOption("needsChoice")],
    answer: solveDLL([]).result.sat ? "sat" : "unsat",
  });

  // 2. Um conjunto que contém F (a cláusula vazia) é insatisfazível, tenha o que tiver.
  const withF = [[lit("p"), lit("q")], [], [lit("r")]];
  questions.push({
    id: "containsF",
    kind: "choice",
    set: withF,
    options: [textOption("sat"), textOption("unsat"), textOption("needsChoice")],
    answer: solveDLL(withF).result.sat ? "sat" : "unsat",
  });

  // 3. Próximo passo com uma unitária: propaga-se ¬q.
  const unitSet = clausesOf("p q, -q, -p r");
  const unitOptions = [
    actionOption("unitNotQ", { type: "unit", literal: lit("q", true) }),
    actionOption("unitQ", { type: "unit", literal: lit("q") }),
    actionOption("branchP", { type: "branch", literal: lit("p") }),
    actionOption("answerSat", { type: "sat" }),
  ];
  questions.push({ id: "nextUnit", kind: "next", set: unitSet, options: unitOptions, answer: answerByAction(unitOptions, nextAction(unitSet)) });

  // 4. Resultado de propagar p: sai p ∨ q (contém p), ¬p ∨ r encurta para r e {p} sai.
  const propagateSet = clausesOf("p q, -p r, p");
  const after = propagateOne(propagateSet, lit("p")).after;
  const afterOptions = [setOption("onlyR", "r"), setOption("qAndR", "q, r"), setOption("keepsPq", "p q, r"), setOption("keepsNotP", "-p r")];
  const afterKey = JSON.stringify(after);
  const afterRight = afterOptions.filter((option) => JSON.stringify(option.clauses) === afterKey);
  if (afterRight.length !== 1) throw new Error("O quiz tem de ter exatamente uma opção certa.");
  questions.push({ id: "afterPropagation", kind: "choice", set: propagateSet, options: afterOptions, answer: afterRight[0].id });

  // 5. Próximo passo sem unitárias: a propagação para e o DLL tem de escolher um literal.
  const branchSet = clausesOf("p q, -p -q, q r");
  const branchOptions = [
    actionOption("branchP", { type: "branch", literal: lit("p") }),
    actionOption("unitQ", { type: "unit", literal: lit("q") }),
    actionOption("answerSat", { type: "sat" }),
    actionOption("answerUnsat", { type: "unsat" }),
  ];
  questions.push({ id: "nextBranch", kind: "next", set: branchSet, options: branchOptions, answer: answerByAction(branchOptions, nextAction(branchSet)) });

  // 6. Retrocesso: o primeiro ramo falhou, por isso tenta-se o complementar (pseudocódigo).
  questions.push({
    id: "backtrack",
    kind: "choice",
    set: null,
    options: [textOption("tryComplement"), textOption("answerUnsat"), textOption("tryOtherVariable"), textOption("answerSatAnyway")],
    answer: "tryComplement",
  });

  // 7. Tautologias: são sempre verdadeiras e podiam ser removidas sem mudar a resposta.
  questions.push({
    id: "tautology",
    kind: "choice",
    set: clausesOf("p -p, q"),
    options: [textOption("tautologyRemovable"), textOption("tautologyUnsat"), textOption("tautologyEmpty"), textOption("tautologyForcesP")],
    answer: "tautologyRemovable",
  });

  // 8. O exemplo com dois ramos: os dois ramos chegam a F.
  const example2 = clausesOf(getExample("two-branches").input);
  questions.push({
    id: "example2",
    kind: "choice",
    set: example2,
    options: [textOption("sat"), textOption("unsat"), textOption("dependsOnLiteral")],
    answer: solveDLL(example2).result.sat ? "sat" : "unsat",
  });

  return questions;
}

/** A opção escolhida está certa? */
export function isCorrect(question, optionId) {
  return question.answer === optionId;
}

/** Contagem final: answers = { [idDaPergunta]: idDaOpção }. */
export function quizScore(questions, answers) {
  const correct = questions.filter((question) => isCorrect(question, answers[question.id])).length;
  return { correct, total: questions.length };
}
