// Página Aprender: lição de cima a baixo com índice lateral (scroll-spy) e barra de progresso.
// O texto das secções está no aprender.html; as figuras descarregam-se depois do primeiro desenho
// (ver js/ui/lesson-interactives.js).
import { mountLayout } from "../ui/layout.js";
import { mountLessonToc } from "../ui/lesson-toc.js";
import { mountLessonReveal } from "../ui/lesson-reveal.js";

mountLayout();
// Lê-se já: o scroll-spy reescreve o hash, e enquanto as figuras crescem passa por outras secções.
const linked = document.getElementById(location.hash.slice(1));
// O salto suave do browser para a âncora ganharia ao acerto de baixo, porque ainda ia a meio.
const { style } = document.documentElement;
if (linked) style.scrollBehavior = "auto";
const toc = mountLessonToc();
mountLessonReveal(document.querySelectorAll(".lesson-section"));

requestAnimationFrame(async () => {
  const { mountLessonInteractives } = await import("../ui/lesson-interactives.js");
  await mountLessonInteractives();
  // As figuras dão altura às secções: um link direto a uma secção tem de voltar a acertar nela.
  linked?.scrollIntoView({ behavior: "instant" });
  style.scrollBehavior = "";
  toc.refresh();
});
