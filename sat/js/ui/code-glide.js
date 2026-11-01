// O realce do pseudocódigo desliza entre linhas, em vez de saltar (DLL e DP).
import { prefersReducedMotion, sequence } from "./motion.js";

/** A caixa das linhas atuais de um pseudocódigo, relativa à lista; null se não houver nenhuma. */
export function currentLinesBox(root) {
  const list = root.querySelector(".code");
  const lines = list?.querySelectorAll(".is-current");
  if (!lines?.length) return null;
  const top = lines[0].getBoundingClientRect().top;
  const bottom = lines[lines.length - 1].getBoundingClientRect().bottom;
  return { top: top - list.getBoundingClientRect().top, height: bottom - top };
}

/**
 * O realce desliza de `before` (uma caixa de currentLinesBox) até às linhas atuais: uma barra por
 * baixo do texto faz o caminho, e as linhas só voltam a ter fundo próprio quando ela chega.
 */
export function glideHighlight(root, before) {
  const after = before && currentLinesBox(root);
  if (!after || after.top === before.top || prefersReducedMotion()) return sequence([]);
  const list = root.querySelector(".code");
  const glide = document.createElement("li");
  glide.className = "code__glide";
  glide.setAttribute("aria-hidden", "true");
  glide.style.background = getComputedStyle(list.querySelector(".is-current")).backgroundColor;
  list.prepend(glide);
  list.classList.add("is-gliding");
  const keyframes = {
    transform: [`translateY(${before.top}px)`, `translateY(${after.top}px)`],
    height: [`${before.height}px`, `${after.height}px`],
  };
  return sequence([{
    tweens: [{ targets: [glide], to: keyframes, dur: "base" }],
    after() {
      glide.remove();
      list.classList.remove("is-gliding");
    },
  }]);
}
