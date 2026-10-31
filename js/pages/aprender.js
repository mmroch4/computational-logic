// Página Aprender: lição de cima a baixo com índice lateral (scroll-spy) e barra de progresso.
// O texto das secções está no aprender.html; o layout traduz os data-i18n ao mudar de idioma.
// Os interativos descarregam-se depois do primeiro desenho (ver js/ui/lesson-interactives.js).
import { mountLayout } from "../ui/layout.js";
import { onLangChange } from "../ui/i18n.js";
import { mountLessonToc } from "../ui/lesson-toc.js";
import { mountLessonReveal } from "../ui/lesson-reveal.js";

mountLayout();
const toc = mountLessonToc();
mountLessonReveal(document.querySelectorAll(".lesson-section"));
onLangChange(() => toc.refresh());

requestAnimationFrame(async () => {
  const { mountLessonInteractives } = await import("../ui/lesson-interactives.js");
  await mountLessonInteractives();
  // Os interativos dão altura às secções: um link direto a uma secção tem de voltar a acertar nela.
  document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "instant" });
  toc.refresh();
});
