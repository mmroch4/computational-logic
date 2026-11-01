// «Encontra o passo errado»: o catálogo contra o verificador, o estado e o HTML.
// No Chrome, a 390px: scripts/check-find-error.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isExerciseId, progressStatus, recordMark } from "../js/core/exercises.js";
import {
  FIND_ERROR_PUZZLES,
  REASONS,
  allowedRuleIds,
  chooseLine,
  chooseReason,
  puzzleFindings,
  puzzleGoal,
  puzzleMark,
  puzzleProof,
  puzzleSolution,
  reasonOptions,
  startPuzzle,
  validatePuzzle,
  validatePuzzles,
} from "../js/core/find-error.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { checkSequent } from "../js/core/semantics.js";
import { VERIFY_ERROR_CODES, verifyLine, verifyProof } from "../js/core/verify.js";
import { LOCALES, initI18n, setLang } from "../js/ui/i18n.js";
import { findErrorHtml } from "../js/ui/find-error.js";

const [FIRST] = FIND_ERROR_PUZZLES;
const puzzleWith = (changes) => ({ ...FIRST, ...changes });

test("há cerca de 10 desafios, com ids próprios", () => {
  assert.ok(FIND_ERROR_PUZZLES.length >= 10 && FIND_ERROR_PUZZLES.length <= 12);
  assert.deepEqual(validatePuzzles(FIND_ERROR_PUZZLES), {});
  for (const { id } of FIND_ERROR_PUZZLES) assert.ok(isExerciseId(id), id);
});

test("o verificador confirma que cada erro está exatamente na linha indicada", () => {
  for (const puzzle of FIND_ERROR_PUZZLES) {
    const proof = puzzleProof(puzzle);
    const rules = ruleSet(puzzle.rules);
    const result = verifyProof(proof, puzzleGoal(puzzle), rules, RULES);
    assert.equal(result.ok, false, puzzle.id);
    assert.equal(result.conclusionError, null, puzzle.id);

    const wrong = [...result.lineErrors.map(({ params }) => params.line), ...result.extraPremises];
    assert.deepEqual(wrong, [puzzle.line], puzzle.id);

    proof.lines.forEach((_, index) => {
      const number = index + 1;
      const isExtra = result.extraPremises.includes(number);
      assert.equal(verifyLine(proof, number, rules, RULES).ok, number !== puzzle.line || isExtra, `${puzzle.id}, linha ${number}`);
    });
  }
});

test("a explicação certa descreve o que o verificador encontra, e as outras não", () => {
  for (const puzzle of FIND_ERROR_PUZZLES) {
    const [{ code }] = puzzleFindings(puzzle);
    assert.equal(REASONS[puzzle.answer], code, puzzle.id);
    for (const key of puzzle.distractors) assert.notEqual(REASONS[key], code, `${puzzle.id}: ${key}`);
  }
});

test("as explicações falam de códigos que o verificador conhece", () => {
  for (const code of Object.values(REASONS)) {
    assert.ok(code === "extraPremise" || VERIFY_ERROR_CODES.includes(code), code);
  }
});

test("com sequente válido há prova correta; sem ela, o sequente é mesmo inválido", () => {
  for (const puzzle of FIND_ERROR_PUZZLES) {
    const goal = puzzleGoal(puzzle);
    const solution = puzzleSolution(puzzle);
    assert.equal(checkSequent(goal).valid, solution !== null, puzzle.id);
    if (solution) assert.ok(verifyProof(solution, goal, ruleSet(puzzle.rules), RULES).ok, puzzle.id);
  }
});

test("os desafios cobrem erros de tipos diferentes, com e sem subdeduções", () => {
  const codes = new Set(FIND_ERROR_PUZZLES.map((puzzle) => puzzleFindings(puzzle)[0].code));
  assert.ok(codes.size >= 8, [...codes].join());
  const answers = new Set(FIND_ERROR_PUZZLES.map(({ answer }) => answer));
  assert.equal(answers.size, FIND_ERROR_PUZZLES.length);
  assert.ok(new Set(FIND_ERROR_PUZZLES.map(({ line }) => line)).size >= 4);
});

test("cada desafio tem textos nos dois idiomas", () => {
  for (const locale of Object.values(LOCALES)) {
    const { reasons, explanations } = locale.exercises.findError;
    for (const key of Object.keys(REASONS)) assert.ok(reasons[key], key);
    for (const { explanation } of FIND_ERROR_PUZZLES) assert.ok(explanations[explanation], explanation);
  }
});

test("as explicações citam linhas e fórmulas da própria prova", () => {
  for (const locale of Object.values(LOCALES)) {
    const { explanations } = locale.exercises.findError;
    for (const puzzle of FIND_ERROR_PUZZLES) {
      const text = explanations[puzzle.explanation];
      const proofs = puzzle.proof + (puzzle.solution ?? "");
      for (const [, line] of text.matchAll(/(?:linha|line) (\d+)/gi)) {
        assert.ok(Number(line) <= puzzleProof(puzzle).lines.length, `${puzzle.id}: linha ${line}`);
      }
      for (const [formula] of text.matchAll(/¬*[a-z] [→∧∨] ¬*[a-z]/g)) {
        assert.ok(proofs.includes(formula), `${puzzle.id}: ${formula}`);
      }
    }
  }
});

test("validatePuzzle apanha cada tipo de problema", () => {
  const cases = [
    [{ id: "ex-outro" }, "badId"],
    [{ level: 0 }, "badLevel"],
    [{ rules: "nada" }, "badRules"],
    [{ sequent: "g ->" }, "badSequent"],
    [{ sequent: "g→h, h ⊢ g∧h" }, "sequentNotCanonical"],
    [{ proof: "isto não é uma prova" }, "badProof"],
    [{ line: 4 }, "wrongLine"],
    [{ answer: "missingCase", distractors: ["laterLine", "assumedPremise", "ruleNotInSet"] }, "wrongAnswer"],
    [{ answer: "nada" }, "badAnswer"],
    [{ distractors: ["laterLine"] }, "badDistractors"],
    [{ distractors: ["laterLine", "laterLine", "missingCase"] }, "badDistractors"],
    [{ distractors: ["onlyOuterDoubleNegation", "laterLine", "missingCase"] }, "badDistractors"],
    [{ explanation: "" }, "badExplanation"],
    [{ sequent: "g → h, h ⊢ h ∧ h", proof: "1 | g → h   premissa\n2 | h       premissa\n3 | g       →E, 2, 1\n4 | h ∧ h   ∧I, 2, 2" }, "missingSolution"],
    [{ solution: "isto também não" }, "badSolution"],
    [{ solution: "1 | g → h   premissa" }, "solutionRejected"],
  ];
  for (const [changes, code] of cases) {
    assert.ok(validatePuzzle(puzzleWith(changes)).includes(code), code);
  }
});

test("uma prova sem erro, com dois erros ou inacabada não serve", () => {
  const sound = puzzleWith({
    sequent: "g → h, h ⊢ h ∧ h",
    proof: "1 | g → h   premissa\n2 | h       premissa\n3 | h ∧ h   ∧I, 2, 2",
  });
  const twice = puzzleWith({
    proof: "1 | g → h   premissa\n2 | h       premissa\n3 | g       →E, 2, 1\n4 | g       →E, 2, 1\n5 | g ∧ h   ∧I, 3, 2",
  });
  const unfinished = puzzleWith({
    proof: "1 | g → h   premissa\n2 | h       premissa\n3 | g       →E, 2, 1\n4 |   g ∧ h   hipótese",
  });
  for (const puzzle of [sound, twice, unfinished]) {
    assert.ok(validatePuzzle(puzzle).includes("notOneError"), puzzle.proof);
  }
});

test("validatePuzzles assinala ids repetidos", () => {
  assert.deepEqual(validatePuzzles([FIRST, FIRST]), { [FIRST.id]: ["duplicateId"] });
});

test("reasonOptions mostra a certa e as falsas, sem a pôr sempre no mesmo sítio", () => {
  for (const puzzle of FIND_ERROR_PUZZLES) {
    assert.deepEqual([...reasonOptions(puzzle)].sort(), [puzzle.answer, ...puzzle.distractors].sort());
    assert.deepEqual(reasonOptions(puzzle), reasonOptions(puzzle));
  }
  const places = FIND_ERROR_PUZZLES.map((puzzle) => reasonOptions(puzzle).indexOf(puzzle.answer));
  assert.equal(new Set(places).size, 4);
});

test("allowedRuleIds não repete as formas alternativas e respeita o conjunto", () => {
  const ids = allowedRuleIds({ rules: "completo" });
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("DM"));
  assert.ok(!allowedRuleIds({ rules: "base" }).includes("MT"));
});

test("apontar: uma linha certa fica recusada, e a errada passa à explicação", () => {
  let state = startPuzzle();
  state = chooseLine(FIRST, state, 1);
  assert.deepEqual(state.wrongLines, [1]);
  assert.deepEqual(state.feedback, { kind: "lineFine", line: 1 });
  assert.equal(state.phase, "line");
  assert.equal(chooseLine(FIRST, state, 1), state);

  state = chooseLine(FIRST, state, FIRST.line);
  assert.equal(state.phase, "reason");
  assert.equal(state.feedback, null);
  assert.equal(chooseLine(FIRST, state, 2), state);
});

test("explicar: só a explicação certa resolve e dá a marca do progresso", () => {
  let state = chooseLine(FIRST, startPuzzle(), FIRST.line);
  assert.equal(puzzleMark(state), null);
  assert.equal(chooseReason(FIRST, startPuzzle(), FIRST.answer).phase, "line");

  const [distractor] = FIRST.distractors;
  state = chooseReason(FIRST, state, distractor);
  assert.deepEqual(state.wrongReasons, [distractor]);
  assert.deepEqual(state.feedback, { kind: "reasonWrong" });
  assert.equal(chooseReason(FIRST, state, distractor), state);
  assert.equal(puzzleMark(state), null);

  state = chooseReason(FIRST, state, FIRST.answer);
  assert.equal(state.phase, "done");
  assert.equal(puzzleMark(state), "solved");
  assert.equal(progressStatus(recordMark(null, puzzleMark(state))), "solved");
});

test("o HTML só revela a linha errada depois de ela ser encontrada", () => {
  initI18n();
  const start = findErrorHtml(FIRST, startPuzzle());
  assert.ok(!start.includes('data-state="error"'));
  assert.ok(!start.includes("data-reason"));
  assert.ok(!start.includes(LOCALES.pt.exercises.findError.reasons[FIRST.answer]));
  assert.equal(start.match(/class="fitch__number fitch__pick"/g).length, puzzleProof(FIRST).lines.length);
  assert.ok(!start.includes(" disabled"));
  assert.ok(start.includes("Regras permitidas: "));

  const refused = chooseLine(FIRST, startPuzzle(), 1);
  const html = findErrorHtml(FIRST, refused);
  assert.ok(html.includes('data-line="1" data-state="ok"'));
  assert.equal(html.match(/ disabled/g).length, 1);
  assert.ok(html.includes("A linha 1 está certa"));
});

test("depois da linha, mostra as quatro explicações e desliga as recusadas", () => {
  initI18n();
  let state = chooseLine(FIRST, startPuzzle(), FIRST.line);
  const html = findErrorHtml(FIRST, state);
  assert.ok(html.includes(`data-line="${FIRST.line}" data-state="error"`));
  assert.equal(html.match(/data-reason=/g).length, 4);

  const [distractor] = FIRST.distractors;
  state = chooseReason(FIRST, state, distractor);
  assert.ok(findErrorHtml(FIRST, state).includes(`data-reason="${distractor}" disabled`));
});

test("no fim, mostra a prova correta ou diz que o sequente é inválido", () => {
  initI18n();
  const finish = (puzzle) => chooseReason(puzzle, chooseLine(puzzle, startPuzzle(), puzzle.line), puzzle.answer);
  const invalid = FIND_ERROR_PUZZLES.find(({ solution }) => !solution);
  const valid = FIND_ERROR_PUZZLES.find(({ solution }) => solution);
  assert.ok(findErrorHtml(invalid, finish(invalid)).includes("nem sequer é válido"));
  assert.ok(!findErrorHtml(invalid, finish(invalid)).includes("Uma prova correta"));
  assert.ok(findErrorHtml(valid, finish(valid)).includes("Uma prova correta"));
  assert.equal(findErrorHtml(valid, finish(valid)).match(/class="fitch"/g).length, 1);
});

test("em inglês, as siglas e os textos mudam com o idioma", () => {
  initI18n();
  setLang("en");
  try {
    const html = findErrorHtml(puzzleWith({ rules: "completo" }), startPuzzle());
    assert.ok(html.includes("Allowed rules: "));
    assert.ok(html.includes("RAA"));
    assert.ok(html.includes("Pick line 1"));
  } finally {
    setLang("pt");
  }
});

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";

test("no Chrome a 390px: faz um desafio até ao fim, com toque e com teclado", { skip: !existsSync(CHROME) }, () => {
  const run = spawnSync("node", ["scripts/check-find-error.mjs"], { encoding: "utf8", timeout: 90000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
