// Demonstração da página inicial: o editor a verificar uma prova, linha a linha.
//
// Começa sozinha quando entra no ecrã, uma só vez, e acaba na prova completa. Tem um botão para pausar,
// porque dura mais de 5 s. Com movimento reduzido, não arranca: mostra logo a prova completa.
//
// `mountHomeDemo(container)` é o único ponto de entrada. As linhas por escrever guardam o lugar.
import { homeDemo } from "../core/home-demo.js";
import { fitchHtml, justificationText, readAsHtml, spokenProse } from "./fitch-view.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { prefersReducedMotion, sequence } from "./motion.js";

/** Tempo de cada fotograma: dá para seguir a fórmula e, a seguir, a regra. */
export const HOME_DEMO_INTERVAL_MS = 1000;

function captionHtml({ kind, line, view }) {
  if (kind === "complete") return msgHtml("ok", escapeHtml(t("home.demo.complete")));
  const why = justificationText(view.lines[line - 1]);
  const text = t(`home.demo.${kind}`, { line, why });
  return `<p class="home-demo__caption-text">${readAsHtml(escapeHtml(text), spokenProse(text))}</p>`;
}

export function mountHomeDemo(container) {
  const { sequent, frames } = homeDemo();
  const last = frames.length - 1;
  container.innerHTML = '<div class="home-demo__bar"><p class="home-demo__sequent"></p>'
    + '<button type="button" class="btn" data-variant="outline" data-role="toggle"></button></div>'
    + '<div class="home-demo__view"></div><div class="home-demo__caption"></div>';

  const view = container.querySelector(".home-demo__view");
  const caption = container.querySelector(".home-demo__caption");
  const toggle = container.querySelector('[data-role="toggle"]');
  container.querySelector(".home-demo__sequent").innerHTML = readAsHtml(escapeHtml(sequent), spokenProse(sequent));

  let index = 0;
  let timer = null;

  function paintToggle() {
    const key = timer !== null ? "pause" : index === last ? "replay" : "play";
    toggle.textContent = t(`home.demo.${key}`);
    container.dataset.playing = String(timer !== null);
  }

  function show(next) {
    index = next;
    const frame = frames[index];
    // Desenhar de novo tira o foco e o scroll a quem está a deslocar a prova com o teclado.
    const scroller = view.querySelector(".fitch");
    const left = scroller?.scrollLeft ?? 0;
    const focused = scroller !== null && scroller === document.activeElement;
    view.innerHTML = fitchHtml(frame.view, { states: frame.states, marks: frame.marks });
    const fresh = view.querySelector(".fitch");
    fresh.scrollLeft = left;
    if (focused) fresh.focus({ preventScroll: true });
    caption.innerHTML = captionHtml(frame);
    container.dataset.frame = String(index);
    return frame;
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    paintToggle();
  }

  function advance() {
    const previous = frames[index];
    const frame = show(index + 1);
    if (frame.line !== previous.line) {
      const row = view.querySelector(`[data-line="${frame.line}"]`);
      sequence([{ tweens: [{ targets: [row], from: { opacity: 0 }, dur: "slow" }] }]);
    }
    if (index === last) stop();
  }

  function play() {
    if (index === last) show(0);
    timer = setInterval(advance, HOME_DEMO_INTERVAL_MS);
    paintToggle();
  }

  const reduced = prefersReducedMotion();
  show(reduced ? last : 0);
  paintToggle();

  // Só a partir do momento em que se vê: a 390px, a demonstração fica abaixo do texto.
  const watcher = new IntersectionObserver(([{ isIntersecting }]) => {
    if (!isIntersecting) return;
    watcher.disconnect();
    play();
  }, { threshold: 0.25 });
  if (!reduced) watcher.observe(container);

  toggle.addEventListener("click", () => {
    watcher.disconnect();
    if (timer === null) play();
    else stop();
  });
}
