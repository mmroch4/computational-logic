import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_STATE_EXAMPLES, renderEmptyState, renderNotationHelp } from "../js/ui/empty-state.js";
import { staleNoteHtml } from "../js/ui/result-card.js";
import { getExample } from "../js/core/examples.js";
import { solveDLL } from "../js/core/dll.js";
import { parse } from "../js/core/parser.js";
import { setLang } from "../js/ui/i18n.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

test("os 3 exemplos do estado vazio existem e mostram propagação, ramificação e um modelo", () => {
  assert.equal(EMPTY_STATE_EXAMPLES.length, 3);
  const results = EMPTY_STATE_EXAMPLES.map((id) => {
    const ex = getExample(id);
    assert.ok(ex, id);
    return solveDLL(parse(ex.input).clauses).result;
  });
  // Cadeia de propagações: só propagação; exemplo 2: ramifica; o de modelo único é satisfazível.
  assert.equal(results[0].stats.branches, 0);
  assert.ok(results[1].stats.branches > 0);
  assert.equal(results[2].sat, true);
});

test("renderEmptyState tem a dica e um botão por exemplo, com título no idioma e fórmula formatada", () => {
  for (const [lang, locale] of [["pt", pt], ["en", en]]) {
    setLang(lang, { silent: true });
    const html = renderEmptyState({ lang });
    assert.ok(html.includes(locale.emptyState.heading));
    for (const id of EMPTY_STATE_EXAMPLES) {
      const ex = getExample(id);
      assert.ok(html.includes(`data-example="${id}"`), id);
      assert.ok(html.includes(ex.title[lang]), `${id} ${lang}`);
    }
    assert.equal((html.match(/<button/g) ?? []).length, 3);
    // Fórmula no estilo matemático (p₁ com <sub>), não o texto cru da notação compacta.
    assert.ok(html.includes("<sub>1</sub>"));
  }
  setLang("pt", { silent: true });
});

test("renderEmptyState mostra as 3 notações em <code>, com as chavetas do exemplo intactas", () => {
  setLang("pt", { silent: true });
  const html = renderEmptyState({ lang: "pt" });
  assert.ok(html.includes("<code>{{p}, {¬p, q}}</code>"));
  assert.ok(html.includes("<code>p, -p q</code>"));
  assert.doesNotMatch(html, /\{compact\}|\{sets\}|\{logic\}/);
});

test("renderNotationHelp: uma linha por regra da notação, com os símbolos aceites (PT e EN)", () => {
  for (const [lang, locale] of [["pt", pt], ["en", en]]) {
    setLang(lang, { silent: true });
    const html = renderNotationHelp();
    assert.ok(html.includes(locale.notationHelp.heading));
    assert.equal((html.match(/<th scope="row">/g) ?? []).length, 4);
    for (const symbols of ["¬  ~  -  !", "∨  |  \\/  v", "p, q1, p_11"]) assert.ok(html.includes(symbols), symbols);
    assert.ok(html.includes("/\\  ^"));
  }
  setLang("pt", { silent: true });
});

test("staleNoteHtml avisa que o resultado está desatualizado (PT e EN)", () => {
  setLang("pt", { silent: true });
  assert.ok(staleNoteHtml().includes(pt.resultCard.stale));
  setLang("en", { silent: true });
  assert.ok(staleNoteHtml().includes(en.resultCard.stale));
  setLang("pt", { silent: true });
});
