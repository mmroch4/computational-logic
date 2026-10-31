import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GENERATOR_LIMITS,
  generateFormula,
  maxDistinctClauses,
  mulberry32,
  normalizeSeed,
  randomSeed,
  generateWanted,
  GENERATOR_WANTS,
} from "../js/core/generator.js";
import { solveDLL } from "../js/core/dll.js";
import { clauseKey, isTautology, variablesOf } from "../js/core/clauses.js";
import { literalKey } from "../js/core/literals.js";
import { parse } from "../js/core/parser.js";
import { shareFormula } from "../js/core/share.js";

test("mulberry32: determinista, em [0, 1), seeds diferentes dão sequências diferentes", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  const seqA = Array.from({ length: 20 }, a);
  assert.deepEqual(seqA, Array.from({ length: 20 }, b));
  assert.notDeepEqual(seqA, Array.from({ length: 20 }, c));
  for (const x of seqA) assert.ok(x >= 0 && x < 1);
});

test("normalizeSeed: números, texto numérico da URL e texto qualquer (hash)", () => {
  assert.equal(normalizeSeed(42), 42);
  assert.equal(normalizeSeed(42.9), 42);
  assert.equal(normalizeSeed("42"), 42);
  assert.equal(normalizeSeed(-1), 4294967295);
  assert.equal(normalizeSeed("lógica"), normalizeSeed("lógica"));
  assert.notEqual(normalizeSeed("lógica"), normalizeSeed("logica"));
  const h = normalizeSeed("abc");
  assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32);
});

test("randomSeed: inteiro de 32 bits sem sinal", () => {
  const s = randomSeed();
  assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
});

test("maxDistinctClauses: conta cláusulas sem tautologias", () => {
  assert.equal(maxDistinctClauses(1, 1, 3), 2); // p, ¬p
  assert.equal(maxDistinctClauses(2, 1, 3), 8); // 4 unitárias + 4 de tamanho 2
  assert.equal(maxDistinctClauses(3, 1, 3), 6 + 12 + 8);
  assert.equal(maxDistinctClauses(3, 3, 3), 8);
});

test("generateFormula: a mesma seed dá o mesmo conjunto; seeds diferentes costumam dar outros", () => {
  const opts = { vars: 4, clauses: 6 };
  const a = generateFormula({ ...opts, seed: 7 });
  const b = generateFormula({ ...opts, seed: "7" });
  assert.deepEqual(a, b);
  assert.equal(a.seed, 7);
  const others = [8, 9, 10].map((seed) => shareFormula(generateFormula({ ...opts, seed }).clauses));
  assert.ok(others.some((t) => t !== shareFormula(a.clauses)));
});

test("generateFormula: respeita nº de variáveis, nº de cláusulas e tamanhos; sem tautologias nem repetidos", () => {
  const random = mulberry32(20261029);
  for (let i = 0; i < 300; i++) {
    const vars = 2 + Math.floor(random() * 7); // 2–8
    const clauses = 1 + Math.floor(random() * 20);
    const minSize = 1 + Math.floor(random() * 3);
    const maxSize = minSize + Math.floor(random() * (4 - minSize));
    const seed = Math.floor(random() * 2 ** 32);
    const { clauses: S } = generateFormula({ seed, vars, clauses, minSize, maxSize });
    const label = JSON.stringify({ seed, vars, clauses, minSize, maxSize });

    const expected = Math.min(clauses, maxDistinctClauses(vars, Math.min(minSize, vars), Math.min(maxSize, vars)));
    assert.equal(S.length, expected, label);
    assert.equal(new Set(S.map(clauseKey)).size, S.length, "cláusulas repetidas " + label);
    for (const clause of S) {
      assert.ok(clause.length >= Math.min(minSize, vars) && clause.length <= Math.min(maxSize, vars), label);
      assert.ok(!isTautology(clause), label);
      assert.equal(new Set(clause.map(literalKey)).size, clause.length, label);
    }
    for (const v of variablesOf(S)) {
      const index = Number(v.slice(1));
      assert.ok(v.startsWith("p") && index >= 1 && index <= vars, label);
    }
  }
});

test("generateFormula: pedir mais cláusulas do que existem dá todas as possíveis", () => {
  const { clauses } = generateFormula({ seed: 1, vars: 2, clauses: 50 });
  assert.equal(clauses.length, 8);
});

test("generateFormula: opções fora dos limites são ajustadas", () => {
  const big = generateFormula({ seed: 3, vars: 99, clauses: 999 });
  assert.equal(big.clauses.length, GENERATOR_LIMITS.maxClauses);
  assert.ok(variablesOf(big.clauses).length <= GENERATOR_LIMITS.maxVars);
  const tiny = generateFormula({ seed: 3, vars: 0, clauses: 0 });
  assert.equal(tiny.clauses.length, 1);
  assert.deepEqual(variablesOf(tiny.clauses), ["p1"]);
});

test("o texto compacto do conjunto gerado volta a dar o mesmo conjunto no parser, sem avisos", () => {
  for (let seed = 0; seed < 50; seed++) {
    const { clauses } = generateFormula({ seed, vars: 5, clauses: 10 });
    const parsed = parse(shareFormula(clauses));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.warnings, []);
    assert.deepEqual(parsed.clauses.map(clauseKey), clauses.map(clauseKey));
  }
});

test("generateWanted: acerta no pedido (sat/unsat/any) e a seed devolvida reproduz o conjunto", () => {
  for (const want of GENERATOR_WANTS) {
    for (let start = 0; start < 20; start++) {
      const options = { seed: start * 7919, vars: 3, clauses: 7 };
      const out = generateWanted({ ...options, want });
      assert.equal(out.found, true, `${want} seed ${start}`);
      const { result } = solveDLL(out.clauses);
      assert.equal(result.sat, out.sat);
      if (want === "sat") assert.equal(out.sat, true);
      if (want === "unsat") assert.equal(out.sat, false);
      if (want === "any") assert.equal(out.tries, 1);
      // A seed que deu o conjunto volta a dá-lo sozinha, e pedir de novo a partir dela dá o mesmo à 1.ª.
      assert.deepEqual(generateFormula({ ...options, seed: out.seed }).clauses, out.clauses);
      const again = generateWanted({ ...options, seed: out.seed, want });
      assert.deepEqual(again.clauses, out.clauses);
      assert.equal(again.tries, 1);
    }
  }
});

test("generateWanted: é determinista e desiste quando o pedido é impossível", () => {
  const a = generateWanted({ seed: 42, vars: 4, clauses: 10, want: "unsat" });
  const b = generateWanted({ seed: 42, vars: 4, clauses: 10, want: "unsat" });
  assert.deepEqual(a, b);
  // Com cláusulas de 3 literais, 1 cláusula é sempre satisfazível.
  const impossible = generateWanted({ seed: 1, vars: 8, clauses: 1, minSize: 3, want: "unsat", maxTries: 50 });
  assert.equal(impossible.found, false);
  assert.equal(impossible.tries, 50);
  assert.equal(impossible.sat, true);
  // Um pedido desconhecido vale "any".
  assert.equal(generateWanted({ seed: 5, want: "talvez" }).tries, 1);
});
