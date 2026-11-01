// O script do Web Analytics só carrega no domínio de produção.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SITE_URL } from "../js/ui/config.js";
import { loadAnalytics } from "../js/ui/analytics.js";

let appended;

beforeEach(() => {
  appended = [];
  globalThis.window = globalThis;
  globalThis.document = { createElement: () => ({}), head: { append: (element) => appended.push(element) } };
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.va;
  delete globalThis.vaq;
});

test("no domínio de produção carrega o script e cria a fila window.va", () => {
  assert.equal(loadAnalytics(new URL(SITE_URL).hostname), true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, "/_vercel/insights/script.js");
  window.va("event", { name: "x" });
  assert.equal(window.vaq.length, 1);
});

test("fora dele não pede nada: localhost, previews e o *.vercel.app", () => {
  for (const host of ["localhost", "127.0.0.1", "learn-nd-git-main.vercel.app", "learn-nd.vercel.app"]) {
    assert.equal(loadAnalytics(host), false, host);
  }
  assert.equal(appended.length, 0);
  assert.equal(window.va, undefined);
});

test("o layout carrega-o em todas as páginas", () => {
  assert.match(readFileSync("js/ui/layout.js", "utf8"), /installSegKeys\(\);\n  loadAnalytics\(\);/);
});
