import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { renderCreditsBar, renderHeader, renderTabBar, renderFooter, pageTitle, escapeHtml, NAV_ITEMS } from "../js/ui/layout.js";
import { setLang } from "../js/ui/i18n.js";
import { APP_NAME, CREDITS_URL, CREDITS_GITHUB_URL, REPO_URL, SITE_URL } from "../js/ui/config.js";

test("header tem nome e seletor PT/EN, sem crédito (o crédito do topo é a barra de créditos)", () => {
  setLang("pt", { silent: true });
  const html = renderHeader("solve");
  assert.match(html, new RegExp(`>${APP_NAME}</a>`));
  assert.doesNotMatch(html, /Miguel Rocha|miguelrocha/);
  assert.match(html, /data-lang="pt" aria-pressed="true"/);
  assert.match(html, /data-lang="en" aria-pressed="false"/);
});

test("header usa as classes do redesign: wordmark, nav e PT/EN em segmented pequeno", () => {
  setLang("pt", { silent: true });
  const html = renderHeader("home");
  assert.match(html, /^<header class="hdr"><div class="wrap hdr-in"><a class="wm" /);
  assert.match(html, /<nav class="nav" /);
  assert.match(html, /<div class="seg sm" role="group" aria-label="[^"]+">/);
  assert.doesNotMatch(html, /site-header|site-nav|segmented/);
});

test("barra de créditos no topo com o nome, o link e o GitHub (PT e EN)", () => {
  setLang("pt", { silent: true });
  let html = renderCreditsBar();
  assert.match(html, new RegExp(`Plataforma criada por Miguel Rocha · <a href="${CREDITS_URL}"[^>]*>miguelrocha.dev<svg[^>]*aria-hidden="true">`));
  assert.match(html, new RegExp(`<a class="credits-gh" href="${CREDITS_GITHUB_URL}"[^>]*aria-label="Miguel Rocha no GitHub">`));
  setLang("en", { silent: true });
  html = renderCreditsBar();
  assert.match(html, new RegExp(`Platform created by Miguel Rocha · <a href="${CREDITS_URL}"[^>]*>miguelrocha.dev<svg`));
  assert.match(html, /aria-label="Miguel Rocha on GitHub"/);
  setLang("pt", { silent: true });
});

test("barra de créditos usa a classe do redesign, a mesma em PT e EN", () => {
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    assert.match(renderCreditsBar(), /^<div class="credits"><p>/);
  }
  setLang("pt", { silent: true });
});

test("nav do header marca só a página atual com aria-current", () => {
  setLang("pt", { silent: true });
  const html = renderHeader("step");
  assert.equal(html.match(/aria-current="page"/g).length, 1);
  assert.match(html, /href="\/passo-a-passo" aria-current="page">Passo a passo</);
  for (const label of ["Início", "Resolver", "Passo a passo", "Aprender", "Exercícios"]) {
    assert.ok(html.includes(`>${label}</a>`), label);
  }
});

test("tab bar tem 5 destinos com ícone e rótulo curto 'Passos'", () => {
  setLang("pt", { silent: true });
  const html = renderTabBar("home");
  assert.equal(html.match(/<svg /g).length, NAV_ITEMS.length);
  assert.match(html, /<span>Passos<\/span>/);
  assert.match(html, /href="\/" aria-current="page"/);
});

test("tab bar usa as classes do redesign, com ícones .ic sem cor nem traço escritos à mão", () => {
  setLang("pt", { silent: true });
  const html = renderTabBar("step");
  assert.match(html, /^<nav class="tabbar" aria-label="[^"]+"><ul class/);
  assert.equal(html.match(/<svg class="ic" /g).length, NAV_ITEMS.length);
  assert.doesNotMatch(html, /stroke-width|tab-bar/);
  assert.equal(html.match(/aria-current="page"/g).length, 1);
});

test("footer tem o crédito completo com link", () => {
  setLang("pt", { silent: true });
  const html = renderFooter();
  assert.match(html, new RegExp(`Desenvolvido por Miguel Rocha · <a href="${CREDITS_URL}"[^>]*>miguelrocha.dev</a>`));
});

test("footer liga ao repositório, com o nome no texto e o ícone escondido, nos dois idiomas", () => {
  for (const [lang, text] of [["pt", "Código no GitHub"], ["en", "Source on GitHub"]]) {
    setLang(lang, { silent: true });
    assert.match(
      renderFooter(),
      new RegExp(`<a class="ftr-repo" href="${REPO_URL}" target="_blank" rel="noopener"><svg [^>]*aria-hidden="true">.*</svg>${text}</a>`)
    );
  }
  setLang("pt", { silent: true });
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.repository, REPO_URL);
});

test("footer usa as classes do redesign e lista as 5 páginas", () => {
  setLang("pt", { silent: true });
  const html = renderFooter();
  assert.match(html, /^<footer class="ftr"><div class="wrap ftr-in"><div class="ftr-credits"><p>/);
  assert.equal(html.match(/<li>/g).length, NAV_ITEMS.length);
  assert.doesNotMatch(html, /site-footer/);
});

test("em inglês os textos mudam e os créditos continuam", () => {
  setLang("en", { silent: true });
  assert.match(renderCreditsBar(), /Platform created by Miguel Rocha · <a/);
  assert.match(renderHeader("home"), /data-lang="en" aria-pressed="true"/);
  assert.match(renderFooter(), /Developed by Miguel Rocha · <a/);
  assert.match(renderTabBar("home"), /<span>Steps<\/span>/);
  assert.equal(pageTitle("solve"), `Online SAT solver using DPLL · ${APP_NAME}`);
  setLang("pt", { silent: true });
});

test("o nome e o URL do site são os definitivos, e o URL não acaba em barra", () => {
  assert.equal(APP_NAME, "Learn Davis-Putnam SAT");
  assert.equal(SITE_URL, "https://sat.computational-logic.miguelrocha.dev");
});

test("404 não marca nenhum link e tem título próprio", () => {
  setLang("pt", { silent: true });
  assert.doesNotMatch(renderHeader("notFound"), /aria-current/);
  assert.equal(pageTitle("notFound"), `Página não encontrada · ${APP_NAME}`);
});

test("as classes antigas do shell já não existem no CSS, no JS nem no HTML", () => {
  const files = [
    ...readdirSync(".").filter((name) => name.endsWith(".html")),
    ...["js/ui", "js/pages"].flatMap((dir) => readdirSync(dir).filter((n) => n.endsWith(".js")).map((n) => `${dir}/${n}`)),
    "css/src/app.css", "scripts/check-edge.sh",
  ];
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /(?<!--)credits-bar|site-header|site-nav|site-footer|tab-bar|\.container\b|class="container/, file);
  }
});

test("escapeHtml escapa os caracteres especiais", () => {
  assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

test("o footer liga à mesma página na outra língua; na 404, ao início", () => {
  setLang("pt", { silent: true });
  assert.match(renderFooter("solve"), /href="\/en\/solver" hreflang="en" lang="en" data-lang="en">English</);
  assert.match(renderFooter("notFound"), /href="\/en" hreflang="en"/);
  setLang("en", { silent: true });
  assert.match(renderFooter("solve"), /href="\/resolver" hreflang="pt" lang="pt" data-lang="pt">Português</);
  setLang("pt", { silent: true });
});
