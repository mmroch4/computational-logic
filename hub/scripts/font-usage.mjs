// Fontes usadas na página, medidas pelo check-page.mjs com MEASURE=1 (depois do EVAL).
// Devolve { used, loaded }:
// - used: as combinações "família peso" pedidas pelo texto do DOM (todos os elementos com texto
//   próprio, mesmo escondidos, para apanhar também as vistas que ainda não estão abertas);
// - loaded: as faces que o browser chegou a descarregar (document.fonts com status "loaded").
// Serve para escolher os pesos do pedido ao Google Fonts (M8.5b): um peso que nunca aparece em
// "used" é peso morto; um peso usado que não é pedido fica sintetizado (negrito falso).
//
// A função é serializada com toString() e corre no browser: não pode usar nada de fora dela.
export function fontUsage() {
  const used = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ownText) continue;
    const style = getComputedStyle(el);
    const family = style.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
    used.add(`${family} ${style.fontWeight}${style.fontStyle === "normal" ? "" : ` ${style.fontStyle}`}`);
  }
  const loaded = new Set();
  for (const face of document.fonts) {
    if (face.status === "loaded") loaded.add(`${face.family.replace(/^["']|["']$/g, "")} ${face.weight}`);
  }
  return { used: [...used].sort(), loaded: [...loaded].sort() };
}
