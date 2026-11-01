// O formulário das regras do utilizador, a sua loja, o painel e a viagem no link.
// No Chrome, de ponta a ponta: scripts/check-rules.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { format } from "../js/core/formula.js";
import { createProof } from "../js/core/proof.js";
import { checkForm, emptyForm, formToDraft, formulaPremise, subproofPremise } from "../js/core/rule-form.js";
import { parseSequent } from "../js/core/sequent.js";
import { SHARE_LIMITS, decodeShare, encodeShare } from "../js/core/share.js";
import { parseProof } from "../js/core/proof-text.js";
import { hint } from "../js/core/hints.js";
import { solve } from "../js/core/solver.js";
import {
  USER_RULE_LIMITS, activeRules, combineUserRules, createUserRule, loadUserRules, mergeUserRules, rulesUsedBy,
} from "../js/core/user-rules.js";
import { verifyProof } from "../js/core/verify.js";
import { LOCALES } from "../js/ui/i18n.js";
import { linkRulesHtml } from "../js/ui/proof-share.js";
import { statusHtml } from "../js/ui/proof-editor.js";
import { createStorage } from "../js/ui/storage.js";
import {
  SCHEMA_KEYS, errorFieldId, premiseRowHtml, resultHtml, ruleErrorText, ruleListHtml, ruleSchemeHtml,
} from "../js/ui/user-rules-panel.js";
import { createUserRuleStore } from "../js/ui/user-rules-store.js";

const form = (name, premises, conclusion) => ({
  name,
  conclusion,
  premises: premises.map((item) => (
    typeof item === "string"
      ? { ...formulaPremise(), text: item }
      : { ...subproofPremise(), ...item }
  )),
});

const rule = (name, premises, conclusion) => {
  const created = createUserRule({ name, premises, conclusion });
  assert.equal(created.ok, true);
  return created.rule;
};

const SWAP = rule("Troca", ["φ ∧ ψ"], "ψ ∧ φ");
const goalOf = (text) => parseSequent(text).sequent;

const memoryBackend = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
};

test("o formulário passa por todos os estados, à medida que se escreve", () => {
  assert.equal(checkForm(emptyForm()).status, "empty");
  assert.equal(checkForm(form("X", [], "")).status, "incomplete");
  assert.equal(checkForm(form("", ["φ ∧ ψ"], "φ")).status, "unnamed");
  assert.equal(checkForm(form("Fica", ["φ ∧ ψ"], "φ")).status, "ready");
});

test("a solidez vê-se antes de haver nome, e a pré-visualização também", () => {
  const check = checkForm(form("", ["φ ∨ ψ"], "φ"));
  assert.equal(check.status, "unsound");
  assert.equal(format(check.formula), "φ ∨ ψ → φ");
  assert.deepEqual(new Map(check.valuation).get("φ"), false);
  assert.ok(check.rule);
});

test("um erro numa premissa aponta para a linha do formulário, mesmo com linhas em branco antes", () => {
  const check = checkForm(form("X", ["", "φ ∧"], "φ"));
  assert.equal(check.status, "invalid");
  assert.equal(check.error.index, 1);
  assert.equal(errorFieldId(check.error, form("X", ["", "φ ∧"], "φ")), "rule-premise-1");
});

test("o erro numa subdedução aponta para a parte certa", () => {
  const written = form("X", [{ hypothesis: "φ", conclusion: "ψ ∧" }], "φ");
  const check = checkForm(written);
  assert.equal(errorFieldId(check.error, written), "rule-premise-0-conclusion");
});

test("nome reservado ou repetido não fica pronto", () => {
  assert.equal(checkForm(form("MT", ["φ"], "φ")).error.code, "reservedName");
  assert.equal(checkForm(form("Troca", ["φ"], "φ"), [SWAP]).error.code, "duplicateName");
  assert.equal(errorFieldId(checkForm(form("MT", ["φ"], "φ")).error, emptyForm()), "rule-name");
});

test("as premissas em branco não contam no rascunho", () => {
  const written = form("  X ", ["", { hypothesis: "", conclusion: " " }, "φ"], "φ");
  assert.deepEqual(formToDraft(written), { name: "X", premises: ["φ"], conclusion: "φ" });
});

test("uma regra guardada pelo formulário é a mesma que a do link", () => {
  const { rule: fromForm } = checkForm(form("Troca", ["φ ∧ ψ"], "ψ ∧ φ"));
  assert.equal(fromForm.user, true);
  const proof = parseProof("1 | p ∧ q   premissa\n2 | q ∧ p   Troca, 1").proof;
  assert.equal(verifyProof(proof, goalOf("p ∧ q ⊢ q ∧ p"), ...Object.values(activeRules({ rules: "completo" }, [fromForm]))).ok, true);
});

test("rulesUsedBy dá só as regras citadas", () => {
  const other = rule("Outra", ["φ"], "φ ∨ φ");
  const proof = parseProof("1 | p ∧ q   premissa\n2 | q ∧ p   Troca, 1").proof;
  assert.deepEqual(rulesUsedBy(proof, [other, SWAP]).map(({ id }) => id), ["Troca"]);
});

test("a regra citada viaja no link e só essa, e a prova volta a verificar-se", () => {
  const other = rule("Outra", ["φ"], "φ ∨ φ");
  const goal = goalOf("p ∧ q ⊢ q ∧ p");
  const proof = parseProof("1 | p ∧ q   premissa\n2 | q ∧ p   Troca, 1").proof;
  const { query, complete } = encodeShare(goal, proof, [other, SWAP]);
  assert.equal(complete, true);
  const opened = decodeShare(`?${query}`);
  assert.equal(opened.status, "ok");
  assert.deepEqual(opened.userRules.rules.map(({ id }) => id), ["Troca"]);
  assert.deepEqual(opened.userRules.rejected, []);
  const { rules, known } = activeRules({ rules: "completo" }, opened.userRules.rules);
  const result = verifyProof(opened.proof, opened.goal, rules, known);
  assert.equal(result.ok, true);
  assert.equal(result.usesUserRules, true);
});

test("sem regras citadas, o link não leva `r`", () => {
  const goal = goalOf("p ⊢ p");
  const proof = parseProof("1 | p   premissa\n2 | p   R, 1").proof;
  assert.doesNotMatch(encodeShare(goal, proof, [SWAP]).query, /r=/);
});

const encoded = (data) => Buffer.from(JSON.stringify(data)).toString("base64url");
const withRules = (rules, entries = [[0, "q", "Falsa, 1"]], sequent = "p|-q") => (
  `?s=${encodeURIComponent(sequent)}&p=1.${encoded(entries)}&r=1.${encoded(rules)}`
);

test("uma regra não sólida num link é recusada, e a prova que a cita não vale", () => {
  const opened = decodeShare(withRules([{ name: "Falsa", premises: ["φ"], conclusion: "ψ" }]));
  assert.equal(opened.status, "ok");
  assert.deepEqual(opened.userRules.rules, []);
  assert.equal(opened.userRules.rejected[0].error.code, "unsound");
  const { rules, known } = activeRules({ rules: "completo" }, opened.userRules.rules);
  assert.equal(verifyProof(opened.proof, opened.goal, rules, known).ok, false);
});

test("um link não pode redefinir uma regra do catálogo nem mentir com `sound`", () => {
  const opened = decodeShare(withRules([
    { name: "MT", premises: ["φ"], conclusion: "ψ", sound: true },
    { name: "Falsa", premises: ["φ"], conclusion: "ψ", sound: true, user: true },
  ]));
  assert.deepEqual(opened.userRules.rejected.map(({ error }) => error.code), ["reservedName", "unsound"]);
});

test("dados das regras estragados ou de outra versão recusam o link", () => {
  assert.equal(decodeShare("?s=p|-p&r=1.@@@").error.code, "badRules");
  assert.equal(decodeShare("?s=p|-p&r=1.e30").error.code, "badRules");
  assert.equal(decodeShare("?s=p|-p&r=abc").error.code, "badRules");
  assert.equal(decodeShare("?s=p|-p&r=9.W10").error.code, "unknownVersion");
  assert.equal(decodeShare("?s=p|-p&r=1.e30").sequent, "p|-p");
});

test("o limite do link conta com as regras", () => {
  const goal = goalOf("p ∧ q ⊢ q ∧ p");
  const proof = parseProof("1 | p ∧ q   premissa\n2 | q ∧ p   Troca, 1").proof;
  const line = { kind: "step", depth: 0, formula: proof.lines[1].formula, rule: "Troca", citations: proof.lines[1].citations };
  const heavy = rule("Troca", Array(6).fill(`${"¬".repeat(40)}φ ∧ ${"¬".repeat(40)}ψ`), "φ ∨ ¬φ");
  // A prova mais longa que cabe sem a regra deixa de caber com ela: fica só o sequente.
  let size = 1;
  while (encodeShare(goal, createProof([proof.lines[0], ...Array(size + 1).fill(line)]).proof).complete) size += 1;
  const long = createProof([proof.lines[0], ...Array(size).fill(line)]).proof;
  assert.equal(encodeShare(goal, long).complete, true);
  const { query, complete } = encodeShare(goal, long, [heavy]);
  assert.equal(complete, false);
  assert.ok(query.length <= SHARE_LIMITS.maxLength);
  assert.doesNotMatch(query, /&p=|&r=/);
});

test("a solução e as dicas respeitam as regras próprias, que passam pelo Worker", () => {
  const { rules, known } = activeRules({ rules: "completo" }, [SWAP]);
  const copy = structuredClone({ rules, known });
  const goal = goalOf("p ∧ q ⊢ q ∧ p");
  const proof = parseProof("1 | p ∧ q   premissa\n2 | ?").proof;
  assert.ok(["step", "fixLine"].includes(hint(proof, goal, copy).status));
  assert.equal(solve(goal, { rules: copy.rules }).provable, true);
});

test("o pior link de regras custa pouco: 30 regras tautológicas com 12 variáveis", () => {
  const atoms = Array.from({ length: 12 }, (_, index) => `a${index}`);
  const drafts = Array.from({ length: USER_RULE_LIMITS.maxRules }, (_, index) => ({
    name: `R${index}`,
    premises: [],
    conclusion: `${atoms.join(" ∧ ")} → ${atoms.join(" ∨ ")}`,
  }));
  const start = performance.now();
  const { rules } = loadUserRules(drafts);
  const elapsed = performance.now() - start;
  assert.equal(rules.length, USER_RULE_LIMITS.maxRules);
  assert.ok(elapsed < 2000, `${elapsed} ms`);
});

test("juntar regras de um link: novas guardam-se, iguais não contam, diferentes só nesta sessão", () => {
  const other = rule("Outra", ["φ"], "φ ∨ φ");
  const twin = rule("Troca", ["φ ∧ ψ"], "ψ ∧ φ");
  assert.deepEqual(mergeUserRules([SWAP], [twin]).added, []);
  assert.deepEqual(mergeUserRules([SWAP], [twin]).replaced, []);

  const added = mergeUserRules([SWAP], [other]);
  assert.deepEqual(added.added, ["Outra"]);
  assert.deepEqual(added.saved.map(({ id }) => id), ["Troca", "Outra"]);

  const rival = rule("Troca", ["φ"], "φ ∨ ψ");
  const merged = mergeUserRules([SWAP], [rival]);
  assert.deepEqual(merged.replaced, ["Troca"]);
  assert.deepEqual(merged.saved, [SWAP]);
  assert.deepEqual(combineUserRules(merged.saved, merged.session), [rival]);
});

test("com a lista cheia, a regra do link vale na sessão sem tirar lugar às guardadas", () => {
  const full = Array.from({ length: USER_RULE_LIMITS.maxRules }, (_, index) => rule(`R${index}`, ["φ"], "φ"));
  const merged = mergeUserRules(full, [SWAP]);
  assert.equal(merged.saved.length, USER_RULE_LIMITS.maxRules);
  assert.deepEqual(merged.session, [SWAP]);
  assert.ok(combineUserRules(merged.saved, merged.session).includes(SWAP));
});

test("a loja guarda, apaga e volta a validar ao carregar", () => {
  const backing = createStorage(memoryBackend());
  const store = createUserRuleStore(backing);
  let changes = 0;
  store.subscribe(() => { changes += 1; });
  store.add(SWAP);
  assert.deepEqual(backing.getUserRules(), [{ name: "Troca", premises: ["φ ∧ ψ"], conclusion: "ψ ∧ φ" }]);
  assert.deepEqual(createUserRuleStore(backing).list().map(({ id }) => id), ["Troca"]);
  store.remove("Troca");
  assert.deepEqual(backing.getUserRules(), []);
  assert.equal(changes, 2);
});

test("a loja ignora o que está guardado e já não é válido, e avisa", () => {
  const backing = createStorage(memoryBackend());
  backing.setUserRules([{ name: "Falsa", premises: [], conclusion: "φ" }, { name: "Boa", premises: ["φ"], conclusion: "φ" }]);
  const store = createUserRuleStore(backing);
  assert.deepEqual(store.list().map(({ id }) => id), ["Boa"]);
  assert.equal(store.rejected[0].name, "Falsa");
});

test("uma regra do link em conflito não muda o que está guardado", () => {
  const backing = createStorage(memoryBackend());
  const store = createUserRuleStore(backing);
  store.add(SWAP);
  const rival = rule("Troca", ["φ"], "φ ∨ ψ");
  assert.deepEqual(store.applyLink([rival]), { added: [], replaced: ["Troca"] });
  assert.equal(store.isSessionOnly("Troca"), true);
  assert.deepEqual(store.list(), [rival]);
  assert.equal(backing.getUserRules()[0].conclusion, "ψ ∧ φ");
});

test("sem nada de novo no link, a loja não avisa nem escreve", () => {
  const store = createUserRuleStore(createStorage(memoryBackend()));
  let changes = 0;
  store.subscribe(() => { changes += 1; });
  assert.deepEqual(store.applyLink([]), { added: [], replaced: [] });
  assert.equal(changes, 0);
});

test("uma regra aparece com as premissas, o traço, a conclusão e o nome, sem HTML cru", () => {
  const contra = rule("Contra", [{ hypothesis: "φ", conclusion: "ψ" }, "¬ψ"], "¬φ");
  const html = ruleSchemeHtml(contra, "<b>");
  assert.match(html, /\[φ\] … ψ/);
  assert.match(html, /rule-scheme__bar/);
  assert.match(html, /&lt;b&gt;/);
  assert.doesNotMatch(html, /<b>/);
});

test("a lista diz quando está vazia e marca as regras só desta sessão", () => {
  assert.match(ruleListHtml([]), /rules-panel__empty/);
  const html = ruleListHtml([SWAP], () => true);
  assert.match(html, /data-delete-rule="Troca"/);
  assert.match(html, /rules-panel__tag/);
  assert.doesNotMatch(ruleListHtml([SWAP]), /rules-panel__tag/);
});

test("o resultado mostra o contraexemplo, ou a frase certa de cada caso", () => {
  const html = resultHtml(checkForm(form("X", ["φ ∨ ψ"], "φ")));
  assert.match(html, /msg-error/);
  assert.match(html, /assist__valuation/);
  assert.match(html, /φ = F/);
  assert.match(resultHtml(checkForm(form("X", ["φ"], "φ"))), /msg-ok/);
  assert.equal(resultHtml({ status: "empty" }), "");
});

test("os erros vêm de três sítios e todos têm frase", () => {
  for (const check of [form("X", ["φ ∧"], "φ"), form("MT", [], "φ → φ")].map((written) => checkForm(written))) {
    assert.doesNotMatch(ruleErrorText(check.error), /\.errors\./);
  }
  assert.doesNotMatch(ruleErrorText({ code: "tooManyVariables", params: { count: 13, max: 12 } }), /\.errors\./);
});

test("as linhas do formulário guardam o texto escapado", () => {
  assert.match(premiseRowHtml({ kind: "formula", text: '"><b' }, 0), /value="&quot;&gt;&lt;b"/);
  assert.match(premiseRowHtml(subproofPremise(), 2), /id="rule-premise-2-hypothesis"/);
});

test("cada tecla do esquema tem nome nos dois idiomas, e as frases dos avisos existem", () => {
  for (const { rulesPanel, share } of [LOCALES.pt, LOCALES.en]) {
    for (const { name } of SCHEMA_KEYS) assert.equal(typeof rulesPanel.keys[name], "string", name);
    for (const key of ["rulesAdded", "rulesReplaced", "rulesRejected"]) assert.equal(typeof share[key], "string", key);
  }
  assert.deepEqual(Object.keys(LOCALES.pt.rulesPanel), Object.keys(LOCALES.en.rulesPanel));
});

test("o aviso do link junta o que aconteceu às regras, sem HTML cru", () => {
  assert.equal(linkRulesHtml({ added: [], replaced: [], rejected: [] }), "");
  const html = linkRulesHtml({ added: ["A"], replaced: ["B"], rejected: [{ name: "<i>" }, { name: null }] });
  assert.match(html, /msg-info/);
  assert.match(html, /msg-warn/);
  assert.doesNotMatch(html, /<i>/);
});

test("uma prova completa com regras próprias é assinalada", () => {
  const status = { complete: true, usesUserRules: true, conclusion: null };
  assert.match(statusHtml(status, null), /<b>/);
  assert.doesNotMatch(statusHtml({ ...status, usesUserRules: false }, null), /<b>/);
});

test("no Chrome, criar, usar, partilhar e reabrir uma regra funciona", { skip: !existsSync("/usr/bin/google-chrome") }, () => {
  const run = spawnSync("node", ["scripts/check-rules.mjs"], { encoding: "utf8", timeout: 180000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
