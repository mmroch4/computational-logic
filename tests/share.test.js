import { test } from "node:test";
import assert from "node:assert/strict";

import { ALGORITHMS, DEFAULT_ALGORITHM, decodeShare, encodeShare, shareFormula } from "../js/core/share.js";
import { parse } from "../js/core/parser.js";
import { clauseKey } from "../js/core/clauses.js";
import { EXAMPLES } from "../js/core/examples.js";

const S = (text) => parse(text).clauses;
const keys = (clauses) => clauses.map(clauseKey);

test("shareFormula: notação compacta; {} para o conjunto vazio; F para a cláusula vazia", () => {
  assert.equal(shareFormula(S("{p ∨ ¬q, q}")), "p -q, q");
  assert.equal(shareFormula([]), "{}");
  assert.equal(shareFormula(S("p, F")), "p, F");
});

test("encodeShare: link legível (vírgulas e +) com f e a=dll", () => {
  assert.equal(encodeShare(S("p1, -p1 -p2, p3 p2")), "f=p1,+-p1+-p2,+p3+p2&a=dll");
  assert.equal(encodeShare([]), "f=%7B%7D&a=dll");
});

test("encodeShare: parâmetros extra, ignorando null/undefined e sem sobrepor f/a", () => {
  const q = encodeShare(S("p"), { params: { step: 3, view: "tree", seed: undefined, f: "x", a: "y" } });
  assert.equal(q, "f=p&a=dll&step=3&view=tree");
});

test("decodeShare: com e sem '?', algoritmo desconhecido e parâmetros extra", () => {
  assert.deepEqual(decodeShare("?f=p1,+-p1+-p2&a=dll&step=4"), {
    formula: "p1, -p1 -p2",
    algorithm: "dll",
    params: { step: "4" },
  });
  assert.equal(decodeShare("f=p&a=zzz").algorithm, DEFAULT_ALGORITHM);
  assert.equal(decodeShare("f=p").algorithm, "dll");
  assert.deepEqual(ALGORITHMS, ["dll", "dp"]);
  assert.equal(decodeShare("f=p&a=dp").algorithm, "dp");
});

test("decodeShare: sem fórmula → null (inclui f vazio ou só espaços)", () => {
  assert.equal(decodeShare("").formula, null);
  assert.equal(decodeShare("?a=dll").formula, null);
  assert.equal(decodeShare("?f=++").formula, null);
  assert.equal(decodeShare(undefined).formula, null);
});

test("decodeShare aceita fórmulas noutras notações e com unicode codificado à mão", () => {
  const q = "f=" + encodeURIComponent("(p ∨ ¬q) ∧ q");
  assert.equal(decodeShare(q).formula, "(p ∨ ¬q) ∧ q");
  assert.deepEqual(keys(S(decodeShare(q).formula)), keys(S("p -q, q")));
});

test("ida e volta: os 14 exemplos e casos-limite dão o mesmo conjunto depois de encode → decode → parse", () => {
  const inputs = [...EXAMPLES.map((e) => e.input), "{}", "F", "p, F", "p_1 -x2y, Q"];
  for (const input of inputs) {
    const clauses = S(input);
    const { formula, algorithm } = decodeShare("?" + encodeShare(clauses));
    const back = parse(formula);
    assert.ok(back.ok, input);
    assert.deepEqual(keys(back.clauses), keys(clauses), input);
    assert.equal(algorithm, "dll");
  }
});

test("ida e volta também pela URL completa (new URL)", () => {
  const clauses = S("p1, -p1 -p2, p3 p2");
  const url = new URL("https://exemplo.pt/passo-a-passo?" + encodeShare(clauses, { params: { step: 2 } }));
  const decoded = decodeShare(url.search);
  assert.deepEqual(keys(S(decoded.formula)), keys(clauses));
  assert.equal(decoded.params.step, "2");
});
