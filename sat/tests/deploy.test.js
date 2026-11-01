// M8.7: preparação do deploy na Vercel. Valida o vercel.json e o .vercelignore e faz um smoke test
// com o scripts/serve.mjs, que imita a Vercel (cleanUrls, trailingSlash, headers, 404 e o que fica
// de fora do deploy): todas as páginas e todos os links internos têm de responder.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";

import { ROUTES } from "../js/core/routes.js";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

const PAGES = ["index", "resolver", "passo-a-passo", "aprender", "exercicios", "404"];
const EN_PAGES = ["en/index", "en/solver", "en/step-by-step", "en/learn", "en/exercises"];
const config = JSON.parse(read("vercel.json"));
const ignored = read(".vercelignore")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

// Ficheiros .js dentro de js/ (recursivo), como caminhos do site ("/js/ui/layout.js").
function jsFiles(dir = "js") {
  return readdirSync(new URL(dir, root)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(new URL(path, root)).isDirectory() ? jsFiles(path) : path.endsWith(".js") ? [`/${path}`] : [];
  });
}

// Caminhos internos que as páginas pedem ou para onde levam: href/src absolutos dos HTML e as rotas
// nos dois idiomas, que o JS monta (nav, «Ver passo a passo», voltar aos exercícios).
function internalUrls() {
  const urls = new Set();
  for (const page of [...PAGES, ...EN_PAGES]) {
    for (const [, url] of read(`${page}.html`).matchAll(/(?:href|src|content)="(\/(?!\/)[^"]*)"/g)) {
      urls.add(url.replace(/&amp;/g, "&"));
    }
  }
  for (const paths of Object.values(ROUTES)) for (const path of Object.values(paths)) urls.add(path);
  return [...urls];
}

let server;
let base;

before(async () => {
  server = spawn(process.execPath, ["scripts/serve.mjs", "0"], {
    cwd: new URL(".", root),
    stdio: ["ignore", "pipe", "inherit"],
  });
  base = await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/localhost:(\d+)\//);
      if (match) resolve(`http://localhost:${match[1]}`);
    });
  });
});

after(() => server?.kill());

const get = (path, options = {}) => fetch(base + path, { redirect: "manual", ...options });

test("vercel.json: só opções de um site estático sem build, com cleanUrls ligado", () => {
  assert.deepEqual(Object.keys(config).sort(), ["cleanUrls", "framework", "headers", "installCommand", "redirects", "trailingSlash"]);
  assert.equal(config.framework, null);
  assert.equal(config.installCommand, "");
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
  for (const rule of config.headers) {
    assert.match(rule.source, /^\//);
    for (const header of rule.headers) {
      assert.equal(typeof header.key, "string");
      assert.equal(typeof header.value, "string");
    }
  }
});

test("headers de segurança em todas as respostas, incluindo a 404", async () => {
  for (const path of ["/", "/en/solver", "/css/app.css", "/og-image.png", "/nao-existe"]) {
    const { headers } = await get(path);
    assert.equal(headers.get("x-content-type-options"), "nosniff", path);
    assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin", path);
    assert.match(headers.get("permissions-policy"), /camera=\(\)/, path);
    assert.equal(headers.get("x-frame-options"), "SAMEORIGIN", path);
    assert.match(headers.get("content-security-policy"), /frame-ancestors 'self'/, path);
  }
});

test("CSP: scripts só do próprio site, e as páginas não têm script inline nem atributos on*", () => {
  const rule = config.headers.flatMap((r) => r.headers).find((h) => h.key === "Content-Security-Policy");
  const directives = Object.fromEntries(rule.value.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));
  assert.deepEqual(directives["script-src"], ["'self'"]);
  assert.deepEqual(directives["default-src"], ["'self'"]);
  assert.ok(directives["style-src"].includes("https://fonts.googleapis.com"));
  assert.deepEqual(directives["font-src"], ["https://fonts.gstatic.com"]);
  for (const page of [...PAGES, ...EN_PAGES]) {
    const html = read(`${page}.html`);
    for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
      assert.match(tag, /\ssrc="\/|type="application\/ld\+json"/, `${page}: ${tag}`);
    }
    assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ""), /<[a-z][^>]*\son[a-z]+=/, `${page}: atributo on*`);
  }
});

test("redirecionamentos 308 de /index e /en/index, sem perder a query", async () => {
  for (const [from, to] of [["/index", "/"], ["/en/index", "/en"], ["/index?f=p", "/?f=p"]]) {
    const response = await get(from);
    assert.equal(response.status, 308, from);
    assert.equal(response.headers.get("location"), to, from);
  }
});

test("Cache-Control: revalida o que muda sem mudar de nome; as imagens têm uma cache curta", async () => {
  for (const path of ["/", "/en/learn", "/css/app.css", "/js/vendor/motion-mini.js", "/js/boot.js", "/sitemap.xml"]) {
    assert.equal((await get(path)).headers.get("cache-control"), "public, max-age=0, must-revalidate", path);
  }
  for (const path of ["/og-image.png", "/favicon.svg"]) {
    assert.equal((await get(path)).headers.get("cache-control"), "public, max-age=86400", path);
  }
});

test("Content-Type do manifest, do sitemap e do robots", async () => {
  const types = { "/site.webmanifest": "application/manifest+json", "/sitemap.xml": "application/xml; charset=utf-8", "/robots.txt": "text/plain; charset=utf-8" };
  for (const [path, type] of Object.entries(types)) {
    assert.equal((await get(path)).headers.get("content-type"), type, path);
  }
});

test(".vercelignore: cada entrada existe e nada do que o site usa fica de fora", () => {
  for (const entry of ignored) {
    assert.match(entry, /^\/[^*]+[^/*]$/, `um caminho a partir da raiz, sem padrões: ${entry}`);
    // Estes não vêm num clone: o node_modules só existe depois do npm install, e o tmp é das verificações.
    if (["/node_modules", "/tmp"].includes(entry)) continue;
    assert.ok(existsSync(new URL(entry.slice(1), root)), `${entry} não existe (gralha?)`);
  }
  const used = new Set(internalUrls().map((url) => url.split("?")[0]));
  for (const name of ["/css", "/js", "/vercel.json", ...[...PAGES, ...EN_PAGES].map((page) => `/${page}.html`)]) used.add(name);
  for (const entry of ignored) {
    assert.ok(![...used].some((url) => url === entry || url.startsWith(`${entry}/`)), `${entry} é usado pelo site`);
  }
});

test(".vercelignore: para a Vercel só vão as páginas, o CSS compilado, o JS, as imagens e os ficheiros de SEO", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: new URL(".", root), encoding: "utf8" }).trim().split("\n");
  const deployed = tracked.filter((file) => !ignored.some((entry) => `/${file}` === entry || `/${file}`.startsWith(`${entry}/`)));
  const isSite = (file) =>
    /^[a-z0-9-]+\.html$/.test(file) || /^en\/[a-z-]+\.html$/.test(file) || file === "css/app.css" || /^js\/.+\.js$/.test(file);
  const extras = ["apple-touch-icon.png", "favicon.svg", "og-image-en.png", "og-image.png", "robots.txt", "site.webmanifest", "sitemap.xml", "vercel.json"];
  assert.deepEqual(deployed.filter((file) => !isSite(file)).sort(), extras);
  for (const page of [...PAGES, ...EN_PAGES]) assert.ok(deployed.includes(`${page}.html`), page);
});

test("cleanUrls: cada página responde no caminho limpo com o seu HTML", async () => {
  for (const page of PAGES) {
    const path = page === "index" ? "/" : `/${page}`;
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /^text\/html/, path);
    assert.equal(await response.text(), read(`${page}.html`), path);
  }
  for (const page of EN_PAGES) {
    const path = page.replace(/\/index$/, "");
    const response = await get(`/${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), read(`${page}.html`), path);
  }
});

test("cleanUrls: .html e a barra final redirecionam (308) e o ?f=… do link partilhado sobrevive", async () => {
  const cases = [
    ["/resolver.html?f=p1%2C%20-p1&a=dll", "/resolver?f=p1%2C%20-p1&a=dll"],
    ["/passo-a-passo.html?f=p&step=2&view=tree", "/passo-a-passo?f=p&step=2&view=tree"],
    ["/index.html", "/"],
    ["/en/index.html", "/en"],
    ["/en/", "/en"],
    ["/en/solver.html?f=p", "/en/solver?f=p"],
    ["/aprender/", "/aprender"],
  ];
  for (const [from, to] of cases) {
    const response = await get(from);
    assert.equal(response.status, 308, from);
    assert.equal(response.headers.get("location"), to, from);
  }
});

test("todos os links e recursos internos das páginas e do JS chegam a uma resposta 200", async () => {
  const urls = internalUrls();
  assert.ok(urls.length > 20, "encontrou os links");
  for (const url of urls) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200, url);
  }
});

test("todos os módulos JS são servidos como JavaScript e com o Cache-Control do vercel.json", async () => {
  for (const file of jsFiles()) {
    const response = await get(file, { method: "HEAD" });
    assert.equal(response.status, 200, file);
    assert.match(response.headers.get("content-type"), /^text\/javascript/, file);
    assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate", file);
  }
  const css = await get("/css/app.css", { method: "HEAD" });
  assert.equal(css.headers.get("cache-control"), "public, max-age=0, must-revalidate");
});

test("404: caminhos que não existem e o que fica fora do deploy mostram a 404.html", async () => {
  const hidden = ["/README.md", "/css/src/app.css", "/package-lock.json", "/node_modules/tailwindcss/package.json", "/LICENSE", "/tests/deploy.test.js", "/scripts/build-pages.mjs"];
  for (const path of ["/nao-existe", "/js/nada.js", ...hidden]) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), read("404.html"), path);
  }
});

test("o CSS compilado é publicado, apesar de css/src ficar de fora", async () => {
  const response = await get("/css/app.css");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), read("css/app.css"));
});
