// Etiqueta de evento: o mesmo ícone e o mesmo nome em todo o lado (nunca só a cor). As classes estão
// escritas por inteiro para o Tailwind e o CSS as encontrarem.
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";

const EVENTS = {
  unit: { classes: "chip ev-unit", icon: '<path d="M5 12h14M13 6l6 6-6 6"/>' },
  branch: { classes: "chip ev-branch", icon: '<path d="M12 21v-8M12 13c-4 0-6-3-6-8M12 13c4 0 6-3 6-8"/>' },
  conflict: { classes: "chip ev-conflict", icon: '<path d="M6 6l12 12M18 6 6 18"/>' },
  sat: { classes: "chip ev-sat", icon: '<path d="m5 12 5 5 9-10"/>' },
  backtrack: { classes: "chip ev-back", icon: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>' },
  resolution: { classes: "chip ev-res", icon: '<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8M16 8l-8 8"/>' },
};

/**
 * Cor (regra) de um evento do trace: a mesma dos cartões, da árvore e do pseudocódigo.
 * O resolve (eliminação por resolução, só no DP) tem a cor "resolution".
 * O result fica com a cor do resultado (sat verde, insat vermelho); start e limit não têm cor.
 */
export function ruleOf(event) {
  switch (event?.type) {
    case "unit":
    case "branch":
    case "conflict":
    case "sat":
    case "backtrack":
      return event.type;
    case "resolve":
      return "resolution";
    case "result":
      if (event.sat === true) return "sat";
      if (event.sat === false) return "conflict";
      return null;
    default:
      return null;
  }
}

/** Ícone do evento (o mesmo do chip, da legenda e da marca da timeline). */
export function eventIconHtml(rule) {
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${EVENTS[rule].icon}</svg>`;
}

/** Chip de evento; `label` substitui o nome (ex.: «8 · Retrocesso»). */
export function eventChipHtml(rule, label = t(`events.${rule}`)) {
  return `<span class="${EVENTS[rule].classes}">${eventIconHtml(rule)}${escapeHtml(label)}</span>`;
}
