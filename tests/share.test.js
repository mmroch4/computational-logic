// O link partilhável, puro. No Chrome, de ponta a ponta: scripts/check-share.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { EXAMPLE_GROUPS } from "../js/core/examples.js";
import { createEditor, hasUnreadText, openProof, setText } from "../js/core/editor.js";
import { citeLine, citeRange, createProof } from "../js/core/proof.js";
import { parseProof } from "../js/core/proof-text.js";
import { RULES } from "../js/core/rules.js";
import { formatSequent, parseSequent } from "../js/core/sequent.js";
import { SHARE_ERROR_CODES, SHARE_LIMITS, decodeShare, encodeShare } from "../js/core/share.js";
import { solve } from "../js/core/solver.js";
import { verifyProof } from "../js/core/verify.js";
import { LOCALES } from "../js/ui/i18n.js";
import { renderExamplesPanel, renderHistoryGroup } from "../js/ui/examples-menu.js";
import { shareUrl } from "../js/ui/proof-share.js";

const goalOf = (text) => parseSequent(text).sequent;

/** As linhas sem o que não conta: a estratégia das provas geradas não faz parte da prova. */
const plain = ({ lines }) => lines.map(({ strategy, ...line }) => line);

const roundTrip = (goal, proof) => {
  const { query, complete } = encodeShare(goal, proof);
  assert.equal(complete, true);
  return decodeShare(`?${query}`);
};

const wrap = (entries) => Buffer.from(JSON.stringify(entries)).toString("base64url");
const link = (sequent, entries) => `?s=${encodeURIComponent(sequent)}&p=1.${wrap(entries)}`;

test("a prova de cada exemplo volta exatamente igual", () => {
  for (const { sequent } of EXAMPLE_GROUPS.flatMap(({ examples }) => examples)) {
    const goal = goalOf(sequent);
    const { proof } = solve(goal);
    if (!proof) continue;
    const opened = roundTrip(goal, proof);
    assert.equal(opened.status, "ok", sequent);
    assert.equal(formatSequent(opened.goal), sequent);
    assert.deepEqual(plain(opened.proof), plain(proof), sequent);
    assert.equal(verifyProof(opened.proof, opened.goal, RULES).ok, true, sequent);
  }
});

test("uma prova a meio volta igual, com linhas erradas, vazias e regras que não existem", () => {
  const goal = goalOf("a₁, b_c ⊢ a₁ ∧ b_c");
  const { proof } = parseProof([
    "1 | a₁    premissa",
    "2 | b_c   premissa",
    "3 |   ?   hipótese",
    "4 |   F   inventada, 9, 1–2",
    "5 | ?",
    "6 | c     premissas",
  ].join("\n"));
  const opened = roundTrip(goal, proof);
  assert.equal(opened.status, "ok");
  assert.deepEqual(plain(opened.proof), plain(proof));
});

test("citações por ordem escrita e repetidas não mudam", () => {
  const goal = goalOf("p ⊢ p");
  const { proof } = createProof([
    { kind: "premise", depth: 0, formula: goal.premises[0] },
    { kind: "step", depth: 0, formula: goal.conclusion, rule: "R", citations: [citeRange(1, 1), citeLine(1), citeLine(1)] },
  ]);
  assert.deepEqual(plain(roundTrip(goal, proof).proof), plain(proof));
});

test("um nome de regra que parece a palavra premissa não estraga o link", () => {
  const goal = goalOf("p ⊢ p");
  const editor = setText(setText(createEditor(goal), 2, "formula", "p"), 2, "justification", "premissa");
  const opened = roundTrip(goal, editor.proof);
  assert.equal(opened.status, "ok");
  assert.equal(opened.proof.lines[1].rule, "premissa");
});

test("uma prova em branco dá um link só com o sequente, e legível", () => {
  const goal = goalOf("p -> q, p |- q");
  const { query } = encodeShare(goal, createEditor(goal).proof);
  assert.equal(query, "s=p+-%3E+q,+p+%7C-+q");
  const opened = decodeShare(query);
  assert.equal(opened.status, "ok");
  assert.deepEqual(plain(opened.proof), plain(createEditor(goal).proof));
});

test("sem premissas e com ¬ logo a seguir a ∨, o sequente em ASCII não vira ⊢", () => {
  const goal = goalOf("⊢ p ∨ ¬p");
  assert.equal(formatSequent(decodeShare(encodeShare(goal, createEditor(goal).proof).query).goal), "⊢ p ∨ ¬p");
});

test("sem s nem p não há link; os outros parâmetros ignoram-se", () => {
  assert.deepEqual(decodeShare(""), { status: "none" });
  assert.deepEqual(decodeShare(null), { status: "none" });
  assert.deepEqual(decodeShare("?utm=1"), { status: "none" });
  assert.equal(decodeShare("?s=p|-p&utm=1").status, "ok");
});

test("cada link inválido dá o seu código e nunca rebenta", () => {
  const cases = [
    ["?p=1.e30", "missingSequent"],
    ["?s=", "badSequent"],
    ["?s=p+%26", "badSequent"],
    ["?s=p|-p&p=", "badProof"],
    ["?s=p|-p&p=1", "badProof"],
    ["?s=p|-p&p=abc.e30", "badProof"],
    ["?s=p|-p&p=1.", "badProof"],
    ["?s=p|-p&p=1.***", "badProof"],
    ["?s=p|-p&p=1.AAAA_w", "badProof"], // bytes que não são UTF-8
    [`?s=p|-p&p=1.${Buffer.from("[[0,").toString("base64url")}`, "badProof"], // cortado a meio
    [`?s=p|-p&p=1.${wrap({ lines: [] })}`, "badProof"],
    [`?s=p|-p&p=1.${wrap([])}`, "badProof"],
    ["?s=p|-p&p=2.e30", "unknownVersion"],
    [link("p ⊢ p", [[0]]), "badLine"],
    [link("p ⊢ p", ["x"]), "badLine"],
    [link("p ⊢ p", [[0, 7, ""]]), "badLine"],
    [link("p ⊢ p", [[0, "p", 3]]), "badLine"],
    [link("p ⊢ p", [[0, "p ∧", ""]]), "badLine"],
    [link("p ⊢ p", [[0, "p", "R, x"]]), "badLine"],
    [link("p ⊢ p", [[0, "p", ", 1"]]), "badLine"],
    [link("p ⊢ p", [[0, "p", "R", "a"]]), "badLine"],
    [link("p ⊢ p", [[-1, "p", "R"]]), "badLine"],
    [link("p ⊢ p", [[1.5, "p", "R"]]), "badLine"],
    [link("p ⊢ p", [["0", "p", "R"]]), "badLine"],
    [link("p ⊢ p", [[5, "p", "R"]]), "badLine"], // salta níveis
    [link("p ⊢ p", [[0, "q"]]), "badLine"], // hipótese fora de subdedução
    [`?s=p|-p&p=1.${"a".repeat(SHARE_LIMITS.maxLength)}`, "tooLong"],
  ];
  for (const [search, code] of cases) {
    const opened = decodeShare(search);
    assert.equal(opened.status, "invalid", search);
    assert.equal(opened.error.code, code, search);
  }
});

test("a linha com erro é contada na prova, depois das premissas", () => {
  assert.deepEqual(decodeShare(link("p, q ⊢ p", [[0, "p", "R, 1"], [0, "p ∧", ""]])).error, { code: "badLine", params: { line: 4 } });
});

test("um erro depois do sequente devolve-o, para ficar no campo", () => {
  assert.equal(decodeShare("?s=p|-q&p=1.***").sequent, "p|-q");
  assert.equal(decodeShare("?s=p+%26").sequent, "p &");
  assert.equal(decodeShare("?p=1.e30").sequent, null);
});

test("um link não consegue acrescentar premissas: as linhas não têm essa forma", () => {
  const opened = decodeShare(link("p ⊢ q", [[0, "q", "R, 1"]]));
  assert.equal(opened.proof.lines.filter(({ kind }) => kind === "premise").length, 1);
  assert.equal(verifyProof(opened.proof, opened.goal, RULES).ok, false);
});

test("o nome de regra de um link é lido como no campo, e uma prova adulterada não passa no verificador", () => {
  const opened = decodeShare(link("p → q, p ⊢ q", [[0, "q", "->E, 1, 2"]]));
  assert.equal(opened.proof.lines[2].rule, "→E");
  assert.equal(verifyProof(opened.proof, opened.goal, RULES).ok, true);
  const forged = decodeShare(link("p → q ⊢ q", [[0, "q", "→E, 1, 1"]]));
  assert.equal(forged.status, "ok");
  assert.equal(verifyProof(forged.proof, forged.goal, RULES).ok, false);
});

test("uma prova que não cabe fica fora do link, e diz-se", () => {
  const goal = goalOf("p ⊢ p");
  const repeated = Array.from({ length: 800 }, () => ({ kind: "step", depth: 0, formula: goal.conclusion, rule: "R", citations: [citeLine(1)] }));
  const { proof } = createProof([{ kind: "premise", depth: 0, formula: goal.premises[0] }, ...repeated]);
  const { query, complete } = encodeShare(goal, proof);
  assert.equal(complete, false);
  assert.equal(decodeShare(query).status, "ok");
  assert.equal(decodeShare(query).proof.lines.length, 2);

  const huge = goalOf(`${Array.from({ length: 1500 }, (_, index) => `(a${index} ∧ b${index})`).join(", ")} ⊢ p`);
  assert.deepEqual(encodeShare(huge, createEditor(huge).proof), { query: "", complete: false });
});

test("a prova aberta de um link fica no editor com o texto certo e sem nada para desfazer", () => {
  const goal = goalOf("p ∧ q ⊢ q");
  const { proof } = parseProof("1 | p ∧ q   premissa\n2 | q       ∧E, 1");
  const editor = openProof(goal, proof, LOCALES.en.rules.labels);
  assert.equal(editor.proof, proof);
  assert.equal(editor.past.length, 0);
  assert.equal(editor.drafts[1].justification, "∧E, 1");
  assert.equal(editor.cursor.line, 2);
});

test("hasUnreadText vê o texto que a prova não guardou", () => {
  const editor = createEditor(goalOf("p ⊢ p"));
  assert.equal(hasUnreadText(editor), false);
  assert.equal(hasUnreadText(setText(editor, 2, "formula", "p ∧")), true);
  assert.equal(hasUnreadText(setText(editor, 2, "justification", "R, x")), true);
});

test("o link absoluto junta só a origem e o caminho", () => {
  const where = { origin: "https://exemplo.pt", pathname: "/provar", search: "?velho=1", hash: "#x" };
  assert.equal(shareUrl("s=p", where), "https://exemplo.pt/provar?s=p");
  assert.equal(shareUrl("", where), "https://exemplo.pt/provar");
});

test("o histórico aparece no menu, escapado, e sem grupo quando está vazio", () => {
  assert.equal(renderHistoryGroup([]), "");
  const html = renderExamplesPanel([{ sequent: 'a"<b ⊢ c', savedAt: 1 }]);
  assert.match(html, /data-sequent="a&quot;&lt;b ⊢ c"/);
  assert.match(html, /data-clear-history/);
  assert.doesNotMatch(renderExamplesPanel(), /data-sequent|data-clear-history/);
});

test("cada código de erro tem frase em PT e EN, e o aviso do link também", () => {
  for (const { share } of [LOCALES.pt, LOCALES.en]) {
    for (const code of SHARE_ERROR_CODES) assert.equal(typeof share.errors[code], "string", code);
    assert.equal(typeof share.errors.heading, "string");
  }
});

test("no Chrome, o link repõe a prova e um link inválido dá erro", { skip: !existsSync("/usr/bin/google-chrome") }, () => {
  const run = spawnSync("node", ["scripts/check-share.mjs"], { encoding: "utf8", timeout: 120000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
