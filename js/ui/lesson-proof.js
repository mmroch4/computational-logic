// Figura de uma prova na lição. Fixa, é só a vista de Fitch; com `stepped`, revela uma linha de cada vez.
// Serve qualquer `{ lines }`: uma prova de `core/lesson.js` ou a guardada numa regra derivada.
//
// `lessonProofHtml` é pura. `mountLessonProof(container, { title, proof, stepped })` liga os botões.
// Sem teclas no `document`: uma página tem várias figuras, ao contrário do player do Passo a passo.
import { firstRevealed, revealMarks } from "../core/lesson.js";
import { fitchHtml, spokenFormula } from "./fitch-view.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { lessonFigureHtml } from "./lesson-figure.js";

const proofViewHtml = (proof, shown) => fitchHtml(proof, { marks: revealMarks(proof, shown) });

/** O número de linhas à vista, por ordem de leitura. */
const counterText = (proof, shown) => t("learn.proofFigure.counter", { shown, total: proof.lines.length });

function stepsHtml(proof, shown) {
  const button = (role, key) => (
    `<button type="button" class="btn" data-variant="outline" data-role="${role}">${escapeHtml(t(key))}</button>`
  );
  return (
    `<div class="lesson-proof__steps">${button("prev", "learn.proofFigure.prev")}` +
    `<span class="lesson-proof__counter">${escapeHtml(counterText(proof, shown))}</span>` +
    `${button("next", "learn.proofFigure.next")}</div>` +
    '<p class="sr-only" role="status"></p>'
  );
}

/** A figura com `shown` linhas à vista; sem `stepped`, com a prova toda. */
export function lessonProofHtml({ title, proof, stepped = false, shown = firstRevealed(proof) }) {
  const body = stepped
    ? `<div class="lesson-proof__view">${proofViewHtml(proof, shown)}</div>${stepsHtml(proof, shown)}`
    : `<div class="lesson-proof__view">${fitchHtml(proof)}</div>`;
  return lessonFigureHtml({ classes: "lesson-proof", icon: "proof", title, interactive: stepped, body });
}

export function mountLessonProof(container, { title, proof, stepped = false }) {
  container.innerHTML = lessonProofHtml({ title, proof, stepped });
  if (!stepped) return;
  const view = container.querySelector(".lesson-proof__view");
  const counter = container.querySelector(".lesson-proof__counter");
  const live = container.querySelector('[role="status"]');
  const prev = container.querySelector('[data-role="prev"]');
  const next = container.querySelector('[data-role="next"]');
  const first = firstRevealed(proof);
  const last = proof.lines.length;
  let shown = first;

  function paintButtons() {
    // Um botão que fica desativado perde o foco: passa para o outro, para o teclado não voltar ao início.
    const focused = document.activeElement;
    prev.disabled = shown === first;
    next.disabled = shown === last;
    if (focused?.disabled) (focused === prev ? next : prev).focus();
  }

  function show(line) {
    shown = line;
    view.innerHTML = proofViewHtml(proof, shown);
    counter.textContent = counterText(proof, shown);
    live.textContent = `${counter.textContent}: ${spokenFormula(proof.lines[shown - 1].formula)}`;
    paintButtons();
  }

  prev.addEventListener("click", () => show(shown - 1));
  next.addEventListener("click", () => show(shown + 1));
  paintButtons();
}
