import { test } from "node:test";
import assert from "node:assert/strict";
import { format } from "../js/core/formula.js";
import { formatProof, parseProof } from "../js/core/proof-text.js";
import { RULES } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import {
  activeRules,
  checkSoundness,
  createUserRule,
  loadUserRules,
  parseUserRule,
  progressMark,
  ruleFormula,
  serializeUserRules,
  USER_RULE_ERROR_CODES,
  USER_RULE_LIMITS,
  userRulesEnabled,
} from "../js/core/user-rules.js";
import { verifyLine, verifyProof } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

const CONTRA = { name: "Contra", premises: ["¬ψ → ¬φ"], conclusion: "φ → ψ" };
const CASES = {
  name: "Casos",
  premises: [{ hypothesis: "φ", conclusion: "ψ" }, { hypothesis: "¬φ", conclusion: "ψ" }],
  conclusion: "ψ",
};
const EXCLUDED = { name: "Terceiro", premises: [], conclusion: "φ ∨ ¬φ" };

function rule(draft, existing) {
  const result = createUserRule(draft, existing);
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.rule;
}

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

function refused(draft, code) {
  const result = createUserRule(draft);
  assert.equal(result.ok, false, JSON.stringify(draft));
  assert.equal(result.error.code, code);
  return result.error;
}

const entries = (valuation) => Object.fromEntries(valuation);

// Regras sólidas

test("aceita uma regra sólida, com a forma das do catálogo", () => {
  const made = rule(CONTRA);
  assert.equal(made.id, "Contra");
  assert.equal(made.user, true);
  assert.equal(made.premises[0].kind, "formula");
  assert.equal(format(made.conclusions[0]), "φ → ψ");
  assert.ok(Object.isFrozen(made));
});

test("aceita uma regra sem premissas e aceita notação ASCII nas fórmulas", () => {
  assert.equal(rule(EXCLUDED).premises.length, 0);
  assert.equal(format(rule({ name: "Trans", premises: ["φ -> ψ", "ψ => θ"], conclusion: "φ -> θ" }).conclusions[0]), "φ → θ");
});

test("o nome perde os espaços à volta", () => {
  assert.equal(rule({ ...CONTRA, name: "  Contra " }).id, "Contra");
});

test("a fórmula da regra é a conjunção das premissas a implicar a conclusão", () => {
  assert.equal(format(ruleFormula(rule(CASES))), "(φ → ψ) ∧ (¬φ → ψ) → ψ");
  assert.equal(format(ruleFormula(rule(CONTRA))), "(¬ψ → ¬φ) → φ → ψ");
  assert.equal(format(ruleFormula(rule(EXCLUDED))), "φ ∨ ¬φ");
});

// Regras não sólidas

test("recusa uma regra não sólida e mostra o contraexemplo", () => {
  const error = refused({ name: "Reciproca", premises: ["φ → ψ", "ψ"], conclusion: "φ" }, "unsound");
  assert.deepEqual(entries(error.counterexample), { ψ: true, φ: false });
  assert.equal(format(error.formula), "(φ → ψ) ∧ ψ → φ");
});

test("recusa uma regra sem premissas que não é tautologia", () => {
  const error = refused({ name: "Tudo", premises: [], conclusion: "φ" }, "unsound");
  assert.deepEqual(entries(error.counterexample), { φ: false });
});

test("uma metavariável não se confunde com um átomo da regra", () => {
  // Com φ trocada por p, como no `ruleGoal`, esta regra pareceria sólida: p ⊢ p.
  const error = refused({ name: "Falsa", premises: ["φ"], conclusion: "p" }, "unsound");
  assert.deepEqual(entries(error.counterexample), { p: false, φ: true });
});

test("uma regra sólida com átomos literais é aceite", () => {
  assert.equal(rule({ name: "Lit", premises: ["p", "φ"], conclusion: "p ∧ φ" }).user, true);
});

test("variáveis a mais dão o erro da semântica, sem decidir a solidez", () => {
  const atoms = Array.from({ length: 13 }, (_, i) => `a${i}`).join(" ∧ ");
  const made = parseUserRule({ name: "Larga", premises: [], conclusion: atoms });
  assert.equal(checkSoundness(made.rule).ok, false);
  refused({ name: "Larga", premises: [], conclusion: atoms }, "tooManyVariables");
});

// Subdeduções

test("uma premissa subdedução fica como as do catálogo e conta como implicação na solidez", () => {
  const made = rule(CASES);
  assert.deepEqual(made.premises.map(({ kind }) => kind), ["subproof", "subproof"]);
  assert.equal(format(made.premises[1].hypothesis), "¬φ");
});

test("recusa uma regra não sólida com subdedução", () => {
  const error = refused({
    name: "Mau",
    premises: [{ hypothesis: "φ", conclusion: "ψ" }],
    conclusion: "ψ",
  }, "unsound");
  assert.deepEqual(entries(error.counterexample), { φ: false, ψ: false });
});

test("erros numa premissa subdedução dizem onde estão", () => {
  const error = refused({ name: "X", premises: ["φ", { hypothesis: "φ", conclusion: "ψ ∧" }], conclusion: "φ" }, "missingOperand");
  assert.deepEqual([error.field, error.index, error.part], ["premise", 1, "conclusion"]);
});

test("o verificador usa uma regra com subdeduções, por qualquer ordem de citação", () => {
  const cases = rule(CASES);
  const good = read(`
    1 | q         premissa
    2 |   p       hipótese
    3 |   q       R, 1
    4 |   ¬p      hipótese
    5 |   q       R, 1
    6 | q         Casos, 4–5, 2–3
  `);
  const { rules, known } = activeRules({ rules: "completo" }, [cases]);
  const result = verifyProof(good, goal("q ⊢ q"), rules, known);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.usesUserRules, true);
});

test("uma regra com subdedução dá erro se se citar uma linha no lugar dela", () => {
  const proof = read(`
    1 | q     premissa
    2 | q     Casos, 1, 1
  `);
  const result = verifyLine(proof, 2, [rule(CASES)]);
  assert.equal(result.error.code, "wrongCitationKind");
});

// Validação sintática

test("recusa rascunhos mal formados", () => {
  for (const draft of [null, 3, "regra", [], {}, { name: "X" }, { name: "X", premises: "φ", conclusion: "φ" }]) {
    refused(draft, "malformed");
  }
  refused({ name: 3, premises: [], conclusion: "φ" }, "malformed");
  refused({ name: "X", premises: [], conclusion: 3 }, "malformed");
  refused({ name: "X", premises: [null], conclusion: "φ" }, "malformed");
  refused({ name: "X", premises: [{ hypothesis: "φ" }], conclusion: "φ" }, "malformed");
  refused({ name: "X", premises: [["φ"]], conclusion: "φ" }, "malformed");
});

test("recusa nomes que o formato das provas não leria", () => {
  for (const name of ["", "duas palavras", "a,b", "a|b", "1x", "-x", "?", "x→y", "¬x"]) {
    refused({ ...CONTRA, name }, "invalidName");
  }
  refused({ ...CONTRA, name: "x".repeat(USER_RULE_LIMITS.maxName + 1) }, "nameTooLong");
});

test("recusa os nomes do catálogo, os aliases e as palavras do formato", () => {
  const names = [
    "MT", "mt", "RA", "RAA", "raa", "LEM", "HS", "DS", "TE", "SH", "SD", "DM", "R", "r", "FI", "FE",
    "premissa", "PREMISSA", "prem", "premise", "hipótese", "Hipotese", "hip", "hyp", "hypothesis", "assumption",
    "vI", "vE",
  ];
  for (const name of names) refused({ ...CONTRA, name }, "reservedName");
});

test("recusa nomes repetidos, sem olhar para a solidez", () => {
  const error = createUserRule(CONTRA, [rule(CONTRA)]).error;
  assert.equal(error.code, "duplicateName");
  assert.equal(error.field, "name");
});

test("os erros do parser dizem o campo e a posição", () => {
  const error = refused({ ...CONTRA, conclusion: "φ →" }, "missingOperand");
  assert.equal(error.field, "conclusion");
  assert.equal(error.start, 2);
  assert.equal(refused({ ...CONTRA, premises: ["φ", "(ψ"] }, "unbalanced").index, 1);
  refused({ ...CONTRA, conclusion: "" }, "emptyInput");
  refused({ ...CONTRA, conclusion: "χ" }, "unexpectedChar");
});

test("aplica os limites de premissas, tamanho e número de regras", () => {
  const { maxPremises, maxNodes, maxRules } = USER_RULE_LIMITS;
  refused({ name: "X", premises: Array(maxPremises + 1).fill("φ"), conclusion: "φ" }, "tooManyPremises");
  refused({ name: "X", premises: [], conclusion: `${"¬".repeat(maxNodes)}φ` }, "schemaTooLarge");
  const many = Array.from({ length: maxRules }, (_, i) => rule({ ...CONTRA, name: `R${i}` }));
  assert.equal(createUserRule(CONTRA, many).error.code, "tooManyRules");
});

// Integração no verificador

test("o verificador usa uma regra do utilizador e assinala a prova", () => {
  const contra = rule(CONTRA);
  const proof = read(`
    1 | ¬q → ¬p   premissa
    2 | p → q     Contra, 1
  `);
  const { rules, known } = activeRules({ rules: "completo" }, [contra]);
  const result = verifyProof(proof, goal("¬q → ¬p ⊢ p → q"), rules, known);
  assert.deepEqual(result.lineErrors, []);
  assert.ok(result.ok);
  assert.equal(result.usesUserRules, true);
  assert.equal(progressMark(result), "solvedWithUserRules");
});

test("uma regra sem premissas cita-se sem linhas", () => {
  const proof = read(`
    1 | q ∨ ¬q   Terceiro
  `);
  const { rules, known } = activeRules({ rules: "completo" }, [rule(EXCLUDED)]);
  assert.ok(verifyProof(proof, goal("⊢ q ∨ ¬q"), rules, known).ok);
});

test("a regra aplica-se como as outras: forma errada dá erro", () => {
  const proof = read(`
    1 | ¬q → ¬p   premissa
    2 | q → p     Contra, 1
  `);
  assert.equal(verifyLine(proof, 2, [rule(CONTRA)]).error.code, "formulaMismatch");
});

test("uma prova sem regras do utilizador não é assinalada, mesmo com regras definidas", () => {
  const proof = read(`
    1 | p     premissa
    2 | p     R, 1
  `);
  const { rules, known } = activeRules({ rules: "completo" }, [rule(CONTRA)]);
  const result = verifyProof(proof, goal("p ⊢ p"), rules, known);
  assert.equal(result.usesUserRules, false);
  assert.equal(progressMark(result), "solved");
});

test("uma prova que falha não conta para o progresso", () => {
  const proof = read(`
    1 | p     premissa
  `);
  assert.equal(progressMark(verifyProof(proof, goal("p ⊢ q"), RULES)), null);
});

test("a regra atravessa o formato textual, mesmo sem citações", () => {
  const proof = read(`
    1 | p ∨ ¬p   Terceiro
  `);
  assert.deepEqual(read(formatProof(proof)), proof);
  assert.equal(proof.lines[0].rule, "Terceiro");
});

// Campo userRules

test("userRules está ativo por omissão e desliga-se nos casos do SPEC", () => {
  assert.equal(userRulesEnabled({ rules: "completo" }), true);
  assert.equal(userRulesEnabled({ rules: { set: "base", plus: ["MT"] } }), true);
  assert.equal(userRulesEnabled({ rules: "base" }), false);
  assert.equal(userRulesEnabled({ rules: { set: "base" } }), false);
  assert.equal(userRulesEnabled({ rules: { set: "restrito", only: ["∧I"] } }), false);
  assert.equal(userRulesEnabled({ rules: { set: "completo", exclude: ["MT"] } }), false);
  assert.equal(userRulesEnabled({ rules: { set: "base", plus: ["SH"], exclude: ["MT"] } }), false);
  assert.equal(userRulesEnabled({ rules: "completo", userRules: false }), false);
  assert.equal(userRulesEnabled({ rules: "base", userRules: true }), false);
});

test("num exercício com userRules desligado, a regra dá ruleNotAllowed", () => {
  const proof = read(`
    1 | ¬q → ¬p   premissa
    2 | p → q     Contra, 1
  `);
  const { rules, known } = activeRules({ rules: "base" }, [rule(CONTRA)]);
  const result = verifyProof(proof, goal("¬q → ¬p ⊢ p → q"), rules, known);
  assert.equal(result.ok, false);
  assert.equal(result.lineErrors[0].code, "ruleNotAllowed");
  assert.equal(progressMark(result), null);
});

test("no modo livre, as regras do catálogo continuam disponíveis", () => {
  const { rules } = activeRules({ rules: "completo" }, [rule(CONTRA)]);
  assert.equal(rules.length, RULES.length + 1);
});

// Serialização

test("serializar e carregar repõe as regras", () => {
  const rules = [rule(CONTRA), rule(CASES), rule(EXCLUDED)];
  const data = JSON.parse(JSON.stringify(serializeUserRules(rules)));
  assert.deepEqual(data[0], { name: "Contra", premises: ["¬ψ → ¬φ"], conclusion: "φ → ψ" });
  assert.deepEqual(data[1].premises[1], { hypothesis: "¬φ", conclusion: "ψ" });
  const loaded = loadUserRules(data);
  assert.deepEqual(loaded.rejected, []);
  assert.deepEqual(loaded.rules, rules);
});

test("uma regra no limite de tamanho sobrevive a imprimir e reler", () => {
  // φ∨¬φ tem 4 nós: com as negações, fica no máximo exato. O número par mantém a tautologia.
  const negations = USER_RULE_LIMITS.maxNodes - 4;
  assert.equal(negations % 2, 0);
  const made = rule({ name: "Grande", premises: [], conclusion: `${"¬".repeat(negations)}(φ∨¬φ)` });
  const { rules, rejected } = loadUserRules(serializeUserRules([made]));
  assert.deepEqual(rejected, []);
  assert.deepEqual(rules, [made]);
});

// Link adulterado

test("um link adulterado com uma regra não sólida é recusado e a prova não passa", () => {
  const data = serializeUserRules([rule(CONTRA)]);
  data[0].conclusion = "ψ";
  data[0].premises = [];
  const { rules, rejected } = loadUserRules(data);
  assert.equal(rules.length, 0);
  assert.equal(rejected[0].name, "Contra");
  assert.equal(rejected[0].error.code, "unsound");

  const proof = read(`
    1 | q     Contra
  `);
  const active = activeRules({ rules: "completo" }, rules);
  const result = verifyProof(proof, goal("⊢ q"), active.rules, active.known);
  assert.equal(result.ok, false);
  assert.equal(result.lineErrors[0].code, "unknownRule");
});

test("campos forjados não contam: a regra é sempre reconstruída do esquema", () => {
  const forged = {
    name: "Forjada",
    premises: [],
    conclusion: "φ",
    sound: true,
    user: false,
    id: "MT",
    conclusions: ["φ ∨ ¬φ"],
    validated: true,
  };
  assert.equal(loadUserRules([forged]).rejected[0].error.code, "unsound");
  const clean = loadUserRules([{ ...CONTRA, id: "MT", user: false, proof: "x" }]).rules[0];
  assert.deepEqual(Object.keys(clean).sort(), ["conclusions", "id", "premises", "user"]);
  assert.equal(clean.id, "Contra");
  assert.equal(clean.user, true);
});

test("um link não consegue redefinir regras do catálogo", () => {
  const { rules, rejected } = loadUserRules([
    { name: "MT", premises: ["φ"], conclusion: "φ" },
    { name: "→E", premises: ["φ"], conclusion: "φ" },
  ]);
  assert.equal(rules.length, 0);
  assert.deepEqual(rejected.map(({ error }) => error.code), ["reservedName", "invalidName"]);
});

test("uma regra recusada não leva as outras atrás", () => {
  const { rules, rejected } = loadUserRules([
    CONTRA,
    { name: "Mau", premises: [], conclusion: "φ" },
    CONTRA,
    CASES,
    null,
  ]);
  assert.deepEqual(rules.map(({ id }) => id), ["Contra", "Casos"]);
  assert.deepEqual(rejected.map(({ index, error }) => [index, error.code]), [
    [1, "unsound"],
    [2, "duplicateName"],
    [4, "malformed"],
  ]);
});

test("dados que não são uma lista não rebentam", () => {
  for (const data of [null, undefined, 3, "x", {}, { length: 2 }]) {
    const { rules, rejected } = loadUserRules(data);
    assert.deepEqual(rules, []);
    assert.equal(rejected[0].error.code, "malformed");
  }
});

test("um link com regras a mais só valida até ao limite", () => {
  const { maxRules } = USER_RULE_LIMITS;
  const data = Array.from({ length: maxRules + 5 }, (_, i) => ({ ...CONTRA, name: `R${i}` }));
  const { rules, rejected } = loadUserRules(data);
  assert.equal(rules.length, maxRules);
  assert.deepEqual(rejected.map(({ error }) => error.code), ["tooManyRules"]);
});

test("um nome enorme num link não é repetido na lista de recusadas", () => {
  const { rejected } = loadUserRules([{ ...CONTRA, name: "x".repeat(100000) }]);
  assert.equal(rejected[0].error.code, "nameTooLong");
  assert.equal(rejected[0].name.length, USER_RULE_LIMITS.maxName);
});

// Locales

test("todos os códigos de erro têm mensagem nos dois idiomas", () => {
  assert.deepEqual(Object.keys(pt.userRules.errors).sort(), [...USER_RULE_ERROR_CODES].sort());
  assert.deepEqual(Object.keys(en.userRules.errors).sort(), [...USER_RULE_ERROR_CODES].sort());
  assert.ok(pt.userRules.mark);
  assert.ok(en.userRules.mark);
});
