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
//   acrescenta. Exceção: um link no meio de uma frase, que não se pode alargar sem tapar o texto;
// - o texto visível cumpre o contraste AA.
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

  // Contraste AA: 4,5:1 para texto, 3:1 para texto grande (24px, ou 18,66px a negrito). Conta o valor e
  // o placeholder dos campos, e a opacidade dos antepassados. Controlos desativados estão isentos, exceto
  // as linhas da prova, que continuam a ser conteúdo a ler. Fundo com imagem não se mede e fica de fora.
  const parseColor = (text) => {
    const [r, g, b, a = 1] = text.match(/[\d.]+%?/g).map((part, index) => (
      part.endsWith("%") ? parseFloat(part) / (index === 3 ? 100 : 1 / 2.55) : parseFloat(part)
    ));
    return { r, g, b, a };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const luminance = ({ r, g, b }) => {
    const [lr, lg, lb] = [r, g, b].map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  const backgroundOf = (el) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== "none") return null;
      const color = parseColor(style.backgroundColor);
      if (color.a > 0) layers.push(color);
      if (color.a === 1) break;
    }
    return layers.reduceRight((below, layer) => over(layer, below), { r: 255, g: 255, b: 255, a: 1 });
  };
  const opacityOf = (el) => {
    let value = 1;
    for (let node = el; node; node = node.parentElement) value *= parseFloat(getComputedStyle(node).opacity);
    return value;
  };
  const checkContrast = (el, cssColor, sample) => {
    const style = getComputedStyle(el);
    const background = backgroundOf(el);
    if (!background) return;
    const color = parseColor(cssColor);
    const text = over({ ...color, a: color.a * opacityOf(el) }, background);
    const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(style.fontWeight, 10) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      problems.push(`Contraste ${ratio.toFixed(2)}:1 em «${sample.trim().slice(0, 24)}»: ${describe(el)}`);
    }
  };
  // Uma secção da lição à espera de aparecer: o check-all mede-a com movimento reduzido, em que nunca espera.
  const legible = (el) => !el.closest(".sr-only, .skip-link, [hidden], .is-waiting") && el.checkVisibility({ visibilityProperty: true, opacityProperty: false }) && visible(el);
  const exempt = (el) => el.matches(":disabled:not(.fitch-pick), :disabled *") && !el.closest(".fitch-pick");
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!node.textContent.trim() || el.closest("script, style, noscript, textarea") || !legible(el) || exempt(el)) continue;
    if (getComputedStyle(el).color === "rgba(0, 0, 0, 0)") continue; // espelho do campo de sequente
    checkContrast(el, getComputedStyle(el).color, node.textContent);
  }
  for (const field of document.querySelectorAll("input:not([type=hidden]), textarea")) {
    if (!legible(field) || exempt(field)) continue;
    if (field.value) checkContrast(field, getComputedStyle(field).color, field.value);
    if (field.placeholder) checkContrast(field, getComputedStyle(field, "::placeholder").color, field.placeholder);
  }

  const seen = new Map();
  for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) || 0) + 1);
  for (const [id, n] of seen) if (n > 1) problems.push(`id repetido (${n}×): #${id}`);

  return problems;
}
