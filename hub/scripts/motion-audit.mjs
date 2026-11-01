// Auditoria do movimento reduzido corrida pelo check-page.mjs quando REDUCED_MOTION=1 (o Chrome emula
// prefers-reduced-motion: reduce). Devolve uma lista de problemas em texto; vazia = tudo bem.
//
// Com movimento reduzido nenhum elemento (nem os seus ::before/::after) pode ter uma transição ou
// uma animação com duração ou atraso maior do que zero, e o scroll da página não pode ser suave.
// O mesmo vale para as animações da Web Animations API (js/ui/motion.js), que não aparecem no estilo.
//
// A função é serializada com toString() e corre no browser: não pode usar nada de fora dela.
export function motionAudit() {
  const problems = [];
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return ["a emulação de prefers-reduced-motion: reduce não está ativa"];
  }
  const moving = (list) => list.split(",").some((v) => parseFloat(v) > 0);
  const describe = (el, pseudo) => {
    const cls = typeof el.className === "string" ? el.className : el.className?.baseVal ?? "";
    return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls.trim().split(/\s+/).join(".")}` : ""}>${pseudo ?? ""}`;
  };
  for (const el of document.querySelectorAll("*")) {
    for (const pseudo of [null, "::before", "::after"]) {
      const s = getComputedStyle(el, pseudo);
      if (moving(s.transitionDuration) || moving(s.transitionDelay)) {
        problems.push(`${describe(el, pseudo)} tem transição (${s.transitionProperty} ${s.transitionDuration})`);
      }
      if (s.animationName !== "none" && (moving(s.animationDuration) || moving(s.animationDelay))) {
        problems.push(`${describe(el, pseudo)} tem animação (${s.animationName} ${s.animationDuration})`);
      }
    }
  }
  for (const animation of document.getAnimations()) {
    const { duration = 0, delay = 0 } = animation.effect?.getComputedTiming() ?? {};
    if (duration > 0 || delay > 0) {
      const target = animation.effect?.target;
      problems.push(`${target ? describe(target) : "?"} tem uma animação da Web Animations API (${duration}ms)`);
    }
  }
  if (getComputedStyle(document.documentElement).scrollBehavior === "smooth") {
    problems.push("<html> com scroll-behavior: smooth");
  }
  return problems.slice(0, 20);
}
