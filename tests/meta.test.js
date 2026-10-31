// Meta e partilha. O <head> de cada página traz o título, a descrição, o canonical, o hreflang e o Open
// Graph no idioma dela (o que os motores de pesquisa e as pré-visualizações de links leem sem correr JS).
// As imagens, o favicon e o manifest ainda não existem: chegam com a H3, que acrescenta aqui os testes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";
import { setLang } from "../js/ui/i18n.js";
import { APP_NAME, SITE_URL } from "../js/ui/config.js";
import { ROUTES } from "../js/core/routes.js";
import { pageFiles } from "../scripts/build-pages.mjs";
import { pageTitle, pageDescription } from "../js/ui/layout.js";

const PAGES = {
  "index.html": "home",
  "provar.html": "prove",
  "passo-a-passo.html": "step",
  "aprender.html": "learn",
  "exercicios.html": "exercises",
  "404.html": "notFound",
};

// As 10 páginas indexáveis: { file, page, lang }.
const INDEXABLE = pageFiles().flatMap(({ page, source, output }) => [
  { file: source, page, lang: "pt" },
  { file: output, page, lang: "en" },
]);

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const meta = (html, attr, name) =>
  unescape(html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`))?.[1] ?? "");

test("cada página tem lang pt-PT, o título do pageTitle e a sua descrição PT", () => {
  setLang("pt", { silent: true });
  for (const [file, page] of Object.entries(PAGES)) {
    const html = read(file);
    assert.match(html, /<html lang="pt-PT">/, file);
    assert.equal(html.match(/<title>([^<]*)<\/title>/)?.[1], pageTitle(page), file);
    assert.equal(meta(html, "name", "description"), pt.meta[page].description, file);
    assert.equal(meta(html, "name", "description"), pageDescription(page), file);
  }
});

test("títulos com a palavra-chave primeiro e o nome no fim, até 60 caracteres, diferentes entre páginas", () => {
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    const titles = Object.values(PAGES).map((page) => pageTitle(page));
    assert.equal(new Set(titles).size, titles.length);
    for (const title of titles) {
      assert.ok(title.length <= 60, `${title.length}: ${title}`);
      assert.ok(title.endsWith(` · ${APP_NAME}`), title);
    }
  }
  setLang("pt", { silent: true });
});

test("as descrições são diferentes entre páginas e têm 120 a 160 caracteres (a 404 não é indexada)", () => {
  for (const dict of [pt, en]) {
    const texts = Object.values(PAGES).map((page) => dict.meta[page].description);
    assert.equal(new Set(texts).size, texts.length);
    for (const page of Object.values(PAGES).filter((id) => id !== "notFound")) {
      const text = dict.meta[page].description;
      assert.ok(text.length >= 120 && text.length <= 160, `${text.length}: ${text}`);
    }
  }
});

test("pageDescription segue o idioma", () => {
  setLang("en", { silent: true });
  assert.equal(pageDescription("prove"), en.meta.prove.description);
  setLang("pt", { silent: true });
  assert.equal(pageDescription("prove"), pt.meta.prove.description);
});

test("Open Graph completo em todas as páginas PT", () => {
  for (const [file, page] of Object.entries(PAGES)) {
    const html = read(file);
    assert.equal(meta(html, "property", "og:type"), "website", file);
    assert.equal(meta(html, "property", "og:locale"), "pt_PT", file);
    assert.equal(meta(html, "property", "og:title"), pageTitle(page), file);
    assert.equal(meta(html, "property", "og:description"), pt.meta[page].description, file);
    assert.equal(meta(html, "property", "og:image"), `${SITE_URL}/og-image.png`, file);
    assert.equal(meta(html, "property", "og:image:width"), "1200", file);
    assert.equal(meta(html, "property", "og:image:height"), "630", file);
    assert.ok(meta(html, "property", "og:image:alt").length > 0, file);
    assert.equal(meta(html, "name", "twitter:card"), "summary_large_image", file);
  }
});

test("cada página indexável tem canonical limpo e hreflang recíproco, com x-default em EN", () => {
  for (const { file, page, lang } of INDEXABLE) {
    const html = read(file);
    const paths = ROUTES[page];
    const hreflang = Object.fromEntries(
      [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((match) => [match[1], match[2]])
    );
    assert.equal(html.match(/<link rel="canonical" href="([^"]+)">/)?.[1], `${SITE_URL}${paths[lang]}`, file);
    assert.deepEqual(hreflang, {
      pt: `${SITE_URL}${paths.pt}`,
      en: `${SITE_URL}${paths.en}`,
      "x-default": `${SITE_URL}${paths.en}`,
    }, file);
    assert.equal(meta(html, "property", "og:url"), `${SITE_URL}${paths[lang]}`, file);
  }
});

test("a 404 não tem URL próprio: sem canonical, sem hreflang e sem og:url", () => {
  const html = read("404.html");
  assert.doesNotMatch(html, /rel="canonical"|hreflang="[^"]*" href="https|og:url/);
});

test("imagem de partilha, Twitter e theme-color em todas as páginas, com a imagem do idioma", () => {
  const css = read("css/src/app.css");
  for (const { file, lang } of [...INDEXABLE, { file: "404.html", lang: "pt" }]) {
    const html = read(file);
    const image = `${SITE_URL}/${lang === "en" ? "og-image-en.png" : "og-image.png"}`;
    assert.equal(meta(html, "property", "og:image"), image, file);
    assert.equal(meta(html, "name", "twitter:image"), image, file);
    assert.equal(meta(html, "property", "og:site_name"), APP_NAME, file);
    assert.ok(css.includes(`--color-surface: ${meta(html, "name", "theme-color")};`), file);
  }
});

test("só a 404 tem noindex", () => {
  for (const [file, page] of Object.entries(PAGES)) {
    assert.equal(meta(read(file), "name", "robots") === "noindex", page === "notFound", file);
  }
});

test("um só <h1> por página, com a palavra-chave", () => {
  for (const { file } of INDEXABLE) {
    const h1s = read(file).match(/<h1[^>]*>[^<]*/g);
    assert.equal(h1s.length, 1, file);
    assert.match(h1s[0], /dedução natural|natural deduction/i, file);
  }
});

// Todos os valores de um JSON, por qualquer profundidade.
const leaves = (value) => (value && typeof value === "object" ? Object.values(value).flatMap(leaves) : [value]);

test("JSON-LD válido, do tipo certo, com URLs absolutos e sem dados inventados", () => {
  const types = { home: "WebSite", prove: "WebApplication", step: "WebApplication", learn: "LearningResource", exercises: "LearningResource" };
  for (const { file, page, lang } of INDEXABLE) {
    const scripts = [...read(file).matchAll(/<script type="application\/ld\+json">(.*)<\/script>/g)];
    assert.equal(scripts.length, 1, file);
    const data = JSON.parse(scripts[0][1]);
    assert.equal(data["@context"], "https://schema.org", file);
    assert.equal(data["@type"], types[page], file);
    assert.equal(data.url, `${SITE_URL}${ROUTES[page][lang]}`, file);
    assert.equal(data.inLanguage, lang === "en" ? "en" : "pt-PT", file);
    assert.deepEqual(data.author, { "@type": "Person", name: "Miguel Rocha", url: "https://miguelrocha.dev" }, file);
    assert.equal(data.isAccessibleForFree, true, file);
    for (const url of leaves(data).filter((value) => typeof value === "string" && /^(\/|https?:)/.test(value))) {
      assert.ok(URL.canParse(url), `${file}: ${url}`);
    }
    assert.ok(!("aggregateRating" in data || "review" in data || "interactionCount" in data), file);
    assert.doesNotMatch(JSON.stringify(data), /isPartOf/, file);
    if (types[page] === "WebApplication") {
      assert.equal(data.applicationCategory, "EducationalApplication", file);
      assert.deepEqual(data.offers, { "@type": "Offer", price: "0", priceCurrency: "EUR" }, file);
    }
    if (types[page] === "LearningResource") {
      assert.ok(data.educationalLevel && data.teaches.length > 0, file);
    }
  }
  assert.doesNotMatch(read("404.html"), /ld\+json/);
});
