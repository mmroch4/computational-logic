import { test } from "node:test";
import assert from "node:assert/strict";
import { formatProof, parseProof } from "../js/core/proof-text.js";
import {
  BASE_RULES,
  DERIVED_RULES,
  localizeRuleParam,
  RULES,
  ruleGoal,
  ruleLabel,
  ruleSet,
} from "../js/core/rules.js";
import { checkSequent } from "../js/core/semantics.js";
import { parseSequent } from "../js/core/sequent.js";
import { verifyLine, verifyProof } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

function read(text) {
  const result = parseProof(text);
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.proof;
}

function goal(text) {
  const result = parseSequent(text);
  assert.ok(result.ok, text);
  return result.sequent;
}

const ids = (rules) => [...new Set(rules.map(({ id }) => id))];

/** Verifica a última linha da prova. */
const lastLine = (proof, rules, known) => verifyLine(proof, proof.lines.length, rules, known);

// Catálogo

test("o catálogo tem as derivadas pedidas, com 4 direções de DM e 2 formas de SD", () => {
  assert.deepEqual(ids(DERIVED_RULES), ["MT", "¬¬I", "RA", "TE", "DM", "SH", "SD"]);
  assert.equal(DERIVED_RULES.filter(({ id }) => id === "DM").length, 4);
  assert.equal(DERIVED_RULES.filter(({ id }) => id === "SD").length, 2);
  assert.ok(Object.isFrozen(DERIVED_RULES));
  assert.ok(DERIVED_RULES.every(Object.isFrozen));
});

const baseIds = new Set(ids(BASE_RULES));

for (const [index, rule] of DERIVED_RULES.entries()) {
  test(`a prova guardada de ${rule.id} (forma ${index}) demonstra a regra só com regras base`, () => {
    const proof = read(rule.proof);
    const result = verifyProof(proof, ruleGoal(rule), BASE_RULES);
    assert.deepEqual(result.lineErrors, []);
    assert.ok(result.ok, JSON.stringify(result));
    for (const line of proof.lines) {
      if (line.kind === "step") assert.ok(baseIds.has(line.rule), line.rule);
    }
  });

  test(`${rule.id} (forma ${index}) é semanticamente válida`, () => {
    const result = checkSequent(ruleGoal(rule));
    assert.ok(result.ok);
    assert.equal(result.valid, true);
  });

  test(`a prova de ${rule.id} (forma ${index}) assume exatamente as premissas da regra`, () => {
    const { premises } = ruleGoal(rule);
    const proof = read(rule.proof);
    assert.equal(proof.lines.filter(({ kind }) => kind === "premise").length, premises.length);
  });
}

test("as provas guardadas continuam certas depois de impressas em inglês", () => {
  for (const rule of DERIVED_RULES) {
    const printed = formatProof(read(rule.proof), en.proofText, en.rules.labels);
    assert.ok(verifyProof(read(printed), ruleGoal(rule), BASE_RULES).ok, rule.id);
  }
});

test("ruleGoal trata uma subdedução como implicação", () => {
  const rule = DERIVED_RULES.find(({ id }) => id === "RA");
  assert.deepEqual(ruleGoal(rule), goal("¬p → F ⊢ p"));
});

// Aplicar as derivadas

const USES = [
  ["MT", `
    1 | a → b   premissa
    2 | ¬b      premissa
    3 | ¬a      MT, 1, 2`],
  ["MT, ordem livre", `
    1 | a → b   premissa
    2 | ¬b      premissa
    3 | ¬a      MT, 2, 1`],
  ["¬¬I", `
    1 | a ∧ b      premissa
    2 | ¬¬(a ∧ b)  ¬¬I, 1`],
  ["RA", `
    1 |   ¬a   hipótese
    2 |   F    FE, 1
    3 | a      RA, 1–2`],
  ["TE, sem citações", `
    1 | (a → b) ∨ ¬(a → b)   TE`],
  ["DM ¬∧", `
    1 | ¬(a ∧ b)   premissa
    2 | ¬a ∨ ¬b    DM, 1`],
  ["DM ∨¬", `
    1 | ¬a ∨ ¬b    premissa
    2 | ¬(a ∧ b)   DM, 1`],
  ["DM ¬∨", `
    1 | ¬(a ∨ b)   premissa
    2 | ¬a ∧ ¬b    DM, 1`],
  ["DM ∧¬", `
    1 | ¬a ∧ ¬b    premissa
    2 | ¬(a ∨ b)   DM, 1`],
  ["SH", `
    1 | a → b   premissa
    2 | b → c   premissa
    3 | a → c   SH, 1, 2`],
  ["SD à esquerda", `
    1 | a ∨ b   premissa
    2 | ¬a      premissa
    3 | b       SD, 1, 2`],
  ["SD à direita", `
    1 | a ∨ b   premissa
    2 | ¬b      premissa
    3 | a       SD, 2, 1`],
];

for (const [name, text] of USES) {
  test(`aplica ${name}`, () => {
    assert.deepEqual(lastLine(read(text), RULES), { ok: true });
  });
}

const MISUSES = [
  ["MT com a negação errada", `
    1 | a → b   premissa
    2 | ¬a      premissa
    3 | ¬b      MT, 1, 2`, "ruleNotApplicable"],
  ["DM a trocar o conectivo", `
    1 | ¬(a ∧ b)   premissa
    2 | ¬a ∧ ¬b    DM, 1`, "formulaMismatch"],
  ["DM sobre outra forma", `
    1 | a ∧ b    premissa
    2 | ¬a ∨ b   DM, 1`, "ruleNotApplicable"],
  ["SD com a conclusão errada", `
    1 | a ∨ b   premissa
    2 | ¬a      premissa
    3 | a       SD, 1, 2`, "formulaMismatch"],
  ["TE com uma citação", `
    1 | a        premissa
    2 | a ∨ ¬a   TE, 1`, "extraCitation"],
  ["TE sobre fórmulas diferentes", `
    1 | a ∨ ¬b   TE`, "formulaMismatch"],
  ["RA com uma linha em vez de subdedução", `
    1 | F   premissa
    2 | a   RA, 1`, "wrongCitationKind"],
  ["RA sem negar a conclusão", `
    1 |   a    hipótese
    2 |   F    FE, 1
    3 | a      RA, 1–2`, "ruleNotApplicable"],
];

for (const [name, text, code] of MISUSES) {
  test(`recusa ${name}`, () => {
    const result = lastLine(read(text), RULES);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
  });
}

test("uma prova com derivadas é aceite por inteiro", () => {
  const proof = read(`
    1 | ¬q → ¬p   premissa
    2 |   p       hipótese
    3 |   ¬¬p     ¬¬I, 2
    4 |   ¬¬q     MT, 1, 3
    5 | p → ¬¬q   →I, 2–4`);
  assert.ok(verifyProof(proof, goal("¬q → ¬p ⊢ p → ¬¬q"), RULES).ok);
});

// Conjuntos de regras

test("base e completo", () => {
  assert.deepEqual(ids(ruleSet("base")), ids(BASE_RULES));
  assert.deepEqual(ruleSet("completo"), RULES);
});

test("base + {…} acrescenta todas as formas da regra", () => {
  const rules = ruleSet({ set: "base", plus: ["DM", "MT"] });
  assert.deepEqual(ids(rules), [...ids(BASE_RULES), "MT", "DM"]);
  assert.equal(rules.filter(({ id }) => id === "DM").length, 4);
});

test("restrito só tem as regras indicadas", () => {
  assert.deepEqual(ids(ruleSet({ set: "restrito", only: ["→E", "∧I"] })), ["∧I", "→E"]);
});

test("um exercício que pede para provar uma regra exclui-a", () => {
  const rules = ruleSet({ set: "completo", exclude: ["MT"] });
  assert.ok(!ids(rules).includes("MT"));
  assert.ok(ids(rules).includes("SH"));
  assert.ok(!ids(ruleSet({ set: "base", exclude: ["R"] })).includes("R"));
});

test("os conjuntos estão congelados", () => {
  assert.ok(Object.isFrozen(ruleSet("base")));
});

test("um conjunto mal escrito é erro do autor", () => {
  assert.throws(() => ruleSet("tudo"));
  assert.throws(() => ruleSet({ set: "constructor" }));
  assert.throws(() => ruleSet({ set: "base", plus: ["XYZ"] }));
  assert.throws(() => ruleSet({ set: "restrito", only: ["XYZ"] }));
  assert.throws(() => ruleSet({ set: "completo", exclude: ["XYZ"] }));
  assert.throws(() => ruleSet({ set: "completo", plus: ["MT"] }));
  assert.throws(() => ruleSet({ set: "base", only: ["MT"] }));
});

// Regra não permitida

const MT_PROOF = `
  1 | a → b   premissa
  2 | ¬b      premissa
  3 | ¬a      MT, 1, 2`;

test("uma regra fora do conjunto dá «regra não permitida»", () => {
  const result = lastLine(read(MT_PROOF), ruleSet("base"), RULES);
  assert.deepEqual(result, { ok: false, error: { code: "ruleNotAllowed", params: { line: 3, rule: "MT" } } });
});

test("uma regra base também pode ser proibida", () => {
  const proof = read(`
    1 | a   premissa
    2 | a   R, 1`);
  const rules = ruleSet({ set: "restrito", only: ["∧I"] });
  assert.equal(lastLine(proof, rules, RULES).error.code, "ruleNotAllowed");
});

test("uma regra que não existe continua a ser desconhecida", () => {
  const proof = read(`
    1 | a   premissa
    2 | a   Magia, 1`);
  assert.equal(lastLine(proof, ruleSet("base"), RULES).error.code, "unknownRule");
});

test("verifyProof respeita o conjunto", () => {
  const sequent = goal("a → b, ¬b ⊢ ¬a");
  const proof = read(MT_PROOF);
  assert.ok(verifyProof(proof, sequent, ruleSet({ set: "base", plus: ["MT"] }), RULES).ok);
  const refused = verifyProof(proof, sequent, ruleSet("base"), RULES);
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.lineErrors.map(({ code }) => code), ["ruleNotAllowed"]);
});

// Siglas

test("as siglas seguem o idioma", () => {
  const expected = {
    pt: ["MT", "¬¬I", "RA", "TE", "DM", "SH", "SD"],
    en: ["MT", "¬¬I", "RAA", "LEM", "DM", "HS", "DS"],
  };
  const order = ids(DERIVED_RULES);
  assert.deepEqual(order.map((id) => ruleLabel(id, pt.rules.labels)), expected.pt);
  assert.deepEqual(order.map((id) => ruleLabel(id, en.rules.labels)), expected.en);
});

test("as regras sem sigla própria e os nomes estranhos ficam como estão", () => {
  assert.equal(ruleLabel("∧I", en.rules.labels), "∧I");
  assert.equal(ruleLabel("constructor", en.rules.labels), "constructor");
  assert.equal(ruleLabel("RA"), "RA");
});

test("as provas imprimem-se com as siglas do idioma e leem-se nos dois", () => {
  const proof = read(`
    1 |   ¬a      hipótese
    2 |   F       FE, 1
    3 | a         RA, 1–2
    4 | a ∨ ¬a    TE`);
  const printed = formatProof(proof, en.proofText, en.rules.labels);
  assert.match(printed, /RAA, 1–2/);
  assert.match(printed, /LEM/);
  assert.match(formatProof(proof, pt.proofText, pt.rules.labels), /RA, 1–2/);
  assert.deepEqual(read(printed), proof);
});

test("todas as siglas EN se leem como o id da regra", () => {
  for (const id of ids(RULES)) {
    const label = ruleLabel(id, en.rules.labels);
    const proof = read(`1 | a   ${label}`);
    assert.equal(proof.lines[0].rule, id);
  }
});

test("as mensagens de erro citam a sigla do idioma", () => {
  const proof = read(`
    1 |   a    hipótese
    2 |   F    FE, 1
    3 | a      RA, 1–2`);
  const { params } = lastLine(proof, RULES).error;
  const message = (locale) => localizeRuleParam(params, locale.rules.labels);
  assert.equal(params.rule, "RA");
  assert.equal(message(en).rule, "RAA");
  assert.equal(message(pt).rule, "RA");
  assert.deepEqual(localizeRuleParam({ line: 1 }, en.rules.labels), { line: 1 });
});
