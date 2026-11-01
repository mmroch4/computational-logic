// L3.1: o mapa de rotas. O idioma vem do URL e cada página tem a sua equivalente no outro idioma.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LANGS,
  ROUTES,
  counterpartPath,
  langFromPath,
  pageFromPath,
  pathFor,
  sitemapEntries,
} from "../js/core/routes.js";

const PAIRS = [
  ["home", "/", "/en"],
  ["solve", "/resolver", "/en/solver"],
  ["step", "/passo-a-passo", "/en/step-by-step"],
  ["learn", "/aprender", "/en/learn"],
  ["exercises", "/exercicios", "/en/exercises"],
];

// As formas do mesmo caminho que chegam à página: limpa, com .html e com barra final.
function variants(path) {
  if (path === "/") return ["/", "/index", "/index.html"];
  return [path, `${path}.html`, `${path}/`, `${path}/index.html`];
}

test("pathFor dá o caminho limpo de cada página nos dois idiomas", () => {
  for (const [page, pt, en] of PAIRS) {
    assert.equal(pathFor(page, "pt"), pt);
    assert.equal(pathFor(page, "en"), en);
  }
  assert.equal(Object.keys(ROUTES).length, PAIRS.length);
});

test("langFromPath: EN em /en e por baixo dele, PT no resto", () => {
  for (const [, pt, en] of PAIRS) {
    for (const path of variants(pt)) assert.equal(langFromPath(path), "pt", path);
    for (const path of variants(en)) assert.equal(langFromPath(path), "en", path);
  }
  assert.equal(langFromPath("/en/nao-existe"), "en");
  assert.equal(langFromPath("/nao-existe"), "pt");
  // Só o segmento inteiro conta.
  assert.equal(langFromPath("/english"), "pt");
  assert.equal(langFromPath("/enx/solver"), "pt");
});

test("pageFromPath reconhece todas as formas dos caminhos", () => {
  for (const [page, pt, en] of PAIRS) {
    for (const path of [...variants(pt), ...variants(en)]) assert.equal(pageFromPath(path), page, path);
  }
  for (const path of ["/404", "/404.html", "/nao-existe", "/en/nao-existe", "/en/resolver", "/solver"]) {
    assert.equal(pageFromPath(path), null, path);
  }
});

test("counterpartPath troca a página pela equivalente, nos dois sentidos", () => {
  for (const [, pt, en] of PAIRS) {
    for (const path of variants(pt)) assert.equal(counterpartPath(path, "en"), en, path);
    for (const path of variants(en)) assert.equal(counterpartPath(path, "pt"), pt, path);
    // Para o idioma em que já está, fica na mesma página.
    assert.equal(counterpartPath(pt, "pt"), pt);
    assert.equal(counterpartPath(en, "en"), en);
  }
});

test("counterpartPath mantém a query e o hash", () => {
  assert.equal(counterpartPath("/passo-a-passo?f=p,+-p&step=2&view=tree", "en"), "/en/step-by-step?f=p,+-p&step=2&view=tree");
  assert.equal(counterpartPath("/passo-a-passo.html?f=p&step=2", "en"), "/en/step-by-step?f=p&step=2");
  assert.equal(counterpartPath("/en/learn#historia", "pt"), "/aprender#historia");
  assert.equal(counterpartPath("/en/solver/?f=p#x", "pt"), "/resolver?f=p#x");
  assert.equal(counterpartPath("/?a=1#b", "en"), "/en?a=1#b");
  assert.equal(counterpartPath("/en?a=1#b", "pt"), "/?a=1#b");
  // Um "/" dentro da query não é caminho.
  assert.equal(counterpartPath("/resolver?f=a/b", "en"), "/en/solver?f=a/b");
});

test("counterpartPath: um caminho que não é rota leva ao início do idioma", () => {
  assert.equal(counterpartPath("/en/nao-existe?x=1#y", "pt"), "/");
  assert.equal(counterpartPath("/nao-existe", "en"), "/en");
  assert.equal(counterpartPath("/404.html", "en"), "/en");
});

test("sitemapEntries: as 10 páginas, cada uma com os alternativos recíprocos", () => {
  const entries = sitemapEntries();
  assert.equal(entries.length, 10);
  assert.equal(new Set(entries.map((entry) => entry.path)).size, 10);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry.alternates), LANGS);
    assert.equal(entry.alternates[entry.lang], entry.path);
    for (const lang of LANGS) {
      const other = entries.find((candidate) => candidate.path === entry.alternates[lang]);
      assert.deepEqual(other.alternates, entry.alternates);
    }
  }
});
