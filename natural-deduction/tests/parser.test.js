import { test } from "node:test";
import assert from "node:assert/strict";
import { FALSUM, and, atom, equals, format, implies, not, or } from "../js/core/formula.js";
import { ERROR_CODES, INPUT_LIMITS, parseFormula } from "../js/core/parser.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

const [p, q, r] = ["p", "q", "r"].map((name) => atom(name));

function read(text) {
  const result = parseFormula(text);
  assert.ok(result.ok, `${text}: ${JSON.stringify(result.error)}`);
  return result.formula;
}

const assertReads = (text, expected) => assert.ok(equals(read(text), expected), `${text} → ${format(read(text))}`);

// Gerador com semente fixa (mulberry32), para as falhas serem reproduzíveis.
function randomSource(seed) {
  let state = seed;
  return (limit) => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return (((mixed ^ (mixed >>> 14)) >>> 0) % limit);
  };
}

const NAMES = ["p", "q", "r", "p1", "p12", "x_2", "Ab", "V", "f", "vv", "F1"];

function randomFormula(pick, depth) {
  const choice = depth === 0 ? pick(2) : pick(6);
  switch (choice) {
    case 0: return atom(NAMES[pick(NAMES.length)]);
    case 1: return pick(4) === 0 ? FALSUM : atom(NAMES[pick(NAMES.length)]);
    case 2: return not(randomFormula(pick, depth - 1));
    case 3: return and(randomFormula(pick, depth - 1), randomFormula(pick, depth - 1));
    case 4: return or(randomFormula(pick, depth - 1), randomFormula(pick, depth - 1));
    default: return implies(randomFormula(pick, depth - 1), randomFormula(pick, depth - 1));
  }
}

test("todas as notações do CLAUDE.md", () => {
  for (const symbol of ["¬", "~", "-", "!"]) assertReads(`${symbol}p`, not(p));
  for (const symbol of ["∧", "&", "/\\", "^"]) assertReads(`p ${symbol} q`, and(p, q));
  for (const symbol of ["∨", "|", "\\/", "v"]) assertReads(`p ${symbol} q`, or(p, q));
  for (const symbol of ["→", "->", "=>"]) assertReads(`p ${symbol} q`, implies(p, q));
  for (const symbol of ["F", "⊥"]) assertReads(symbol, FALSUM);
});

test("as notações funcionam sem espaços", () => {
  assertReads("p&q", and(p, q));
  assertReads("p/\\q", and(p, q));
  assertReads("p\\/q", or(p, q));
  assertReads("p->q", implies(p, q));
  assertReads("-p->-q", implies(not(p), not(q)));
  assertReads("--p", not(not(p)));
  assertReads("!~¬-p", not(not(not(not(p)))));
  assertReads("(p)v(q)", or(p, q));
});

test("v só é disjunção como palavra isolada", () => {
  assertReads("pvq", atom("pvq"));
  assertReads("vv", atom("vv"));
  assertReads("v1", atom("v1"));
  assertReads("V", atom("V"));
});

test("F só é o absurdo como palavra isolada", () => {
  assertReads("F1", atom("F1"));
  assertReads("Fa", atom("Fa"));
  assertReads("f", atom("f"));
  assertReads("¬⊥", not(FALSUM));
});

test("nomes de variáveis e subscritos", () => {
  assertReads("x_2", atom("x_2"));
  assertReads("A1b", atom("A1b"));
  assertReads("p₁₂", atom("p12"));
  assertReads("p12", atom("p12"));
});

test("precedência e associatividade", () => {
  assertReads("¬p ∧ q", and(not(p), q));
  assertReads("p ∧ q ∨ r", or(and(p, q), r));
  assertReads("p ∨ q ∧ r", or(p, and(q, r)));
  assertReads("p ∨ q → r", implies(or(p, q), r));
  assertReads("p → q ∨ r", implies(p, or(q, r)));
  assertReads("p → q → r", implies(p, implies(q, r)));
  assertReads("(p → q) → r", implies(implies(p, q), r));
  assertReads("p ∧ q ∧ r", and(and(p, q), r));
  assertReads("p ∨ q ∨ r", or(or(p, q), r));
  assertReads("¬(p ∧ q)", not(and(p, q)));
  assertReads("((p))", p);
});

test("espaços de qualquer tipo são ignorados", () => {
  assertReads("  p\t∧\nq ", and(p, q));
  assertReads("p ∧ q", and(p, q));
});

const ERROR_EXAMPLES = [
  { text: "", code: "emptyInput", start: 0, end: 0 },
  { text: "   ", code: "emptyInput", start: 0, end: 3 },
  { text: "p # q", code: "unexpectedChar", start: 2, end: 3, params: { char: "#" } },
  { text: "p = q", code: "unexpectedChar", start: 2, end: 3, params: { char: "=" } },
  { text: "p 😀", code: "unexpectedChar", start: 2, end: 4, params: { char: "😀" } },
  { text: "p ∧ 1q", code: "badVariable", start: 4, end: 6, params: { token: "1q" } },
  { text: "_p", code: "badVariable", start: 0, end: 2, params: { token: "_p" } },
  { text: "(p ∧ q", code: "unbalanced", start: 0, end: 1, params: { char: "(" } },
  { text: "((p)", code: "unbalanced", start: 0, end: 1, params: { char: "(" } },
  { text: "(", code: "unbalanced", start: 0, end: 1, params: { char: "(" } },
  { text: "p ∧ (", code: "unbalanced", start: 4, end: 5, params: { char: "(" } },
  { text: "p)", code: "unbalanced", start: 1, end: 2, params: { char: ")" } },
  { text: ")", code: "unbalanced", start: 0, end: 1, params: { char: ")" } },
  { text: "()", code: "missingOperand", start: 1, end: 2, params: { char: ")" } },
  { text: "(p ∧)", code: "missingOperand", start: 4, end: 5, params: { char: ")" } },
  { text: "p ∧", code: "missingOperand", start: 2, end: 3, params: { char: "∧" } },
  { text: "p ->", code: "missingOperand", start: 2, end: 4, params: { char: "->" } },
  { text: "¬", code: "missingOperand", start: 0, end: 1, params: { char: "¬" } },
  { text: "∧ p", code: "missingOperand", start: 0, end: 1, params: { char: "∧" } },
  { text: "v p", code: "missingOperand", start: 0, end: 1, params: { char: "v" } },
  { text: "p ∧ ∨ q", code: "missingOperand", start: 4, end: 5, params: { char: "∨" } },
  { text: "p q", code: "missingOperator", start: 2, end: 3, params: { token: "q" } },
  { text: "p F", code: "missingOperator", start: 2, end: 3, params: { token: "F" } },
  { text: "p ¬q", code: "missingOperator", start: 2, end: 3, params: { token: "¬" } },
  { text: "p (q)", code: "missingOperator", start: 2, end: 3, params: { token: "(" } },
  { text: "(p q)", code: "missingOperator", start: 3, end: 4, params: { token: "q" } },
  { text: "p-->q", code: "missingOperator", start: 1, end: 2, params: { token: "-" } },
];

test("erros com código, posição e parâmetros", () => {
  for (const { text, code, start, end, params = {} } of ERROR_EXAMPLES) {
    assert.deepEqual(parseFormula(text), { ok: false, error: { code, params, start, end } }, text);
  }
});

test("texto demasiado longo", () => {
  const { maxChars } = INPUT_LIMITS;
  const text = "p".repeat(maxChars + 5);
  assert.deepEqual(parseFormula(text), {
    ok: false,
    error: { code: "tooLong", params: { length: maxChars + 5, max: maxChars }, start: 0, end: maxChars + 5 },
  });
});

test("os espaços não contam para o limite de tamanho", () => {
  assertReads(`${" ".repeat(INPUT_LIMITS.maxChars)}p`, p);
});

test("no limite de tamanho, nenhuma forma de aninhar esgota a pilha", () => {
  const half = Math.floor(INPUT_LIMITS.maxChars / 2);
  const inputs = [
    `${"(".repeat(half - 1)}p${")".repeat(half - 1)}`,
    `${"¬".repeat(INPUT_LIMITS.maxChars - 1)}p`,
    `${"p→".repeat(half - 1)}p`,
    `${"p∧".repeat(half - 1)}p`,
    `${"(p∧".repeat(Math.floor(half / 2) - 1)}p${")".repeat(Math.floor(half / 2) - 1)}`,
  ];
  for (const text of inputs) {
    const formula = read(text);
    assert.ok(equals(read(format(formula)), formula));
  }
});

test("cada código de erro é coberto por um exemplo e traduzido nos dois idiomas", () => {
  const covered = new Set([...ERROR_EXAMPLES.map(({ code }) => code), "tooLong"]);
  assert.deepEqual([...covered].sort(), [...ERROR_CODES].sort());
  for (const code of ERROR_CODES) {
    assert.equal(typeof pt.parser.errors[code], "string", `pt: ${code}`);
    assert.equal(typeof en.parser.errors[code], "string", `en: ${code}`);
  }
});

test("imprimir e voltar a ler dá a mesma fórmula, em fórmulas aleatórias", () => {
  const pick = randomSource(2026);
  for (let i = 0; i < 5000; i++) {
    const formula = randomFormula(pick, 1 + pick(6));
    const text = format(formula);
    assert.ok(equals(read(text), formula), text);
    assert.equal(format(read(text)), text);
  }
});

test("a impressão aleatória, reescrita noutras notações, lê-se igual", () => {
  const ALIASES = {
    "¬": ["~", "-", "!"],
    "∧": ["&", "/\\", "^"],
    "∨": ["|", "\\/", " v "],
    "→": ["->", "=>"],
  };
  const pick = randomSource(7);
  for (let i = 0; i < 2000; i++) {
    const formula = randomFormula(pick, 1 + pick(5));
    const rewritten = format(formula)
      .replace(/[¬∧∨→]/g, (symbol) => ALIASES[symbol][pick(ALIASES[symbol].length)])
      .replace(/(?<![\w₀-₉])F(?![\w₀-₉])/g, "⊥");
    assert.ok(equals(read(rewritten), formula), rewritten);
  }
});

test("nenhum par de parênteses impresso é dispensável", () => {
  const pick = randomSource(99);
  for (let i = 0; i < 2000; i++) {
    const formula = randomFormula(pick, 1 + pick(5));
    const text = format(formula);
    const opened = [];
    [...text].forEach((char, index, chars) => {
      if (char === "(") opened.push(index);
      if (char !== ")") return;
      const start = opened.pop();
      const without = chars.filter((_, k) => k !== start && k !== index).join("");
      const result = parseFormula(without);
      assert.ok(!result.ok || !equals(result.formula, formula), `${text} → ${without}`);
    });
  }
});
