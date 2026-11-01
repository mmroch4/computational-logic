// As páginas EN são geradas e commitadas (a Vercel não compila nada), por isso têm de estar sempre em
// dia com as páginas PT e com o en.js. Se falhar, corre `npm run build:pages`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, buildPages, englishPage, pageFiles, sitemapXml } from "../scripts/build-pages.mjs";
import { ROUTES } from "../js/core/routes.js";
import { SITE_URL } from "../js/ui/config.js";
import { LOCALES, setLang } from "../js/ui/i18n.js";
import { pageTitle } from "../js/ui/layout.js";

const read = (file) => readFileSync(join(ROOT, file), "utf8");
const mainOf = (html) => html.match(/<main[\s\S]*<\/main>/)[0];

test("o que está commitado é o que o gerador produz", () => {
  for (const { output, content } of buildPages()) assert.equal(read(output), content, output);
});

test("gerar a partir do resultado não muda nada", () => {
  for (const { page, source, output } of pageFiles()) {
    const once = read(output);
    const twice = englishPage(once.replace(/<!-- Gerado[^\n]*\n/, ""), page, source);
    assert.equal(twice, once, output);
  }
});

test("uma página EN desatualizada é detetada: a saída muda quando a fonte PT muda", () => {
  const { page, source, output } = pageFiles()[1];
  const changed = englishPage(read(source).replace('<main id="main"', '<main id="main" data-x="1"'), page, source);
  assert.notEqual(changed, read(output));
});

test("há uma página EN por rota, com lang, título e imagem em inglês", () => {
  assert.deepEqual(pageFiles().map((file) => file.output), [
    "en/index.html", "en/prove.html", "en/step-by-step.html", "en/learn.html", "en/exercises.html",
  ]);
  for (const { page, output } of pageFiles()) {
    const html = read(output);
    setLang("en", { silent: true });
    assert.match(html, /<html lang="en">/, output);
    assert.ok(html.includes(`<title>${pageTitle(page)}</title>`), output);
    assert.match(html, /<meta property="og:locale" content="en_GB">/, output);
    assert.match(html, /<meta property="og:locale:alternate" content="pt_PT">/, output);
    assert.match(html, /<meta property="og:image" content="https:\/\/[^"]*\/og-image-en.png">/, output);
    assert.ok(html.includes(LOCALES.en.meta[page].description), output);
  }
  setLang("pt", { silent: true });
});

test("o texto EN está no HTML e o que não é uma página fica como está", () => {
  for (const { page, output } of pageFiles()) {
    const html = read(output);
    assert.ok(html.includes(LOCALES.en[page].title), output);
    if (!["exercises", "learn", "home"].includes(page)) assert.ok(html.includes(LOCALES.en[page].empty), output);
    assert.match(html, /href="\/css\/app.css"/, output);
    assert.match(html, /src="\/js\/pages\/[a-z0-9-]+\.js"/, output);
  }
});

test("os links para páginas passam às rotas EN, com a query e o hash", () => {
  const html = '<!doctype html>\n<html lang="pt-PT">\n<body><a href="/passo-a-passo?s=p#x">a</a><form action="/provar"></form><a href="/css/app.css">b</a></body></html>';
  const out = englishPage(html, "learn", "aprender.html");
  assert.match(out, /href="\/en\/step-by-step\?s=p#x"/);
  assert.match(out, /action="\/en\/prove"/);
  assert.match(out, /href="\/css\/app.css"/);
  setLang("pt", { silent: true });
});

test("nenhum elemento traduzível ficou com o texto do PT", () => {
  const leaf = /<[a-z][a-z0-9-]*\b[^<>]*\sdata-i18n="([^"]+)"[^<>]*>([^<]*)</g;
  const lookup = (locale, key) => key.split(".").reduce((node, part) => node[part], locale);
  for (const { source, output } of pageFiles()) {
    const pt = [...read(source).matchAll(leaf)];
    const en = [...read(output).matchAll(leaf)];
    assert.ok(pt.length > 0, source);
    assert.equal(en.length, pt.length, output);
    for (const [, key, text] of en) {
      const changed = lookup(LOCALES.pt, key) !== lookup(LOCALES.en, key);
      if (changed) assert.notEqual(text, lookup(LOCALES.pt, key), `${output}: ${key}`);
    }
  }
});

test("o <main> das páginas EN não tem palavras do PT fora dos locales", () => {
  const portuguese = /(?<![\p{L}])(não|são|dedução|prova|Provar|Passo a passo|Aprender|Exercícios|Início)(?![\p{L}])/iu;
  for (const { output } of pageFiles()) {
    const text = mainOf(read(output)).replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(text, portuguese, output);
  }
});

test("a página gerada diz de onde veio e traduz o conteúdo", () => {
  const html = '<!doctype html>\n<html lang="pt-PT">\n<head><title>x</title></head><body><p data-i18n="learn.lead">pt</p></body></html>';
  const out = englishPage(html, "learn", "aprender.html");
  assert.doesNotMatch(out, />pt</);
  assert.match(out, /<!-- Gerado por scripts\/build-pages.mjs a partir de aprender.html/);
  setLang("pt", { silent: true });
});

test("a 404 fica de fora do gerador e os links dela seguem o idioma do caminho", () => {
  assert.ok(!pageFiles().some((file) => file.source === "404.html"));
  const html = read("404.html");
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /href="\/" data-route="home"/);
  assert.match(html, /href="\/provar" data-route="prove"/);
});

test("sitemap: as 10 páginas, sem a 404 nem query strings, com os alternativos recíprocos", () => {
  const xml = sitemapXml();
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => ({
    loc: body.match(/<loc>([^<]*)<\/loc>/)[1],
    links: Object.fromEntries([...body.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]])),
  }));
  const expected = Object.values(ROUTES).flatMap(({ pt, en }) => [pt, en]).map((path) => `${SITE_URL}${path}`);
  assert.deepEqual(urls.map((url) => url.loc), expected);
  assert.doesNotMatch(xml, /404|<loc>[^<]*\?/);
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  for (const { loc, links } of urls) {
    assert.deepEqual(Object.keys(links), ["pt", "en", "x-default"], loc);
    assert.ok([links.pt, links.en].includes(loc), loc);
    assert.equal(links["x-default"], links.en, loc);
    for (const lang of ["pt", "en"]) {
      const other = urls.find((url) => url.loc === links[lang]);
      assert.deepEqual(other.links, links, loc);
    }
  }
});

test("robots.txt permite tudo e aponta para o sitemap absoluto", () => {
  assert.equal(read("robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

test("no HTML, sem JS, há links para as 5 páginas do idioma e para a mesma página na outra língua", () => {
  for (const { page, source, output } of pageFiles()) {
    for (const [file, lang, other] of [[source, "pt", "en"], [output, "en", "pt"]]) {
      const footer = read(file).match(/<footer class="ftr" data-layout>[\s\S]*<\/footer>/)[0];
      for (const paths of Object.values(ROUTES)) assert.ok(footer.includes(`href="${paths[lang]}"`), `${file}: ${paths[lang]}`);
      assert.ok(footer.includes(`href="${ROUTES[page][other]}" hreflang="${other}"`), file);
      assert.match(footer, /miguelrocha\.dev/, file);
      const home = lang === "en" ? "/en" : "/";
      for (const site of ["https://computational-logic.miguelrocha.dev", "https://sat.computational-logic.miguelrocha.dev"]) assert.ok(footer.includes(`href="${site}${home}"`), `${file}: ${site}`);
    }
  }
});
