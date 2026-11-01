import { test } from "node:test";
import assert from "node:assert/strict";
import { t, setLang, getLang, initI18n, onLangChange, pagePath, LOCALES } from "../js/ui/i18n.js";

// Lista todas as chaves "a.b.c" de um objeto de locale.
function keysOf(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

test("pt e en têm exatamente as mesmas chaves", () => {
  assert.deepEqual(keysOf(LOCALES.en).sort(), keysOf(LOCALES.pt).sort());
});

test("t traduz conforme o idioma atual", () => {
  setLang("pt");
  assert.equal(t("nav.step"), "Passo a passo");
  setLang("en");
  assert.equal(t("nav.step"), "Step by step");
  setLang("pt");
});

test("t interpola parâmetros e deixa os desconhecidos intactos", () => {
  setLang("pt");
  assert.equal(t("creditsBar.text", { name: "Miguel Rocha" }), "Plataforma criada por Miguel Rocha");
  assert.equal(t("creditsBar.text"), "Plataforma criada por {name}");
});

test("t devolve a chave quando não existe", () => {
  assert.equal(t("nao.existe"), "nao.existe");
  assert.equal(t("nav"), "nav");
});

test("setLang ignora idiomas não suportados", () => {
  setLang("pt");
  setLang("fr");
  assert.equal(getLang(), "pt");
});

test("initI18n: o idioma vem só do caminho", () => {
  assert.equal(initI18n("/en/prove"), "en");
  assert.equal(getLang(), "en");
  assert.equal(initI18n("/provar"), "pt");
  assert.equal(initI18n("/en/nao-existe"), "en");
  assert.equal(initI18n("/nao-existe"), "pt");
});

test("pagePath dá o caminho da página no idioma atual", () => {
  setLang("en", { silent: true });
  assert.equal(pagePath("step"), "/en/step-by-step");
  setLang("pt", { silent: true });
  assert.equal(pagePath("step"), "/passo-a-passo");
});

test("initI18n não notifica e setLang sim", () => {
  let calls = 0;
  const off = onLangChange(() => calls++);
  assert.equal(initI18n("/en"), "en");
  assert.equal(calls, 0);
  setLang("pt");
  assert.equal(calls, 1);
  off();
  setLang("en");
  assert.equal(calls, 1);
  setLang("pt");
});
