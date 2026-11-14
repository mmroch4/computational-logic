// Exportar uma prova para LaTeX: um documento completo, com a prova em Fitch. Módulo puro (sem DOM).
//
// As barras de escopo são macros próprias, sobre `tabular`, e não um pacote de Fitch: assim o documento
// compila com uma instalação mínima, só com o que traz qualquer distribuição.
// O texto vem de fora, através de text(key), para sair em PT ou EN (`latex.*` nos locales); as siglas
// vêm de `ruleLabels` e as palavras premissa e hipótese de `labels`, como em `formatProof`.
// Contrato:
//   latexFormula(formula) → LaTeX de modo matemático, com os parênteses de `format`
//   latexProof(proof, { labels, ruleLabels }) → o `tabular` da prova; a variável de uma caixa [v] vai
//     numa caixa (`\boxed`) antes da fórmula, e a linha de etiqueta é uma linha sem número
//   proofToLatex(goal, proof, { text, labels, ruleLabels, app }) → documento pronto para o pdflatex

import { displayName, format } from "./formula.js";
import { ruleLabel } from "./rules.js";

const MATH_SYMBOLS = {
  "¬": "\\lnot ", "∧": "\\land", "∨": "\\lor", "→": "\\to", "∀": "\\forall ", "∃": "\\exists ",
};

/** Na regra, os conectivos e os quantificadores passam a matemática e o resto a texto. */
const RULE_SYMBOLS = {
  "¬": "$\\lnot$", "∧": "$\\land$", "∨": "$\\lor$", "→": "$\\to$", "∀": "$\\forall$", "∃": "$\\exists$",
};

const TEXT_ESCAPES = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  "%": "\\%",
  _: "\\_",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
  '"': "\\textquotedbl{}", // com o babel em português, as aspas são um comando
};

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

/** ASCII e letras acentuadas: outro carácter pode parar o pdflatex, e o nome de uma regra é texto livre. */
const printable = (char) => /[\x20-\x7EÀ-ÿ]/.test(char);

/** Texto normal, com tudo o que o LaTeX interpreta escapado. */
export function latexText(text) {
  return [...text].map((char) => {
    if (char in TEXT_ESCAPES) return TEXT_ESCAPES[char];
    return printable(char) ? char : "?";
  }).join("");
}

/** Um nome como `format` o imprime: `p₁₁` dá `p_{11}`, e um nome comprido fica em itálico de texto. */
function latexName(written) {
  const [, stem, digits] = /^(.*?)([₀-₉]*)$/.exec(written);
  const base = stem.length === 1 ? stem : `\\mathit{${stem.replaceAll("_", "\\_")}}`;
  if (digits === "") return base;
  const plain = [...digits].map((digit) => SUBSCRIPT_DIGITS.indexOf(digit)).join("");
  return `${base}_{${plain}}`;
}

const TOKEN_RE = /[A-Za-z][A-Za-z0-9_]*[₀-₉]*|\S/g;

/** Passa o texto de `format` para modo matemático. */
function latexMath(written) {
  const tokens = written.match(TOKEN_RE);
  const isName = (token) => /^[A-Za-z]/.test(token);
  return tokens.map((token, index) => {
    // Os argumentos de um predicado ou de uma função colam ao nome: `P(x)`, e não `P (x)`.
    const glue = token === "(" && index > 0 && isName(tokens[index - 1]) ? "\u0000" : "";
    if (token === "F") return "\\mathrm{F}";
    if (token in MATH_SYMBOLS) return MATH_SYMBOLS[token];
    return glue + (isName(token) ? latexName(token) : token);
  }).join(" ").replace(/ +/g, " ").replace(/ ?\u0000/g, "").replace(/\( /g, "(").replace(/ \)/g, ")").replace(/ ,/g, ",");
}

export const latexFormula = (formula) => latexMath(format(formula));

function latexSequent({ premises, conclusion }) {
  const left = premises.map(latexFormula).join(",\\ ");
  return `${left}${left ? " " : ""}\\vdash ${latexFormula(conclusion)}`;
}

const latexRule = (rule, ruleLabels) => [...ruleLabel(rule, ruleLabels)]
  .map((char) => RULE_SYMBOLS[char] ?? latexText(char))
  .join("");

const citationLatex = (citation) => (citation.kind === "line" ? String(citation.line) : `${citation.from}--${citation.to}`);

function justification({ kind, rule, citations }, labels, ruleLabels) {
  if (kind !== "step") return latexText(labels[kind]);
  const parts = rule ? [latexRule(rule, ruleLabels)] : [];
  return [...parts, ...citations.map(citationLatex)].join(", ");
}

/** O traço por baixo de cada hipótese e da última premissa, como na vista de Fitch. */
function underlined(lines, index) {
  const { kind } = lines[index];
  return kind === "hypothesis" || (kind === "premise" && lines[index + 1]?.kind !== "premise");
}

/** A marca `[v]` de uma caixa com variável: o nome numa caixa, como nos slides. */
const latexMark = (name) => `\\boxed{${latexMath(displayName(name))}}\\ `;

/** A prova num `tabular`: número, barras e fórmula, justificação. */
export function latexProof({ lines }, { labels, ruleLabels = {} }) {
  const rows = lines.flatMap((line, index) => {
    const math = line.formula ? latexFormula(line.formula) : "?";
    const formula = underlined(lines, index) ? `\\underline{${math}}` : math;
    const mark = line.fresh ? latexMark(line.fresh) : "";
    const bars = "\\fitchbar".repeat(line.depth + 1);
    const row = `${index + 1} & ${bars} $${mark}${formula}$ & ${justification(line, labels, ruleLabels)} \\\\`;
    if (!line.label) return [row];
    // A linha de etiqueta: sem número, abre a caixa do ∀I um nível acima da hipótese.
    return [` & ${"\\fitchbar".repeat(line.depth)} $${latexMark(line.label)}$ &  \\\\`, row];
  });
  return `\\begin{tabular}{r@{\\quad}l@{\\qquad}l}\n${rows.join("\n")}\n\\end{tabular}`;
}

/** Documento LaTeX completo, pronto a compilar com pdflatex. */
export function proofToLatex(goal, proof, { text, labels, ruleLabels = {}, app = "" }) {
  return `\\documentclass[a4paper,11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[${text("babel")}]{babel}
\\usepackage{amsmath,amssymb}
\\usepackage[margin=2.5cm]{geometry}

% Uma barra de escopo da prova: a altura faz as linhas seguidas ficarem ligadas.
\\newcommand{\\fitchbar}{\\rule[-0.39\\normalbaselineskip]{0.4pt}{1.3\\normalbaselineskip}\\hspace{0.7em}}
\\renewcommand{\\arraystretch}{1.3}

\\begin{document}

\\section*{${latexText(text("title"))}}

$${latexSequent(goal)}$

\\bigskip

\\noindent
${latexProof(proof, { labels, ruleLabels })}

\\vfill
{\\footnotesize ${latexText(text("generatedBy", { app }))}}

\\end{document}
`;
}
