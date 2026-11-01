/**
 * Segmented control (`.seg`): ←/→ muda de segmento e dá logo a escolha, sem ser preciso Enter. Um só
 * listener para todos os `.seg` da página, mesmo os que forem redesenhados depois.
 */

/** Índice do segmento para onde a tecla leva (dá a volta nas pontas), ou null se a tecla não for uma seta. */
export function segTarget(index, count, key) {
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  return null;
}

// Quem trata o clique pode redesenhar o `.seg`: nesse caso o botão reencontra-se pelos data-*.
function buttonSelector(button) {
  const attrs = [...button.attributes].filter((a) => a.name.startsWith("data-"));
  return "button" + attrs.map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join("");
}

/**
 * Na captura, para as setas não chegarem à timeline nem aos players, que as usam para mudar de passo.
 * O botão pressionado continua a ser a escolha: só muda com a seta, como num grupo de opções.
 * Um `.seg` com data-seg-keys="off" fica de fora: ali carregar é uma resposta, que não pode sair sem querer.
 */
export function installSegKeys(root = document) {
  root.addEventListener("keydown", (event) => {
    const button = event.target.closest?.(".seg button");
    if (!button || button.closest('[data-seg-keys="off"]')) return;
    const buttons = [...button.closest(".seg").querySelectorAll("button")];
    const target = segTarget(buttons.indexOf(button), buttons.length, event.key);
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    const next = buttons[target];
    const selector = buttonSelector(next);
    next.click();
    (next.isConnected ? next : root.querySelector(selector))?.focus();
  }, true);
}
