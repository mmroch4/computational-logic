import { test } from "node:test";
import assert from "node:assert/strict";
import { eventChipHtml } from "../js/ui/events.js";
import { setLang } from "../js/ui/i18n.js";

const RULES = ["unit", "branch", "conflict", "sat", "backtrack", "resolution"];

test("chip de evento: ícone + nome em PT e EN, com a classe da cor escrita por inteiro", () => {
  setLang("pt", { silent: true });
  assert.match(eventChipHtml("unit"), /^<span class="chip ev-unit"><svg class="ic"[^>]*aria-hidden="true"[\s\S]*<\/svg>Propagação unitária<\/span>$/);
  assert.match(eventChipHtml("backtrack"), /class="chip ev-back"[\s\S]*Retrocesso/);
  assert.match(eventChipHtml("resolution"), /class="chip ev-res"[\s\S]*Resolução/);
  setLang("en", { silent: true });
  assert.match(eventChipHtml("branch"), /Branching<\/span>$/);
  setLang("pt", { silent: true });
});

test("chip de evento: todos os eventos têm ícone e nome, e o nome pode ser trocado", () => {
  setLang("pt", { silent: true });
  for (const rule of RULES) assert.match(eventChipHtml(rule), /<path|<circle/, rule);
  assert.match(eventChipHtml("backtrack", "8 · Retrocesso"), /8 · Retrocesso<\/span>$/);
});
