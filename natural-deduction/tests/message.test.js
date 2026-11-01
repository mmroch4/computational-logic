import { test } from "node:test";
import assert from "node:assert/strict";
import { msgBodyHtml, msgClasses, msgHtml } from "../js/ui/message.js";

test("cada tipo tem a sua classe e um ícone: nunca só a cor", () => {
  for (const kind of ["error", "warn", "info", "ok"]) {
    assert.equal(msgClasses(kind), `msg msg-${kind}`);
    assert.match(msgBodyHtml(kind, "texto"), /^<svg class="ic" [^>]*aria-hidden="true".*<\/svg><span>texto<\/span>$/);
  }
});

test("msgHtml aceita outra tag, classes e atributos extra", () => {
  assert.match(msgHtml("error", "x"), /^<p class="msg msg-error">/);
  const html = msgHtml("ok", "x", { tag: "div", classes: "mt-4", attrs: ' role="status"' });
  assert.match(html, /^<div class="msg msg-ok mt-4" role="status">.*<\/div>$/);
});
