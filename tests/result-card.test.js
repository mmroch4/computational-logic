import { test } from "node:test";
import assert from "node:assert/strict";
import { elapsedLabel, renderResultCard, valuationEntries, verificationRows, truthLabel } from "../js/ui/result-card.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { EXAMPLES } from "../js/core/examples.js";
import { setLang } from "../js/ui/i18n.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

function solve(text) {
  const { clauses } = parse(text);
  return { clauses, result: solveDLL(clauses).result };
}

test("truthLabel: V/F em PT e T/F em EN", () => {
  setLang("pt", { silent: true });
  assert.equal(truthLabel(true), "V");
  assert.equal(truthLabel(false), "F");
  setLang("en", { silent: true });
  assert.equal(truthLabel(true), "T");
  assert.equal(truthLabel(false), "F");
  setLang("pt", { silent: true });
});

test("valuationEntries: todas as variáveis por ordem natural; as não fixadas ficam null", () => {
  const { clauses } = parse("p11 q, p2");
  const entries = valuationEntries(clauses, { p2: true, p11: false });
  assert.deepEqual(entries, [
    { v: "p2", value: true },
    { v: "p11", value: false },
    { v: "q", value: null },
  ]);
});

test("verificationRows: índices dos literais verdadeiros em cada cláusula", () => {
  const { clauses } = parse("p -q, -p, q r");
  const rows = verificationRows(clauses, { p: false, q: false, r: true });
  assert.deepEqual(
    rows.map((r) => [r.trueLiterals, r.value]),
    [
      [[1], true],
      [[0], true],
      [[1], true],
    ],
  );
  // Uma cláusula sem nenhum literal verdadeiro fica falsa.
  assert.equal(verificationRows(clauses, { p: true, q: true })[1].value, false);
});

test("satisfazível: estado, estatísticas, valoração e tabela com o literal verdadeiro destacado", () => {
  setLang("pt", { silent: true });
  const { clauses, result } = solve("p1, -p1 -p2, p3 p2"); // cadeia de propagações
  const html = renderResultCard(clauses, result);
  assert.ok(html.includes("rule-sat"));
  assert.ok(html.includes("✓"));
  assert.ok(html.includes(pt.resultCard.sat));
  // p1 → ¬p2 → p3: só propagação, sem ramificar (como nos conjuntos (1)–(6)).
  assert.ok(html.includes("3 propagações"));
  assert.ok(html.includes("0 ramificações"));
  assert.ok(html.includes("0 conflitos"));
  // p1 = V, p2 = F, p3 = V: uma coluna por variável, com o valor por baixo.
  assert.ok(html.includes('<th scope="col">p<sub>1</sub></th><th scope="col">p<sub>2</sub></th><th scope="col">p<sub>3</sub></th>'));
  assert.ok(html.includes('<td class="tv v">V</td><td class="tv f">F</td><td class="tv v">V</td>'));
  // Na cláusula 2 (¬p1 ∨ ¬p2) o literal verdadeiro é ¬p2.
  assert.ok(html.includes(`<span class="lit">¬p<sub>1</sub></span> ∨ <mark class="lit lit--true">¬p<sub>2</sub></mark>`));
  assert.ok(html.includes("as 3 cláusulas são verdadeiras"));
});

test("satisfazível com variáveis livres: «qualquer» e nota explicativa", () => {
  setLang("pt", { silent: true });
  const { clauses, result } = solve("p, p q");
  const html = renderResultCard(clauses, result);
  assert.ok(html.includes(`<td class="result-valuation__free">${pt.resultCard.any}</td>`));
  assert.ok(html.includes(pt.resultCard.freeNote));
});

test("insatisfazível: cores de conflito, ✕, explicação e sem valoração", () => {
  setLang("pt", { silent: true });
  const { clauses, result } = solve("-p -q, -p q, p -q, p q"); // dois ramos
  const html = renderResultCard(clauses, result);
  assert.ok(html.includes("rule-conflict"));
  assert.ok(html.includes("✕"));
  assert.ok(html.includes(pt.resultCard.unsat));
  assert.ok(html.includes(pt.resultCard.unsatLead));
  assert.ok(!html.includes("result-table"));
  assert.ok(!html.includes(pt.resultCard.valuation));
});

test("casos-limite: conjunto vazio, cláusula vazia e limite de passos", () => {
  setLang("pt", { silent: true });
  const empty = solve("{}");
  const emptyHtml = renderResultCard(empty.clauses, empty.result);
  assert.ok(emptyHtml.includes(pt.resultCard.satEmptyLead));
  assert.ok(!emptyHtml.includes("result-table"));

  const f = solve("F");
  assert.ok(renderResultCard(f.clauses, f.result).includes(pt.resultCard.unsat));

  const { clauses } = parse("p q, -p q, p -q, -p -q");
  const limited = solveDLL(clauses, { maxSteps: 2 }).result;
  const limitedHtml = renderResultCard(clauses, limited);
  assert.ok(limitedHtml.includes(pt.resultCard.limited));
  assert.ok(!limitedHtml.includes("rule-sat") && !limitedHtml.includes("rule-conflict"));
});

test("todos os exemplos: o cartão bate com o DLL e as valorações verificam todas as cláusulas", () => {
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    const strings = lang === "pt" ? pt : en;
    for (const ex of EXAMPLES) {
      const { clauses, result } = solve(ex.input);
      const html = renderResultCard(clauses, result);
      assert.ok(html.includes(result.sat ? strings.resultCard.sat : strings.resultCard.unsat), ex.id);
      if (result.sat && clauses.length) {
        assert.ok(verificationRows(clauses, result.assignment).every((r) => r.value), ex.id);
        assert.ok(html.includes("result-card__verified"), ex.id);
      }
    }
  }
  setLang("pt", { silent: true });
});

test("cartão: número grande com o rótulo no singular certo, e a frase inteira para o leitor de ecrã", () => {
  setLang("pt", { silent: true });
  const { clauses, result } = solve("p q, -p -q"); // um ramo chega: p, depois ¬q, e S fica vazio
  assert.equal(result.stats.branches, 1);
  const html = renderResultCard(clauses, result);
  assert.ok(html.includes('<b class="result-stat__n">1</b>'));
  assert.ok(html.includes(">ramificação</span>"));
  assert.ok(html.includes('<span class="sr-only">1 ramificação</span>'));
  assert.ok(html.includes(">conflitos</span>"));
});

test("cartão: metadados com cláusulas, variáveis e tempo medido, com a vírgula do idioma", () => {
  setLang("pt", { silent: true });
  const { clauses, result } = solve("p, q");
  assert.match(renderResultCard(clauses, result, { elapsedMs: 1.25 }), /2 cláusulas · 2 variáveis · 1,3 ms/);
  assert.match(renderResultCard(clauses, result), /2 cláusulas · 2 variáveis</);
  assert.equal(elapsedLabel(0.04), "< 0,1 ms");
  setLang("en", { silent: true });
  assert.equal(elapsedLabel(1.25), "1.3 ms");
  setLang("pt", { silent: true });
});

test("cartão: avisos do parser com título, em sat, unsat e no limite; a tautologia é informativa", () => {
  setLang("pt", { silent: true });
  const parsed = parse("p q, p q, r -r");
  const { result } = solve("p q, p q, r -r");
  const html = renderResultCard(parsed.clauses, result, { warnings: parsed.warnings });
  assert.ok(html.includes(`<b>${pt.parser.warningTitles.duplicateClause}</b>`));
  assert.ok(html.includes(`<b>${pt.parser.warningTitles.tautology}</b>`));
  assert.ok(html.includes("msg-warn") && html.includes("msg-info"));
  assert.ok(!renderResultCard(parsed.clauses, result).includes("result-card__warnings"));
  assert.ok(renderResultCard(parsed.clauses, { sat: null, stats: result.stats }, { warnings: parsed.warnings }).includes("result-card__warnings"));
});

test("cartão: a verificação fica recolhida num <details>, com o resumo a dizer que bate certo", () => {
  setLang("pt", { silent: true });
  const { clauses, result } = solve("p, q");
  const html = renderResultCard(clauses, result);
  assert.match(html, /<details class="result-check">\s*<summary><span class="result-card__verified">/);
  assert.ok(!html.includes("<details class=\"result-check\" open"));
});

test("locales: PT e EN têm as mesmas chaves em resultCard", () => {
  const keys = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  assert.deepEqual(keys(pt.resultCard).sort(), keys(en.resultCard).sort());
});

test("renderResultCard: ações (passo a passo com a fórmula no link e o menu Exportar) em todos os estados", async () => {
  const { stepByStepHref } = await import("../js/ui/result-card.js");
  setLang("pt", { silent: true });
  const sat = solve("p1, -p1 -p2, p3 p2");
  assert.equal(stepByStepHref(sat.clauses), "/passo-a-passo?f=p1,+-p1+-p2,+p3+p2&a=dll");
  const unsat = solve("p, -p");
  for (const { clauses, result } of [sat, unsat, { clauses: [], result: solveDLL([]).result }]) {
    const html = renderResultCard(clauses, result);
    assert.ok(html.includes(`href="${stepByStepHref(clauses).replaceAll("&", "&amp;")}"`));
    assert.ok(html.includes("Ver passo a passo"));
    assert.ok(html.includes('data-action="copy-link"'));
    assert.ok(!html.includes('data-action="clear"'));
  }
  const limited = renderResultCard(sat.clauses, { sat: null, stats: { units: 0, branches: 0, conflicts: 0 } });
  assert.ok(limited.includes('data-action="copy-link"'));
});

test("renderResultCard: actions false (página Passo a passo) não tem ações no fim do cartão", () => {
  setLang("pt", { silent: true });
  for (const { clauses, result } of [solve("p1, -p1 -p2, p3 p2"), solve("p, -p")]) {
    const html = renderResultCard(clauses, result, { actions: false });
    assert.ok(!html.includes("result-card__actions"));
    assert.ok(!html.includes("data-action="));
  }
});

test("renderResultCard: stepLink false esconde só o link para o passo a passo", () => {
  setLang("pt", { silent: true });
  for (const { clauses, result } of [solve("p1, -p1 -p2, p3 p2"), solve("p, -p")]) {
    const html = renderResultCard(clauses, result, { stepLink: false });
    assert.ok(!html.includes("Ver passo a passo"));
    assert.ok(!html.includes("/passo-a-passo?"));
    assert.ok(html.includes('data-action="copy-link"'));
    assert.ok(!html.includes('data-action="clear"'));
  }
});
