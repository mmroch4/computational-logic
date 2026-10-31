// Mapa de rotas: cada página em cada idioma. O idioma de uma página vem do URL e de mais lado nenhum.
// Módulo puro: recebe e devolve texto; a UI é que lê `location` e navega.

export const LANGS = ["pt", "en"];
export const DEFAULT_LANG = "pt";

/** Caminho limpo de cada página, por idioma (a mesma ordem da navegação). */
export const ROUTES = {
  home: { pt: "/", en: "/en" },
  prove: { pt: "/provar", en: "/en/prove" },
  step: { pt: "/passo-a-passo", en: "/en/step-by-step" },
  learn: { pt: "/aprender", en: "/en/learn" },
  exercises: { pt: "/exercicios", en: "/en/exercises" },
};

/** Caminho limpo da página `page` em `lang`. */
export function pathFor(page, lang) {
  return ROUTES[page][lang];
}

/** Tira o que não distingue páginas: `.html`, `/index` e a barra final ("/en/index.html" → "/en"). */
function cleanPath(pathname) {
  const clean = pathname.replace(/\.html$/, "").replace(/\/index$/, "").replace(/\/+$/, "");
  return clean === "" ? "/" : clean;
}

/** Idioma do caminho: EN em /en e por baixo dele, PT no resto (também nos caminhos que não existem). */
export function langFromPath(pathname) {
  return /^\/en(\.html|\/|$)/.test(pathname) ? "en" : DEFAULT_LANG;
}

/** A página do caminho ("/en/prove" → "prove"), ou null se não for uma das rotas. */
export function pageFromPath(pathname) {
  const clean = cleanPath(pathname);
  for (const [page, paths] of Object.entries(ROUTES)) {
    if (LANGS.some((lang) => paths[lang] === clean)) return page;
  }
  return null;
}

/**
 * A página equivalente em `lang`. Recebe o caminho com a query e o hash e mantém-nos
 * ("/passo-a-passo?s=p&step=2" → "/en/step-by-step?s=p&step=2"). Um caminho que não é uma rota
 * (a 404) leva ao início desse idioma, sem a query e o hash, que eram de outra página.
 */
export function counterpartPath(url, lang) {
  const [, pathname, rest] = url.match(/^([^?#]*)(.*)$/s);
  const page = pageFromPath(pathname);
  return page ? `${pathFor(page, lang)}${rest}` : pathFor("home", lang);
}

/** Lista para o sitemap: uma entrada por caminho, com os caminhos da mesma página nos dois idiomas. */
export function sitemapEntries() {
  return Object.values(ROUTES).flatMap((paths) =>
    LANGS.map((lang) => ({ lang, path: paths[lang], alternates: { ...paths } }))
  );
}
