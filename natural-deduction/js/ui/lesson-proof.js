// Figura de uma prova na lição. Fixa, é só a vista de Fitch; com `stepped`, revela uma linha de cada vez.
// Serve qualquer `{ lines }`: uma prova de `core/lesson.js` ou a guardada numa regra derivada.
//
// Com `notes` (função da linha para o texto), é uma prova animada: cada linha traz o seu porquê, e um botão
// avança sozinho. Com `sequent`, mostra por cima o que se quer provar, a que as notas se referem. A nota fica por baixo dos botões, porque a sua altura muda e eles não podem fugir do dedo.
//
// `lessonProofHtml` é pura. `mountLessonProof(container, { title, proof, stepped, notes })` liga os botões.
// Sem teclas no `document`: uma página tem várias figuras, ao contrário do player do Passo a passo.
import { firstRevealed, revealMarks } from "../core/lesson.js";
import { fitchHtml, readAsHtml, spokenFormula, spokenProse } from "./fitch-view.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { lessonFigureHtml } from "./lesson-figure.js";
import { sequence } from "./motion.js";

/** Tempo de leitura de cada nota, a reproduzir. */
export const WALKTHROUGH_INTERVAL_MS = 3600;

const proofViewHtml = (proof, shown) => fitchHtml(proof, { marks: revealMarks(proof, shown) });

/** O número de linhas à vista, por ordem de leitura. */
const counterText = (proof, shown) => t("learn.proofFigure.counter", { shown, total: proof.lines.length });

const noteHtml = (text) => readAsHtml(escapeHtml(text), spokenProse(text));

function stepsHtml(proof, shown, notes) {
  const button = (role, key) => (
    `<button type="button" class="btn" data-variant="outline" data-role="${role}">${escapeHtml(t(key))}</button>`
  );
  return (
    `<div class="lesson-proof__steps">${button("prev", "learn.proofFigure.prev")}` +
    `<span class="lesson-proof__counter">${escapeHtml(counterText(proof, shown))}</span>` +
    `${button("next", "learn.proofFigure.next")}</div>` +
    (notes
      ? `<div class="lesson-proof__play">${button("play", "learn.proofFigure.play")}</div>` +
        `<p class="lesson-proof__note">${noteHtml(notes(shown))}</p>`
      : "") +
    '<p class="sr-only" role="status"></p>'
  );
}

/** A figura com `shown` linhas à vista; sem `stepped`, com a prova toda. */
export function lessonProofHtml({ title, proof, stepped = false, notes = null, sequent = null, shown = firstRevealed(proof) }) {
  const lead = sequent ? `<p class="lesson-rule__sequent">${noteHtml(sequent)}</p>` : "";
  const body = stepped
    ? `${lead}<div class="lesson-proof__view">${proofViewHtml(proof, shown)}</div>${stepsHtml(proof, shown, notes)}`
    : `<div class="lesson-proof__view">${fitchHtml(proof)}</div>`;
  return lessonFigureHtml({ classes: "lesson-proof", icon: "proof", title, interactive: stepped, body });
}

export function mountLessonProof(container, { title, proof, stepped = false, notes = null, sequent = null }) {
  container.innerHTML = lessonProofHtml({ title, proof, stepped, notes, sequent });
  if (!stepped) return;
  const view = container.querySelector(".lesson-proof__view");
  const counter = container.querySelector(".lesson-proof__counter");
  const live = container.querySelector('[role="status"]');
  const prev = container.querySelector('[data-role="prev"]');
  const next = container.querySelector('[data-role="next"]');
  const play = container.querySelector('[data-role="play"]');
  const note = container.querySelector(".lesson-proof__note");
  const first = firstRevealed(proof);
  const last = proof.lines.length;
  let shown = first;
  let timer = null;

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
    const spoken = `${counter.textContent}: ${spokenFormula(proof.lines[shown - 1].formula)}`;
    live.textContent = notes ? `${spoken}. ${spokenProse(notes(shown))}` : spoken;
    if (notes) note.innerHTML = noteHtml(notes(shown));
    paintButtons();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    if (play) play.textContent = t("learn.proofFigure.play");
  }

  /** Revela a linha seguinte, a aparecer aos poucos. */
  function advance() {
    show(shown + 1);
    const row = view.querySelector(`[data-line="${shown}"]`);
    sequence([{ tweens: [{ targets: [row], from: { opacity: 0 }, dur: "slow" }] }]);
    if (shown === last) stop();
  }

  function togglePlay() {
    if (timer !== null) {
      stop();
      return;
    }
    if (shown === last) show(first);
    play.textContent = t("learn.proofFigure.pause");
    timer = setInterval(advance, WALKTHROUGH_INTERVAL_MS);
    advance();
  }

  prev.addEventListener("click", () => {
    stop();
    show(shown - 1);
  });
  next.addEventListener("click", () => {
    stop();
    show(shown + 1);
  });
  play?.addEventListener("click", togglePlay);
  paintButtons();
}
