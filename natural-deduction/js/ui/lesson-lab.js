// Laboratório da lição: um sequente para provar ali mesmo, no editor da página Provar. Abre no modo guiado,
// que num telemóvel dispensa o teclado, e o modo de escrita fica a um toque. Nada se guarda: recarregar
// a página começa de novo, e os laboratórios não contam para o progresso dos exercícios.
//
// `lessonLabHtml` é pura. `mountLessonLab(container, { id })` monta o editor.
import { createEditor } from "../core/editor.js";
import { lessonLab } from "../core/lesson.js";
import { formatSequent } from "../core/sequent.js";
import { readAsHtml, spokenProse } from "./fitch-view.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { lessonFigureHtml } from "./lesson-figure.js";
import { mountProofEditor } from "./proof-editor.js";

const proseHtml = (text) => readAsHtml(escapeHtml(text), spokenProse(text));

const toolHtml = (role) => (
  `<button type="button" class="btn" data-variant="outline" data-size="sm" data-role="${role}">${escapeHtml(t(`learn.lab.${role}`))}</button>`
);

export function lessonLabHtml(id) {
  const { goal } = lessonLab(id);
  const text = (name) => t(`learn.labs.${id}.${name}`);
  const body = `<p class="lesson-rule__sequent">${proseHtml(formatSequent(goal))}</p>`
    + `<p class="lesson-lab__task">${proseHtml(text("task"))}</p>`
    + `<details class="exercise-hints"><summary>${escapeHtml(t("learn.lab.hint"))}</summary><p>${proseHtml(text("hint"))}</p></details>`
    + '<div class="lesson-lab__editor"></div>'
    + `<div class="lesson-lab__tools">${toolHtml("restart")}${toolHtml("solution")}</div>`;
  return lessonFigureHtml({ classes: "lesson-lab", icon: "proof", title: text("title"), interactive: true, body });
}

export function mountLessonLab(container, { id }) {
  const { goal, rules, solution } = lessonLab(id);
  container.innerHTML = lessonLabHtml(id);
  const editor = mountProofEditor(container.querySelector(".lesson-lab__editor"), { rules, idPrefix: id, mode: "guided" });
  const blank = createEditor(goal).proof;
  // `open`, e não `start`: a lição não deve saltar para aqui ao carregar.
  editor.open(goal, blank);
  // Pela `useProof`, as duas ações desfazem-se como as outras.
  container.querySelector('[data-role="restart"]').addEventListener("click", () => editor.useProof(blank));
  container.querySelector('[data-role="solution"]').addEventListener("click", () => editor.useProof(solution));
}
