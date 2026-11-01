import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { LOCALES } from "../js/ui/i18n.js";
import { stringLiterals, looksLikeVisibleText } from "./helpers/js-strings.js";

// M8.1: o EN está completo e as páginas não têm texto fora dos locales.

// Lista [chave, valor] de todas as folhas de um locale.
function entriesOf(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? entriesOf(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
  );
}

// Os {parâmetros} de uma string, sem repetidos e ordenados.
function placeholders(value) {
  return [...new Set(value.match(/\{[A-Za-z_]\w*\}/g) || [])].sort();
}

test("pt e en: cada chave tem o mesmo tipo (texto ou função de plural)", () => {
  const en = Object.fromEntries(entriesOf(LOCALES.en));
  for (const [key, pt] of entriesOf(LOCALES.pt)) {
    assert.equal(typeof en[key], typeof pt, key);
  }
});

test("pt e en: cada texto usa os mesmos {parâmetros}", () => {
  const en = Object.fromEntries(entriesOf(LOCALES.en));
  for (const [key, pt] of entriesOf(LOCALES.pt)) {
    if (typeof pt !== "string") continue;
    assert.deepEqual(placeholders(en[key]), placeholders(pt), key);
  }
});

// Um texto vazio só é aceitável se for de propósito nos dois idiomas
// (ex.: generator.wantsLower.any, o «qualquer» que não acrescenta nada à frase).
test("pt e en: nenhum texto está vazio só num dos idiomas", () => {
  const en = Object.fromEntries(entriesOf(LOCALES.en));
  for (const [key, pt] of entriesOf(LOCALES.pt)) {
    if (typeof pt !== "string") continue;
    assert.equal(en[key].trim() === "", pt.trim() === "", key);
  }
});

test("o scanner encontra texto em strings e templates e ignora comentários e markup", () => {
  const source = [
    '// "Texto num comentário"',
    "/* `outro comentário` */",
    'el.textContent = "Carrega aqui";',
    'const re = /"não é string"/g;',
    "el.innerHTML = `<button class=\"btn\" data-x=\"${id}\">${t(\"a.b\")}</button>`;",
    "el.innerHTML = `<p>${n} cláusulas</p>`;",
    'document.querySelector("[data-view]");',
  ].join("\n");
  const found = stringLiterals(source).filter((s) => looksLikeVisibleText(s.value));
  assert.deepEqual(found.map((s) => [s.value, s.line]), [
    ["Carrega aqui", 3],
    [" cláusulas</p>", 6],
  ]);
});

test("js/pages: nenhuma string visível está hardcoded (tudo passa por t())", () => {
  const dir = new URL("../js/pages/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 6, "esperava os entries das 6 páginas");
  const offenders = [];
  for (const file of files) {
    const source = readFileSync(new URL(file, dir), "utf8");
    for (const { value, line } of stringLiterals(source)) {
      if (looksLikeVisibleText(value)) offenders.push(`${file}:${line} ${JSON.stringify(value)}`);
    }
  }
  assert.deepEqual(offenders, []);
});
