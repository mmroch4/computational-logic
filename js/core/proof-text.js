// Formato textual das provas. Módulo puro (sem DOM).
//
//   1 | m → n       premissa
//   2 | m           premissa
//   3 |   ¬n        hipótese
//   4 |   n         →E, 2, 1
//   5 |   F         FI, 4, 3
//   6 | ¬¬n         ¬I, 3–5
//
// Cada linha tem o número, uma barra, a fórmula e a justificação. A profundidade é a indentação
// depois da barra: um espaço, mais dois por escopo. `?` é uma fórmula por preencher. As linhas
// em branco ignoram-se.
// Contrato:
//   parseProof(text) → { ok: true, proof } | { ok: false, error: { code, params, start, end } }
//   formatProof(proof, labels, ruleLabels) → texto que `parseProof` volta a ler
// As posições são índices em `text`, e `params.line` é sempre a linha da prova. Os códigos são os de
// `PROOF_TEXT_ERROR_CODES` (`proofText.errors.*`), do parser (`parser.errors.*`) e da estrutura da
// prova (`proof.errors.*`).

import { format } from "./formula.js";
import { parseFormula } from "./parser.js";
import { citeLine, citeRange, createProof } from "./proof.js";
import { ruleLabel } from "./rules.js";

/** Códigos de erro próprios deste formato; todos têm o parâmetro { line }. */
export const PROOF_TEXT_ERROR_CODES = [
  "badLine", // a linha não tem a forma `número | …`
  "badLineNumber", // { expected, found }: os números têm de ser seguidos, a começar em 1
  "badIndent", // indentação que não é um espaço mais dois por escopo
  "missingRuleName", // há citações, mas não há regra
  "badCitation", // { token }: citação que não é um número nem um intervalo crescente
  "unexpectedCitation", // premissas e hipóteses não citam linhas
];

/** Marcador de uma fórmula por preencher. */
const EMPTY_FORMULA = "?";

/** Palavras que ocupam o lugar da regra, em qualquer idioma. O `labels` vem dos locales. */
const LINE_KINDS = new Map([
  ["premissa", "premise"],
  ["prem", "premise"],
  ["premise", "premise"],
  ["hipótese", "hypothesis"],
  ["hipotese", "hypothesis"],
  ["hip", "hypothesis"],
  ["hypothesis", "hypothesis"],
  ["hyp", "hypothesis"],
  ["assumption", "hypothesis"],
]);

const DEFAULT_LABELS = { premise: "premissa", hypothesis: "hipótese" };

/** Conectivos das regras na notação de entrada. */
const RULE_SYMBOLS = new Map([
  ["->", "→"],
  ["=>", "→"],
  ["/\\", "∧"],
  ["&", "∧"],
  ["^", "∧"],
  ["\\/", "∨"],
  ["|", "∨"],
  ["v", "∨"],
  ["⊥", "F"],
]);
const RULE_SYMBOL_RE = /^(->|=>|\/\\|&|\^|\\\/|\||v|⊥)(?=[IE]$)/;
const RULE_NEGATION_RE = /^[~!-]+(?=[IE]$)/;

/** Siglas EN que diferem do id, para uma prova se ler da mesma forma nos dois idiomas. */
const RULE_ALIASES = new Map([
  ["RAA", "RA"],
  ["LEM", "TE"],
  ["HS", "SH"],
  ["DS", "SD"],
]);

const LINE_RE = /^\s*(\d+)\s*\|(.*)$/;
const CITATION_RE = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/;

const failure = (code, start, end, params) => ({ ok: false, error: { code, params, start, end } });

const reads = (text) => text === EMPTY_FORMULA || parseFormula(text).ok;

/** O id do catálogo para uma regra escrita na notação de entrada. */
function ruleId(written) {
  if (RULE_ALIASES.has(written)) return RULE_ALIASES.get(written);
  return written
    .replace(RULE_SYMBOL_RE, (symbol) => RULE_SYMBOLS.get(symbol))
    .replace(RULE_NEGATION_RE, (symbols) => "¬".repeat(symbols.length));
}

/**
 * Onde acaba a fórmula e começa a regra, que é sempre uma só palavra: o índice dela, `head.length`
 * se não houver regra, ou -1 se há citações sem regra. Como `∧I` também se lê como o fim de uma
 * fórmula, um intervalo de dois espaços antes da última palavra separa as duas coisas.
 */
function ruleStart(head, hasCitations) {
  if (head === "") return 0;
  const start = head.search(/\S+$/);
  const before = head.slice(0, start);
  const separated = reads(before.trimEnd());
  if (hasCitations) return separated || !reads(head) ? start : -1;
  if (separated && /\s\s$/.test(before)) return start;
  return reads(head) ? head.length : start;
}

/** Lê as citações depois da vírgula; `offset` é a posição de `text` na linha. */
function parseCitations(text, offset, fail) {
  const citations = [];
  let position = offset;
  for (const part of text.split(",")) {
    const token = part.trim();
    const [, first, second] = CITATION_RE.exec(token) ?? [];
    const from = Number(first);
    const to = second === undefined ? from : Number(second);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || from > to) {
      return { failed: fail("badCitation", position, position + part.length, { token }) };
    }
    citations.push(second === undefined ? citeLine(from) : citeRange(from, to));
    position += part.length + 1;
  }
  return { citations };
}

/** Lê a linha de número `number`; as posições dos erros somam `lineStart`. */
function parseLine(raw, lineStart, number) {
  const fail = (code, start, end, params = {}) => (
    failure(code, lineStart + start, lineStart + end, { line: number, ...params })
  );

  const match = LINE_RE.exec(raw);
  if (!match) return fail("badLine", 0, raw.length);
  const [, written, rest] = match;
  if (Number(written) !== number) {
    const start = raw.indexOf(written);
    return fail("badLineNumber", start, start + written.length, { expected: number, found: written });
  }

  const restStart = raw.length - rest.length;
  const indent = /^[ \t]*/.exec(rest)[0];
  const bodyStart = restStart + indent.length;
  if (indent.includes("\t") || (indent.length > 0 && indent.length % 2 === 0)) {
    return fail("badIndent", restStart, bodyStart);
  }
  const depth = Math.max(indent.length - 1, 0) / 2;

  const body = rest.slice(indent.length).trimEnd();
  const comma = body.indexOf(",");
  const hasCitations = comma !== -1;
  const head = (hasCitations ? body.slice(0, comma) : body).trimEnd();
  const split = ruleStart(head, hasCitations);
  if (split === -1) return fail("missingRuleName", bodyStart, bodyStart + head.length);

  const formulaText = head.slice(0, split).trimEnd();
  const ruleText = head.slice(split);

  let formula = null;
  if (formulaText !== EMPTY_FORMULA) {
    const result = parseFormula(formulaText);
    if (!result.ok) {
      const { code, params, start, end } = result.error;
      return fail(code, bodyStart + start, bodyStart + end, params);
    }
    formula = result.formula;
  }

  const kind = LINE_KINDS.get(ruleText.toLowerCase()) ?? "step";
  if (hasCitations && kind !== "step") {
    return fail("unexpectedCitation", bodyStart + comma, bodyStart + body.length);
  }
  const { citations = [], failed } = hasCitations
    ? parseCitations(body.slice(comma + 1), bodyStart + comma + 1, fail)
    : {};
  if (failed) return failed;

  const rule = kind === "step" && ruleText ? ruleId(ruleText) : null;
  return { ok: true, line: { kind, depth, formula, rule, citations } };
}

/** Lê uma prova; as regras não se validam aqui, porque isso é com o verificador. */
export function parseProof(text) {
  const lines = [];
  const spans = [];
  let offset = 0;
  for (const written of text.split("\n")) {
    const raw = written.replace(/\r$/, "");
    if (raw.trim() !== "") {
      const result = parseLine(raw, offset, lines.length + 1);
      if (!result.ok) return result;
      lines.push(result.line);
      spans.push({ start: offset, end: offset + raw.length });
    }
    offset += written.length + 1;
  }

  const result = createProof(lines);
  if (result.ok) return result;
  const { code, params } = result.error;
  const { start, end } = spans[params.line - 1];
  return failure(code, start, end, params);
}

const citationText = (citation) => (
  citation.kind === "line" ? String(citation.line) : `${citation.from}–${citation.to}`
);

function justification({ kind, rule, citations }, labels, ruleLabels) {
  if (kind !== "step") return labels[kind];
  return [rule ? ruleLabel(rule, ruleLabels) : "", ...citations.map(citationText)].join(", ");
}

/**
 * Imprime a prova com as justificações em coluna. `labels` tem as palavras { premise, hypothesis }
 * do idioma da página (`proofText.premise` e `proofText.hypothesis`), todas lidas por `parseProof`.
 * `ruleLabels` (`rules.labels`) dá as siglas do idioma, que o `parseProof` também lê.
 */
export function formatProof({ lines }, labels = DEFAULT_LABELS, ruleLabels = {}) {
  const numberWidth = String(lines.length).length;
  const bodies = lines.map(({ depth, formula }) => (
    "  ".repeat(depth) + (formula ? format(formula) : EMPTY_FORMULA)
  ));
  const column = bodies.reduce((widest, body) => Math.max(widest, body.length), 0);
  return lines.map((line, index) => {
    const number = String(index + 1).padStart(numberWidth);
    const written = justification(line, labels, ruleLabels);
    const body = written ? `${bodies[index].padEnd(column)}   ${written}` : bodies[index];
    return `${number} | ${body}`;
  }).join("\n");
}
