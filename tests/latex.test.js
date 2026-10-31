import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { traceToLatex, proofLatex, treeLatex, latexSet, dpTraceToLatex, dpSequenceLatex } from "../js/core/latex.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { solveDP } from "../js/core/dp.js";
import { getExample, EXAMPLES } from "../js/core/examples.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

// O mesmo que t("latex.<key>", params) faz na UI, mas direto do objeto do locale (com "dp.title" → latex.dp.title).
const textFrom = (locale) => (key, params = {}) => {
  const value = key.split(".").reduce((node, part) => node?.[part], locale.latex);
  return typeof value === "function" ? value(params) : value;
};
const ptText = textFrom(pt);

function traceOf(text) {
  return solveDLL(parse(text).clauses).trace;
}

// Para regravar os snapshots depois de uma mudança intencional: UPDATE_SNAPSHOTS=1 npm test
function matchSnapshot(name, actual) {
  const path = new URL(`./snapshots/${name}`, import.meta.url);
  if (process.env.UPDATE_SNAPSHOTS) writeFileSync(path, actual);
  assert.equal(actual, readFileSync(path, "utf8"));
}

/** Chavetas equilibradas, ignorando as escapadas (\{ e \}). */
function balancedBraces(tex) {
  let depth = 0;
  const clean = tex.replace(/\\[{}]/g, "");
  for (const ch of clean) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

test("latexSet: literais com \\neg, \\lor e subscritos; F na cláusula vazia", () => {
  assert.equal(latexSet(parse("-p1 p11, q").clauses), "\\{\\neg p_{1} \\lor p_{11},\\allowbreak\\ q\\}");
  assert.equal(latexSet([[]]), "\\{F\\}");
  assert.equal(latexSet([]), "\\{\\}");
});

test("proofLatex: cadeia de propagações tem os conjuntos (1)…(11), F e o resultado", () => {
  const tex = proofLatex(traceOf(getExample("propagation-chain").input), ptText);
  const numbers = [...tex.matchAll(/^\\passo\{\d+\}\{\((\d+)\)\}/gm)].map((m) => Number(m[1]));
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.match(tex, /\$S\$ contém \$F\$ \$\\Rightarrow\$ insatisfazível/);
  assert.match(tex.split("\n").at(-1), /Resultado: \$S\$ é insatisfazível/);
});

test("proofLatex: o 2.º ramo diz que tenta o complementar e fica indentado", () => {
  const lines = proofLatex(traceOf(getExample("two-branches").input), ptText).split("\n");
  const branches = lines.filter((l) => /escolhemos|complementar/.test(l));
  assert.equal(branches.length, 2);
  assert.match(branches[0], /^\\passo\{1\}.*escolhemos \$p\$/);
  assert.match(branches[1], /^\\passo\{1\}.*complementar, \$S \\cup \\\{\\neg p\\\}\$/);
});

test("proofLatex: satisfazível mostra a valoração por ordem alfabética (V/F)", () => {
  const tex = proofLatex(traceOf("p q, -p, r"), ptText);
  assert.match(tex, /satisfazível \(\$p = \\text\{F\},\\ q = \\text\{V\},\\ r = \\text\{V\}\$\)/);
});

test("treeLatex: forest com a raiz S, ramos p / ¬p e folhas ✗", () => {
  const tex = treeLatex(traceOf(getExample("two-branches").input));
  assert.ok(tex.startsWith("\\begin{forest}") && tex.endsWith("\\end{forest}"));
  assert.match(tex, /\[\{\$S\$\}/);
  assert.match(tex, /\[\{\$p\$/);
  assert.match(tex, /\[\{\$\\neg p\$/);
  assert.equal((tex.match(/\\times/g) ?? []).length, 2);
  // Propagações: um nó por literal, ligado por aresta tracejada (p, q em cada ramo).
  assert.equal((tex.match(/, edge=dashed/g) ?? []).length, 4);
  assert.doesNotMatch(tex, /footnotesize/);
  assert.equal((tex.match(/\[/g) ?? []).length, (tex.match(/\]/g) ?? []).length);
});

test("traceToLatex: chavetas equilibradas em todos os exemplos e nas duas línguas", () => {
  for (const example of EXAMPLES) {
    const trace = traceOf(example.input);
    for (const locale of [pt, en]) {
      const tex = traceToLatex(trace, { text: textFrom(locale), app: "Learn Davis-Putnam SAT" });
      assert.ok(balancedBraces(tex), `${example.id} (${locale.latex.babel})`);
      assert.ok(tex.includes("\\begin{document}") && tex.includes("\\end{document}"));
    }
  }
});

test("traceToLatex: snapshot do dois ramos (PT) e do pombos (EN)", () => {
  const app = "Learn Davis-Putnam SAT";
  matchSnapshot("latex-two-branches.pt.tex", traceToLatex(traceOf(getExample("two-branches").input), { text: ptText, app }));
  matchSnapshot("latex-propagation-chain.en.tex", traceToLatex(traceOf(getExample("propagation-chain").input), { text: textFrom(en), app }));
});

// Compila se houver pdflatex no sistema; sem ele o teste é saltado.
const hasPdflatex = spawnSync("pdflatex", ["--version"]).status === 0;

test("traceToLatex: compila com pdflatex", { skip: !hasPdflatex && "pdflatex não instalado" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "dpsat-latex-"));
  for (const id of ["propagation-chain", "two-branches"]) {
    writeFileSync(join(dir, `${id}.tex`), traceToLatex(traceOf(getExample(id).input), { text: ptText, app: "Learn Davis-Putnam SAT" }));
    const run = spawnSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `${id}.tex`], { cwd: dir, encoding: "utf8" });
    assert.equal(run.status, 0, run.stdout.slice(-2000));
  }
});

// --- DP (1960) ---

function dpTraceOf(text, options) {
  return solveDP(parse(text).clauses, options).trace;
}

/** Pombos n → n-1 na notação compacta (cada pombo num poleiro; dois pombos nunca no mesmo). */
function pigeons(n) {
  const holes = Array.from({ length: n - 1 }, (_, j) => j + 1);
  const clauses = [];
  for (let i = 1; i <= n; i++) clauses.push(holes.map((j) => `p${i}${j}`).join(" "));
  for (const j of holes) for (let a = 1; a <= n; a++) for (let b = a + 1; b <= n; b++) clauses.push(`-p${a}${j} -p${b}${j}`);
  return clauses.join(", ");
}

test("dpSequenceLatex: dois ramos = eliminação de p, propagação de ¬q e F", () => {
  const tex = dpSequenceLatex(dpTraceOf(getExample("two-branches").input), ptText);
  const numbers = [...tex.matchAll(/^\\passo\{0\}\{\((\d+)\)\}/gm)].map((m) => Number(m[1]));
  assert.deepEqual(numbers, [1, 2, 3]);
  assert.match(tex, /^\\passo\{0\}\{\(2\)\}\{Eliminação de \$p\$ por resolução:\}/m);
  assert.match(tex, /\\begin\{pares\}\n\\item \$.* \\;\\cdot\\; .* \\;\\to\\; .*\$/);
  assert.match(tex, /^\\passo\{0\}\{\(3\)\}\{Propagação de \$\\neg q\$:\}\{\$\\\{F\\\}\$\}/m);
  assert.match(tex, /\$S\$ contém \$F\$/);
  assert.match(tex.split("\n").at(-1), /Resultado: \$S\$ é insatisfazível/);
});

test("dpSequenceLatex: tautologias marcadas como descartadas e valoração no fim (satisfazível)", () => {
  // Eliminar p: (p ∨ q) · (¬p ∨ ¬q) dá q ∨ ¬q (tautologia).
  const tex = dpSequenceLatex(dpTraceOf("p q, -p -q"), ptText);
  assert.match(tex, /\\item \$p \\lor q \\;\\cdot\\; \\neg p \\lor \\neg q \\;\\to\\; q \\lor \\neg q\$ \(tautologia: descartada\)/);
  assert.match(tex, /satisfazível \(\$p = \\text\{[VF]\},\\ q = \\text\{[VF]\}\$\)/);
});

test("dpSequenceLatex: cláusulas com x e ¬x saem sem resolventes", () => {
  const tex = dpSequenceLatex(dpTraceOf("p -p q, p r, -p s"), ptText);
  assert.match(tex, /Saem sem resolventes, porque têm \$p\$ e \$\\neg p\$: \$p \\lor \\neg p \\lor q\$\./);
});

test("dpSequenceLatex: pombos 4→3 com limite de 20 cláusulas mostra o aviso da explosão", () => {
  const tex = dpSequenceLatex(dpTraceOf(pigeons(4), { maxClauses: 20 }), ptText);
  assert.match(tex, /Ao eliminar \$p_\{11\}\$, o conjunto passava a ter \d+ cláusulas \(o limite é 20\)/);
  assert.match(tex.split("\n").at(-1), /Resultado: sem resposta \(limite atingido\)/);
  const english = dpSequenceLatex(dpTraceOf(pigeons(4), { maxClauses: 20 }), textFrom(en));
  assert.match(english, /Resolution blew up/);
});

test("dpTraceToLatex: chavetas equilibradas, sem forest, em todos os exemplos e nas duas línguas", () => {
  for (const example of [...EXAMPLES.map((e) => e.input), pigeons(3)]) {
    const trace = dpTraceOf(example);
    for (const locale of [pt, en]) {
      const tex = dpTraceToLatex(trace, { text: textFrom(locale), app: "Learn Davis-Putnam SAT" });
      assert.ok(balancedBraces(tex), `${example} (${locale.latex.babel})`);
      assert.ok(tex.includes("\\begin{document}") && tex.includes("\\end{document}"));
      assert.ok(!tex.includes("forest"));
      assert.ok(tex.includes("\\newenvironment{pares}"));
      assert.doesNotMatch(tex, /undefined|\{(variable|literal|size|max|clauses)\}/, "parâmetro por preencher");
    }
  }
});

test("dpTraceToLatex: snapshot do dois ramos (PT) e dos pombos 3→2 (EN)", () => {
  const app = "Learn Davis-Putnam SAT";
  matchSnapshot("latex-dp-two-branches.pt.tex", dpTraceToLatex(dpTraceOf(getExample("two-branches").input), { text: ptText, app }));
  matchSnapshot("latex-dp-pigeons-3.en.tex", dpTraceToLatex(dpTraceOf(pigeons(3)), { text: textFrom(en), app }));
});

test("dpTraceToLatex: compila com pdflatex", { skip: !hasPdflatex && "pdflatex não instalado" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "dpsat-latex-dp-"));
  const inputs = { "two-branches": getExample("two-branches").input, pigeons: pigeons(3), limit: pigeons(4) };
  for (const [id, input] of Object.entries(inputs)) {
    const trace = dpTraceOf(input, id === "limit" ? { maxClauses: 20 } : undefined);
    writeFileSync(join(dir, `${id}.tex`), dpTraceToLatex(trace, { text: ptText, app: "Learn Davis-Putnam SAT" }));
    const run = spawnSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `${id}.tex`], { cwd: dir, encoding: "utf8" });
    assert.equal(run.status, 0, run.stdout.slice(-2000));
  }
});
