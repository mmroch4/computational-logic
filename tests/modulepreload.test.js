// Cada página faz preload de todos os módulos que o entry importa (sem bundle, o browser só
// descobriria cada import depois de descarregar o módulo anterior). Os <link> são gerados por
// scripts/modulepreload.mjs; se este teste falhar, corre `node scripts/modulepreload.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, htmlPages, entryOf, moduleGraph, withPreloads, importsOf } from "../scripts/modulepreload.mjs";

test("importsOf apanha import/export com from, em várias linhas, e import só pelo efeito", () => {
  const source = [
    'import { a } from "./a.js";',
    "import {",
    "  b,",
    "  c,",
    '} from "../b.js";',
    'export { d } from "./d.js";',
    'import "./side.js";',
    'const s = "from \\"./nao.js\\"";',
  ].join("\n");
  assert.deepEqual(importsOf(source), ["./a.js", "../b.js", "./d.js", "./side.js"]);
});

test("moduleGraph resolve caminhos relativos e não repete módulos", () => {
  const files = {
    "/js/pages/p.js": 'import "../ui/a.js";\nimport "../ui/b.js";',
    "/js/ui/a.js": 'import "./b.js";\nimport "../core/c.js";',
    "/js/ui/b.js": 'import "../core/c.js";',
    "/js/core/c.js": "",
  };
  assert.deepEqual(moduleGraph("/js/pages/p.js", (path) => files[path]), [
    "/js/ui/a.js",
    "/js/ui/b.js",
    "/js/core/c.js",
  ]);
});

test("as 11 páginas têm os modulepreload atualizados e os módulos existem", () => {
  assert.equal(htmlPages().length, 11);
  for (const page of htmlPages()) {
    const html = readFileSync(join(ROOT, page), "utf8");
    const entry = entryOf(html);
    assert.ok(entry, `${page}: sem <script type="module">`);
    assert.equal(withPreloads(html), html, `${page}: modulepreload desatualizado (corre node scripts/modulepreload.mjs)`);
    const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
    assert.equal(preloads[0], entry, `${page}: o entry vem primeiro`);
    for (const path of preloads) assert.ok(existsSync(join(ROOT, path)), `${page}: ${path} não existe`);
    // Os preloads vêm antes do script, para os pedidos começarem logo.
    assert.ok(html.lastIndexOf('rel="modulepreload"') < html.indexOf('<script type="module"'), `${page}: preload depois do script`);
  }
});
