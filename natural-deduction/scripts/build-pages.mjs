// Gera as páginas EN (en/*.html) a partir das páginas PT, escritas à mão, com o texto já traduzido
// pelo en.js: os motores de pesquisa leem o inglês no HTML, sem precisarem de correr JS.
// Nos dois idiomas, gera também o bloco de SEO do <head> (entre <!-- seo --> e <!-- /seo -->), a
// partir dos locales, do config.js e do mapa de rotas, e o rodapé (entre <!-- footer --> e
// <!-- /footer -->). As páginas PT são reescritas só nesses blocos.
// Gera ainda o sitemap.xml e o robots.txt, a partir do mapa de rotas e do SITE_URL.
// O resultado é commitado, como o css/app.css: a Vercel só serve ficheiros.
//
// Uso: npm run build:pages   (o tests/build-pages.test.js falha se o resultado ficar desatualizado)
// Só com Node: as páginas são escritas à mão e com regras simples, que chegam para as percorrer.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LANGS, ROUTES, counterpartPath, pageFromPath, sitemapEntries } from "../js/core/routes.js";
import { APP_NAME, CREDITS_NAME, CREDITS_URL, SITE_URL } from "../js/ui/config.js";
import { HTML_LANG, setLang, t } from "../js/ui/i18n.js";
import { escapeHtml, pageDescription, pageTitle, renderFooter } from "../js/ui/layout.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const read = (file) => readFileSync(join(ROOT, file), "utf8");
const fileOf = (path) => (path === "/" || path === "/en" ? `${path}/index.html` : `${path}.html`).replace(/^\/+/, "");

/** Cada página gerada: { page, source: "provar.html", output: "en/prove.html" }. */
export function pageFiles() {
  return Object.entries(ROUTES).map(([page, { pt, en }]) => ({ page, source: fileOf(pt), output: fileOf(en) }));
}

// Posição do </tag> que fecha a tag aberta antes de `from` (as tags iguais aninhadas contam).
function closingTagIndex(html, tag, from) {
  const pattern = new RegExp(`<(/?)${tag}\\b[^<>]*>`, "g");
  pattern.lastIndex = from;
  let depth = 1;
  for (const match of html.matchAll(pattern)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index;
  }
  throw new Error(`<${tag}> sem fecho depois da posição ${from}`);
}

// Troca o conteúdo de cada elemento com data-i18n (o mesmo que o layout faz no browser).
function translateText(html) {
  const pattern = /<([a-z][a-z0-9-]*)\b[^<>]*\sdata-i18n="([^"]+)"[^<>]*>/g;
  let out = "";
  let last = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    const start = match.index + match[0].length;
    const end = closingTagIndex(html, match[1], start);
    out += html.slice(last, start) + escapeHtml(t(match[2]));
    last = end;
    pattern.lastIndex = end;
  }
  return out + html.slice(last);
}

function setAttribute(tag, name, value) {
  const attribute = new RegExp(`(\\s${name}=")[^"]*"`);
  const escaped = escapeHtml(value);
  if (attribute.test(tag)) return tag.replace(attribute, (_, start) => `${start}${escaped}"`);
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${escaped}"${end}`);
}

// data-i18n-attr="placeholder:chave; aria-label:outra" → os atributos traduzidos.
function translateAttributes(html) {
  return html.replace(/<[a-z][^<>]*\sdata-i18n-attr="([^"]+)"[^<>]*>/g, (tag, pairs) =>
    pairs.split(";").reduce((result, pair) => {
      const [name, key] = pair.split(":").map((part) => part.trim());
      return name && key ? setAttribute(result, name, t(key)) : result;
    }, tag)
  );
}

// Links para as páginas do site passam às rotas EN; o resto (CSS, JS, imagens) fica como está.
function translateLinks(html) {
  return html.replace(/\s(href|action)="(\/[^"]*)"/g, (match, name, url) => {
    const [pathname] = url.split(/[?#]/);
    return pageFromPath(pathname) ? ` ${name}="${counterpartPath(url, "en")}"` : match;
  });
}

const SEO_BLOCK = /<!-- seo [^\n]*-->\n[\s\S]*?<!-- \/seo -->/;
const OG_LOCALE = { pt: "pt_PT", en: "en_GB" };
const OG_IMAGE = { pt: "/og-image.png", en: "/og-image-en.png" };
// A cor da barra do navegador é a da barra de créditos, a primeira coisa no topo da página.
const THEME_COLOR = read("css/src/app.css").match(/--color-surface: (#[0-9a-f]+);/)[1];

// URL público de um caminho do site.
const siteUrl = (path) => `${SITE_URL}${path}`;

// O canonical e o hreflang: a mesma lista em cada idioma, com a própria página incluída.
function routeLinks(paths, lang) {
  return [
    `<link rel="canonical" href="${siteUrl(paths[lang])}">`,
    ...LANGS.map((code) => `<link rel="alternate" hreflang="${code}" href="${siteUrl(paths[code])}">`),
    `<link rel="alternate" hreflang="x-default" href="${siteUrl(paths.en)}">`,
  ];
}

// Campos comuns a todos os dados estruturados. Só factos do site: nada de avaliações nem de contagens.
function schemaBase(type, page, lang) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    url: siteUrl(ROUTES[page][lang]),
    inLanguage: HTML_LANG[lang],
    description: pageDescription(page),
    isAccessibleForFree: true,
    author: { "@type": "Person", name: CREDITS_NAME, url: CREDITS_URL },
  };
}

const webApplication = (page, lang) => ({
  ...schemaBase("WebApplication", page, lang),
  name: t(`meta.${page}.title`),
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
});

const learningResource = (page, lang, fields) => ({
  ...schemaBase("LearningResource", page, lang),
  name: t(`meta.${page}.title`),
  educationalLevel: t("meta.learn.level"),
  teaches: t("meta.learn.teaches").split(" · "),
  ...fields,
});

const STRUCTURED_DATA = {
  home: (lang) => ({ ...schemaBase("WebSite", "home", lang), name: APP_NAME }),
  prove: (lang) => webApplication("prove", lang),
  step: (lang) => webApplication("step", lang),
  learn: (lang) => learningResource("learn", lang, { learningResourceType: "lesson" }),
  exercises: (lang) => learningResource("exercises", lang, { learningResourceType: "exercise" }),
};

/** O JSON-LD de uma página, pronto para o <head> (o "<" escapado impede que o texto feche o <script>). */
function jsonLd(page, lang) {
  const json = JSON.stringify(STRUCTURED_DATA[page](lang)).replaceAll("<", "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

/** O bloco de SEO de uma página em `lang`. A 404 não tem URL próprio: leva noindex e fica sem canonical. */
export function seoBlock(page, lang) {
  setLang(lang, { silent: true });
  const title = escapeHtml(pageTitle(page));
  const description = escapeHtml(pageDescription(page));
  const paths = ROUTES[page];
  const image = siteUrl(OG_IMAGE[lang]);
  const alternateLang = LANGS.find((code) => code !== lang);
  const lines = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    ...(paths ? routeLinks(paths, lang) : ['<meta name="robots" content="noindex">']),
    `<meta name="theme-color" content="${THEME_COLOR}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${escapeHtml(APP_NAME)}">`,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}">`,
    `<meta property="og:locale:alternate" content="${OG_LOCALE[alternateLang]}">`,
    ...(paths ? [`<meta property="og:url" content="${siteUrl(paths[lang])}">`] : []),
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${escapeHtml(t("meta.ogImageAlt"))}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:image" content="${image}">`,
    ...(paths ? [jsonLd(page, lang)] : []),
  ];
  return ["<!-- seo (gerado por scripts/build-pages.mjs) -->", ...lines, "<!-- /seo -->"].join("\n  ");
}

const FOOTER_BLOCK = /<!-- footer [^\n]*-->\n[\s\S]*?<!-- \/footer -->/;

// O rodapé no HTML: links normais para as páginas e para a outra língua, antes de o JS correr.
function footerBlock(page, lang) {
  setLang(lang, { silent: true });
  const footer = renderFooter(page).replace('<footer class="ftr">', '<footer class="ftr" data-layout>');
  return ["<!-- footer (gerado por scripts/build-pages.mjs) -->", footer, "<!-- /footer -->"].join("\n  ");
}

const withSeo = (html, page, lang) =>
  html.replace(SEO_BLOCK, () => seoBlock(page, lang)).replace(FOOTER_BLOCK, () => footerBlock(page, lang));

function translateHead(html, page, source) {
  return withSeo(html, page, "en")
    .replace("<!doctype html>\n", `<!doctype html>\n<!-- Gerado por scripts/build-pages.mjs a partir de ${source}: não editar. -->\n`)
    .replace('<html lang="pt-PT">', '<html lang="en">');
}

/** A versão EN de uma página PT. `page` é o id da página; `source`, o ficheiro de onde veio. */
export function englishPage(html, page, source) {
  setLang("en", { silent: true });
  return translateHead(translateLinks(translateAttributes(translateText(html))), page, source);
}

/** O sitemap: uma entrada por página, cada uma com os alternativos dos dois idiomas e o x-default. */
export function sitemapXml() {
  const link = (hreflang, path) => `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${siteUrl(path)}"/>`;
  const urls = sitemapEntries().map(({ path, alternates }) => [
    "  <url>",
    `    <loc>${siteUrl(path)}</loc>`,
    ...LANGS.map((lang) => link(lang, alternates[lang])),
    link("x-default", alternates.en),
    "  </url>",
  ].join("\n"));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

const robotsTxt = () => `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl("/sitemap.xml")}\n`;

/** Tudo o que o gerador escreve: { output, content }. Não escreve nada. */
export function buildPages() {
  const sources = pageFiles().map(({ page, source, output }) => ({ page, source, output, html: read(source) }));
  return [
    ...sources.map(({ page, source, html }) => ({ output: source, content: withSeo(html, page, "pt") })),
    { output: "404.html", content: withSeo(read("404.html"), "notFound", "pt") },
    ...sources.map(({ page, source, output, html }) => ({ output, content: englishPage(html, page, source) })),
    { output: "sitemap.xml", content: sitemapXml() },
    { output: "robots.txt", content: robotsTxt() },
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const { output, content } of buildPages()) {
    const file = join(ROOT, output);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`gerado: ${output}`);
  }
}
