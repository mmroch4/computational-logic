// A estrutura da lição: secções, índice e componentes. No Chrome, com toques: scripts/check-learn.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  LESSON_CHECKS, LESSON_COUNTERS, LESSON_DERIVED, LESSON_LABS, LESSON_MISTAKES, LESSON_PROOFS, LESSON_RULES, LESSON_SECTIONS,
  LESSON_WALKTHROUGHS, firstRevealed, lessonCounter, lessonDerivedForms, lessonLab, lessonMistake, lessonProof, mistakeFindings,
  revealMarks, ruleSchemaLines, verifyLessonProof,
} from "../js/core/lesson.js";
import { createEditor, editorStatus } from "../js/core/editor.js";
import { applyOutcome, focusObjective, guidedLines, guidedRules, toggleSelection } from "../js/core/guided.js";
import { solve } from "../js/core/solver.js";
import { equals, format } from "../js/core/formula.js";
import { parseFormula } from "../js/core/parser.js";
import { accessibleFrom } from "../js/core/proof.js";
import { formatProof, parseProof } from "../js/core/proof-text.js";
import { BASE_RULES, DERIVED_RULES, RULES, ruleGoal, ruleSet } from "../js/core/rules.js";
import { checkSequent } from "../js/core/semantics.js";
import { formatSequent, parseSequent } from "../js/core/sequent.js";
import { verifyProof } from "../js/core/verify.js";
import { LOCALES, setLang } from "../js/ui/i18n.js";
import { lessonCheckFeedbackHtml, lessonCheckHtml } from "../js/ui/lesson-check.js";
import { lessonLabHtml } from "../js/ui/lesson-lab.js";
import { editableLineHtml } from "../js/ui/proof-editor.js";
import { lessonFigureHtml } from "../js/ui/lesson-figure.js";
import { lessonProofHtml } from "../js/ui/lesson-proof.js";
import { lessonCounterHtml, lessonDerivedHtml, lessonMistakeHtml, lessonRuleHtml } from "../js/ui/lesson-rule.js";
import { activeSectionIndex, readingProgress, renderLessonToc } from "../js/ui/lesson-toc.js";
import { COURSE_SEQUENTS } from "./fixtures/course-sequents.js";
import { LAB_GUIDED } from "./fixtures/lab-guided.js";
import { fingerprint } from "./helpers/fingerprint.js";

const page = readFileSync(new URL("../aprender.html", import.meta.url), "utf8");
const english = readFileSync(new URL("../en/learn.html", import.meta.url), "utf8");
const SECTIONS = LESSON_SECTIONS.map(({ id, key }, index) => ({ id, number: String(index + 1), title: LOCALES.pt.learn.sections[key] }));

test("a lição tem as 9 secções, por ordem, com âncora e título", () => {
  assert.equal(LESSON_SECTIONS.length, 9);
  const ids = [...page.matchAll(/<section class="lesson-section" id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, LESSON_SECTIONS.map(({ id }) => id));
  for (const { id, key } of LESSON_SECTIONS) {
    assert.ok(page.includes(`aria-labelledby="${id}-title"`), id);
    assert.ok(page.includes(`data-i18n="learn.sections.${key}"`), key);
    for (const locale of Object.values(LOCALES)) assert.equal(typeof locale.learn.sections[key], "string", key);
  }
});

test("a página EN mantém as âncoras e traz os títulos em inglês", () => {
  for (const { id, key } of LESSON_SECTIONS) {
    assert.ok(english.includes(`id="${id}"`), id);
    assert.ok(english.includes(LOCALES.en.learn.sections[key]), key);
  }
});

test("a página da lição já não tem o estado vazio e tem onde pôr o índice", () => {
  assert.doesNotMatch(page, /empty-state/);
  assert.match(page, /<nav class="lesson-toc" id="lesson-toc"/);
  assert.equal(LOCALES.pt.learn.empty, undefined);
  assert.equal(LOCALES.en.learn.empty, undefined);
});

test("todas as provas da lição passam pelo verificador", () => {
  for (const id of Object.keys(LESSON_PROOFS)) assert.equal(verifyLessonProof(id).ok, true, id);
});

test("nenhuma prova da lição coincide com os materiais da cadeira", () => {
  const course = new Map(COURSE_SEQUENTS.map((text) => [fingerprint(text), text]));
  for (const [id, { sequent }] of Object.entries(LESSON_PROOFS)) {
    assert.equal(course.get(fingerprint(sequent)), undefined, id);
  }
});

test("cada figura e cada pergunta do HTML existem, com o texto nos dois idiomas", () => {
  const used = (attribute) => [...page.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map((match) => match[1]);
  for (const id of used("data-lesson-proof")) {
    assert.ok(LESSON_PROOFS[id], id);
    for (const locale of Object.values(LOCALES)) assert.ok(locale.learn.figures[id], id);
  }
  for (const id of used("data-lesson-check")) assert.ok(LESSON_CHECKS[id], id);
  assert.ok(used("data-lesson-proof").length > 0);
  assert.ok(used("data-lesson-check").length > 0);
});

test("cada pergunta tem a resposta entre as opções e uma explicação por opção", () => {
  for (const [id, { options, answer }] of Object.entries(LESSON_CHECKS)) {
    assert.ok(options.includes(answer), id);
    for (const locale of Object.values(LOCALES)) {
      assert.ok(locale.learn.checks[id].question, id);
      for (const option of options) {
        assert.ok(locale.learn.checks[id].options[option], `${id}.${option}`);
        assert.ok(locale.learn.checks[id].why[option], `${id}.${option}`);
      }
    }
  }
});

test("a resposta da primeira pergunta é a regra da linha que ela refere", () => {
  const line = lessonProof("firstProof").proof.lines[3];
  assert.equal(line.rule, LOCALES.pt.learn.checks.firstRule.options[LESSON_CHECKS.firstRule.answer]);
});

test("as secções 2 a 6 apresentam todas as regras base, cada uma uma vez e pela ordem da lição", () => {
  const used = [...page.matchAll(/data-lesson-rule="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(used, Object.keys(LESSON_RULES));
  assert.deepEqual(used.map((id) => LESSON_RULES[id].rule), ["∧I", "∧E", "→E", "→I", "R", "∨I", "∨E", "FI", "¬I", "¬E", "FE"]);
  assert.deepEqual(used.map((id) => LESSON_RULES[id].rule).sort(), BASE_RULES.map((rule) => rule.id).sort());
  const sections = page.split('<section class="lesson-section"');
  assert.match(sections[2], /data-lesson-rule="andElim"/);
  assert.match(sections[3], /data-lesson-rule="implElim"/);
  assert.match(sections[4], /data-lesson-rule="repeat"/);
  assert.match(sections[5], /data-lesson-rule="orElim"/);
  assert.match(sections[6], /data-lesson-rule="falseElim"/);
});

test("a secção 7 mostra todas as derivadas, cada uma uma vez e pela ordem do catálogo", () => {
  const used = [...page.matchAll(/data-lesson-derived="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(used, Object.keys(LESSON_DERIVED));
  assert.deepEqual(used.map((id) => LESSON_DERIVED[id].rule), [...new Set(DERIVED_RULES.map(({ id }) => id))]);
  const sections = page.split('<section class="lesson-section"');
  assert.equal(sections[7].match(/data-lesson-derived=/g).length, used.length);
  for (const id of used) for (const locale of Object.values(LOCALES)) {
    assert.ok(locale.learn.derivedRules[id].name, id);
    assert.ok(locale.learn.derivedRules[id].when, id);
  }
});

test("as provas das derivadas vêm do catálogo, uma por forma, sem cópia na lição", () => {
  const forms = Object.keys(LESSON_DERIVED).flatMap(lessonDerivedForms);
  assert.equal(forms.length, DERIVED_RULES.length);
  DERIVED_RULES.forEach((rule, index) => {
    assert.deepEqual(forms[index].proof, parseProof(rule.proof).proof, rule.id);
    assert.deepEqual(forms[index].goal, ruleGoal(rule), rule.id);
  });
  // A mesma prova com outras letras também seria uma cópia: dá-se às letras o nome pela ordem em que aparecem.
  const shape = (proof) => {
    const names = new Map();
    return formatProof(proof).replace(/(?<!\p{L})[a-z](?!\p{L})/gu, (name) => {
      if (!names.has(name)) names.set(name, `x${names.size}`);
      return names.get(name);
    });
  };
  const stored = new Set(forms.map(({ proof }) => shape(proof)));
  for (const id of Object.keys(LESSON_PROOFS)) assert.equal(stored.has(shape(lessonProof(id).proof)), false, id);
  assert.equal(stored.has(shape(parseProof("1 | a → b   premissa\n2 | ¬b      premissa\n3 |   a     hipótese\n4 |   b     →E, 3, 1\n5 |   F     FI, 4, 2\n6 | ¬a      ¬I, 3–5").proof)), true);
});

test("figura de derivada: esquema de todas as formas e a prova de cada uma, só com regras base", () => {
  const base = new Set(BASE_RULES.map(({ id }) => id));
  const usedRules = (proof) => proof.lines.filter((line) => line.kind === "step").map((line) => line.rule);
  for (const lang of ["pt", "en"]) {
    setLang(lang);
    for (const [id, { rule }] of Object.entries(LESSON_DERIVED)) {
      const html = lessonDerivedHtml(id);
      const forms = lessonDerivedForms(id);
      assert.equal(html.match(/lesson-proof__view/g).length, forms.length, id);
      assert.equal(html.match(/lesson-rule__sequent/g).length, forms.length, id);
      assert.equal(html.match(/<li>/g).length, ruleSchemaLines(rule).length, id);
      for (const { goal, proof } of forms) {
        assert.equal(verifyProof(proof, goal, ruleSet("base")).ok, true, id);
        assert.ok(usedRules(proof).length > 0 && usedRules(proof).every((name) => base.has(name)), id);
      }
    }
  }
  setLang("pt");
  assert.match(lessonDerivedHtml("reductio"), /Redução ao absurdo \(RA\)/);
  assert.match(lessonDerivedHtml("deMorgan"), /Prova só com regras base/);
  assert.equal(lessonDerivedHtml("deMorgan").match(/data-line="1"/g).length, 4);
  setLang("en");
  assert.match(lessonDerivedHtml("reductio"), /Reductio ad absurdum \(RAA\)/);
  assert.match(lessonDerivedHtml("excludedMiddle"), /\(LEM\)/);
  assert.match(lessonDerivedHtml("hypotheticalSyllogism"), /\(HS\)/);
  assert.match(lessonDerivedHtml("disjunctiveSyllogism"), /\(DS\)/);
  setLang("pt");
});

test("o que as secções 5 a 7 afirmam é o que o verificador faz", () => {
  const reads = (sequent, text) => verifyProof(parseProof(text).proof, parseSequent(sequent).sequent, ruleSet("completo"));
  // closeNegated: ¬I sobre a hipótese ¬p dá ¬¬p, e RA são estes dois passos.
  const reductio = lessonDerivedForms("reductio")[0];
  assert.equal(format(reductio.proof.lines[1].formula), "¬p");
  assert.equal(reductio.proof.lines[3].rule, "¬I");
  assert.equal(format(reductio.proof.lines[3].formula), "¬¬p");
  assert.equal(reductio.proof.lines[4].rule, "¬E");
  assert.equal(formatSequent(reductio.goal), "¬p → F ⊢ p");
  // Não há regra de ¬φ para φ; ⊥ é aceite na entrada, mas mostra-se F.
  assert.equal(reads("¬a ⊢ a", "1 | ¬a   premissa\n2 | a    ¬E, 1").ok, false);
  assert.equal(formatSequent(parseSequent("a, ¬a ⊢ ⊥").sequent), "a, ¬a ⊢ F");
  // TE não cita nada.
  assert.equal(reads("⊢ a ∨ ¬a", "1 | a ∨ ¬a   TE").ok, true);
  // As quatro formas de DM e o FE nas duas provas de SD.
  assert.equal(ruleSchemaLines("DM").length, 4);
  for (const { proof } of lessonDerivedForms("disjunctiveSyllogism")) {
    assert.ok(proof.lines.some((line) => line.rule === "FE"));
  }
  // As correções que as explicações propõem resultam.
  assert.equal(reads("a ∧ b, ¬a ⊢ F", "1 | a ∧ b   premissa\n2 | ¬a      premissa\n3 | a       ∧E, 1\n4 | F       FI, 3, 2").ok, true);
  assert.equal(reads("¬a ⊢ a → b", "1 | ¬a      premissa\n2 |   a     hipótese\n3 |   F     FI, 2, 1\n4 |   b     FE, 3\n5 | a → b   →I, 2–4").ok, true);
  // notIntroNoFalse: o sequente é mesmo inválido.
  assert.equal(checkSequent(lessonMistake("notIntroNoFalse").goal).valid, false);
  // derivedUse: duas linhas com MT e nenhuma subdedução.
  const steps = lessonProof("derivedUse").proof.lines.filter((line) => line.kind !== "premise");
  assert.deepEqual(steps.map((line) => line.rule), ["MT", "MT"]);
});

test("cada regra tem exemplo que a usa, erro comum e texto nos dois idiomas", () => {
  for (const [id, { rule, example, mistake }] of Object.entries(LESSON_RULES)) {
    assert.ok(lessonProof(example).proof.lines.some((line) => line.rule === rule), id);
    assert.ok(LESSON_MISTAKES[mistake], id);
    assert.ok(lessonMistake(mistake).proof.lines.some((line) => line.rule === rule), id);
    for (const locale of Object.values(LOCALES)) {
      assert.ok(locale.learn.rules[id].name, id);
      assert.ok(locale.learn.rules[id].when, id);
    }
  }
});

test("cada erro é mesmo um erro: o verificador só aponta a linha e o código previstos", () => {
  for (const [id, { line, code }] of Object.entries(LESSON_MISTAKES)) {
    assert.deepEqual(mistakeFindings(id), [{ line, code }], id);
    for (const locale of Object.values(LOCALES)) assert.ok(locale.learn.mistakes[id], id);
  }
});

test("todos os erros aparecem na lição, nenhum fica por mostrar", () => {
  const inRules = Object.values(LESSON_RULES).map(({ mistake }) => mistake);
  const alone = [...page.matchAll(/data-lesson-mistake="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...inRules, ...alone].sort(), Object.keys(LESSON_MISTAKES).sort());
  for (const id of alone) for (const locale of Object.values(LOCALES)) assert.ok(locale.learn.figures[id], id);
});

test("nenhum erro da lição coincide com os materiais da cadeira", () => {
  const course = new Map(COURSE_SEQUENTS.map((text) => [fingerprint(text), text]));
  for (const [id, { sequent }] of Object.entries(LESSON_MISTAKES)) {
    assert.equal(course.get(fingerprint(sequent)), undefined, id);
  }
});

test("o contraexemplo que o texto dá para o erro da →E é o verdadeiro", () => {
  const { counterexample, valid } = checkSequent(lessonMistake("implElimBackwards").goal);
  assert.equal(valid, false);
  assert.deepEqual([...counterexample].sort(), [["a", false], ["b", true]]);
});

test("os esquemas das regras vêm do catálogo, com uma forma por conclusão", () => {
  assert.deepEqual(ruleSchemaLines("∧I"), ["φ, ψ ⊢ φ ∧ ψ"]);
  assert.deepEqual(ruleSchemaLines("∧E"), ["φ ∧ ψ ⊢ φ", "φ ∧ ψ ⊢ ψ"]);
  assert.deepEqual(ruleSchemaLines("→E"), ["φ, φ → ψ ⊢ ψ"]);
  assert.deepEqual(ruleSchemaLines("→I"), ["[φ] … ψ ⊢ φ → ψ"]);
  assert.deepEqual(ruleSchemaLines("R"), ["φ ⊢ φ"]);
  assert.deepEqual(ruleSchemaLines("∨I"), ["φ ⊢ φ ∨ ψ", "φ ⊢ ψ ∨ φ"]);
  assert.deepEqual(ruleSchemaLines("∨E"), ["φ ∨ ψ, [φ] … θ, [ψ] … θ ⊢ θ"]);
  assert.deepEqual(ruleSchemaLines("¬E"), ["¬¬φ ⊢ φ"]);
  assert.deepEqual(ruleSchemaLines("TE"), ["⊢ φ ∨ ¬φ"]);
  assert.deepEqual(ruleSchemaLines("RA"), ["[¬φ] … F ⊢ φ"]);
  assert.deepEqual(ruleSchemaLines("SD"), ["φ ∨ ψ, ¬φ ⊢ ψ", "φ ∨ ψ, ¬ψ ⊢ φ"]);
  assert.deepEqual(ruleSchemaLines("DM"), ["¬(φ ∧ ψ) ⊢ ¬φ ∨ ¬ψ", "¬φ ∨ ¬ψ ⊢ ¬(φ ∧ ψ)", "¬(φ ∨ ψ) ⊢ ¬φ ∧ ¬ψ", "¬φ ∧ ¬ψ ⊢ ¬(φ ∨ ψ)"]);
});

test("figura de regra: esquema, exemplo e erro com só a linha errada assinalada", () => {
  setLang("pt");
  const html = lessonRuleHtml("implElim");
  assert.match(html, /Eliminação da implicação \(→E\)/);
  assert.match(html, /lesson-rule__schema/);
  assert.match(html, />Exemplo</);
  assert.match(html, />Erro comum</);
  assert.match(html, /Linha 3\./);
  assert.match(html, /msg-warn/);
  assert.equal(html.match(/data-state="error"/g).length, 1);
  assert.match(html, /data-line="3" data-state="error"/);
  setLang("en");
  assert.match(lessonRuleHtml("implElim"), /Implication elimination \(→E\)/);
  assert.match(lessonMistakeHtml("closedLine"), /Common mistake: using a line/);
  setLang("pt");
});

test("o que as perguntas das secções 2 a 4 afirmam é o que o verificador faz", () => {
  // andDepth: b sai de (a ∧ b) ∧ c com duas aplicações de ∧E.
  assert.equal(lessonProof("andElim").proof.lines.filter((line) => line.rule === "∧E").length, 2);
  // citeOrder: as duas ordens passam.
  for (const citation of ["1, 2", "2, 1"]) {
    const text = `1 | a → b   premissa\n2 | a       premissa\n3 | b       →E, ${citation}`;
    const goal = parseSequent("a → b, a ⊢ b").sequent;
    assert.equal(verifyProof(parseProof(text).proof, goal).ok, true, citation);
  }
  // scopeLines: na linha 6, soltas só 1 e 2; o resto só como intervalo.
  const { lines, ranges } = accessibleFrom(lessonProof("nestedScopes").proof, 6);
  assert.deepEqual(lines, [1, 2]);
  assert.deepEqual(ranges, [{ from: 3, to: 5 }]);
});

test("a leitura sem parênteses que o texto ensina é a do parser, e o site mostra a forma curta", () => {
  const formula = (text) => parseFormula(text).formula;
  for (const [short, full] of [
    ["a → b ∧ c", "a → (b ∧ c)"],
    ["a → b ∨ c", "a → (b ∨ c)"],
    ["a ∧ b ∧ c", "(a ∧ b) ∧ c"],
    ["a → b → c", "a → (b → c)"],
    ["¬a ∧ b", "(¬a) ∧ b"],
    ["¬a → b", "(¬a) → b"],
  ]) {
    assert.ok(equals(formula(short), formula(full)), short);
    assert.equal(format(formula(full)), short);
  }
});

test("o intervalo de uma linha que o texto dá como exemplo é aceite", () => {
  const text = "1 |   a     hipótese\n2 | a → a   →I, 1–1";
  assert.equal(verifyProof(parseProof(text).proof, parseSequent("⊢ a → a").sequent).ok, true);
});

test("revelar: começa nas premissas, marca a linha nova e guarda o lugar das seguintes", () => {
  const { proof } = lessonProof("firstProof");
  assert.equal(firstRevealed(proof), 2);
  assert.equal(firstRevealed({ lines: [{ kind: "hypothesis" }, { kind: "step" }] }), 1);
  assert.deepEqual([...revealMarks(proof, 2)], [[3, "future"], [4, "future"], [5, "future"], [6, "future"]]);
  assert.deepEqual([...revealMarks(proof, 5)], [[5, "current"], [6, "future"]]);
  assert.deepEqual([...revealMarks(proof, 6)], [[6, "current"]]);
});

test("figura: só as interativas levam o rótulo", () => {
  setLang("pt");
  const figure = (interactive) => lessonFigureHtml({ icon: "proof", title: "a < b", interactive, body: "<p>x</p>" });
  assert.match(figure(true), /lesson-figure__tag">Interativo</);
  assert.doesNotMatch(figure(false), /lesson-figure__tag/);
  assert.match(figure(false), /a &lt; b/);
});

test("figura de prova: fixa, mostra tudo; por passos, tem botões e contador", () => {
  setLang("pt");
  const { proof } = lessonProof("firstProof");
  const still = lessonProofHtml({ title: "t", proof });
  assert.doesNotMatch(still, /data-step-mark|data-role/);
  const stepped = lessonProofHtml({ title: "t", proof, stepped: true });
  assert.match(stepped, /data-role="prev"/);
  assert.match(stepped, /data-role="next"/);
  assert.match(stepped, /Linha 2 de 6/);
  assert.equal(stepped.match(/data-step-mark="future"/g).length, 4);
  setLang("en");
  assert.match(lessonProofHtml({ title: "t", proof, stepped: true, shown: 3 }), /Line 3 of 6/);
  setLang("pt");
});

test("pergunta: a opção escolhida fica marcada e a explicação depende dela", () => {
  setLang("pt");
  assert.match(lessonCheckHtml("firstRule", "andI"), /data-option="andI" aria-pressed="true"/);
  assert.match(lessonCheckHtml("firstRule"), /data-option="andI" aria-pressed="false"/);
  assert.match(lessonCheckFeedbackHtml("firstRule", "implE"), /msg-ok/);
  assert.match(lessonCheckFeedbackHtml("firstRule", "andI"), /msg-warn/);
});

const sectionHtml = (index) => page.split('<section class="lesson-section"')[index];

test("a secção 8 tem as provas animadas, com uma nota por linha nos dois idiomas", () => {
  const used = [...page.matchAll(/data-lesson-walkthrough="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(used, [...LESSON_WALKTHROUGHS]);
  assert.equal(sectionHtml(8).match(/data-lesson-walkthrough=/g).length, used.length);
  for (const id of used) {
    const { proof } = lessonProof(id);
    const wanted = proof.lines.map((_, index) => index + 1).filter((line) => line >= firstRevealed(proof)).map((line) => `l${line}`);
    for (const locale of Object.values(LOCALES)) {
      assert.ok(locale.learn.figures[id], id);
      assert.deepEqual(Object.keys(locale.learn.walkthroughs[id]), wanted, id);
    }
  }
});

test("prova animada: traz a nota da linha e o botão de reproduzir", () => {
  setLang("pt");
  const { proof } = lessonProof("strategyBackward");
  const html = lessonProofHtml({ title: "t", proof, stepped: true, notes: (line) => `nota ${line}` });
  assert.match(html, /data-role="play"/);
  assert.match(html, /Reproduzir/);
  assert.match(html, /nota 1/);
  assert.doesNotMatch(lessonProofHtml({ title: "t", proof, stepped: true }), /data-role="play"|lesson-proof__note|lesson-rule__sequent/);
  assert.match(lessonProofHtml({ title: "t", proof, stepped: true, sequent: "x ⊢ y" }), /lesson-rule__sequent/);
});

test("o que as notas das provas animadas dizem bate com as provas", () => {
  const rules = (id) => lessonProof(id).proof.lines.map((line) => line.rule);
  assert.equal(rules("strategyBackward")[6], "→I");
  assert.equal(rules("strategyCases")[7], "∨E");
  assert.deepEqual(rules("strategyAbsurd").slice(2), ["∨I", "∨I", "FI", "RA"]);
  // strategyCases: a conclusão não sai de nenhum dos lados sozinho, a partir das premissas.
  for (const side of ["b", "c"]) assert.equal(checkSequent(parseSequent(`a ∨ b, a → c ⊢ ${side}`).sequent).valid, false, side);
  // strategyAbsurd: sem ¬E, RA ou TE não se chega a a.
  const direct = solve(lessonProof("strategyAbsurd").goal, { rules: ruleSet({ set: "base", exclude: ["¬E"] }) });
  assert.equal(direct.provable, false);
});

test("há pelo menos 3 laboratórios, todos na secção 8 e com texto nos dois idiomas", () => {
  const used = [...page.matchAll(/data-lesson-lab="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(used, Object.keys(LESSON_LABS));
  assert.ok(used.length >= 3);
  assert.equal(sectionHtml(8).match(/data-lesson-lab=/g).length, used.length);
  for (const id of used) for (const locale of Object.values(LOCALES)) {
    for (const key of ["title", "task", "hint"]) assert.ok(locale.learn.labs[id][key], `${id}.${key}`);
  }
});

test("a solução de cada laboratório passa pelo verificador, só com as regras do laboratório", () => {
  for (const id of Object.keys(LESSON_LABS)) {
    const { goal, rules, solution } = lessonLab(id);
    assert.equal(verifyProof(solution, goal, rules, RULES).ok, true, id);
  }
});

test("cada laboratório resolve-se no modo guiado, passo a passo", () => {
  for (const id of Object.keys(LESSON_LABS)) {
    const { goal, rules } = lessonLab(id);
    let editor = focusObjective(createEditor(goal));
    assert.equal(editorStatus(editor, { rules, known: RULES }).complete, false, id);
    for (const { pick = [], rule } of LAB_GUIDED[id]) {
      let selection = [];
      for (const line of pick) selection = toggleSelection(selection, guidedLines(editor, selection)[line - 1].item);
      const { outcomes } = guidedRules(editor, selection, { rules, known: RULES }).find((option) => option.id === rule);
      assert.equal(outcomes.length, 1, `${id}: ${rule}`);
      editor = applyOutcome(editor, outcomes[0], {});
    }
    assert.equal(editorStatus(editor, { rules, known: RULES }).complete, true, id);
  }
});

test("nenhum laboratório coincide com os materiais da cadeira", () => {
  const course = new Map(COURSE_SEQUENTS.map((text) => [fingerprint(text), text]));
  for (const [id, { sequent }] of Object.entries({ ...LESSON_LABS, ...LESSON_COUNTERS })) {
    assert.equal(course.get(fingerprint(sequent)), undefined, id);
  }
});

test("figura de laboratório: sequente, tarefa, pista e as duas ações", () => {
  setLang("pt");
  const html = lessonLabHtml("labCases");
  assert.match(html, /Laboratório: dois casos/);
  assert.match(html, /Interativo/);
  assert.match(html, /lesson-lab__editor/);
  assert.match(html, /<details/);
  assert.match(html, /data-role="restart"/);
  assert.match(html, /data-role="solution"/);
  setLang("en");
  assert.match(lessonLabHtml("labAbsurd"), /Lab: reductio ad absurdum/);
  setLang("pt");
});

test("cada editor tem ids próprios, e na página Provar ficam os de sempre", () => {
  const line = { kind: "step", depth: 0 };
  const draft = { formula: "", justification: "" };
  setLang("pt");
  const lab = editableLineHtml(line, 1, draft, false, "labCases");
  for (const name of ["formula", "justification", "reading", "error"]) assert.ok(lab.includes(`id="labCases-${name}-2"`), name);
  assert.ok(lab.includes('aria-describedby="labCases-reading-2 labCases-error-2"'));
  assert.doesNotMatch(lab, /proof-/);
  assert.ok(editableLineHtml(line, 1, draft, false).includes('id="proof-formula-2"'));
});

test("secção 9: o contraexemplo é verdadeiro e o que o texto afirma sobre as regras também", () => {
  assert.match(sectionHtml(9), /data-lesson-counter="orToSide"/);
  assert.deepEqual(lessonCounter("orToSide").valuation, [["a", false], ["b", true]]);
  for (const locale of Object.values(LOCALES)) assert.ok(locale.learn.counters.orToSide.why);
  setLang("pt");
  assert.match(lessonCounterHtml("orToSide"), /a = F/);
  assert.match(lessonCounterHtml("orToSide"), /b = V/);
  setLang("en");
  assert.match(lessonCounterHtml("orToSide"), /b = T/);
  setLang("pt");
  // «Se tirares ¬E às regras base»: a ∨ ¬a continua válida e deixa de ter prova; com ¬E, tem.
  const goal = parseSequent("⊢ a ∨ ¬a").sequent;
  assert.equal(checkSequent(goal).valid, true);
  assert.equal(solve(goal, { rules: ruleSet({ set: "base", exclude: ["¬E"] }) }).provable, false);
  assert.equal(solve(goal, { rules: ruleSet("base") }).provable, true);
});

test("índice: uma ligação por secção, a atual assinalada e as anteriores lidas", () => {
  setLang("pt");
  const html = renderLessonToc(SECTIONS, 3, { progress: 0.4 });
  for (const { id } of SECTIONS) assert.ok(html.includes(`href="#${id}"`), id);
  assert.equal(html.match(/aria-current="location"/g).length, 1);
  assert.match(html, /href="#subdeducoes" data-toc-index="3" aria-current="location"/);
  assert.equal(html.match(/lesson-toc__item--done/g).length, 3);
  assert.match(html, /4\/9/);
  assert.match(html, /aria-valuenow="40"/);
  assert.match(html, /3 de 9 lidas/);
});

test("scroll-spy: a última secção que passou a linha; no fim da página, a última", () => {
  assert.equal(activeSectionIndex([], 100), 0);
  assert.equal(activeSectionIndex([50, 90, 400], 100), 1);
  assert.equal(activeSectionIndex([200, 400], 100), 0);
  assert.equal(activeSectionIndex([-900, -500, 300], 100, { atBottom: true }), 2);
});

test("progresso da leitura: entre 0 e 1, e 1 se a página couber no ecrã", () => {
  assert.equal(readingProgress({ scrollY: 0, scrollHeight: 2000, viewportHeight: 1000 }), 0);
  assert.equal(readingProgress({ scrollY: 500, scrollHeight: 2000, viewportHeight: 1000 }), 0.5);
  assert.equal(readingProgress({ scrollY: 5000, scrollHeight: 2000, viewportHeight: 1000 }), 1);
  assert.equal(readingProgress({ scrollY: 0, scrollHeight: 500, viewportHeight: 1000 }), 1);
});

test("no Chrome: índice, links diretos e figuras, a 390px e a 1280px", { skip: !existsSync(process.env.CHROME_BIN || "/usr/bin/google-chrome") }, () => {
  const run = spawnSync("node", ["scripts/check-learn.mjs"], { encoding: "utf8", timeout: 90000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
