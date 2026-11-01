// Tradução das strings da interface: t("nav.home"), t("creditsBar.text", { name }).
// O idioma de uma página vem só do URL (js/core/routes.js): nunca do navegador nem do localStorage,
// porque cada idioma tem as suas páginas e os motores de pesquisa têm de ver sempre o mesmo em cada URL.
import { DEFAULT_LANG, LANGS, langFromPath, pathFor } from "../core/routes.js";
import pt from "./locales/pt.js";
import en from "./locales/en.js";

export const LOCALES = { pt, en };
export const SUPPORTED_LANGS = LANGS;

// Valor do atributo lang do <html> para cada idioma.
export const HTML_LANG = { pt: "pt-PT", en: "en" };

let currentLang = DEFAULT_LANG;
const listeners = new Set();

/** Põe o idioma do caminho `pathname` e devolve-o. */
export function initI18n(pathname) {
  setLang(langFromPath(pathname), { silent: true });
  return currentLang;
}

export function getLang() {
  return currentLang;
}

/** Caminho da página `page` no idioma atual. */
export function pagePath(page) {
  return pathFor(page, currentLang);
}

export function setLang(lang, { silent = false } = {}) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  currentLang = lang;
  if (typeof document !== "undefined") document.documentElement.lang = HTML_LANG[lang];
  if (!silent) listeners.forEach((fn) => fn(lang));
}

// Regista uma função chamada sempre que o idioma muda. Devolve a função para cancelar.
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function lookup(locale, key) {
  return key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), locale);
}

// Traduz uma chave. Se faltar no idioma atual usa PT; se faltar em PT devolve a própria chave
// (fica visível no ecrã e é fácil de detetar).
export function t(key, params = {}) {
  let value = lookup(LOCALES[currentLang], key);
  if (value === undefined) value = lookup(LOCALES[DEFAULT_LANG], key);
  if (typeof value === "function") return value(params);
  if (typeof value !== "string") return key;
  return value.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
