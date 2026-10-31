// Preparação do deploy na Vercel: valida o vercel.json e o .vercelignore e faz um smoke test com o
// scripts/serve.mjs, que imita a Vercel (cleanUrls, headers, 404 e o que fica de fora do deploy).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

const config = JSON.parse(read("vercel.json"));
const ignored = read(".vercelignore")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

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

test("package.json: nome do projeto e versões fixas", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.name, "natural-deduction");
  for (const [name, version] of Object.entries(pkg.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, name);
  }
});

test("CSP: scripts e Web Workers só do próprio site", () => {
  const rule = config.headers.flatMap((r) => r.headers).find((h) => h.key === "Content-Security-Policy");
  const directives = Object.fromEntries(rule.value.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));
  assert.deepEqual(directives["default-src"], ["'self'"]);
  assert.deepEqual(directives["script-src"], ["'self'"]);
  assert.deepEqual(directives["worker-src"], ["'self'"]);
});

test("o servidor responde em / com os headers de segurança", async () => {
  const response = await get("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.match(response.headers.get("content-security-policy"), /worker-src 'self'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("as 10 rotas abrem, cada uma com o seu idioma e o entry certo", async () => {
  const pages = [
    ["/", "index", "pt-PT"], ["/provar", "provar", "pt-PT"], ["/passo-a-passo", "passo-a-passo", "pt-PT"],
    ["/aprender", "aprender", "pt-PT"], ["/exercicios", "exercicios", "pt-PT"],
    ["/en", "index", "en"], ["/en/prove", "provar", "en"], ["/en/step-by-step", "passo-a-passo", "en"],
    ["/en/learn", "aprender", "en"], ["/en/exercises", "exercicios", "en"],
  ];
  for (const [path, entry, lang] of pages) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes(`<html lang="${lang}">`), path);
    assert.ok(html.includes(`<script type="module" src="/js/pages/${entry}.js">`), path);
  }
});

test("um caminho que não existe, também em /en, serve a 404 com o seu entry", async () => {
  for (const path of ["/nao-existe", "/en/nao-existe"]) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.ok((await response.text()).includes('<body data-page="notFound">'), path);
  }
});

test("serve o CSS compilado, o boot.js e o vendor", async () => {
  for (const [path, type] of [["/css/app.css", /^text\/css/], ["/js/boot.js", /^text\/javascript/], ["/js/vendor/motion-mini.js", /^text\/javascript/]]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), type, path);
  }
});

test("caminhos que não existem dão 404, e /index redireciona sem perder a query", async () => {
  assert.equal((await get("/nao-existe")).status, 404);
  const response = await get("/index?f=p");
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "/?f=p");
});

test(".vercelignore: a referência, os materiais e o loop não chegam ao deploy", async () => {
  for (const entry of ["/.reference", "/conteudos", "/ralph", "/SPEC.md", "/css/src", "/tests", "/scripts"]) {
    assert.ok(ignored.includes(entry), entry);
  }
  for (const path of ["/.reference/sat", "/.reference/sat/index", "/.reference/sat/package.json", "/SPEC.md", "/ralph/PLAN.md", "/package.json"]) {
    assert.equal((await get(path)).status, 404, path);
  }
});
