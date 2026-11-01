// Modo exercício «Próximo passo»: o aluno faz o DLL à mão, uma jogada de cada vez,
// e este avaliador diz se a jogada é válida a partir do estado atual.
//
// Jogadas (move):
//   { type: "unit", clauseIndex }  propagar a cláusula unitária S[clauseIndex] (qualquer unitária serve);
//   { type: "branch", literal }    escolher o literal l (S ∪ {l}); qualquer literal de S serve;
//   { type: "sat" }                responder «satisfazível» (S vazio);
//   { type: "unsat" }              responder «insatisfazível» neste ramo (S contém F).
//
// O «else return DLL(S ∪ {l̃})» do pseudocódigo não é uma escolha do aluno: quando um ramo
// acaba em F, o avaliador volta atrás sozinho e abre o ramo complementar que ficou pendente.
//
// O estado guarda um trace no mesmo formato do solveDLL, por isso a
// árvore do aluno é desenhada com o mesmo buildTree/treeModel do Passo a passo.
// Módulo puro (sem DOM). As funções nunca alteram o estado recebido: devolvem um novo.
import { isUnitClause, variablesOf } from "./clauses.js";
import { branch, hasEmptyClause, propagateOne, selectLiteral, units } from "./dll.js";
import { complement, sameLiteral } from "./literals.js";
import { propagationStatus } from "./propagation.js";

function toAssignment(literals) {
  const assignment = {};
  for (const l of literals) assignment[l.v] = !l.neg;
  return assignment;
}

/** Estado inicial do exercício com o conjunto S (nó 0 = raiz). */
export function startGame(S) {
  return {
    S,
    node: 0,
    depth: 0,
    path: [], // literais já fixados neste ramo (propagados ou escolhidos)
    pending: [], // ramos l̃ por tentar, do mais antigo para o mais recente (pilha)
    nextNode: 1,
    trace: [{ type: "start", node: 0, S }],
    stats: { units: 0, branches: 0, conflicts: 0, nodes: 1, maxDepth: 0 },
    moves: 0, // jogadas válidas
    errors: 0, // jogadas inválidas
    hints: 0, // níveis de dica pedidos no exercício todo (o custo que aparece no fim)
    hintLevel: 0, // dica já mostrada na posição atual: 0 (nenhuma) … 3 (a jogada); volta a 0 a cada jogada válida
    finished: null, // null | "sat" | "unsat"
    assignment: null,
  };
}

/** A jogada que o DLL da ferramenta faria (primeira unitária; senão primeira variável, ramo positivo). */
export function toolMove(state) {
  if (state.finished) return null;
  const status = propagationStatus(state.S);
  if (status === "sat" || status === "unsat") return { type: status };
  if (status === "units") return { type: "unit", clauseIndex: units(state.S)[0].index };
  return { type: "branch", literal: selectLiteral(state.S) };
}

/**
 * Todas as jogadas válidas no estado atual (para as dicas e para os testes):
 * cada cláusula unitária, ou cada literal de S (os dois sinais), ou a resposta.
 */
export function validMoves(state) {
  if (state.finished) return [];
  const status = propagationStatus(state.S);
  if (status === "sat" || status === "unsat") return [{ type: status }];
  if (status === "units") return units(state.S).map(({ index }) => ({ type: "unit", clauseIndex: index }));
  return variablesOf(state.S).flatMap((v) => [
    { type: "branch", literal: { v, neg: false } },
    { type: "branch", literal: { v, neg: true } },
  ]);
}

/** Número de níveis das dicas: 1 o que olhar → 2 que regra → 3 a jogada. */
export const HINT_LEVELS = 3;

/**
 * A dica para a posição atual: { situation, move } ou null se o exercício acabou.
 *   situation: "empty" (S vazio) | "conflict" (S contém F) | "units" (há unitárias) | "branch" (escolher);
 *   move: a jogada da ferramenta (toolMove), que é a que o nível 3 revela.
 * A UI mostra o nível 1 (o que olhar) e o 2 (que regra) a partir da situation, e o 3 a partir do move.
 */
export function hintFor(state) {
  const move = toolMove(state);
  if (!move) return null;
  const situation = { sat: "empty", unsat: "conflict", unit: "units", branch: "branch" }[move.type];
  return { situation, move };
}

/**
 * Pede o próximo nível de dica. Cada nível novo custa 1 (hints + 1); no nível 3 já não há mais.
 * Devolve um novo estado; se não houver dica (acabou ou já está no nível 3), devolve o mesmo.
 */
export function takeHint(state) {
  if (state.finished || state.hintLevel >= HINT_LEVELS) return state;
  return { ...state, hintLevel: state.hintLevel + 1, hints: state.hints + 1 };
}

/**
 * Porque é que a jogada não é válida? Devolve null se for válida, senão { code, … }:
 *   finished  o exercício já acabou;
 *   isEmpty   S está vazio: a resposta é «satisfazível»;
 *   hasF      S contém F: a resposta é «insatisfazível» (a propagação para aqui);
 *   badClause o índice não é uma cláusula de S;
 *   notUnit   a cláusula clicada não é unitária (units = as unitárias que há, pode ser []);
 *   stillUnits ainda há cláusulas unitárias: propagar antes de escolher (units);
 *   notInSet  o literal escolhido não aparece em S;
 *   notEmpty  respondeu «satisfazível» mas S ainda tem cláusulas (units, se as houver);
 *   noF       respondeu «insatisfazível» mas S não contém F (units, se as houver).
 */
export function moveError(state, move) {
  if (state.finished) return { code: "finished" };
  const S = state.S;
  const empty = S.length === 0;
  const hasF = hasEmptyClause(S);
  const unitList = hasF ? [] : units(S);

  switch (move?.type) {
    case "unit": {
      if (empty) return { code: "isEmpty" };
      if (hasF) return { code: "hasF" };
      const clause = S[move.clauseIndex];
      if (!clause) return { code: "badClause", clauseIndex: move.clauseIndex };
      if (!isUnitClause(clause)) return { code: "notUnit", clauseIndex: move.clauseIndex, units: unitList };
      return null;
    }
    case "branch": {
      if (empty) return { code: "isEmpty" };
      if (hasF) return { code: "hasF" };
      if (unitList.length) return { code: "stillUnits", units: unitList };
      if (!move.literal || !variablesOf(S).includes(move.literal.v)) return { code: "notInSet", literal: move.literal ?? null };
      return null;
    }
    case "sat":
      if (hasF) return { code: "hasF" };
      return empty ? null : { code: "notEmpty", units: unitList };
    case "unsat":
      if (empty) return { code: "isEmpty" };
      return hasF ? null : { code: "noF", units: unitList };
    default:
      throw new Error(`Jogada desconhecida: ${move?.type}`);
  }
}

/**
 * Aplica a jogada. Devolve { ok, state, error?, warning?, events }:
 *   ok: false → state só tem errors + 1; error = moveError(…).
 *   ok: true  → events = eventos novos do trace (o último é "result" se o exercício acabou);
 *               warning = { code: "pathChanges", tool } se o aluno escolheu um literal diferente do
 *               select_literal da ferramenta (a jogada vale, mas a árvore fica diferente da do Passo a passo).
 */
export function playMove(state, move) {
  const error = moveError(state, move);
  if (error) return { ok: false, state: { ...state, errors: state.errors + 1 }, error, events: [] };

  const next = {
    ...state,
    trace: state.trace.slice(),
    pending: state.pending.slice(),
    stats: { ...state.stats },
    moves: state.moves + 1,
    hintLevel: 0, // posição nova: as dicas recomeçam no nível 1
  };
  const start = next.trace.length;
  let warning;

  if (move.type === "unit") {
    const literal = next.S[move.clauseIndex][0];
    const step = propagateOne(next.S, literal);
    next.trace.push({ type: "unit", node: next.node, literal, clauseIndex: move.clauseIndex, before: next.S, ...step });
    next.stats.units++;
    next.path = [...next.path, literal];
    next.S = step.after;
  } else if (move.type === "branch") {
    const tool = selectLiteral(next.S);
    if (!sameLiteral(tool, move.literal)) warning = { code: "pathChanges", tool };
    const child = next.nextNode++;
    // O ramo l̃ fica pendente: só se abre se este ramo acabar em F.
    next.pending.push({ parent: next.node, firstChild: child, depth: next.depth, path: next.path, S: next.S, literal: complement(move.literal) });
    openBranch(next, next.node, child, next.depth, next.path, next.S, move.literal);
  } else if (move.type === "sat") {
    next.assignment = toAssignment(next.path);
    next.trace.push({ type: "sat", node: next.node, S: next.S, assignment: next.assignment });
    finish(next, "sat");
  } else {
    next.trace.push({ type: "conflict", node: next.node, S: next.S });
    next.stats.conflicts++;
    const later = next.pending.pop();
    if (later) {
      // else return DLL(S ∪ {l̃}): volta ao nó onde se escolheu l e tenta o complemento.
      next.trace.push({ type: "backtrack", node: later.firstChild, to: later.parent, literal: later.literal });
      openBranch(next, later.parent, next.nextNode++, later.depth, later.path, later.S, later.literal);
    } else {
      finish(next, "unsat");
    }
  }

  const result = { ok: true, state: next, events: next.trace.slice(start) };
  if (warning) result.warning = warning;
  return result;
}

// Nó `child` com S ∪ {l}, filho de `parent`; passa a ser o nó atual.
function openBranch(state, parent, child, depth, path, S, literal) {
  const after = branch(S, literal);
  state.trace.push({ type: "branch", node: child, parent, literal, depth: depth + 1, before: S, after });
  state.stats.branches++;
  state.stats.nodes++;
  state.stats.maxDepth = Math.max(state.stats.maxDepth, depth + 1);
  state.node = child;
  state.depth = depth + 1;
  state.path = [...path, literal];
  state.S = after;
}

function finish(state, outcome) {
  state.finished = outcome;
  state.pending = [];
  state.trace.push({ type: "result", sat: outcome === "sat", assignment: state.assignment, stats: state.stats });
}
