// A tradução EN: os locales têm a mesma forma e não há português nas páginas EN. O HTML gerado vê-se
// aqui; o que só existe depois de o JS correr vê-se no Chrome, em scripts/check-english.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { englishPage, pageFiles } from "../scripts/build-pages.mjs";
import { quizQuestions } from "../js/core/quiz.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";
import { portugueseSign } from "./helpers/portuguese.js";

// Ficam iguais de propósito: nomes, ou o nome da outra língua no seletor de idioma.
const SHARED_TEXT = new Set(["Fitch", "Modus tollens", "De Morgan", "Learn Natural Deduction", "Português", "PT", "EN"]);
const NAME_OF_THE_OTHER_LANGUAGE = "Português";

function leaves(value, path = "") {
  return Object.entries(value).flatMap(([key, item]) => (
    item && typeof item === "object" ? leaves(item, `${path}${key}.`) : [[`${path}${key}`, item]]
  ));
}

const SAMPLE_PARAMS = { n: 2, total: 8 };
const text = (value) => (typeof value === "function" ? value(SAMPLE_PARAMS) : value);
const placeholders = (value) => [...new Set([...String(text(value)).matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();

const ptLeaves = new Map(leaves(pt));
const enLeaves = new Map(leaves(en));

// O que se lê na página: sem comentários, código e estilos, com as entidades que o build escreve.
function visibleText(html) {
  const body = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)\b[\s\S]*?<\/\1>/g, " ");
  const decode = (item) => item.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
  const nodes = [...body.matchAll(/>([^<>]+)</g)].map((match) => match[1].trim());
  const attributes = [...body.matchAll(/\s(?:aria-label|alt|title|placeholder|content)="([^"]*)"/g)].map((match) => match[1]);
  return [...nodes, ...attributes].filter(Boolean).map(decode);
}

const isProse = (item) => /\p{L}{3}/u.test(item);
const ptPages = pageFiles().map(({ page, source, output }) => ({
  page,
  output,
  source: readFileSync(source, "utf8"),
  english: readFileSync(output, "utf8"),
}));

test("pt e en têm a mesma forma, chave a chave", () => {
  assert.deepEqual([...enLeaves.keys()].sort(), [...ptLeaves.keys()].sort());
  for (const [key, value] of enLeaves) {
    assert.equal(typeof value, typeof ptLeaves.get(key), key);
    assert.deepEqual(placeholders(value), placeholders(ptLeaves.get(key)), key);
  }
});

test("nenhum texto do locale EN está vazio ou ficou igual ao PT", () => {
  for (const [key, value] of enLeaves) {
    const english = text(value);
    assert.notEqual(String(english).trim(), "", key);
    const same = english === text(ptLeaves.get(key)) && isProse(english);
    if (same) assert.ok(SHARED_TEXT.has(english), `${key}: ${english}`);
  }
});

test("o locale EN não tem português nem siglas PT, fora da tabela das siglas", () => {
  for (const [key, value] of enLeaves) {
    if (key.startsWith("rules.labels.")) continue;
    assert.equal(portugueseSign(String(text(value))), null, `${key}: ${text(value)}`);
  }
});

test("as siglas EN são as do CLAUDE.md", () => {
  assert.deepEqual(en.rules.labels, { MT: "MT", "¬¬I": "¬¬I", RA: "RAA", TE: "LEM", DM: "DM", SH: "HS", SD: "DS" });
});

test("a terminologia EN é uma só: subproof, base rules, hypothesis", () => {
  for (const [key, value] of enLeaves) {
    assert.doesNotMatch(String(text(value)), /sub-?deduction|basic rules?|Assumption of premise/i, key);
  }
});

test("o quiz tem texto EN para todas as perguntas", () => {
  for (const { id } of quizQuestions()) {
    assert.ok(enLeaves.has(`learn.quiz.questions.${id}.prompt`), id);
  }
});

test("as páginas EN não têm português no HTML", () => {
  for (const { output, english } of ptPages) {
    for (const item of visibleText(english)) {
      if (item === NAME_OF_THE_OTHER_LANGUAGE) continue;
      assert.equal(portugueseSign(item), null, `${output}: ${item.slice(0, 120)}`);
    }
  }
});

test("todo o texto das páginas PT muda na versão EN", () => {
  for (const { output, source, english } of ptPages) {
    const translated = new Set(visibleText(english));
    for (const item of visibleText(source)) {
      if (!isProse(item) || SHARED_TEXT.has(item)) continue;
      if (/^https?:|miguelrocha\.dev|^width=|^summary_large_image$|^website$|^#|^(pt|en)_[A-Z]{2}$/.test(item)) continue;
      if (item === "Miguel Rocha" || item === "noindex") continue;
      assert.equal(translated.has(item), false, `${output}: ${item.slice(0, 120)}`);
    }
  }
});

test("o gerador deixa passar um parágrafo sem chave, e o teste apanha-o", () => {
  const html = `<!doctype html>\n<html lang="pt-PT"><head></head><body><main><p>Uma prova sem chave</p></main></body></html>`;
  const leaked = visibleText(englishPage(html, "home", "index.html"));
  assert.ok(leaked.some((item) => portugueseSign(item)));
});

test("o detetor reconhece português e deixa o inglês em paz", () => {
  for (const sample of ["Início", "a prova", "Regras", "SD, 1, 2", "«resolvido»", "Passo 2 de 7"]) {
    assert.notEqual(portugueseSign(sample), null, sample);
  }
  for (const sample of ["Home", "Line 2: RAA, 1–3", "From φ you get ψ", "A teacher", "Step 2 of 7", "LEM"]) {
    assert.equal(portugueseSign(sample), null, sample);
  }
});

test("a parte PT dos locales é quase toda reconhecida pelo detetor", () => {
  const prose = [...ptLeaves.values()].filter((value) => typeof value === "string" && value.length > 40);
  const seen = prose.filter((value) => portugueseSign(value));
  assert.ok(seen.length / prose.length > 0.95, `${seen.length} de ${prose.length}`);
});

test("as páginas EN renderizadas não têm português no Chrome", { skip: !existsSync(process.env.CHROME_BIN || "/usr/bin/google-chrome") }, () => {
  const run = spawnSync("node", ["scripts/check-english.mjs"], { encoding: "utf8", timeout: 240000 });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
});
