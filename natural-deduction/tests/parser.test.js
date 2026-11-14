import { test } from "node:test";
import assert from "node:assert/strict";
import { FALSUM, and, atom, eq, equals, exists, forall, format, implies, not, or, term } from "../js/core/formula.js";
import { convertNotation } from "../js/core/notation.js";
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
  { text: "p ? q", code: "unexpectedChar", start: 2, end: 3, params: { char: "?" } },
  { text: "p, q", code: "unexpectedChar", start: 1, end: 2, params: { char: "," } },
  { text: "(p, q)", code: "unexpectedChar", start: 2, end: 3, params: { char: "," } },
  { text: ", p", code: "unexpectedChar", start: 0, end: 1, params: { char: "," } },
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
  { text: "F (q)", code: "missingOperator", start: 2, end: 3, params: { token: "(" } },
  { text: "P(a) Q(a)", code: "missingOperator", start: 5, end: 6, params: { token: "Q" } },
  { text: "p ∀x P(x)", code: "missingOperator", start: 2, end: 4, params: { token: "∀x" } },
  { text: "∀x", code: "missingOperand", start: 0, end: 2, params: { char: "∀x" } },
  { text: "forall y1", code: "missingOperand", start: 0, end: 9, params: { char: "forall y1" } },
  { text: "v(a)", code: "missingOperand", start: 0, end: 1, params: { char: "v" } },
  // 1.ª ordem
  { text: "∀", code: "missingVariable", start: 0, end: 1, params: { token: "∀" } },
  { text: "∃(P(x))", code: "missingVariable", start: 0, end: 1, params: { token: "∃" } },
  { text: "∀F P(F)", code: "missingVariable", start: 0, end: 1, params: { token: "∀" } },
  { text: "forall", code: "missingVariable", start: 0, end: 6, params: { token: "forall" } },
  { text: "p ∧ exists 1", code: "missingVariable", start: 4, end: 10, params: { token: "exists" } },
  { text: "a =", code: "missingTerm", start: 2, end: 3, params: { char: "=" } },
  { text: "= a", code: "missingTerm", start: 0, end: 1, params: { char: "=" } },
  { text: "a = = b", code: "missingTerm", start: 4, end: 5, params: { char: "=" } },
  { text: "P()", code: "missingTerm", start: 2, end: 3, params: { char: ")" } },
  { text: "P(a,)", code: "missingTerm", start: 4, end: 5, params: { char: ")" } },
  { text: "P(, a)", code: "missingTerm", start: 2, end: 3, params: { char: "," } },
  { text: "P(a,", code: "missingTerm", start: 3, end: 4, params: { char: "," } },
  { text: "P(¬a)", code: "notATerm", start: 2, end: 3, params: { token: "¬" } },
  { text: "a = F", code: "notATerm", start: 4, end: 5, params: { token: "F" } },
  { text: "P((a))", code: "notATerm", start: 2, end: 3, params: { token: "(" } },
  { text: "P(∀x)", code: "notATerm", start: 2, end: 4, params: { token: "∀x" } },
  { text: "f(a) = ∧", code: "notATerm", start: 7, end: 8, params: { token: "∧" } },
  { text: "P(a b)", code: "badArgument", start: 4, end: 5, params: { token: "b" } },
  { text: "P(a ∧ b)", code: "badArgument", start: 4, end: 5, params: { token: "∧" } },
  { text: "P(a = b)", code: "badArgument", start: 4, end: 5, params: { token: "=" } },
  { text: "a = b = c", code: "badEquality", start: 6, end: 7, params: { char: "=" } },
  { text: "(a) = b", code: "badEquality", start: 4, end: 5, params: { char: "=" } },
  { text: "(p ∧ a = b = c)", code: "badEquality", start: 11, end: 12, params: { char: "=" } },
  { text: "P(a", code: "unbalanced", start: 1, end: 2, params: { char: "(" } },
  { text: "P(", code: "unbalanced", start: 1, end: 2, params: { char: "(" } },
  { text: "a = f(", code: "unbalanced", start: 5, end: 6, params: { char: "(" } },
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

// 1.ª ordem.

const [a, b, x, y, v] = ["a", "b", "x", "y", "v"].map((name) => term(name));
const f = (...args) => term("f", args);
const P = (...args) => atom("P", args);
const Q = (...args) => atom("Q", args);

test("predicados, funções e igualdade", () => {
  assertReads("P(x)", P(x));
  assertReads("P(x, f(a))", P(x, f(a)));
  assertReads("P (x ,f( a ))", P(x, f(a)));
  assertReads("R(f(g(x)), b)", atom("R", [f(term("g", [x])), b]));
  assertReads("a = b", eq(a, b));
  assertReads("a=b", eq(a, b));
  assertReads("f(a) = b", eq(f(a), b));
  assertReads("f(x, y) = f(y, x)", eq(f(x, y), f(y, x)));
  assertReads("P(x₁, c_2)", P(term("x1"), term("c_2")));
  assertReads("p", atom("p"));
  assertReads("p ∧ P(a)", and(atom("p"), P(a)));
});

test("quantificadores em todas as escritas", () => {
  for (const written of ["∀x P(x)", "∀xP(x)", "∀ x P(x)", "forall x P(x)", "forall xP(x)", "forall\tx P(x)"]) {
    assertReads(written, forall("x", P(x)));
  }
  for (const written of ["∃x P(x)", "∃xP(x)", "exists x P(x)", "exists xP(x)"]) {
    assertReads(written, exists("x", P(x)));
  }
  assertReads("∀x∀y R(x, y)", forall("x", forall("y", atom("R", [x, y]))));
  assertReads("forall x exists y R(x, y)", forall("x", exists("y", atom("R", [x, y]))));
  assertReads("∀x1 P(x1)", forall("x1", P(term("x1"))));
  assertReads("∀x₁P(x₁)", forall("x1", P(term("x1"))));
  assertReads("∀x(P(x) → Q(x))", forall("x", implies(P(x), Q(x))));
  assertReads("∀x ¬P(x)", forall("x", not(P(x))));
  assertReads("∀x x = x", forall("x", eq(x, x)));
  // A variável é uma letra e dígitos: o resto da palavra já é a fórmula.
  assertReads("∀xPx", forall("x", atom("Px")));
});

test("os quantificadores ligam como o ¬ e o = liga mais do que tudo", () => {
  assertReads("∃x P(x) ∨ ¬P(x)", or(exists("x", P(x)), not(P(x))));
  assertReads("∀x P(x) → Q(a)", implies(forall("x", P(x)), Q(a)));
  assertReads("¬∀x P(x)", not(forall("x", P(x))));
  assertReads("∀x ¬∃y R(x, y)", forall("x", not(exists("y", atom("R", [x, y])))));
  assertReads("¬a = b", not(eq(a, b)));
  assertReads("a = b ∧ b = a", and(eq(a, b), eq(b, a)));
  assertReads("p → a = b", implies(atom("p"), eq(a, b)));
});

test("o v é disjunção entre fórmulas e nome em posição de termo", () => {
  assertReads("P(v)", P(v));
  assertReads("P(a, v)", P(a, v));
  assertReads("P(v(a))", P(term("v", [a])));
  assertReads("∀v P(v)", forall("v", P(v)));
  assertReads("∀vP(v)", forall("v", P(v)));
  assertReads("forall v P(v)", forall("v", P(v)));
  assertReads("v = a", eq(v, a));
  assertReads("a = v", eq(a, v));
  assertReads("v(a) = b", eq(term("v", [a]), b));
  assertReads("∀v v = v", forall("v", eq(v, v)));
  assertReads("P(v) v Q(v)", or(P(v), Q(v)));
  assertReads("p v q", or(atom("p"), atom("q")));
  assertReads("P(a) v ∀x Q(x)", or(P(a), forall("x", Q(x))));
});

test("forall e exists são reservados e o F continua a ser o absurdo", () => {
  for (const text of ["forall", "exists", "forall ∧ p", "p → exists"]) {
    assert.equal(parseFormula(text).ok, false, text);
  }
  assertReads("foralls", atom("foralls"));
  assertReads("exists1", atom("exists1"));
  assertReads("P(Fa)", P(term("Fa")));
  assertReads("F ∨ P(F1)", or(FALSUM, P(term("F1"))));
});

const TERM_NAMES = ["a", "b", "c1", "x", "y", "v", "x_2", "u12", "Ab", "vv"];
const PREDICATE_NAMES = ["P", "Q", "R1", "p", "q", "Love", "V"];
const VARIABLES = ["x", "y", "v", "z1", "u12"];

function randomTerm(pick, depth) {
  if (depth === 0 || pick(3) > 0) return term(TERM_NAMES[pick(TERM_NAMES.length)]);
  const args = Array.from({ length: 1 + pick(2) }, () => randomTerm(pick, depth - 1));
  return term(["f", "g", "v", "h1"][pick(4)], args);
}

function randomFirstOrder(pick, depth) {
  const choice = depth === 0 ? pick(3) : pick(9);
  switch (choice) {
    case 0: {
      const args = Array.from({ length: pick(3) }, () => randomTerm(pick, 2));
      return atom(PREDICATE_NAMES[pick(PREDICATE_NAMES.length)], args);
    }
    case 1: return eq(randomTerm(pick, 2), randomTerm(pick, 2));
    case 2: return pick(4) === 0 ? FALSUM : atom(PREDICATE_NAMES[pick(PREDICATE_NAMES.length)], [randomTerm(pick, 1)]);
    case 3: return not(randomFirstOrder(pick, depth - 1));
    case 4: return forall(VARIABLES[pick(VARIABLES.length)], randomFirstOrder(pick, depth - 1));
    case 5: return exists(VARIABLES[pick(VARIABLES.length)], randomFirstOrder(pick, depth - 1));
    case 6: return and(randomFirstOrder(pick, depth - 1), randomFirstOrder(pick, depth - 1));
    case 7: return or(randomFirstOrder(pick, depth - 1), randomFirstOrder(pick, depth - 1));
    default: return implies(randomFirstOrder(pick, depth - 1), randomFirstOrder(pick, depth - 1));
  }
}

test("imprimir e voltar a ler dá a mesma fórmula, em fórmulas de 1.ª ordem aleatórias", () => {
  const pick = randomSource(2027);
  for (let i = 0; i < 5000; i++) {
    const formula = randomFirstOrder(pick, 1 + pick(6));
    const text = format(formula);
    assert.ok(equals(read(text), formula), text);
    assert.equal(format(read(text)), text);
  }
});

test("as fórmulas de 1.ª ordem aleatórias, em ASCII e com v, leem-se igual", () => {
  const pick = randomSource(11);
  for (let i = 0; i < 2000; i++) {
    const formula = randomFirstOrder(pick, 1 + pick(5));
    const ascii = convertNotation(format(formula), "ascii");
    assert.ok(equals(read(ascii), formula), ascii);
    const withV = ascii.replace(/ \| /g, " v ");
    assert.ok(equals(read(withV), formula), withV);
    assert.equal(convertNotation(ascii, "symbols"), format(formula), ascii);
  }
});

test("nenhum par de parênteses impresso é dispensável, em 1.ª ordem", () => {
  const pick = randomSource(123);
  for (let i = 0; i < 2000; i++) {
    const formula = randomFirstOrder(pick, 1 + pick(5));
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
