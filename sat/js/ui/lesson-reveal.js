// Aprender: as secções abaixo da dobra entram uma vez, ao aparecer. O JS é que as esconde, e só no
// ecrã (ver .is-waiting no CSS): sem JS e na impressão, o conteúdo nunca fica escondido.
import { prefersReducedMotion, sequence } from "./motion.js";

const ENTER = { opacity: "0", transform: "translateY(8px)" };

export function mountLessonReveal(sections) {
  if (prefersReducedMotion() || typeof IntersectionObserver !== "function") return;
  const observer = new IntersectionObserver((entries) => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      target.classList.remove("is-waiting");
      sequence([{ tweens: [{ targets: [target], from: ENTER, dur: "slow" }] }]);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const section of sections) {
    if (section.getBoundingClientRect().top < innerHeight) continue;
    section.classList.add("is-waiting");
    observer.observe(section);
  }
}
