// O conteúdo das páginas: as duas ferramentas, os créditos, os dois idiomas e o SEO.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const HUB = "https://computational-logic.miguelrocha.dev";
const PAGES = {
  pt: {
    file: "index.html",
    lang: "pt-PT",
    canonical: `${HUB}/`,
    tools: ["https://sat.computational-logic.miguelrocha.dev/", "https://nd.computational-logic.miguelrocha.dev/"],
    bar: "Plataforma criada por Miguel Rocha · ",
    footer: "Desenvolvido por Miguel Rocha · ",
    other: '<a class="ftr-repo" href="/en" hreflang="en" lang="en">English</a>',
  },
  en: {
    file: "en/index.html",
    lang: "en",
    canonical: `${HUB}/en`,
    tools: ["https://sat.computational-logic.miguelrocha.dev/en", "https://nd.computational-logic.miguelrocha.dev/en"],
    bar: "Platform created by Miguel Rocha · ",
    footer: "Developed by Miguel Rocha · ",
    other: '<a class="ftr-repo" href="/" hreflang="pt" lang="pt">Português</a>',
  },
};
const CREDIT_LINK = '<a href="https://miguelrocha.dev" target="_blank" rel="noopener">miguelrocha.dev</a>';

// As tags da página, sem o texto: PT e EN têm de ter a mesma estrutura.
const structure = (html) => [...html.matchAll(/<\/?([a-z0-9]+)/g)].map((match) => match[1]);

for (const [id, page] of Object.entries(PAGES)) {
  const html = read(page.file);

  test(`${id}: declara o idioma e o canonical da página`, () => {
    assert.match(html, new RegExp(`<html lang="${page.lang}">`));
    assert.ok(html.includes(`<link rel="canonical" href="${page.canonical}">`));
    assert.ok(html.includes(`<meta property="og:url" content="${page.canonical}">`));
  });

  test(`${id}: hreflang para os dois idiomas, com x-default em inglês`, () => {
    assert.ok(html.includes(`<link rel="alternate" hreflang="pt" href="${HUB}/">`));
    assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${HUB}/en">`));
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${HUB}/en">`));
  });

  test(`${id}: tem título, descrição e um só h1`, () => {
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{50,160}">/);
    assert.equal(html.match(/<h1\b/g).length, 1);
  });

  test(`${id}: apresenta as duas ferramentas e liga ao mesmo idioma de cada uma`, () => {
    const cards = [...html.matchAll(/<a class="tool" href="([^"]+)">\s*<h2>([^<]+)<\/h2>\s*<p>[^<]{40,}<\/p>/g)];
    assert.deepEqual(cards.map((card) => card[1]), page.tools);
    assert.deepEqual(cards.map((card) => card[2]), ["Learn Davis-Putnam SAT", "Learn Natural Deduction"]);
  });

  test(`${id}: créditos como no SAT, na barra do topo e no rodapé`, () => {
    const bar = html.slice(html.indexOf('<div class="credits">'), html.indexOf("<main"));
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    assert.ok(bar.includes(page.bar + CREDIT_LINK), "barra");
    assert.ok(footer.includes(page.footer + CREDIT_LINK), "rodapé");
    assert.ok(bar.includes('href="https://github.com/mmroch4"'), "GitHub na barra");
    assert.ok(footer.includes('href="https://github.com/mmroch4/computational-logic"'), "repositório no rodapé");
  });

  test(`${id}: liga à página do outro idioma`, () => {
    assert.ok(html.includes(page.other));
  });
}

test("PT e EN têm a mesma estrutura", () => {
  assert.deepEqual(structure(read(PAGES.en.file)), structure(read(PAGES.pt.file)));
});

test("sem framework nem build: o package.json só tem o script de testes e não há dependências", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys(pkg.scripts), ["test"]);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.license, "MIT");
});

test("sitemap com as duas páginas e robots a apontar para ele", () => {
  const sitemap = read("sitemap.xml");
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), [`${HUB}/`, `${HUB}/en`]);
  assert.ok(read("robots.txt").includes(`Sitemap: ${HUB}/sitemap.xml`));
});

test("a 404 não é indexada e leva ao início nos dois idiomas", () => {
  const html = read("404.html");
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(html.includes('href="/"'));
  assert.ok(html.includes('href="/en"'));
});
