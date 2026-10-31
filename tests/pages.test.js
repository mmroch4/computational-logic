import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";
import { NAV_ITEMS } from "../js/ui/layout.js";
import { pathFor } from "../js/core/routes.js";

const PAGES = {
  "index.html": "home",
  "provar.html": "prove",
  "passo-a-passo.html": "step",
  "aprender.html": "learn",
  "exercicios.html": "exercises",
  "404.html": "notFound",
};

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const lookup = (dict, key) => key.split(".").reduce((node, part) => node?.[part], dict);

// Todas as chaves usadas no HTML (data-i18n="k" e data-i18n-attr="attr:k; attr2:k2").
function keysIn(html) {
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  for (const [, list] of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of list.split(";")) keys.push(pair.split(":")[1].trim());
  }
  return keys;
}

test("as 6 páginas existem com data-page, <main id=main> e o seu entry JS", () => {
  for (const [file, page] of Object.entries(PAGES)) {
    const html = read(file);
    assert.match(html, new RegExp(`<body data-page="${page}">`), file);
    assert.match(html, /<main id="main"/, file);
    const entry = html.match(/<script type="module" src="\/(js\/pages\/[^"]+)"/)?.[1];
    assert.ok(entry && existsSync(new URL(`../${entry}`, import.meta.url)), `${file}: entry ${entry}`);
    assert.deepEqual([...html.matchAll(/href="(\/css\/[^"]+)"/g)].map((m) => m[1]), ["/css/app.css"], file);
  }
});

test("cada entry monta o layout, que traz a barra de créditos, o cabeçalho e o rodapé", () => {
  for (const file of readdirSync(new URL("../js/pages/", import.meta.url))) {
    assert.match(read(`js/pages/${file}`), /mountLayout\(\)/, file);
  }
});

test("as 5 páginas têm estado vazio, com o texto próprio de cada uma", () => {
  for (const [file, page] of Object.entries(PAGES)) {
    if (page === "notFound") continue;
    const html = read(file);
    assert.match(html, /<div class="empty-state">/, file);
    assert.ok(html.includes(`data-i18n="${page}.empty"`), file);
  }
  const texts = Object.values(PAGES).filter((page) => page !== "notFound").map((page) => pt[page].empty);
  assert.equal(new Set(texts).size, texts.length);
});

test("a 404 tem as saídas para o início e para o editor", () => {
  const html = read("404.html");
  assert.match(html, /data-route="home"/);
  assert.match(html, /data-route="prove"/);
});

test("todas as chaves i18n usadas no HTML existem em PT e EN", () => {
  for (const file of Object.keys(PAGES)) {
    const keys = keysIn(read(file));
    assert.ok(keys.length > 0, file);
    for (const key of keys) {
      assert.equal(typeof lookup(pt, key), "string", `${file}: pt ${key}`);
      assert.equal(typeof lookup(en, key), "string", `${file}: en ${key}`);
    }
  }
});

test("o texto de fallback no HTML é igual ao PT (sem JS a página lê-se em PT)", () => {
  for (const file of Object.keys(PAGES)) {
    for (const [, key, text] of read(file).matchAll(/data-i18n="([^"]+)">([^<]*)</g)) {
      assert.equal(text, lookup(pt, key), `${file}: ${key}`);
    }
  }
});

test("hrefs da nav apontam para ficheiros que existem", () => {
  for (const item of NAV_ITEMS) {
    const path = pathFor(item.id, "pt");
    const file = path === "/" ? "index.html" : `${path.slice(1)}.html`;
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), path);
  }
});

test("vercel.json: cleanUrls, sem barra final e cache para /css e /js", () => {
  const config = JSON.parse(read("vercel.json"));
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
  const sources = config.headers.map((h) => h.source);
  assert.ok(sources.some((s) => s.startsWith("/css/")));
  assert.ok(sources.some((s) => s.startsWith("/js/")));
});

test("a transição entre páginas espera pelo JS da própria página", () => {
  for (const page of readdirSync(".").filter((name) => name.endsWith(".html"))) {
    const html = readFileSync(page, "utf8");
    const entry = html.match(/<script type="module" src="([^"]+)"/)[1];
    const boot = html.indexOf(`<script src="/js/boot.js" data-entry="${entry}"></script>`);
    assert.ok(boot > -1, `${page}: o boot.js tem de saber o JS da página`);
    assert.ok(boot < html.indexOf('<script type="module"'), `${page}: o listener tem de vir antes do primeiro desenho`);
    assert.ok(boot > html.indexOf('rel="preload" as="style"'), `${page}: o boot.js procura o preload das fontes`);
    assert.ok(boot < html.indexOf('rel="stylesheet" href="/css/app.css"'), `${page}: o boot.js corre antes da folha de estilos`);
  }
});
