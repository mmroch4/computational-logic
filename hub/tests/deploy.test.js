// Preparação do deploy na Vercel: valida o vercel.json e o .vercelignore e faz um smoke test com o
// scripts/serve.mjs, que imita a Vercel.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

const PAGES = { "/": "index.html", "/en": "en/index.html" };
const HTML = [...Object.values(PAGES), "404.html"];
const config = JSON.parse(read("vercel.json"));
const ignored = read(".vercelignore")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
const csp = config.headers.flatMap((rule) => rule.headers).find((header) => header.key === "Content-Security-Policy");

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

const get = (path) => fetch(base + path, { redirect: "manual" });

test("vercel.json: site estático sem build, com cleanUrls ligado", () => {
  assert.deepEqual(Object.keys(config).sort(), ["cleanUrls", "framework", "headers", "installCommand", "redirects", "trailingSlash"]);
  assert.equal(config.framework, null);
  assert.equal(config.installCommand, "");
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
});

test("headers de segurança em todas as respostas, incluindo a 404", async () => {
  for (const path of ["/", "/en", "/css/app.css", "/favicon.svg", "/nao-existe"]) {
    const { headers } = await get(path);
    assert.equal(headers.get("x-content-type-options"), "nosniff", path);
    assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin", path);
    assert.match(headers.get("permissions-policy"), /camera=\(\)/, path);
    assert.equal(headers.get("x-frame-options"), "SAMEORIGIN", path);
    assert.equal(headers.get("content-security-policy"), csp.value, path);
  }
});

// O JSON-LD é um bloco de dados, que o browser não executa: é o único <script> que as páginas podem ter.
const withoutJsonLd = (html) => html.replace(/<script type="application\/ld\+json">[^<]*<\/script>/g, "");

test("CSP: sem scripts, sem estilos inline, e as páginas cumprem-na", () => {
  const directives = Object.fromEntries(csp.value.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));
  assert.deepEqual(directives["default-src"], ["'self'"]);
  assert.deepEqual(directives["script-src"], ["'none'"]);
  assert.deepEqual(directives["style-src"], ["'self'", "https://fonts.googleapis.com"]);
  assert.deepEqual(directives["font-src"], ["https://fonts.gstatic.com"]);
  assert.deepEqual(directives["object-src"], ["'none'"]);
  assert.deepEqual(directives["frame-ancestors"], ["'self'"]);
  for (const page of HTML) {
    const html = withoutJsonLd(read(page));
    assert.doesNotMatch(html, /<script\b/, `${page}: script`);
    assert.doesNotMatch(html, /<style\b/, `${page}: <style>`);
    assert.doesNotMatch(html, /<[a-z][^>]*\s(on[a-z]+|style)=/, `${page}: atributo inline`);
  }
});

test("cleanUrls: cada página responde no caminho limpo com o seu HTML", async () => {
  for (const [path, file] of Object.entries(PAGES)) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /^text\/html/, path);
    assert.equal(await response.text(), read(file), path);
  }
});

test("redirecionamentos 308 para os caminhos limpos", async () => {
  const cases = [["/index", "/"], ["/en/index", "/en"], ["/index.html", "/"], ["/en/index.html", "/en"], ["/en/", "/en"]];
  for (const [from, to] of cases) {
    const response = await get(from);
    assert.equal(response.status, 308, from);
    assert.equal(response.headers.get("location"), to, from);
  }
});

test("Cache-Control e Content-Type", async () => {
  for (const path of ["/", "/en", "/css/app.css", "/sitemap.xml"]) {
    assert.equal((await get(path)).headers.get("cache-control"), "public, max-age=0, must-revalidate", path);
  }
  for (const path of ["/favicon.svg", "/og-image.png", "/og-image-en.png", "/apple-touch-icon.png"]) {
    assert.equal((await get(path)).headers.get("cache-control"), "public, max-age=86400", path);
  }
  const types = {
    "/sitemap.xml": "application/xml; charset=utf-8",
    "/robots.txt": "text/plain; charset=utf-8",
    "/site.webmanifest": "application/manifest+json",
    "/og-image.png": "image/png",
  };
  for (const [path, type] of Object.entries(types)) {
    assert.equal((await get(path)).headers.get("content-type"), type, path);
  }
});

test("todos os links e recursos internos das páginas chegam a uma resposta 200", async () => {
  const urls = new Set();
  for (const page of HTML) {
    for (const [, url] of read(page).matchAll(/(?:href|src)="(\/(?!\/)[^"]*)"/g)) urls.add(url);
  }
  assert.ok(urls.size >= 4, "encontrou os links");
  for (const url of urls) assert.equal((await get(url)).status, 200, url);
});

test("404: caminhos que não existem e o que fica fora do deploy mostram a 404.html", async () => {
  for (const path of ["/nao-existe", "/en/nao-existe", "/package.json", "/README.md", "/CLAUDE.md", "/.vercelignore", "/scripts/serve.mjs", "/tests/deploy.test.js"]) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), read("404.html"), path);
  }
});

test(".vercelignore: cada entrada é um caminho que existe", () => {
  for (const entry of ignored) {
    assert.match(entry, /^\/[^*]+[^/*]$/, `um caminho a partir da raiz, sem padrões: ${entry}`);
    if (entry === "/tmp") continue; // não vem num clone: é das verificações
    assert.ok(existsSync(new URL(entry.slice(1), root)), `${entry} não existe (gralha?)`);
  }
});

test(".vercelignore: para a Vercel só vão as páginas, o CSS, os ícones, as imagens, o manifest e o SEO", () => {
  const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: new URL(".", root), encoding: "utf8" })
    .trim()
    .split("\n");
  const deployed = tracked.filter((file) => !ignored.some((entry) => `/${file}` === entry || `/${file}`.startsWith(`${entry}/`)));
  assert.deepEqual(deployed.sort(), [...HTML, "apple-touch-icon.png", "css/app.css", "favicon.svg", "og-image-en.png", "og-image.png", "robots.txt", "site.webmanifest", "sitemap.xml", "vercel.json"].sort());
});
