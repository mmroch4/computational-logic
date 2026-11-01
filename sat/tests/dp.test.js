import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_MAX_CLAUSES, solveDP } from "../js/core/dp.js";
import { solveDLL } from "../js/core/dll.js";
import { formatSet, variablesOf } from "../js/core/clauses.js";
import { EXAMPLES } from "../js/core/examples.js";
import { generateFormula, mulberry32 } from "../js/core/generator.js";
import { parse } from "../js/core/parser.js";
import { bruteForceSat } from "../js/core/verify.js";
import { randomFormula } from "./helpers/random-formula.js";
import { setLang, t } from "../js/ui/i18n.js";

function set(text) {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
}

const show = (S) => formatSet(S, "compact");

/** Todas as cláusulas têm um literal verdadeiro na valoração? */
function satisfies(S, assignment) {
  return S.every((clause) => clause.some((l) => l.v in assignment && assignment[l.v] === !l.neg));
}

/** Resumo legível do trace: "unit p1", "resolve p", … */
function summary(trace) {
  return trace.map((e) => {
    if (e.type === "unit") return `unit ${show([[e.literal]])}`;
    if (e.type === "resolve") return `resolve ${e.variable}`;
    return e.type;
  });
}

test("dois ramos: elimina p por resolução, {¬q, q}, propaga ¬q e aparece F", () => {
  const { trace, result } = solveDP(set("-p -q, -p q, p -q, p q"));
  assert.deepEqual(summary(trace), ["start", "resolve p", "unit -q", "conflict", "result"]);
  const resolve = trace[1];
  assert.deepEqual(resolve.positive, [2, 3]);
  assert.deepEqual(resolve.negative, [0, 1]);
  assert.deepEqual(resolve.kept, []);
  assert.equal(resolve.pairs.length, 4);
  assert.equal(show(resolve.after), "-q, q");
  assert.equal(show(trace[2].after), "F");
  assert.equal(result.sat, false);
  assert.equal(result.assignment, null);
  assert.deepEqual(result.stats, { units: 1, eliminations: 1, resolvents: 2, tautologies: 2, steps: 2, maxSize: 4 });
});

test("cadeia de propagações: só propagação, os mesmos literais que o DLL", () => {
  const S = set(EXAMPLES[0].input);
  const { trace, result } = solveDP(S);
  const unitsOf = (events) => events.filter((e) => e.type === "unit").map((e) => [show([[e.literal]]), show(e.after)]);
  assert.deepEqual(unitsOf(trace), unitsOf(solveDLL(S).trace));
  assert.equal(trace.filter((e) => e.type === "resolve").length, 0);
  assert.equal(result.sat, false);
});

test("todos os exemplos base: resultado esperado e valoração que satisfaz S", () => {
  for (const example of EXAMPLES) {
    const S = set(example.input);
    const { result } = solveDP(S);
    assert.equal(result.sat, example.expected === "sat", example.id);
    if (result.sat) assert.ok(satisfies(S, result.assignment), `${example.id}: ${JSON.stringify(result.assignment)}`);
  }
});

test("cada eliminação tira a variável do conjunto e os resolventes tautológicos não entram", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { clauses } = generateFormula({ seed, vars: 5, clauses: 10, minSize: 2, maxSize: 3 });
    const { trace } = solveDP(clauses);
    for (const e of trace.filter((x) => x.type === "resolve")) {
      assert.ok(!variablesOf(e.after).includes(e.variable), `seed ${seed}: ${e.variable} ainda está em S`);
      assert.equal(e.variable, variablesOf(e.before)[0], "a primeira variável em ordem alfabética natural");
      assert.equal(e.before.filter((c) => c.length === 1).length, 0, "só elimina quando não há unitárias");
      for (const pair of e.pairs.filter((p) => p.tautology)) {
        assert.ok(!e.after.some((c) => show([c]) === show([pair.resolvent])), "tautologia descartada");
      }
    }
  }
});

test("200 fórmulas aleatórias: concorda com a força bruta e a valoração satisfaz S", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { clauses } = generateFormula({ seed, vars: 1 + (seed % 6), clauses: 2 + (seed % 9), minSize: 1, maxSize: 3 });
    const { result } = solveDP(clauses);
    const expected = bruteForceSat(clauses);
    assert.equal(result.sat, expected.sat, `seed ${seed}: ${show(clauses)}`);
    if (result.sat) assert.ok(satisfies(clauses, result.assignment), `seed ${seed}: ${show(clauses)}`);
  }
});

test("cláusula com x e ¬x: sai na eliminação sem deixar x no conjunto", () => {
  const S = set("p -p q, -p r, p s");
  const { trace, result } = solveDP(S);
  const resolve = trace.find((e) => e.type === "resolve");
  assert.deepEqual(resolve.dropped, [0]);
  assert.equal(show(resolve.after), "s r");
  assert.equal(result.sat, true);
  assert.ok(satisfies(S, result.assignment));
});

test("conjunto vazio é satisfazível sem passos; {F} é insatisfazível", () => {
  assert.deepEqual(summary(solveDP([]).trace), ["start", "sat", "result"]);
  assert.deepEqual(solveDP([]).result.assignment, {});
  assert.deepEqual(summary(solveDP([[]]).trace), ["start", "conflict", "result"]);
});

test("a resolução explode: evento limit com o aviso didático e sem resposta", () => {
  // Princípio dos pombos com 4 pombos e 3 ninhos: sem unitárias, a eliminação faz o conjunto crescer.
  const pigeons = [];
  for (let i = 1; i <= 4; i++) pigeons.push([1, 2, 3].map((j) => `p${i}${j}`).join(" "));
  for (let j = 1; j <= 3; j++)
    for (let a = 1; a <= 4; a++) for (let b = a + 1; b <= 4; b++) pigeons.push(`-p${a}${j} -p${b}${j}`);
  const S = set(pigeons.join(", "));
  assert.equal(solveDP(S).result.sat, false, "sem limite apertado chega à resposta");

  const { trace, result } = solveDP(S, { maxClauses: 20 });
  const limit = trace.at(-2);
  assert.equal(limit.type, "limit");
  assert.equal(limit.reason, "clauses");
  assert.ok(limit.size > 20);
  assert.equal(limit.code, "dp.limit.clauses");
  assert.equal(result.sat, null);
  assert.equal(result.limited, true);
  assert.ok(DEFAULT_MAX_CLAUSES >= 100);

  for (const lang of ["pt", "en"]) {
    setLang(lang);
    const text = t(limit.code, limit);
    assert.doesNotMatch(text, /\{\w+\}/, `${lang}: ${text}`);
    assert.match(text, /DLL/);
  }
  setLang("pt");
});

test("limite de passos", () => {
  const { trace, result } = solveDP(set(EXAMPLES[0].input), { maxSteps: 3 });
  assert.deepEqual(summary(trace), ["start", "unit p1", "unit -p2", "unit p3", "limit", "result"]);
  assert.equal(trace.at(-2).reason, "steps");
  assert.equal(result.limited, true);
});

test("M7.2: nas 500 fórmulas aleatórias do teste do DLL, DP, DLL e força bruta concordam", () => {
  const random = mulberry32(20261029); // a mesma seed de tests/verify.test.js → as mesmas 500 fórmulas
  let sat = 0;
  let unsat = 0;
  let eliminations = 0;
  for (let i = 0; i < 500; i++) {
    const text = randomFormula(random);
    const S = set(text);
    const dp = solveDP(S).result;
    const dll = solveDLL(S).result;
    const brute = bruteForceSat(S);
    assert.notEqual(dp.limited, true, `o DP não pode bater no limite: ${text}`);
    assert.equal(dp.sat, brute.sat, `DP × força bruta: ${text}`);
    assert.equal(dp.sat, dll.sat, `DP × DLL: ${text}`);
    if (dp.sat) assert.ok(satisfies(S, dp.assignment), `valoração do DP: ${text}`);
    eliminations += dp.stats.eliminations;
    if (brute.sat) sat++;
    else unsat++;
  }
  // A amostra tem de ter os dois resultados e eliminações por resolução, senão não testa o DP a sério.
  assert.ok(sat > 50 && unsat > 50, `sat=${sat} unsat=${unsat}`);
  assert.ok(eliminations > 100, `eliminações=${eliminations}`);
});

test("M7.2: nos 10 exemplos base, DP, DLL e força bruta dão a resposta esperada", () => {
  const base = EXAMPLES.filter((example) => example.source !== "extra");
  assert.equal(base.length, 10);
  for (const example of base) {
    const S = set(example.input);
    const dp = solveDP(S).result;
    const expected = example.expected === "sat";
    assert.equal(dp.sat, expected, `DP: ${example.id}`);
    assert.equal(solveDLL(S).result.sat, expected, `DLL: ${example.id}`);
    assert.equal(bruteForceSat(S).sat, expected, `força bruta: ${example.id}`);
    if (dp.sat) assert.ok(satisfies(S, dp.assignment), `${example.id}: ${JSON.stringify(dp.assignment)}`);
  }
});
