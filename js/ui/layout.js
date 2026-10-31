// Layout comum a todas as páginas: barra de créditos no topo ("Plataforma criada por Miguel Rocha ·
// miguelrocha.dev"), header (nome, nav, PT/EN),
// tab bar inferior no mobile e footer ("Desenvolvido por Miguel Rocha · miguelrocha.dev").
//
// As funções render*() são puras (devolvem HTML em texto) para poderem ser testadas em node.
// mountLayout() é a única parte que mexe no DOM. Cada página HTML tem:
//   <body data-page="prove"> … <main id="main"> … </main> … <script type="module" src="/js/pages/…">
// e o entry da página chama mountLayout({ page: "prove" }) (ou sem argumento: lê data-page).
import { APP_NAME, CREDITS_NAME, CREDITS_URL, CREDITS_LABEL, CREDITS_GITHUB_URL, REPO_URL } from "./config.js";
import { t, initI18n, getLang, pagePath, SUPPORTED_LANGS, LOCALES } from "./i18n.js";
import { ROUTES, counterpartPath, pathFor } from "../core/routes.js";
import { storage } from "./storage.js";
import { installSegKeys } from "./segmented.js";
import { loadAnalytics } from "./analytics.js";

// Marca do GitHub (16×16, preenchida com a cor do texto), para a barra de créditos e o link do rodapé.
const GITHUB_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 ' +
  "0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 " +
  "1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 " +
  ".67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 " +
  "0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z\"/></svg>";

// Ícones da tab bar (24×24; cor e traço vêm da classe .ic).
const ICONS = {
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  prove: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  step: '<path d="M7 5.5v13l11-6.5z"/>',
  learn: '<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  exercises: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>',
};

// Destinos da navegação, por ordem. "short" é o rótulo da tab bar (opcional).
export const NAV_ITEMS = [
  { id: "home", label: "nav.home" },
  { id: "prove", label: "nav.prove" },
  { id: "step", label: "nav.step", short: "nav.stepShort" },
  { id: "learn", label: "nav.learn" },
  { id: "exercises", label: "nav.exercises" },
];

export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function currentAttr(item, page) {
  return item.id === page ? ' aria-current="page"' : "";
}

function icon(id) {
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[id]}</svg>`;
}

function langSwitch(lang) {
  const buttons = SUPPORTED_LANGS.map((code) => {
    const pressed = code === lang ? "true" : "false";
    return (
      `<button type="button" class="h-7" data-lang="${code}" aria-pressed="${pressed}" ` +
      `lang="${code}" title="${escapeHtml(LOCALES[code].meta.langName)}">${code.toUpperCase()}</button>`
    );
  }).join("");
  return `<div class="seg sm" role="group" aria-label="${escapeHtml(t("header.langLabel"))}">${buttons}</div>`;
}

// Seta de link externo (12×12, traço com a cor do texto), a seguir ao domínio na barra de créditos.
const EXTERNAL_ICON =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 8.5l5-5M4.5 3.5h4v4"/></svg>';

// Barra a tinta por cima do header com o crédito ao criador. Sai com o scroll (o header é que fica fixo).
// O link do site fica sem classe, no meio da frase; o do GitHub é um alvo à parte (ver .credits-gh).
export function renderCreditsBar() {
  return (
    `<div class="credits"><p>${escapeHtml(t("creditsBar.text", { name: CREDITS_NAME }))} · ` +
    `<a href="${CREDITS_URL}" target="_blank" rel="noopener">${CREDITS_LABEL}${EXTERNAL_ICON}</a></p>` +
    `<a class="credits-gh" href="${CREDITS_GITHUB_URL}" target="_blank" rel="noopener" ` +
    `aria-label="${escapeHtml(t("creditsBar.github", { name: CREDITS_NAME }))}">${GITHUB_ICON}</a></div>`
  );
}

export function renderHeader(page, lang = getLang()) {
  const links = NAV_ITEMS.map(
    (item) => `<li><a href="${pagePath(item.id)}"${currentAttr(item, page)}>${escapeHtml(t(item.label))}</a></li>`
  ).join("");
  return (
    '<header class="hdr"><div class="wrap hdr-in">' +
    `<a class="wm" href="${pagePath("home")}" aria-label="${escapeHtml(t("header.homeLink", { app: APP_NAME }))}">` +
    `${escapeHtml(APP_NAME)}</a>` +
    `<nav class="nav" aria-label="${escapeHtml(t("nav.label"))}"><ul class="flex gap-6 list-none p-0 m-0">${links}</ul></nav>` +
    langSwitch(lang) +
    "</div></header>"
  );
}

export function renderTabBar(page) {
  const links = NAV_ITEMS.map(
    (item) =>
      `<li class="min-w-0 flex-1"><a href="${pagePath(item.id)}"${currentAttr(item, page)}>` +
      `${icon(item.id)}<span>${escapeHtml(t(item.short ?? item.label))}</span></a></li>`
  ).join("");
  return `<nav class="tabbar" aria-label="${escapeHtml(t("nav.label"))}"><ul class="flex list-none p-0 m-0">${links}</ul></nav>`;
}

// O link para a mesma página na outra língua (na 404, o início). É um <a> para os motores de pesquisa
// o seguirem; ao clicar, o switchLang leva também o estado que está no URL.
function otherLangLink(page) {
  const lang = SUPPORTED_LANGS.find((code) => code !== getLang());
  const href = pathFor(ROUTES[page] ? page : "home", lang);
  return `<a class="ftr-repo" href="${href}" hreflang="${lang}" lang="${lang}" data-lang="${lang}">${escapeHtml(LOCALES[lang].meta.langName)}</a>`;
}

export function renderFooter(page) {
  const links = NAV_ITEMS.map(
    (item) => `<li><a href="${pagePath(item.id)}">${escapeHtml(t(item.label))}</a></li>`
  ).join("");
  return (
    '<footer class="ftr"><div class="wrap ftr-in">' +
    '<div class="ftr-credits">' +
    `<p>${escapeHtml(t("footer.credit", { name: CREDITS_NAME }))} · ` +
    `<a href="${CREDITS_URL}" target="_blank" rel="noopener">${CREDITS_LABEL}</a></p>` +
    `<a class="ftr-repo" href="${REPO_URL}" target="_blank" rel="noopener">${GITHUB_ICON}${escapeHtml(t("footer.repo"))}</a>` +
    otherLangLink(page) +
    "</div>" +
    `<nav aria-label="${escapeHtml(t("footer.pagesLabel"))}"><ul class="flex gap-[18px] list-none p-0 m-0">${links}</ul></nav>` +
    "</div></footer>"
  );
}

// Título da página no idioma atual: a palavra-chave primeiro e o nome no fim.
export function pageTitle(page) {
  return `${t(`meta.${page}.title`)} · ${APP_NAME}`;
}

// Descrição da página (meta description e Open Graph), no idioma atual.
export function pageDescription(page) {
  return t(`meta.${page}.description`);
}

// O HTML já traz o título e a descrição no idioma da página (é o que os motores de pesquisa e as
// pré-visualizações de links leem, sem correr JS), menos na 404, que é uma só para os dois idiomas.
function updateHeadMeta(page) {
  const title = pageTitle(page);
  const description = pageDescription(page);
  document.title = title;
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
    document.querySelector(selector)?.setAttribute("content", description);
  }
}

// Traduz o texto próprio da página escrito no HTML:
//   <h1 data-i18n="home.title">…</h1>              → textContent
//   <input data-i18n-attr="placeholder:home.sequentPlaceholder">  → atributos ("attr:chave; attr2:chave2")
// O texto já vem traduzido no HTML (as páginas EN são geradas, a 404 é só uma).
function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map((part) => part.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
  // A 404 é uma só para os dois idiomas: os links dela vão para as páginas do idioma do caminho pedido.
  root.querySelectorAll("[data-route]").forEach((el) => el.setAttribute("href", pagePath(el.dataset.route)));
}

// Insere (ou volta a inserir) header, tab bar e footer à volta do <main>. O footer que vem no HTML
// (gerado pelo build:pages, para os links serem vistos sem JS) também tem data-layout e é substituído.
function renderInto(page) {
  const main = document.querySelector("main");
  document.querySelectorAll("[data-layout]").forEach((node) => node.remove());

  const skip = `<a class="skip-link" href="#main" data-layout>${escapeHtml(t("layout.skipToContent"))}</a>`;
  const before = skip + renderCreditsBar() + renderHeader(page);
  const after = renderFooter(page) + renderTabBar(page);

  const anchor = main ?? document.body.firstChild;
  const wrap = (html) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    [...template.content.children].forEach((el) => el.setAttribute("data-layout", ""));
    return template.content;
  };
  document.body.insertBefore(wrap(before), anchor);
  if (main) main.after(wrap(after));
  else document.body.append(wrap(after));

  updateHeadMeta(page);
  applyTranslations(main ?? document);

  document.querySelectorAll(".hdr [data-lang], .ftr [data-lang]").forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
      switchLang(control.dataset.lang);
    });
  });
}

// Mudar de idioma é ir para a mesma página no outro idioma: o estado está na query e no hash, que a
// página mantém em dia. A preferência guardada fica para o que não tem URL.
function switchLang(lang) {
  if (lang === getLang()) return;
  storage.setPrefs({ lang });
  const { pathname, search, hash } = location;
  location.assign(counterpartPath(`${pathname}${search}${hash}`, lang));
}

// Ponto de entrada usado por todas as páginas. Devolve o idioma inicial.
export function mountLayout({ page = document.body.dataset.page ?? "home" } = {}) {
  const lang = initI18n(location.pathname);
  renderInto(page);
  installSegKeys();
  loadAnalytics();
  return lang;
}
