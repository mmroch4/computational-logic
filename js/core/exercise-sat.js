// Modo exercício «Satisfazível?»: o aluno diz se S é satisfazível e, se disser que sim, dá uma
// valoração que a ferramenta verifica cláusula a cláusula.
//
// A resposta certa vem da tabela de verdade (verify.js), não do DLL: assim este modo não depende
// do algoritmo que o aluno está a aprender.
//
// Módulo puro (sem DOM). Estado imutável:
//   { S, phase: "answer" | "valuation" | "done", answered, moves, errors, finished, assignment, check }
//   - phase "answer":    à espera da resposta (satisfazível / insatisfazível);
//   - phase "valuation": o aluno disse satisfazível e tem de mostrar uma valoração;
//   - phase "done":      acabou (finished = "sat" | "unsat").
// Jogadas: { type: "answer", answer: "sat" | "unsat" }, { type: "check", assignment }, { type: "change" }
// (voltar a responder depois de não conseguir uma valoração).
import { variablesOf } from "./clauses.js";
import { bruteForceSat, evaluateClause } from "./verify.js";

/** Estado inicial para o conjunto S. */
export function startSatGame(S) {
  return {
    S,
    sat: bruteForceSat(S).sat,
    phase: "answer",
    answered: null,
    moves: 0,
    errors: 0,
    finished: null,
    assignment: null,
    check: null,
  };
}

/**
 * Verificação cláusula a cláusula de uma valoração (possivelmente parcial) { variável: true/false }.
 * rows: [{ index, clause, value, trueLiterals, missing }], com value = true | false | null (por decidir),
 * trueLiterals = índices dos literais verdadeiros e missing = variáveis da cláusula ainda sem valor.
 * value do conjunto: false se alguma cláusula é
 * falsa, null se nenhuma é falsa mas alguma está por decidir, true se todas são verdadeiras.
 */
export function checkValuation(S, assignment) {
  // Só contam as variáveis de S (valores a mais são ignorados).
  const vars = new Set(variablesOf(S));
  const clean = Object.fromEntries(Object.entries(assignment ?? {}).filter(([v, value]) => vars.has(v) && typeof value === "boolean"));
  const rows = S.map((clause, index) => {
    const trueLiterals = [];
    clause.forEach((l, i) => {
      if (l.v in clean && clean[l.v] === !l.neg) trueLiterals.push(i);
    });
    const missing = [...new Set(clause.filter((l) => !(l.v in clean)).map((l) => l.v))];
    return { index, clause, value: evaluateClause(clause, clean), trueLiterals, missing };
  });
  const falseCount = rows.filter((row) => row.value === false).length;
  const undecidedCount = rows.filter((row) => row.value === null).length;
  const value = falseCount > 0 ? false : undecidedCount > 0 ? null : true;
  return { assignment: clean, rows, value, falseCount, undecidedCount };
}

/**
 * Faz uma jogada. Devolve { ok, state, outcome } com outcome:
 *   "correctUnsat" — disse insatisfazível e é (acaba);
 *   "wrongUnsat"   — disse insatisfazível mas é satisfazível (erro; passa a pedir uma valoração);
 *   "askValuation" — disse satisfazível: agora tem de dar a valoração (ainda não se diz se está certo);
 *   "satisfies"    — a valoração satisfaz S (acaba);
 *   "falsifies"    — alguma cláusula fica falsa (erro);
 *   "undecided"    — nenhuma é falsa mas há cláusulas por decidir (não conta como erro);
 *   "changed"      — voltou a responder;
 *   "invalid"      — jogada que não faz sentido nesta fase (não muda nada).
 */
export function satMove(state, move) {
  const next = { ...state, moves: state.moves + 1 };
  if (state.phase === "answer" && move?.type === "answer" && (move.answer === "sat" || move.answer === "unsat")) {
    next.answered = move.answer;
    if (move.answer === "sat") return { ok: true, state: { ...next, phase: "valuation" }, outcome: "askValuation" };
    if (!state.sat) return { ok: true, state: { ...next, phase: "done", finished: "unsat" }, outcome: "correctUnsat" };
    return { ok: false, state: { ...next, phase: "valuation", errors: next.errors + 1 }, outcome: "wrongUnsat" };
  }
  if (state.phase === "valuation" && move?.type === "check") {
    const check = checkValuation(state.S, move.assignment);
    next.check = check;
    if (check.value === true) {
      return { ok: true, state: { ...next, phase: "done", finished: "sat", assignment: check.assignment }, outcome: "satisfies" };
    }
    if (check.value === null) return { ok: true, state: next, outcome: "undecided" };
    return { ok: false, state: { ...next, errors: next.errors + 1 }, outcome: "falsifies" };
  }
  if (state.phase === "valuation" && move?.type === "change") {
    return { ok: true, state: { ...next, phase: "answer", check: null }, outcome: "changed" };
  }
  return { ok: false, state, outcome: "invalid" };
}
