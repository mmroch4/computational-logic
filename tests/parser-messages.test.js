import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parse,
  detectNotation,
  ERROR_CODES,
  WARNING_CODES,
  NOT_CNF_REASONS,
  NOTATIONS,
  INPUT_LIMITS,
} from "../js/core/parser.js";

// Conjuntos grandes para os erros e o aviso de tamanho (ver INPUT_LIMITS).
const variables = (n) => Array.from({ length: n }, (_, i) => `x${i + 1}`);
const LONG_TEXT = "p".repeat(INPUT_LIMITS.maxChars + 1);
// Pares {xi, xj} de 40 variáveis: 780 cláusulas diferentes, mais do que o limite.
const PAIRS = variables(40).flatMap((a, i, all) => all.slice(i + 1).map((b) => `${a} ${b}`));
const MANY_CLAUSES = PAIRS.slice(0, INPUT_LIMITS.maxClauses + 1).join(", ");
const MANY_VARIABLES = variables(INPUT_LIMITS.maxVariables + 1).join(", ");
const SOME_VARIABLES = variables(INPUT_LIMITS.manyVariables + 1).join(", ");
import { setLang, t, LOCALES } from "../js/ui/i18n.js";
import { parserErrorMessage, parserWarningMessage } from "../js/ui/parser-messages.js";

// Um exemplo real (texto → erro) para cada código e cada motivo de notCNF.
const ERROR_EXAMPLES = [
  { text: "   ", code: "emptyInput", start: 0, end: 3 },
  { text: "p, , q", code: "emptyClause", start: 3, end: 4 },
  { text: "p, q#", code: "unexpectedChar", start: 4, end: 5, params: { char: "#" } },
  { text: "p, 1q", code: "badVariable", start: 3, end: 5, params: { token: "1q" } },
  { text: "p F", code: "reservedF", start: 2, end: 3 },
  { text: "{{p, q}", code: "unbalanced", start: 0, end: 1, params: { char: "{" } },
  { text: "(p ∨ q", code: "unbalanced", start: 0, end: 1, params: { char: "(" } },
  { text: "{p q}", code: "missingSeparator", start: 3, end: 4, params: { token: "q" } },
  { text: "p ∧", code: "missingOperand", start: 2, end: 3, params: { char: "∧" } },
  { text: "¬(p ∨ q)", code: "notCNF", start: 0, end: 1, params: { char: "¬", reason: "negation" } },
  { text: "p ∨ (q ∧ r)", code: "notCNF", start: 7, end: 8, params: { char: "∧", reason: "andInsideOr" } },
  { text: "p → q", code: "notCNF", start: 2, end: 3, params: { char: "→", reason: "implication" } },
  { text: "p <-> q", code: "notCNF", start: 2, end: 5, params: { char: "<->", reason: "equivalence" } },
  { text: LONG_TEXT, code: "tooLong", start: INPUT_LIMITS.maxChars, end: LONG_TEXT.length, params: { length: LONG_TEXT.length, max: INPUT_LIMITS.maxChars } },
  { text: MANY_CLAUSES, code: "tooManyClauses", start: undefined, end: undefined, params: { count: INPUT_LIMITS.maxClauses + 1, max: INPUT_LIMITS.maxClauses } },
  { text: MANY_VARIABLES, code: "tooManyVariables", start: undefined, end: undefined, params: { count: INPUT_LIMITS.maxVariables + 1, max: INPUT_LIMITS.maxVariables } },
];

const WARNING_EXAMPLES = [
  { text: "p1 p1 q, r", code: "duplicateLiteral", params: { index: 0, literal: "p1" } },
  { text: "-p q, r, q -p", code: "duplicateClause", params: { index: 2, clause: "q -p" } },
  { text: "p -p, q", code: "tautology", params: { index: 0, clause: "p -p" } },
  { text: SOME_VARIABLES, code: "manyVariables", params: { count: INPUT_LIMITS.manyVariables + 1, maxSteps: 5000 } },
];

test("cada código de erro tem um exemplo e cada exemplo dá o erro esperado com posição", () => {
  for (const ex of ERROR_EXAMPLES) {
    const result = parse(ex.text);
    assert.equal(result.ok, false, ex.text);
    assert.equal(result.error.code, ex.code, ex.text);
    assert.equal(result.error.start, ex.start, `start de ${ex.text}`);
    assert.equal(result.error.end, ex.end, `end de ${ex.text}`);
    if (ex.params) assert.deepEqual(result.error.params, ex.params, ex.text);
  }
  const covered = new Set(ERROR_EXAMPLES.map((ex) => ex.code));
  assert.deepEqual([...covered].sort(), [...ERROR_CODES].sort());
  const reasons = ERROR_EXAMPLES.filter((ex) => ex.code === "notCNF").map((ex) => ex.params.reason);
  assert.deepEqual(reasons.sort(), [...NOT_CNF_REASONS].sort());
});

test("o parser só usa códigos de erro listados em ERROR_CODES", () => {
  const source = readFileSync(new URL("../js/core/parser.js", import.meta.url), "utf8");
  const used = new Set([...source.matchAll(/fail\("(\w+)"/g)].map((m) => m[1]));
  used.add("notCNF"); // emitido pelo helper notCNF()
  for (const code of used) assert.ok(ERROR_CODES.includes(code), `código ${code} sem entrada em ERROR_CODES`);
});

test("cada código de aviso tem um exemplo que o produz", () => {
  for (const ex of WARNING_EXAMPLES) {
    const result = parse(ex.text);
    assert.equal(result.ok, true, ex.text);
    assert.deepEqual(result.warnings, [{ code: ex.code, params: ex.params }], ex.text);
  }
  assert.deepEqual(WARNING_EXAMPLES.map((ex) => ex.code).sort(), [...WARNING_CODES].sort());
});

// Uma mensagem está "resolvida" se não é a própria chave e não sobrou nenhum {parâmetro}.
function assertResolved(message, label) {
  assert.ok(message && !message.startsWith("parser."), `${label}: mensagem em falta (${message})`);
  assert.doesNotMatch(message, /\{\w+\}/, `${label}: parâmetro por substituir em "${message}"`);
}

test("aviso manyVariables: o nº de ramos aparece como potência com expoente em sobrescrito", () => {
  setLang("pt");
  const [warning] = parse(variables(25).join(" ")).warnings;
  const message = parserWarningMessage(warning);
  assert.match(message, /25 variáveis/);
  assert.match(message, /2²⁵ ramos/);
  assert.match(message, /5000 passos/);
});

for (const lang of ["pt", "en"]) {
  test(`mensagens de erro em ${lang}: todas existem, sem parâmetros por substituir`, () => {
    setLang(lang);
    for (const ex of ERROR_EXAMPLES) {
      const { error } = parse(ex.text);
      const message = parserErrorMessage(error);
      assertResolved(message, `${lang} ${ex.code}`);
      // A mensagem mostra o símbolo/token culpado e a posição contada a partir de 1.
      const culprit = error.params.char ?? error.params.token;
      if (culprit) assert.ok(message.includes(culprit), `${lang} ${ex.code}: falta «${culprit}» em "${message}"`);
      if (ex.start === undefined) {
        // Erros de tamanho do conjunto inteiro (tooManyClauses/tooManyVariables): sem posição.
        assert.equal(message, parserErrorMessage(error, { withPosition: false }), `${lang} ${ex.code}: não devia ter posição`);
      } else {
        assert.ok(message.includes(String(ex.start + 1)), `${lang} ${ex.code}: falta a posição em "${message}"`);
      }
      assertResolved(parserErrorMessage(error, { withPosition: false }), `${lang} ${ex.code} sem posição`);
    }
    setLang("pt");
  });

  test(`mensagens de aviso em ${lang}: mostram a cláusula em notação matemática e o nº a partir de 1`, () => {
    setLang(lang);
    for (const ex of WARNING_EXAMPLES) {
      const [warning] = parse(ex.text).warnings;
      assertResolved(parserWarningMessage(warning), `${lang} ${ex.code}`);
    }
    const [dupLiteral] = parse("q, p1 p1").warnings;
    assert.match(parserWarningMessage(dupLiteral), /p₁/);
    assert.match(parserWarningMessage(dupLiteral), /2/);
    const [tautology] = parse("p -p, q").warnings;
    assert.match(parserWarningMessage(tautology), /p ∨ ¬p/);
    setLang("pt");
  });
}

test("os locales têm mensagens para todos os códigos, motivos e notações (pt e en)", () => {
  for (const lang of ["pt", "en"]) {
    const parser = LOCALES[lang].parser;
    for (const code of ERROR_CODES.filter((c) => c !== "notCNF")) {
      assert.equal(typeof parser.errors[code], "string", `${lang}: errors.${code}`);
    }
    for (const reason of NOT_CNF_REASONS) {
      assert.equal(typeof parser.errors.notCNF[reason], "string", `${lang}: errors.notCNF.${reason}`);
    }
    for (const code of WARNING_CODES) assert.equal(typeof parser.warnings[code], "string", `${lang}: warnings.${code}`);
    for (const notation of NOTATIONS) assert.equal(typeof parser.notations[notation], "string", `${lang}: ${notation}`);
  }
});

test("mensagens em PT-PT de exemplo", () => {
  setLang("pt");
  assert.equal(
    parserErrorMessage(parse("p, q#").error),
    "O símbolo «#» não faz parte da notação. (posição 5)"
  );
  assert.equal(t("parser.notations.logic"), "Notação lógica");
});

test("detectNotation: conjuntos, lógica e compacta", () => {
  assert.equal(detectNotation("{{p, ¬q}, {q}}"), "sets");
  assert.equal(detectNotation("  {p ∨ ¬q, q}"), "sets");
  assert.equal(detectNotation("{}"), "sets");
  assert.equal(detectNotation("(p ∨ ¬q) ∧ q"), "logic");
  assert.equal(detectNotation("p | ~q & q"), "logic");
  assert.equal(detectNotation("p \\/ q /\\ r"), "logic");
  assert.equal(detectNotation("p -> q"), "logic");
  assert.equal(detectNotation("p <=> q"), "logic");
  assert.equal(detectNotation("p v q"), "logic");
  assert.equal(detectNotation("p1, -p1 -p2, p3 p2"), "compact");
  assert.equal(detectNotation("v1 vx, -v"), "compact");
  assert.equal(detectNotation("F"), "compact");
  assert.equal(detectNotation(""), "compact");
  assert.equal(detectNotation(undefined), "compact");
});

test("parse: as três notações do mesmo conjunto dão as mesmas cláusulas", () => {
  const compact = parse("p -q, q");
  const sets = parse("{{p, ¬q}, {q}}");
  const disjunctions = parse("{p ∨ ¬q, q}");
  const logic = parse("(p ∨ ¬q) ∧ q");
  assert.equal(compact.notation, "compact");
  assert.equal(sets.notation, "sets");
  assert.equal(disjunctions.notation, "sets");
  assert.equal(logic.notation, "logic");
  for (const r of [sets, disjunctions, logic]) assert.deepEqual(r.clauses, compact.clauses);
});

test("parse: a opção notation força uma notação", () => {
  const forced = parse("p v q", { notation: "compact" });
  assert.equal(forced.ok, true);
  assert.equal(forced.notation, "compact");
  assert.equal(forced.clauses[0].length, 3); // p, v, q
  assert.equal(parse("p v q").clauses[0].length, 2);
  assert.equal(parse("p", { notation: "xpto" }).notation, "compact"); // desconhecida → auto
});
