import { test } from "node:test";
import assert from "node:assert/strict";
import { latexDocument, texFilename } from "../js/ui/latex-export.js";
import { renderResultCard } from "../js/ui/result-card.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { solveDP } from "../js/core/dp.js";
import { APP_NAME } from "../js/ui/config.js";
import { setLang } from "../js/ui/i18n.js";

function solve(text) {
  const { clauses } = parse(text);
  return { clauses, ...solveDLL(clauses) };
}

test("latexDocument: documento completo no idioma atual, com o nome da ferramenta", () => {
  const { trace } = solve("p, -p q, -q");
  setLang("pt", { silent: true });
  const pt = latexDocument(trace);
  assert.match(pt, /^\\documentclass/);
  assert.match(pt, /\\usepackage\[portuguese\]\{babel\}/);
  assert.match(pt, /insatisfazível/);
  assert.ok(pt.includes(APP_NAME));
  assert.match(pt, /\\end\{document\}\s*$/);
  setLang("en", { silent: true });
  const en = latexDocument(trace);
  assert.match(en, /\\usepackage\[english\]\{babel\}/);
  assert.match(en, /unsatisfiable/);
  setLang("pt", { silent: true });
});

test("renderResultCard: botões de LaTeX no menu Exportar (sat e unsat)", () => {
  setLang("pt", { silent: true });
  for (const text of ["p1, -p1 -p2, p3 p2", "p, -p"]) {
    const { clauses, result } = solve(text);
    const html = renderResultCard(clauses, result);
    assert.ok(html.includes('data-action="copy-latex"'));
    assert.ok(html.includes('data-action="download-tex"'));
  }
});

test("latexDocument (DP): sequência de conjuntos e pares no idioma atual; ficheiro dp.tex", () => {
  const { trace } = solveDP(parse("p q, -p r").clauses);
  setLang("pt", { silent: true });
  const pt = latexDocument(trace, { algorithm: "dp" });
  assert.match(pt, /Algoritmo DP \(Davis-Putnam, 1960\)/);
  assert.match(pt, /Sequência de conjuntos/);
  assert.match(pt, /\\begin\{pares\}/);
  assert.doesNotMatch(pt, /forest/);
  assert.ok(pt.includes(APP_NAME));
  setLang("en", { silent: true });
  assert.match(latexDocument(trace, { algorithm: "dp" }), /Sequence of sets/);
  setLang("pt", { silent: true });
  // Sem algoritmo continua a ser o documento do DLL.
  assert.match(latexDocument(solve("p q, -p r").trace), /\\usepackage\{forest\}/);
  assert.equal(texFilename(), "dll.tex");
  assert.equal(texFilename("dp"), "dp.tex");
});
