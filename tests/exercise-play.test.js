import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { buildTree } from "../js/core/trace.js";
import { generateFormula, mulberry32 } from "../js/core/generator.js";
import { bruteForceSat, evaluate } from "../js/core/verify.js";
import { EXAMPLES } from "../js/core/examples.js";
import { lit } from "../js/core/literals.js";
import { HINT_LEVELS, hintFor, moveError, playMove, startGame, takeHint, toolMove, validMoves } from "../js/core/exercise-play.js";

const clausesOf = (text) => {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
};

/** Joga até ao fim escolhendo a jogada com `pick(state)`. */
function playOut(S, pick) {
  let state = startGame(S);
  for (let i = 0; i < 10000 && !state.finished; i++) {
    const outcome = playMove(state, pick(state));
    assert.ok(outcome.ok, `jogada inválida: ${JSON.stringify(outcome.error)}`);
    state = outcome.state;
  }
  assert.ok(state.finished, "o jogo não acabou");
  return state;
}

const randomFormulas = () =>
  Array.from({ length: 200 }, (_, seed) => generateFormula({ seed, vars: 1 + (seed % 5), clauses: 2 + (seed % 9) }).clauses);

test("jogar sempre a jogada da ferramenta reproduz o trace do solveDLL", () => {
  const sets = [...EXAMPLES.map((example) => clausesOf(example.input)), ...randomFormulas()];
  for (const S of sets) {
    const state = playOut(S, toolMove);
    assert.deepEqual(state.trace, solveDLL(S).trace);
  }
});

test("qualquer sequência de jogadas válidas chega à resposta certa", () => {
  const random = mulberry32(7);
  for (const S of randomFormulas()) {
    const state = playOut(S, (s) => {
      const moves = validMoves(s);
      return moves[Math.floor(random() * moves.length)];
    });
    const expected = bruteForceSat(S).sat;
    assert.equal(state.finished, expected ? "sat" : "unsat");
    if (expected) assert.equal(evaluate(S, state.assignment), true);
    // A árvore do aluno é uma árvore válida para o buildTree do Passo a passo.
    const tree = buildTree(state.trace);
    assert.equal(tree.nodes.filter(Boolean).length, state.stats.nodes);
  }
});

test("propagar: qualquer cláusula unitária serve, uma não unitária é erro", () => {
  const S = clausesOf("p q, -q, r");
  const state = startGame(S);
  assert.deepEqual(validMoves(state), [
    { type: "unit", clauseIndex: 1 },
    { type: "unit", clauseIndex: 2 },
  ]);
  const second = playMove(state, { type: "unit", clauseIndex: 2 });
  assert.ok(second.ok);
  assert.equal(second.warning, undefined);
  assert.deepEqual(second.state.S, clausesOf("p q, -q"));
  assert.equal(second.state.moves, 1);

  const wrong = playMove(state, { type: "unit", clauseIndex: 0 });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error.code, "notUnit");
  assert.deepEqual(wrong.error.units.map((u) => u.index), [1, 2]);
  assert.equal(wrong.state.errors, 1);
  assert.equal(wrong.state.trace.length, 1, "uma jogada inválida não muda o trace");
  assert.equal(state.errors, 0, "o estado recebido não é alterado");

  assert.equal(moveError(state, { type: "unit", clauseIndex: 9 }).code, "badClause");
});

test("escolher: só sem unitárias; avisa quando o caminho muda", () => {
  // «Ainda há cláusulas unitárias: {¬p₂}»
  const withUnit = startGame(clausesOf("p1 p2, -p2"));
  const early = playMove(withUnit, { type: "branch", literal: lit("p1") });
  assert.equal(early.error.code, "stillUnits");
  assert.deepEqual(early.error.units, [{ index: 1, literal: lit("p2", true) }]);

  const S = clausesOf("p q, -p q, p -q, -p -q"); // dois ramos
  const state = startGame(S);
  assert.equal(validMoves(state).length, 4);
  assert.deepEqual(toolMove(state), { type: "branch", literal: lit("p") });

  const same = playMove(state, { type: "branch", literal: lit("p") });
  assert.ok(same.ok);
  assert.equal(same.warning, undefined);

  // Escolher ¬p primeiro vale, mas a árvore fica diferente da da ferramenta.
  const negative = playMove(state, { type: "branch", literal: lit("p", true) });
  assert.ok(negative.ok);
  assert.deepEqual(negative.warning, { code: "pathChanges", tool: lit("p") });
  assert.deepEqual(negative.state.S.at(-1), [lit("p", true)]);
  assert.deepEqual(negative.events.map((e) => e.type), ["branch"]);

  assert.equal(moveError(state, { type: "branch", literal: lit("r") }).code, "notInSet");
});

test("responder: satisfazível só com S vazio, insatisfazível só com F", () => {
  const empty = startGame([]);
  assert.equal(moveError(empty, { type: "unsat" }).code, "isEmpty");
  assert.equal(moveError(empty, { type: "unit", clauseIndex: 0 }).code, "isEmpty");
  const done = playMove(empty, { type: "sat" });
  assert.equal(done.state.finished, "sat");
  assert.deepEqual(done.events.map((e) => e.type), ["sat", "result"]);
  assert.equal(moveError(done.state, { type: "sat" }).code, "finished");

  const withF = startGame(clausesOf("p, -p"));
  const afterP = playMove(withF, { type: "unit", clauseIndex: 0 }).state;
  assert.deepEqual(afterP.S, [[]]);
  assert.equal(moveError(afterP, { type: "sat" }).code, "hasF");
  assert.equal(moveError(afterP, { type: "branch", literal: lit("p") }).code, "hasF");

  const open = startGame(clausesOf("p q, -p"));
  const notEmpty = moveError(open, { type: "sat" });
  assert.equal(notEmpty.code, "notEmpty");
  assert.equal(notEmpty.units.length, 1);
  assert.equal(moveError(open, { type: "unsat" }).code, "noF");
});

test("um ramo com F volta atrás sozinho e abre o ramo complementar", () => {
  const S = clausesOf("p q, -p q, p -q, -p -q");
  let state = playMove(startGame(S), { type: "branch", literal: lit("p", true) }).state; // nó 1: S ∪ {¬p}
  while (validMoves(state)[0].type === "unit") state = playMove(state, toolMove(state)).state;
  const closed = playMove(state, { type: "unsat" });
  assert.ok(closed.ok);
  assert.equal(closed.state.finished, null);
  assert.deepEqual(closed.events.map((e) => e.type), ["conflict", "backtrack", "branch"]);
  assert.deepEqual(closed.events[2].literal, lit("p"));
  assert.equal(closed.state.node, 2);

  state = closed.state;
  while (validMoves(state)[0].type === "unit") state = playMove(state, toolMove(state)).state;
  const last = playMove(state, { type: "unsat" });
  assert.equal(last.state.finished, "unsat");
  assert.deepEqual(last.events.map((e) => e.type), ["conflict", "result"]);
  assert.equal(last.state.stats.nodes, 3);
});

test("jogada desconhecida é um erro de programação", () => {
  assert.throws(() => playMove(startGame([]), { type: "nope" }));
});

test("dicas: a situação de cada tipo de estado e a jogada do nível 3 é a da ferramenta", () => {
  const units = startGame(clausesOf("p1, -p1 -p2, p3 p2"));
  assert.deepEqual(hintFor(units), { situation: "units", move: { type: "unit", clauseIndex: 0 } });

  const choose = startGame(clausesOf("p q, -p q, p -q, -p -q"));
  assert.deepEqual(hintFor(choose), { situation: "branch", move: { type: "branch", literal: lit("p") } });

  assert.deepEqual(hintFor(startGame([])), { situation: "empty", move: { type: "sat" } });
  assert.deepEqual(hintFor(startGame([[]])), { situation: "conflict", move: { type: "unsat" } });

  const done = playOut(clausesOf("p"), toolMove);
  assert.equal(hintFor(done), null);
});

test("dicas: cada nível custa 1, param no nível 3 e recomeçam depois de uma jogada válida", () => {
  let state = startGame(clausesOf("p1, -p1 -p2, p3 p2"));
  assert.equal(state.hints, 0);
  assert.equal(state.hintLevel, 0);
  for (let i = 1; i <= HINT_LEVELS; i++) {
    state = takeHint(state);
    assert.equal(state.hintLevel, i);
    assert.equal(state.hints, i);
  }
  assert.equal(takeHint(state), state, "depois do nível 3 não há mais dicas nem mais custo");

  // Uma jogada inválida não muda a posição: a dica continua no mesmo nível.
  const wrong = playMove(state, { type: "sat" });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.state.hintLevel, HINT_LEVELS);

  const right = playMove(wrong.state, toolMove(wrong.state));
  assert.equal(right.state.hintLevel, 0);
  assert.equal(right.state.hints, HINT_LEVELS, "o custo acumula-se no exercício");
  assert.equal(takeHint(right.state).hints, HINT_LEVELS + 1);

  const done = playOut(clausesOf("p"), toolMove);
  assert.equal(takeHint(done), done, "no fim não há dicas");
});

test("dicas: seguir sempre a dica do nível 3 resolve o exercício como a ferramenta", () => {
  for (const S of randomFormulas().slice(0, 50)) {
    let state = startGame(S);
    while (!state.finished) {
      while (state.hintLevel < HINT_LEVELS) state = takeHint(state);
      state = playMove(state, hintFor(state).move).state;
    }
    assert.deepEqual(state.trace, solveDLL(S).trace);
    assert.equal(state.hints, state.moves * HINT_LEVELS);
  }
});

// M6.6: matriz «tipo de estado × jogada» com o código de erro esperado (null = jogada válida).
// Os cinco tipos de estado são os do DLL: há unitárias, é preciso escolher, S vazio, S contém F, acabou.
function matrixStates() {
  const conflict = playMove(startGame(clausesOf("p, -p, q")), { type: "unit", clauseIndex: 0 }).state;
  assert.deepEqual(conflict.S, [[], [lit("q")]], "F ao lado de uma unitária: a propagação para no F");
  return {
    units: startGame(clausesOf("p q, -q")),
    branch: startGame(clausesOf("p q, -p q")),
    empty: startGame([]),
    conflict,
    finished: playOut(clausesOf("p"), toolMove),
  };
}

const MATRIX_MOVES = {
  unitOk: { type: "unit", clauseIndex: 1 }, // a 2.ª cláusula (unitária em «units», [q] em «conflict»)
  unitFirst: { type: "unit", clauseIndex: 0 },
  unitOut: { type: "unit", clauseIndex: 99 },
  branchIn: { type: "branch", literal: lit("p", true) },
  branchOut: { type: "branch", literal: lit("z") },
  sat: { type: "sat" },
  unsat: { type: "unsat" },
};

const EXPECTED_ERRORS = {
  units: { unitOk: null, unitFirst: "notUnit", unitOut: "badClause", branchIn: "stillUnits", branchOut: "stillUnits", sat: "notEmpty", unsat: "noF" },
  branch: { unitOk: "notUnit", unitFirst: "notUnit", unitOut: "badClause", branchIn: null, branchOut: "notInSet", sat: "notEmpty", unsat: "noF" },
  empty: { unitOk: "isEmpty", unitFirst: "isEmpty", unitOut: "isEmpty", branchIn: "isEmpty", branchOut: "isEmpty", sat: null, unsat: "isEmpty" },
  conflict: { unitOk: "hasF", unitFirst: "hasF", unitOut: "hasF", branchIn: "hasF", branchOut: "hasF", sat: "hasF", unsat: null },
  finished: { unitOk: "finished", unitFirst: "finished", unitOut: "finished", branchIn: "finished", branchOut: "finished", sat: "finished", unsat: "finished" },
};

test("matriz: cada tipo de estado aceita ou recusa cada jogada com o código certo", () => {
  const states = matrixStates();
  for (const [stateName, state] of Object.entries(states)) {
    for (const [moveName, move] of Object.entries(MATRIX_MOVES)) {
      const expected = EXPECTED_ERRORS[stateName][moveName];
      const outcome = playMove(state, move);
      const where = `${stateName} × ${moveName}`;
      assert.equal(moveError(state, move)?.code ?? null, expected, where);
      assert.equal(outcome.ok, expected === null, where);
      if (expected === null) {
        assert.equal(outcome.state.moves, state.moves + 1, where);
        assert.equal(outcome.state.errors, state.errors, where);
        assert.ok(outcome.events.length > 0, where);
      } else {
        assert.deepEqual(outcome.error, moveError(state, move), where);
        assert.deepEqual(outcome.events, [], where);
      }
    }
  }
});

test("matriz: os erros trazem o que a mensagem precisa (unitárias por propagar)", () => {
  const { units, branch } = matrixStates();
  const pending = [{ index: 1, literal: lit("q", true) }];
  assert.deepEqual(moveError(units, MATRIX_MOVES.unitFirst), { code: "notUnit", clauseIndex: 0, units: pending });
  assert.deepEqual(moveError(units, MATRIX_MOVES.branchIn), { code: "stillUnits", units: pending });
  assert.deepEqual(moveError(units, MATRIX_MOVES.sat), { code: "notEmpty", units: pending });
  assert.deepEqual(moveError(units, MATRIX_MOVES.unsat), { code: "noF", units: pending });
  assert.deepEqual(moveError(units, MATRIX_MOVES.unitOut), { code: "badClause", clauseIndex: 99 });

  assert.deepEqual(moveError(branch, MATRIX_MOVES.unitFirst), { code: "notUnit", clauseIndex: 0, units: [] });
  assert.deepEqual(moveError(branch, MATRIX_MOVES.branchOut), { code: "notInSet", literal: lit("z") });
  assert.deepEqual(moveError(branch, { type: "branch" }), { code: "notInSet", literal: null });
  assert.deepEqual(moveError(branch, MATRIX_MOVES.sat), { code: "notEmpty", units: [] });
});

/** Todas as jogadas que um aluno pode tentar em S0: cada cláusula, um índice a mais, cada literal (e um de fora), as respostas. */
function candidateMoves(S0) {
  const vars = [...new Set(S0.flat().map((l) => l.v)), "zz"];
  return [
    ...Array.from({ length: S0.length + 1 }, (_, clauseIndex) => ({ type: "unit", clauseIndex })),
    ...vars.flatMap((v) => [{ type: "branch", literal: lit(v) }, { type: "branch", literal: lit(v, true) }]),
    { type: "sat" },
    { type: "unsat" },
  ];
}

test("em qualquer estado, as jogadas aceites são exatamente as de validMoves, e uma inválida só conta um erro", () => {
  const random = mulberry32(66);
  const key = (move) => JSON.stringify(move);
  for (const S0 of randomFormulas().slice(0, 80)) {
    const candidates = candidateMoves(S0);
    let state = startGame(S0);
    for (let guard = 0; guard < 500; guard++) {
      const valid = new Set(validMoves(state).map(key));
      const accepted = candidates.filter((move) => moveError(state, move) === null).map(key);
      // S nunca tem mais do que |S0| + 1 cláusulas (só se escolhe l sem unitárias, por isso o {l} anterior
      // já foi propagado): os candidatos cobrem todas as jogadas válidas e a comparação é direta.
      assert.ok(state.S.length <= S0.length + 1);
      assert.deepEqual(new Set(accepted), valid);

      for (const move of candidates) {
        if (valid.has(key(move))) continue;
        const outcome = playMove(state, move);
        assert.equal(outcome.ok, false, `aceite fora de validMoves: ${key(move)}`);
        assert.deepEqual(outcome.state, { ...state, errors: state.errors + 1 });
      }
      if (state.finished) break;
      const moves = validMoves(state);
      state = playMove(state, moves[Math.floor(random() * moves.length)]).state;
    }
    assert.ok(state.finished);
    assert.deepEqual(validMoves(state), []);
  }
});
