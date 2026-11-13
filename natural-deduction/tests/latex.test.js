// A exportação para LaTeX. Sem pdflatex, a compilação salta-se e fica só a validação do texto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXAMPLE_GROUPS } from "../js/core/examples.js";
import { latexFormula, latexProof, latexText, proofToLatex } from "../js/core/latex.js";
import { parseFormula } from "../js/core/parser.js";
import { parseProof } from "../js/core/proof-text.js";
import { DERIVED_RULES, isFirstOrderRule, ruleGoal } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { LOCALES } from "../js/ui/i18n.js";
import { printSheetHtml, shareErrorHtml } from "../js/ui/proof-share.js";

const formula = (text) => parseFormula(text).formula;

const documentFor = (goal, proof, lang = "pt") => proofToLatex(goal, proof, {
  text: (key, params = {}) => LOCALES[lang].latex[key].replace("{app}", params.app),
  labels: LOCALES[lang].proofText,
  ruleLabels: LOCALES[lang].rules.labels,
  app: "Learn Natural Deduction",
});

const hasPdflatex = spawnSync("pdflatex", ["--version"]).status === 0;

const SEQUENT = parseSequent("p ∨ q, ¬q ⊢ p").sequent;
const PROOF = parseProof([
  "1 | p ∨ q     premissa",
  "2 | ¬q        premissa",
  "3 |   p       hipótese",
  "4 |   p       R, 3",
  "5 |   q       hipótese",
  "6 |   F       FI, 5, 2",
  "7 |   p       FE, 6",
  "8 | p         ∨E, 1, 3–4, 5–7",
].join("\n")).proof;

test("fórmulas: símbolos, parênteses, subscritos e nomes compridos", () => {
  assert.equal(latexFormula(formula("¬(p ∧ q) → r ∨ F")), "\\lnot (p \\land q) \\to r \\lor \\mathrm{F}");
  assert.equal(latexFormula(formula("p11 ∧ foo_bar2")), "p_{11} \\land \\mathit{foo\\_bar}_{2}");
  assert.equal(latexFormula(formula("¬¬p")), "\\lnot \\lnot p");
});

test("a prova tem as barras de escopo, os traços e as citações em intervalo", () => {
  const rows = latexProof(PROOF, { labels: LOCALES.pt.proofText }).split("\n");
  assert.equal(rows[1], "1 & \\fitchbar $p \\lor q$ & premissa \\\\");
  assert.equal(rows[2], "2 & \\fitchbar $\\underline{\\lnot q}$ & premissa \\\\");
  assert.equal(rows[3], "3 & \\fitchbar\\fitchbar $\\underline{p}$ & hipótese \\\\");
  assert.equal(rows[8], "8 & \\fitchbar $p$ & $\\lor$E, 1, 3--4, 5--7 \\\\");
});

test("as siglas seguem o idioma", () => {
  const goal = parseSequent("⊢ p ∨ ¬p").sequent;
  const { proof } = solve(goal);
  assert.match(documentFor(goal, proof, "pt"), /RA, /);
  assert.match(documentFor(goal, proof, "en"), /RAA, /);
  assert.match(documentFor(goal, proof, "en"), /\[english\]\{babel\}/);
  assert.match(documentFor(goal, proof, "pt"), /\[portuguese\]\{babel\}/);
});

test("uma linha por preencher sai com ? e sem regra", () => {
  const { proof } = parseProof("1 | ?");
  assert.equal(latexProof(proof, { labels: LOCALES.pt.proofText }).split("\n")[1], "1 & \\fitchbar $?$ &  \\\\");
});

test("o texto livre de uma regra não mexe no documento", () => {
  assert.equal(latexText("a_b%c&d#e$f{g}h~i^j\\k\"l"), "a\\_b\\%c\\&d\\#e\\$f\\{g\\}h\\textasciitilde{}i\\textasciicircum{}j\\textbackslash{}k\\textquotedbl{}l");
  assert.equal(latexText("Olá 日本"), "Olá ??");
  const { proof } = parseProof("1 | p   \\input{x}%, 1");
  assert.doesNotMatch(latexProof(proof, { labels: LOCALES.pt.proofText }), /\\input/);
});

const KNOWN_COMMANDS = ["documentclass", "usepackage", "newcommand", "fitchbar", "rule", "normalbaselineskip", "hspace",
  "renewcommand", "arraystretch", "begin", "end", "section", "bigskip", "quad", "qquad", "noindent", "vfill", "footnotesize", "lnot", "land",
  "lor", "to", "vdash", "underline", "mathrm", "mathit", "_",
  // 1.ª ordem: os exemplos do menu já têm quantificadores e caixas [v].
  "forall", "exists", "boxed"];

test("todas as chavetas fecham, e só se usam comandos conhecidos", () => {
  const known = new Set(KNOWN_COMMANDS);
  for (const { sequent } of EXAMPLE_GROUPS.flatMap(({ examples }) => examples)) {
    const goal = parseSequent(sequent).sequent;
    const { proof } = solve(goal);
    if (!proof) continue;
    const text = documentFor(goal, proof);
    let depth = 0;
    for (const char of text.replace(/\\[{}]/g, "")) {
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      assert.ok(depth >= 0, sequent);
    }
    assert.equal(depth, 0, sequent);
    for (const [, command] of text.replaceAll("\\\\\n", "\n").matchAll(/\\([A-Za-z]+|_)/g)) {
      assert.ok(known.has(command), `${sequent}: \\${command}`);
    }
    assert.doesNotMatch(text.replace(/hipótese|dedução/g, ""), /[^\x00-\x7F]/, sequent);
  }
});

test("o documento e a folha de impressão têm o sequente", () => {
  assert.match(documentFor(SEQUENT, PROOF), /\$p \\lor q,\\ \\lnot q \\vdash p\$/);
  const none = parseSequent("⊢ p → p").sequent;
  assert.match(documentFor(none, solve(none).proof), /\$\\vdash p \\to p\$/);
  const sheet = printSheetHtml(SEQUENT, PROOF);
  assert.match(sheet, /p ∨ q, ¬q ⊢ p/);
  assert.match(sheet, /class="fitch"/);
  assert.doesNotMatch(sheet, /data-state/);
});

// 1.ª ordem

const NQ_RULES = DERIVED_RULES.filter(isFirstOrderRule);

test("fórmulas de 1.ª ordem: quantificadores, termos e igualdade", () => {
  assert.equal(latexFormula(formula("∀x∃y R(x, f(y))")), "\\forall x \\exists y R(x, f(y))");
  assert.equal(latexFormula(formula("¬∀x1(P(x1) → a = b)")), "\\lnot \\forall x_{1}(P(x_{1}) \\to a = b)");
  assert.equal(latexFormula(formula("Alto(c) ∧ ¬(p ∨ q)")), "\\mathit{Alto}(c) \\land \\lnot (p \\lor q)");
});

test("as caixas [v]: a marca numa caixa antes da fórmula, e a linha de etiqueta sem número", () => {
  const proof = parseProof(NQ_RULES.find(({ id }) => id === "NQ1").proof).proof;
  const rows = latexProof(proof, { labels: LOCALES.pt.proofText, ruleLabels: LOCALES.pt.rules.labels }).split("\n");
  assert.equal(rows[3], " & \\fitchbar\\fitchbar\\fitchbar $\\boxed{v}\\ $ &  \\\\");
  assert.equal(rows[4], "3 & \\fitchbar\\fitchbar\\fitchbar\\fitchbar $\\underline{\\lnot P(v)}$ & hipótese \\\\");
  assert.equal(rows[9], "8 & \\fitchbar\\fitchbar $\\forall x P(x)$ & $\\forall$I, 3--7 \\\\");
  assert.equal(rows.length, 1 + 12 + 1);

  const exists = parseProof(NQ_RULES.find(({ id }) => id === "NQ2").proof).proof;
  const marked = latexProof(exists, { labels: LOCALES.pt.proofText }).split("\n");
  assert.equal(marked[3], "3 & \\fitchbar\\fitchbar\\fitchbar $\\boxed{v}\\ \\underline{\\lnot P(v)}$ & hipótese \\\\");
  assert.equal(marked[6], "6 & \\fitchbar\\fitchbar $\\mathrm{F}$ & $\\exists$E, 1, 3--5 \\\\");

  const step = parseProof("1 | ∀x P(x)   premissa\n2 |  [a1] P(a1)   ∀E, 1\n3 | ∀x P(x)   ∀I, 2–2").proof;
  assert.equal(latexProof(step, { labels: LOCALES.pt.proofText }).split("\n")[2], "2 & \\fitchbar\\fitchbar $\\boxed{a_{1}}\\ P(a_{1})$ & $\\forall$E, 1 \\\\");
});

test("as derivadas de 1.ª ordem saem com as siglas do idioma, e com comandos conhecidos", () => {
  for (const rule of NQ_RULES) {
    const proof = parseProof(rule.proof).proof;
    const text = documentFor(ruleGoal(rule), proof, "en");
    assert.match(text, /\\forall/);
    for (const [, command] of text.replaceAll("\\\\\n", "\n").matchAll(/\\([A-Za-z]+|_)/g)) {
      assert.ok(["forall", "exists", "boxed", ...KNOWN_COMMANDS].includes(command), `${rule.id}: \\${command}`);
    }
  }
  const proof = parseProof("1 | ¬∀x P(x)   premissa\n2 | ∃x ¬P(x)   NQ1, 1").proof;
  assert.match(documentFor(parseSequent("¬∀x P(x) ⊢ ∃x ¬P(x)").sequent, proof, "en"), /QN1, 1/);
  assert.match(documentFor(parseSequent("¬∀x P(x) ⊢ ∃x ¬P(x)").sequent, proof, "pt"), /NQ1, 1/);
});

test("com pdflatex, as provas de 1.ª ordem compilam nos dois idiomas", { skip: hasPdflatex ? false : "sem pdflatex" }, () => {
  const folder = mkdtempSync(join(tmpdir(), "nd-latex-"));
  try {
    for (const [index, rule] of NQ_RULES.entries()) {
      for (const lang of ["pt", "en"]) {
        const name = `fo${lang}${index}`;
        writeFileSync(join(folder, `${name}.tex`), documentFor(ruleGoal(rule), parseProof(rule.proof).proof, lang));
        const run = spawnSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `${name}.tex`], { cwd: folder, encoding: "utf8" });
        assert.equal(run.status, 0, run.stdout);
      }
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("o erro de um link é uma mensagem de erro com o que fazer", () => {
  assert.match(shareErrorHtml({ code: "badProof", params: {} }), /msg-error/);
});

test("com pdflatex, cada exemplo e os dois idiomas compilam", { skip: hasPdflatex ? false : "sem pdflatex" }, () => {
  const folder = mkdtempSync(join(tmpdir(), "nd-latex-"));
  try {
    const goals = EXAMPLE_GROUPS.flatMap(({ examples }) => examples).map(({ sequent }) => parseSequent(sequent).sequent);
    for (const [index, goal] of goals.entries()) {
      const { proof } = solve(goal);
      if (!proof) continue;
      for (const lang of ["pt", "en"]) {
        const name = `${lang}${index}`;
        writeFileSync(join(folder, `${name}.tex`), documentFor(goal, proof, lang));
        const run = spawnSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `${name}.tex`], { cwd: folder, encoding: "utf8" });
        assert.equal(run.status, 0, run.stdout);
        assert.ok(existsSync(join(folder, `${name}.pdf`)));
      }
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
