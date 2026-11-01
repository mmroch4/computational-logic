// Figuras e interativos da lição. Cada lugar marca-se no `aprender.html`:
//   <div class="lesson-interactive" data-lesson-proof="firstProof" data-stepped></div>
//   <div class="lesson-interactive" data-lesson-check="firstRule"></div>
//   <div class="lesson-interactive" data-lesson-rule="andIntro"></div>
//   <div class="lesson-interactive" data-lesson-mistake="closedLine"></div>
//   <div class="lesson-interactive" data-lesson-derived="deMorgan"></div>
// Vêm num módulo à parte porque a lição é texto: o primeiro desenho não fica à espera deles.
import { lessonProof } from "../core/lesson.js";
import { t } from "./i18n.js";
import { mountLessonCheck } from "./lesson-check.js";
import { mountLessonProof } from "./lesson-proof.js";
import { lessonDerivedHtml, lessonMistakeHtml, lessonRuleHtml } from "./lesson-rule.js";

// Dá a vez ao browser: montar tudo de seguida prendia a página numa tarefa longa.
const nextTask = () => new Promise((resolve) => setTimeout(resolve));

function mountProofFigure(el) {
  const id = el.dataset.lessonProof;
  mountLessonProof(el, { title: t(`learn.figures.${id}`), proof: lessonProof(id).proof, stepped: "stepped" in el.dataset });
}

/** Cada seletor e o que monta nesse lugar. */
const MOUNTERS = [
  ["[data-lesson-proof]", mountProofFigure],
  ["[data-lesson-check]", (el) => mountLessonCheck(el, { id: el.dataset.lessonCheck })],
  ["[data-lesson-rule]", (el) => { el.innerHTML = lessonRuleHtml(el.dataset.lessonRule); }],
  ["[data-lesson-mistake]", (el) => { el.innerHTML = lessonMistakeHtml(el.dataset.lessonMistake); }],
  ["[data-lesson-derived]", (el) => { el.innerHTML = lessonDerivedHtml(el.dataset.lessonDerived); }],
];

/** Monta tudo, um lugar por tarefa. */
export async function mountLessonInteractives(root = document) {
  for (const [selector, mount] of MOUNTERS) {
    for (const el of root.querySelectorAll(selector)) {
      mount(el);
      await nextTask();
    }
  }
}
