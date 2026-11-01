import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../js/core/parser.js";
import { formatNotations, clauseKind, clauseSetSummary } from "../js/core/notations.js";
import { CONVERTER_EXAMPLES, notationHtml, renderConverterOutput, renderNotationConverter } from "../js/ui/notation-converter.js";
import { EXAMPLES } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";

const clausesOf = (text) => {
  const result = parse(text);
  assert.ok(result.ok, `parse falhou: ${text}`);
  return result.clauses;
};

test("formatNotations: exemplo pequeno (FNC → conjunto de cláusulas)", () => {
  const clauses = clausesOf("¬p ∧ (q ∨ r ∨ q) ∧ (¬r ∨ ¬s) ∧ (p ∨ s) ∧ (¬q ∨ ¬s)");
  assert.deepEqual(formatNotations(clauses), {
    compact: "-p, q r, -r -s, p s, -q -s",
    sets: "{{¬p}, {q, r}, {¬r, ¬s}, {p, s}, {¬q, ¬s}}",
    logic: "¬p ∧ (q ∨ r) ∧ (¬r ∨ ¬s) ∧ (p ∨ s) ∧ (¬q ∨ ¬s)",
  });
});

test("formatNotations: uma só cláusula não leva parênteses; F e o conjunto vazio", () => {
  assert.equal(formatNotations(clausesOf("p1 -p11")).logic, "p1 ∨ ¬p11");
  assert.deepEqual(formatNotations(clausesOf("F, p")), { compact: "F, p", sets: "{F, {p}}", logic: "F ∧ p" });
  assert.deepEqual(formatNotations([]), { compact: null, sets: "{}", logic: null });
});

test("formatNotations: as 3 escritas voltam a dar o mesmo conjunto (todos os exemplos base)", () => {
  const texts = [...EXAMPLES.map((e) => e.input), ...CONVERTER_EXAMPLES.map((e) => e.text)];
  for (const text of texts) {
    const clauses = clausesOf(text);
    const written = formatNotations(clauses);
    for (const notation of ["compact", "sets", "logic"]) {
      if (written[notation] === null) continue;
      const again = parse(written[notation], { notation });
      assert.ok(again.ok, `${notation}: ${written[notation]}`);
      assert.deepEqual(again.clauses, clauses, `${notation}: ${written[notation]}`);
    }
  }
});

test("clauseKind e clauseSetSummary", () => {
  assert.equal(clauseKind([]), "empty");
  assert.equal(clauseKind(clausesOf("-p")[0]), "unit");
  assert.equal(clauseKind(clausesOf("p -q -p s")[0]), "tautology");
  assert.equal(clauseKind(clausesOf("p q")[0]), "clause");
  const summary = clauseSetSummary(clausesOf("p1, -p1 -p2, F, p -p"));
  assert.deepEqual(
    { ...summary, kinds: undefined },
    { clauses: 4, empty: 1, unit: 1, tautology: 1, kinds: undefined },
  );
});

test("notationHtml: subscritos nas variáveis, F intacto, texto escapado", () => {
  assert.equal(notationHtml("{¬p11, F}"), "{¬p<sub>11</sub>, F}");
  assert.equal(notationHtml("-p1 q", { subscripts: false }), "-p1 q");
  assert.equal(notationHtml("<b>"), "&lt;b&gt;");
});

test("renderConverterOutput: notação do aluno marcada, resumo, veredito e avisos", () => {
  setLang("pt");
  const html = renderConverterOutput("¬p ∧ (q ∨ r ∨ q)");
  assert.match(html, /notation-converter__row--current"><dt>Notação lógica/);
  assert.deepEqual(
    [...html.matchAll(/<span class="st">([^<]*)<\/span>/g)].map((m) => m[1]),
    ["2 cláusulas", "unitárias: 1", "vazias (F): 0", "tautologias: 0"],
  );
  assert.match(html, /O literal q aparece repetido/);
  assert.match(renderConverterOutput("{}"), /Conjunto vazio: é satisfazível/);
  assert.match(renderConverterOutput("{}"), /não tem escrita nesta notação/);
  assert.match(renderConverterOutput("p, F"), /contém F: é insatisfazível/);
  assert.match(renderConverterOutput("p ∨"), /field-error/);
  assert.match(renderConverterOutput("  "), /Escreve um conjunto/);
});

test("renderNotationConverter: textarea com o texto e botões dos exemplos (PT e EN)", () => {
  setLang("en");
  const html = renderNotationConverter({ text: "p, <q>" });
  assert.match(html, /Notation converter/);
  assert.match(html, /p, &lt;q&gt;<\/textarea>/);
  assert.equal(html.match(/data-example=/g).length, CONVERTER_EXAMPLES.length);
  setLang("pt");
});
