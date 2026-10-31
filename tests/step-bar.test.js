import { test } from "node:test";
import assert from "node:assert/strict";
import { setSummaryHtml, editButtonHtml, algoMenuHtml, exportMenuHtml, shortcutsMenuHtml, barKeyAction } from "../js/ui/step-bar.js";
import { keyAction } from "../js/ui/timeline.js";
import { parse } from "../js/core/parser.js";
import { setLang } from "../js/ui/i18n.js";

test("setSummaryHtml: contagens no singular e no plural, em PT e EN", () => {
  setLang("pt", { silent: true });
  assert.match(setSummaryHtml(parse("p q, -p").clauses), /Conjunto inicial · 2 cláusulas, 2 variáveis/);
  assert.match(setSummaryHtml(parse("p").clauses), /Conjunto inicial · 1 cláusula, 1 variável/);
  setLang("en", { silent: true });
  assert.match(setSummaryHtml(parse("p q, -p").clauses), /Initial set · 2 clauses, 2 variables/);
  setLang("pt", { silent: true });
});

test("setSummaryHtml: o conjunto inteiro fica no title (no ecrã pode ser truncado)", () => {
  setLang("pt", { silent: true });
  assert.match(setSummaryHtml(parse("p11, -p11 q").clauses), /title="\{p₁₁, ¬p₁₁ ∨ q\}"/);
});

test("exportMenuHtml: «Partilhar…» só com a Web Share API, e só no mobile", () => {
  setLang("pt", { silent: true });
  assert.doesNotMatch(exportMenuHtml(), /data-action="share"/);
  assert.match(exportMenuHtml({ canShare: true }), /class="md:hidden" data-action="share"/);
  assert.match(exportMenuHtml({ canShare: true }), /Partilhar…/);
});

test("exportMenuHtml: fora do Passo a passo não há teclas nem a dica do passo", () => {
  setLang("pt", { silent: true });
  const html = exportMenuHtml({ step: false });
  assert.doesNotMatch(html, /menu-key/);
  assert.doesNotMatch(html, /mesmo passo/);
  assert.match(html, /data-action="copy-link"/);
  assert.match(html, /data-action="print-pdf"/);
});

test("exportMenuHtml: as quatro exportações dentro de um só menu", () => {
  setLang("pt", { silent: true });
  const html = exportMenuHtml();
  assert.match(html, /<details class="dd end">/);
  for (const action of ["copy-link", "copy-latex", "download-tex", "print-pdf"]) {
    assert.match(html, new RegExp(`data-action="${action}"><svg`), action);
  }
});

test("barra: Editar tem ação e os atalhos têm nome acessível e as teclas da timeline", () => {
  setLang("pt", { silent: true });
  assert.match(editButtonHtml(), /data-action="edit"/);
  const html = shortcutsMenuHtml();
  assert.match(html, /aria-label="Atalhos de teclado"/);
  for (const key of ["←", "→", "Home", "End"]) {
    assert.ok(html.includes(`<kbd class="kbd-key">${key}</kbd>`), key);
    assert.ok(keyAction(key === "←" ? "ArrowLeft" : key === "→" ? "ArrowRight" : key), key);
  }
});

test("algoMenuHtml: botão só com o ícone, que abre a lista com o atual marcado", () => {
  setLang("pt", { silent: true });
  const html = algoMenuHtml(["dll", "dp"], "dp");
  assert.match(html, /<summary class="btn" data-variant="ghost" data-size="icon" aria-label="Algoritmo: DP" title="Algoritmo: DP"><svg/);
  assert.match(html, /data-sheet-title="Algoritmo"/);
  assert.match(html, /data-algo="dll" aria-pressed="false"><span class="flex-1">DLL<span class="sub">Propagação unitária e ramos \(1962\)<\/span><\/span><\/button>/);
  assert.match(html, /data-algo="dp" aria-pressed="true"><span class="flex-1">DP<span class="sub">Eliminação de variáveis por resolução \(1960\)<\/span><\/span><svg/);
});

test("barra: no mobile, Editar e Exportar ficam só com o ícone, com o nome para os leitores de ecrã", () => {
  setLang("pt", { silent: true });
  assert.match(editButtonHtml(), /<span class="max-md:sr-only">Editar<\/span>/);
  assert.match(exportMenuHtml(), /<span class="max-md:sr-only">Exportar<\/span>/);
});

test("barKeyAction: L, P (maiúsculas ou minúsculas) e ?; as outras teclas não fazem nada", () => {
  assert.equal(barKeyAction("l"), "copy-link");
  assert.equal(barKeyAction("L"), "copy-link");
  assert.equal(barKeyAction("p"), "print-pdf");
  assert.equal(barKeyAction("?"), "shortcuts");
  assert.equal(barKeyAction("ArrowLeft"), null);
  assert.equal(barKeyAction("x"), null);
});

test("menu Exportar: teclas L e P mostradas, e o PDF separado por uma linha", () => {
  setLang("pt", { silent: true });
  const html = exportMenuHtml();
  assert.match(html, /<kbd class="menu-key max-md:hidden">L<\/kbd>/);
  assert.match(html, /<hr><button[^>]*data-action="print-pdf"/);
  assert.match(shortcutsMenuHtml(), /<kbd class="kbd-key">\?<\/kbd>/);
});
