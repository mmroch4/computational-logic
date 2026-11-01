// A documentação não pode citar o que não existe: scripts, comandos npm, rotas, siglas e tokens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DERIVED_RULES, BASE_RULES } from "../js/core/rules.js";
import { LANGS, ROUTES, pathFor } from "../js/core/routes.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const DOCS = ["README.md", "CLAUDE.md", "DESIGN.md"];
const pkg = JSON.parse(read("package.json"));

test("os scripts citados existem", () => {
  for (const doc of DOCS) {
    for (const [path] of read(doc).matchAll(/\bscripts\/[\w./-]*\w\.(?:sh|mjs)\b/g)) {
      assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${doc}: ${path}`);
    }
  }
});

test("os comandos npm citados existem", () => {
  for (const doc of DOCS) {
    for (const [, name] of read(doc).matchAll(/npm run ([\w:]+)/g)) {
      assert.ok(pkg.scripts[name], `${doc}: npm run ${name}`);
    }
  }
});

test("os ficheiros citados no README existem", () => {
  for (const file of ["LICENSE", "SPEC.md", "CLAUDE.md", "DESIGN.md", "vercel.json", ".vercelignore", "js/ui/config.js", "tests/__snapshots__"]) {
    assert.ok(read("README.md").includes(file), file);
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
  }
});

test("README e CLAUDE.md têm as rotas todas", () => {
  for (const doc of ["README.md", "CLAUDE.md"]) {
    const text = read(doc);
    for (const lang of LANGS) {
      for (const page of Object.keys(ROUTES)) {
        assert.ok(text.includes(`\`${pathFor(page, lang)}\``), `${doc}: ${page} ${lang}`);
      }
    }
  }
});

test("o README nomeia todas as regras", () => {
  const text = read("README.md");
  for (const { id } of [...BASE_RULES, ...DERIVED_RULES]) assert.ok(text.includes(id), id);
  for (const id of ["RAA", "LEM", "HS", "DS"]) assert.ok(text.includes(id), id);
});

test("os tokens citados no DESIGN.md estão no CSS", () => {
  const css = read("css/src/app.css");
  for (const [token] of read("DESIGN.md").matchAll(/--(?:color|radius|shadow|dur|font|weight)-[a-z0-9-]*[a-z0-9]/g)) {
    assert.ok(css.includes(token), token);
  }
});
