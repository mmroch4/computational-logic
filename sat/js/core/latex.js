// Exportar um trace do DLL para LaTeX: um documento com a vista de prova (os conjuntos numerados
// (1), (2), …, indentados dentro de cada ramo) e a árvore de decisão
// desenhada com o pacote `forest`.
//
// Módulo puro (sem DOM). O texto vem de fora, através de text(key, params), para o documento sair
// em PT ou EN com as mesmas frases da UI (ver `latex.*` em js/ui/locales/*.js). As frases já são
// LaTeX: os parâmetros {literal} chegam em modo matemático, sem os $ à volta.
import { formatClause } from "./clauses.js";
import { compareVariables, formatLiteral, formatVariable } from "./literals.js";
import { buildTree, proofSteps } from "./trace.js";

const lit = (l) => formatLiteral(l, "latex");

/** Conjunto em LaTeX (modo matemático). Depois de cada vírgula a linha pode partir. */
export function latexSet(clauses) {
  return `\\{${clauses.map((c) => formatClause(c, "latex")).join(",\\allowbreak\\ ")}\\}`;
}

/** Valoração por ordem alfabética natural: "p = V, r = F" (em modo matemático). */
function latexAssignment(assignment, text) {
  return Object.keys(assignment ?? {})
    .sort(compareVariables)
    .map((v) => `${formatVariable(v, "latex")} = \\text{${text(assignment[v] ? "true" : "false")}}`)
    .join(",\\ ");
}

/** Texto de cada passo da prova (como labelHtml() da vista de prova, mas em LaTeX). */
function stepLabel(step, second, text) {
  switch (step.kind) {
    case "start":
      return text("start");
    case "unit":
      return text("unit", { literal: lit(step.literal) });
    case "branch":
      return text(second ? "branchSecond" : "branchFirst", { literal: lit(step.literal) });
    case "conflict":
      return text("conflict");
    case "sat": {
      const valuation = latexAssignment(step.assignment, text);
      return text("sat") + (valuation ? ` ($${valuation}$)` : "");
    }
    case "backtrack":
      return text("backtrack", { literal: lit(step.literal) });
    case "limit":
      return text("limit", { steps: step.steps });
    default:
      return "";
  }
}

/**
 * A vista de prova em LaTeX: um \passo{profundidade}{(n)}{texto}{conjunto} por linha.
 * Os passos sem número (conclusões e retrocessos) não têm conjunto.
 */
export function proofLatex(trace, text) {
  const steps = proofSteps(trace);
  const lines = steps.map((step, i) => {
    const second = step.kind === "branch" && steps[i - 1]?.kind === "backtrack";
    const num = step.n !== null ? `(${step.n})` : "";
    const set = step.S && step.n !== null ? `$${latexSet(step.S)}$` : "";
    return `\\passo{${step.depth}}{${num}}{${stepLabel(step, second, text)}}{${set}}`;
  });

  const result = trace.at(-1);
  if (result?.type === "result") {
    const key = result.sat === null ? "resultLimited" : result.sat ? "resultSat" : "resultUnsat";
    lines.push(`\\passo{0}{}{\\textbf{${text(key)}}}{}`);
  }
  return lines.join("\n");
}

/**
 * Conteúdo de um nó da árvore: o literal (na raiz, S) e, se o nó for o último da sua chamada e
 * não tiver filhos, ✗ (S contém F) ou ✓ (S vazio).
 */
function nodeContent(literal, call, last) {
  const lines = [literal ? `$${lit(literal)}$` : "$S$"];
  if (last && call.children.length === 0 && call.status === "conflict") lines.push("$\\times$");
  if (last && call.children.length === 0 && call.status === "sat") lines.push("$\\checkmark$");
  return lines.join("\\\\ ");
}

/**
 * A árvore de decisão na sintaxe do `forest`: [{conteúdo} [filho] [filho]]. Como na UI, cada
 * chamada é um nó com o literal l do ramo, seguido de um nó por literal propagado, ligado por uma
 * aresta tracejada (`edge=dashed`); as ramificações saem do último nó dessa cadeia.
 */
export function treeLatex(trace) {
  const { root, nodes } = buildTree(trace);
  if (!root) return "";

  // Cadeia da chamada `call` a partir do literal j (-1 = o nó da própria chamada).
  function walk(call, j, indent) {
    const pad = "  ".repeat(indent);
    const last = j === call.units.length - 1;
    const literal = j < 0 ? call.literal : call.units[j];
    const options = j < 0 ? "" : ", edge=dashed";
    const children = last
      ? call.children.map((c) => walk(nodes[c], -1, indent + 1))
      : [walk(call, j + 1, indent + 1)];
    const head = `${pad}[{${nodeContent(literal, call, last)}}${options}`;
    if (children.length === 0) return `${head}]`;
    return `${head}\n${children.join("\n")}\n${pad}]`;
  }

  return `\\begin{forest}\n  for tree={align=center, l sep=1.5em, s sep=2em}\n${walk(root, -1, 1)}\n\\end{forest}`;
}

/**
 * Preâmbulo comum aos documentos do DLL e do DP. O `forest` (para a árvore) só entra no do DLL.
 * Define \passo e o ambiente `pares` (pares resolvidos de uma eliminação do DP, em letra pequena).
 */
function preamble(text, { forest = true } = {}) {
  return `\\documentclass[a4paper,11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[${text("babel")}]{babel}
\\usepackage{amsmath,amssymb}
\\usepackage[margin=2.5cm]{geometry}
${forest ? "\\usepackage{forest}\n" : ""}
% Um passo da prova: \\passo{profundidade}{(n)}{texto}{conjunto}
\\newcommand{\\passo}[4]{%
  \\par{\\leftskip=\\dimexpr 2em*#1\\relax
  \\noindent\\makebox[2.5em][l]{#2}#3\\par
  \\if\\relax\\detokenize{#4}\\relax\\else\\noindent\\hspace*{2.5em}#4\\par\\fi}%
  \\smallskip}
${forest ? "" : `
% Pares resolvidos de uma eliminação: (cláusula com x) · (cláusula com ¬x) → resolvente
\\newenvironment{pares}{\\begin{itemize}\\setlength{\\itemsep}{0pt}\\small}{\\end{itemize}\\smallskip}
`}`;
}

/**
 * Documento LaTeX completo, pronto a compilar com pdflatex.
 *   text(key, params): frases do documento (chaves de `latex.*` nos locales).
 *   app: nome da ferramenta, para a linha "Gerado por …".
 */
export function traceToLatex(trace, { text, app = "" } = {}) {
  const start = trace[0];
  return `${preamble(text)}
\\begin{document}

\\section*{${text("title")}}

${text("input")} $S = ${latexSet(start?.S ?? [])}$

\\subsection*{${text("proofHeading")}}

${proofLatex(trace, text)}

\\subsection*{${text("treeHeading")}}

${text("treeHint")}

\\begin{center}
${treeLatex(trace)}
\\end{center}

\\vfill
{\\footnotesize ${text("generatedBy", { app })}}

\\end{document}
`;
}

// --- DP original (1960) ---
// O DP não ramifica: o documento é a sequência de conjuntos (1), (2), … e, depois de cada
// eliminação, os pares de cláusulas-pai → resolvente (as tautologias ficam marcadas como descartadas).

const clause = (c) => formatClause(c, "latex");

/** Os pares resolvidos de uma eliminação e as cláusulas com x e ¬x que saem sem resolventes. */
function dpPairsLatex(e, text) {
  const x = formatVariable(e.variable, "latex");
  const lines = [];
  if (e.pairs.length > 0) {
    lines.push(`\\noindent\\hspace*{2.5em}{\\small ${text("dp.pairsHeading", { variable: x })}}`);
    lines.push("\\begin{pares}");
    for (const pair of e.pairs) {
      const tag = pair.tautology ? ` (${text("dp.tautology")})` : "";
      lines.push(`\\item $${clause(e.before[pair.positive])} \\;\\cdot\\; ${clause(e.before[pair.negative])} \\;\\to\\; ${clause(pair.resolvent)}$${tag}`);
    }
    lines.push("\\end{pares}");
  }
  if (e.dropped.length > 0) {
    const clauses = e.dropped.map((i) => `$${clause(e.before[i])}$`).join(", ");
    lines.push(`\\passo{0}{}{\\small ${text("dp.dropped", { variable: x, clauses })}}{}`);
  }
  return lines;
}

/** Texto do aviso do limite (a resolução explodiu ou passos a mais). */
function dpLimitLatex(e, text) {
  if (e.reason === "clauses") {
    return text("dp.limitClauses", { variable: formatVariable(e.variable, "latex"), size: e.size, max: e.max });
  }
  return text("dp.limitSteps", { max: e.max });
}

/**
 * A sequência de conjuntos do DP em LaTeX: um \passo{0}{(n)}{texto}{conjunto} por conjunto novo
 * (início, propagação, eliminação), os pares de cada eliminação e a conclusão.
 */
export function dpSequenceLatex(trace, text) {
  const lines = [];
  let n = 0;
  for (const e of trace) {
    if (e.type === "start") {
      lines.push(`\\passo{0}{(${++n})}{${text("dp.start")}}{$${latexSet(e.S)}$}`);
    } else if (e.type === "unit") {
      lines.push(`\\passo{0}{(${++n})}{${text("dp.unit", { literal: lit(e.literal) })}}{$${latexSet(e.after)}$}`);
    } else if (e.type === "resolve") {
      const variable = formatVariable(e.variable, "latex");
      lines.push(`\\passo{0}{(${++n})}{${text("dp.resolve", { variable })}}{$${latexSet(e.after)}$}`);
      lines.push(...dpPairsLatex(e, text));
    } else if (e.type === "conflict") {
      lines.push(`\\passo{0}{}{${text("conflict")}}{}`);
    } else if (e.type === "sat") {
      const valuation = latexAssignment(e.assignment, text);
      lines.push(`\\passo{0}{}{${text("sat") + (valuation ? ` ($${valuation}$)` : "")}}{}`);
    } else if (e.type === "limit") {
      lines.push(`\\passo{0}{}{${dpLimitLatex(e, text)}}{}`);
    } else if (e.type === "result") {
      const key = e.sat === null ? "dp.resultLimited" : e.sat ? "resultSat" : "resultUnsat";
      lines.push(`\\passo{0}{}{\\textbf{${text(key)}}}{}`);
    }
  }
  return lines.join("\n");
}

/** Documento LaTeX completo do DP (mesmas opções que traceToLatex). */
export function dpTraceToLatex(trace, { text, app = "" } = {}) {
  const start = trace[0];
  return `${preamble(text, { forest: false })}
\\begin{document}

\\section*{${text("dp.title")}}

${text("input")} $S = ${latexSet(start?.S ?? [])}$

\\subsection*{${text("dp.sequenceHeading")}}

${text("dp.sequenceHint")}

${dpSequenceLatex(trace, text)}

\\vfill
{\\footnotesize ${text("generatedBy", { app })}}

\\end{document}
`;
}
