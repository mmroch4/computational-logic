// O retorno das respostas (exercícios e quiz): curto e sem festa, só para mostrar o que mudou.
// Primeiro entra a marca na opção escolhida; depois, o que explica a resposta sobe por baixo.
import { sequence } from "./motion.js";

const MARK = { opacity: "0", transform: "scale(0.7)" };
const RISE = { opacity: "0", transform: "translateY(6px)" };

/**
 *   marks    as marcas (✓ ou ✗) que entram primeiro;
 *   appear   o que aparece a seguir sem se mexer (a resposta certa, a tracejado);
 *   messages o que sobe por baixo; o ícone de cada mensagem entra com ela.
 */
export function showFeedback({ marks = [], appear = [], messages = [] }) {
  const icons = messages.flatMap((message) => [...message.querySelectorAll(":scope > .ic")]);
  return sequence([
    { tweens: [{ targets: marks, from: MARK, dur: "fast" }] },
    {
      tweens: [
        { targets: appear, from: { opacity: "0" }, dur: "base" },
        { targets: messages, from: RISE, dur: "base" },
        { targets: icons, from: MARK, dur: "base" },
      ],
    },
  ]);
}

/** A barra enche-se a partir de `from` (uma largura de CSS): é a transição de width do CSS. */
export function fillBar(bar, from) {
  const width = bar.style.width;
  bar.style.width = from;
  bar.getBoundingClientRect();
  bar.style.width = width;
}
