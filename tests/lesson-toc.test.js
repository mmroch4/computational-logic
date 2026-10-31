import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderLessonToc, activeSectionIndex, readingProgress } from "../js/ui/lesson-toc.js";
import { setLang } from "../js/ui/i18n.js";

const SECTIONS = [
  { id: "sat", number: "1", title: "O problema SAT" },
  { id: "clausulas", number: "2", title: "Cláusulas e conjuntos de cláusulas" },
  { id: "propagacao", number: "3", title: "Propagação unitária" },
];

test("renderLessonToc: links para as secções, a atual com aria-current e as anteriores com ✓", () => {
  setLang("pt", { silent: true });
  const html = renderLessonToc(SECTIONS, 1, { progress: 0.43 });
  assert.match(html, /<details class="lesson-toc__details">/);
  assert.match(html, /href="#sat"/);
  assert.match(html, /href="#propagacao"/);
  assert.equal(html.match(/aria-current="location"/g).length, 1);
  assert.match(html, /href="#clausulas" data-toc-index="1" aria-current="location"/);
  // Só a §1 já foi lida.
  assert.equal(html.match(/lesson-toc__check/g).length, 1);
  assert.match(html, /lesson-toc__item--done"><a class="lesson-toc__link" href="#sat"/);
  assert.match(html, /\(já lida\)/);
  // A barra fixa mostra a posição e a secção atual; a folha, quantas já foram lidas.
  assert.match(html, /<span class="lesson-toc__position">2\/3<\/span><span class="lesson-toc__current">Cláusulas e conjuntos de cláusulas<\/span>/);
  assert.match(html, /1 de 3 lidas/);
  assert.match(html, /<span class="lesson-toc__state" aria-hidden="true">a ler<\/span>/);
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="43"/);
  assert.match(html, /Nesta lição/);
});

test("renderLessonToc: escapa os títulos e traduz para EN", () => {
  setLang("en", { silent: true });
  const html = renderLessonToc([{ id: "x", number: "1", title: "<b>a & b</b>" }], 0);
  assert.match(html, /&lt;b&gt;a &amp; b&lt;\/b&gt;/);
  assert.match(html, /In this lesson/);
  assert.doesNotMatch(html, /lesson-toc__check/);
  setLang("pt", { silent: true });
});

test("activeSectionIndex: a última secção que passou a linha de leitura", () => {
  assert.equal(activeSectionIndex([300, 900, 1500], 200), 0); // nenhuma passou: a primeira
  assert.equal(activeSectionIndex([-400, 150, 800], 200), 1);
  assert.equal(activeSectionIndex([-1400, -800, 200], 200), 2);
  assert.equal(activeSectionIndex([-400, 150, 800], 200, { atBottom: true }), 2);
  assert.equal(activeSectionIndex([], 200), 0);
});

test("readingProgress: fração entre 0 e 1", () => {
  assert.equal(readingProgress({ scrollY: 0, scrollHeight: 3000, viewportHeight: 1000 }), 0);
  assert.equal(readingProgress({ scrollY: 1000, scrollHeight: 3000, viewportHeight: 1000 }), 0.5);
  assert.equal(readingProgress({ scrollY: 2500, scrollHeight: 3000, viewportHeight: 1000 }), 1);
  assert.equal(readingProgress({ scrollY: -50, scrollHeight: 3000, viewportHeight: 1000 }), 0);
  assert.equal(readingProgress({ scrollY: 0, scrollHeight: 800, viewportHeight: 1000 }), 1);
});

test("aprender.html: as 7 secções pela ordem da lição, cada uma com título e link para experimentar", () => {
  const html = readFileSync(new URL("../aprender.html", import.meta.url), "utf8");
  const ids = [...html.matchAll(/<section class="lesson-section" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["sat", "clausulas", "propagacao", "dll", "escolha", "historia", "quiz"]);
  assert.equal(html.match(/data-section-title/g).length, 7);
  assert.equal(html.match(/class="lesson-section__try"/g).length, 7);
  assert.match(html, /id="lesson-toc"/);
});
