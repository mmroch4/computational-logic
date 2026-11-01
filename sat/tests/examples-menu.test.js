import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleGroups, matchesSearch, recentLabel, renderMenuPanel } from "../js/ui/examples-menu.js";
import { EXAMPLES, EXAMPLE_SOURCES } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";
import { createStorage } from "../js/ui/storage.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

test("exampleGroups agrupa todos os exemplos pela ordem das fontes", () => {
  const groups = exampleGroups();
  assert.deepEqual(
    groups.map((g) => g.source),
    EXAMPLE_SOURCES,
  );
  const ids = groups.flatMap((g) => g.examples.map((ex) => ex.id));
  assert.deepEqual([...ids].sort(), EXAMPLES.map((ex) => ex.id).sort());
  for (const g of groups) assert.ok(g.examples.every((ex) => ex.source === g.source));
});

test("renderMenuPanel mostra cada exemplo com título e fórmula no estilo matemático", () => {
  setLang("pt", { silent: true });
  const html = renderMenuPanel({ history: [], lang: "pt" });
  for (const ex of EXAMPLES) {
    assert.ok(html.includes(`data-example="${ex.id}"`), ex.id);
    assert.ok(html.includes(ex.title.pt.replaceAll("'", "&#39;")), ex.id);
  }
  for (const source of EXAMPLE_SOURCES) assert.ok(html.includes(pt.examplesMenu.sources[source]));
  // Dois ramos formatado com ¬ e ∨.
  assert.ok(html.includes("{¬p ∨ ¬q, ¬p ∨ q, p ∨ ¬q, p ∨ q}"));
  // Subscritos no exemplo 1.
  assert.ok(html.includes("p<sub>1</sub>"));
});

test("histórico: vazio mostra a dica; com entradas mostra-as por ordem e o botão limpar", () => {
  setLang("pt", { silent: true });
  const empty = renderMenuPanel({ history: [] });
  assert.ok(empty.includes(pt.examplesMenu.historyEmpty));
  assert.ok(!empty.includes("examples-menu__clear"));

  const store = createStorage(null); // só em memória
  store.addToHistory("p, -p q");
  store.addToHistory("{{a}, {¬a}}");
  const html = renderMenuPanel({ history: store.getHistory() });
  assert.ok(html.includes("examples-menu__clear"));
  assert.ok(!html.includes(pt.examplesMenu.historyEmpty));
  assert.ok(html.indexOf('data-history="0"') < html.indexOf('data-history="1"'));
  assert.ok(html.indexOf("{a, ¬a}") < html.indexOf("{p, ¬p ∨ q}"));

  store.clearHistory();
  assert.ok(renderMenuPanel({ history: store.getHistory() }).includes(pt.examplesMenu.historyEmpty));
});

test("fórmulas inválidas no histórico aparecem como texto escapado", () => {
  const html = renderMenuPanel({ history: [{ formula: "<img src=x onerror=alert(1)>" }] });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});

test("em EN usa os títulos e as fontes em inglês", () => {
  setLang("en", { silent: true });
  const html = renderMenuPanel({ history: [], lang: "en" });
  assert.ok(html.includes(en.examplesMenu.history));
  assert.ok(html.includes(en.examplesMenu.sources.branching));
  assert.ok(html.includes(EXAMPLES[0].title.en));
  setLang("pt", { silent: true });
});

test("matchesSearch: sem acentos nem maiúsculas, todas as palavras, por qualquer ordem", () => {
  assert.ok(matchesSearch("ramificacao", "Com ramificação"));
  assert.ok(matchesSearch("POMBOS 3", "3 pombos, 2 poleiros"));
  assert.ok(matchesSearch("", "qualquer coisa"));
  assert.ok(matchesSearch("  ", "qualquer coisa"));
  assert.ok(!matchesSearch("pombos 4", "3 pombos, 2 poleiros"));
});

test("recentLabel: tempo relativo no idioma, sem data não diz nada", () => {
  const now = Date.UTC(2026, 9, 30, 12);
  const ago = (minutes) => now - minutes * 60000;
  assert.equal(recentLabel(undefined, now, "pt"), "");
  assert.equal(recentLabel(ago(0), now, "pt"), "agora");
  assert.match(recentLabel(ago(2), now, "pt"), /^há 2 min/);
  assert.match(recentLabel(ago(180), now, "pt"), /^há 3 h/);
  assert.equal(recentLabel(ago(1440), now, "pt"), "ontem");
  assert.equal(recentLabel(ago(1440), now, "en"), "yesterday");
  assert.equal(recentLabel(now + 5000, now, "pt"), "agora");
  assert.match(recentLabel(ago(60 * 24 * 90), now, "en"), /3 mo/);
});

test("renderMenuPanel: pesquisa, contagem de cláusulas, tempo dos recentes e cada item pesquisável", () => {
  setLang("pt", { silent: true });
  const now = Date.UTC(2026, 9, 30, 12);
  const html = renderMenuPanel({ history: [{ formula: "p, -p", savedAt: now - 120000 }], lang: "pt", now });
  assert.ok(html.includes(`placeholder="${pt.examplesMenu.search}"`));
  assert.ok(html.includes(`aria-label="${pt.examplesMenu.search}"`));
  assert.ok(html.includes('data-example="pigeons-3-2" data-search="3 pombos, 2 poleiros p11 p12'));
  assert.match(html, /<span class="examples-menu__meta">9<\/span>/);
  assert.match(html, /<span class="examples-menu__meta">há 2 min/);
  assert.equal((html.match(/max-md:hidden"> cláusulas/g) ?? []).length, 1);
  assert.ok(html.indexOf('data-history="0"') < html.indexOf("data-example"));
  assert.ok(html.indexOf("data-example") < html.indexOf("examples-menu__clear"));
});

test("as strings do menu existem em PT e EN", () => {
  for (const locale of [pt, en]) {
    const m = locale.examplesMenu;
    for (const key of ["toggle", "history", "historyEmpty", "clearHistory"]) assert.equal(typeof m[key], "string");
    for (const source of EXAMPLE_SOURCES) assert.equal(typeof m.sources[source], "string");
  }
});
