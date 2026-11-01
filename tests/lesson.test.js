// A estrutura da lição: secções, índice e componentes. No Chrome, com toques: scripts/check-learn.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  LESSON_CHECKS, LESSON_PROOFS, LESSON_SECTIONS, firstRevealed, lessonProof, revealMarks, verifyLessonProof,
} from "../js/core/lesson.js";
import { LOCALES, setLang } from "../js/ui/i18n.js";
import { lessonCheckFeedbackHtml, lessonCheckHtml } from "../js/ui/lesson-check.js";
import { lessonFigureHtml } from "../js/ui/lesson-figure.js";
import { lessonProofHtml } from "../js/ui/lesson-proof.js";
import { activeSectionIndex, readingProgress, renderLessonToc } from "../js/ui/lesson-toc.js";
import { COURSE_SEQUENTS } from "./fixtures/course-sequents.js";
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
