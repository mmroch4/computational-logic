// Auditoria de acessibilidade corrida na página pelo check-page.mjs (depois do EVAL, por isso também
// apanha os estados interativos). Devolve uma lista de problemas em texto; vazia = tudo bem.
//
// Regras (as que se podem medir sem ferramentas externas):
// - cada <svg> visível ou está escondido dos leitores de ecrã (aria-hidden="true", ele ou um
//   antepassado) ou tem um papel (role) e um nome (aria-label, aria-labelledby ou <title>);
// - cada <img> tem alt (alt="" para imagens decorativas);
// - cada botão, link, input, select e textarea visível tem um nome acessível;
// - cada elemento com tabindex="0" tem papel e nome;
// - os ids são únicos (aria-labelledby e <label for> dependem deles);
// - no mobile (< 768px), os alvos têm pelo menos 44×44px, contando a zona que um ::after absoluto
//   acrescenta. Exceção: um link no meio de uma frase, que não se pode alargar sem tapar o texto.
//
// A função é serializada com toString() e corre no browser: não pode usar nada de fora dela.
export function a11yAudit() {
  const problems = [];
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className : el.className?.baseVal ?? "";
    return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls.trim().split(/\s+/).join(".")}` : ""}>`;
  };
  const hiddenFromAT = (el) => el.closest('[aria-hidden="true"], [hidden]') !== null;
  const visible = (el) => el.getClientRects().length > 0;
  const labelledBy = (el) => (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
  const nameOf = (el) => {
    const aria = (el.getAttribute("aria-label") || "").trim();
    if (aria) return aria;
    const by = labelledBy(el);
    if (by) return by;
    if (el.labels && el.labels.length) return [...el.labels].map((l) => l.textContent).join(" ").trim();
    if (el.tagName === "INPUT" && ["button", "submit", "reset"].includes(el.type)) return el.value.trim();
    const title = (el.getAttribute("title") || "").trim();
    // Texto visível, sem o dos ícones escondidos.
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    return clone.textContent.trim() || title;
  };

  for (const svg of document.querySelectorAll("svg")) {
    if (hiddenFromAT(svg) || !visible(svg)) continue;
    // Um <svg> dentro de outro herda o papel do de fora.
    if (svg.parentElement?.closest("svg")) continue;
    const role = svg.getAttribute("role");
    const name = (svg.getAttribute("aria-label") || "").trim() || labelledBy(svg) ||
      svg.querySelector(":scope > title")?.textContent.trim();
    if (!role || !name) problems.push(`SVG sem texto alternativo (role + aria-label) nem aria-hidden: ${describe(svg)}`);
  }

  for (const img of document.querySelectorAll("img")) {
    if (!img.hasAttribute("alt")) problems.push(`<img> sem alt: ${img.getAttribute("src")}`);
  }

  const controls = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex="0"]';
  for (const el of document.querySelectorAll(controls)) {
    if (hiddenFromAT(el) || !visible(el)) continue;
    if (!nameOf(el)) problems.push(`Controlo sem nome acessível: ${describe(el)}`);
    const native = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    if (!native && !el.getAttribute("role")) problems.push(`tabindex="0" sem role: ${describe(el)}`);
  }

  if (innerWidth < 768) {
    const reach = (el) => {
      const after = getComputedStyle(el, "::after");
      const r = el.getBoundingClientRect();
      if (after.content === "none" || after.position !== "absolute") return r;
      return { width: Math.max(r.width, parseFloat(after.width) || 0), height: Math.max(r.height, parseFloat(after.height) || 0) };
    };
    const inline = (el) => el.tagName === "A" && !el.className && el.closest("p, li, td, dd, small") !== null;
    const targets = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex="0"]';
    for (const el of document.querySelectorAll(targets)) {
      if (hiddenFromAT(el) || !el.checkVisibility({ visibilityProperty: true }) || !visible(el)) continue;
      if (el.matches(".skip-link, svg *") || inline(el)) continue;
      const { width, height } = reach(el);
      if (width < 44 || height < 44) problems.push(`Alvo pequeno (${Math.round(width)}×${Math.round(height)}): ${describe(el)}`);
    }
  }

  const seen = new Map();
  for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) || 0) + 1);
  for (const [id, n] of seen) if (n > 1) problems.push(`id repetido (${n}×): #${id}`);

  return problems;
}
