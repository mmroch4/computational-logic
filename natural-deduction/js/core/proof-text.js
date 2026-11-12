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
//
// Na 1.ª ordem, a variável nova de uma caixa marca-se à margem, onde começa a caixa:
//
//   3 |  [v] P(v) → Q(v)   ∀E, 1        passo que abre a caixa do ∀I, à profundidade 1
//     |  [u]                           linha de etiqueta: caixa do ∀I que começa por uma hipótese
//   4 |     P(u)          hipótese
//
// A marca `[v]` fica a 2·profundidade espaços da barra, onde ficaria a barra da caixa, e a fórmula vem
// depois dela. A linha de etiqueta não tem número e abre a caixa da hipótese seguinte, um nível mais
// dentro; no modelo é o campo `label` dessa hipótese.
// Contrato:
//   parseProof(text) → { ok: true, proof } | { ok: false, error: { code, params, start, end } }
//   formatProof(proof, labels, ruleLabels) → texto que `parseProof` volta a ler
// As posições são índices em `text`, e `params.line` é sempre a linha da prova. Os códigos são os de
// `PROOF_TEXT_ERROR_CODES` (`proofText.errors.*`), do parser (`parser.errors.*`) e da estrutura da
// prova (`proof.errors.*`).

import { format, isTermName } from "./formula.js";
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
  "badFresh", // { name }: a marca `[…]` não tem um nome que possa ser variável, ou está numa premissa
  "orphanLabel", // a linha de etiqueta não vem antes de uma hipótese um nível mais dentro
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
export const RULE_ALIASES = new Map([
  ["RAA", "RA"],
  ["LEM", "TE"],
  ["HS", "SH"],
  ["DS", "SD"],
]);

const LINE_RE = /^\s*(\d+)\s*\|(.*)$/;
const LABEL_LINE_RE = /^\s*\|([ \t]*)\[([^\]]*)\]\s*$/;
const MARK_RE = /^\[([^\]]*)\][ \t]*/;
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

/** Indica se `name`, escrito como regra, não seria lido como uma regra com esse mesmo nome. */
export function isReservedRuleWord(name) {
  return LINE_KINDS.has(name.toLowerCase()) || ruleId(name) !== name;
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

/** A citação escrita em `token`, ou null. */
function readCitation(token) {
  const [, first, second] = CITATION_RE.exec(token) ?? [];
  const from = Number(first);
  const to = second === undefined ? from : Number(second);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || from > to) return null;
  return second === undefined ? citeLine(from) : citeRange(from, to);
}

/** Lê as citações depois da vírgula; `offset` é a posição de `text` na linha. */
function parseCitations(text, offset, fail) {
  const citations = [];
  let position = offset;
  for (const part of text.split(",")) {
    const token = part.trim();
    const citation = readCitation(token);
    if (!citation) return { failed: fail("badCitation", position, position + part.length, { token }) };
    citations.push(citation);
    position += part.length + 1;
  }
  return { citations };
}

/**
 * Lê só a justificação da linha `line`, como no campo do editor: a regra e as citações, separadas por
 * vírgulas ou espaços. Vazia, não tem regra.
 * → { ok: true, rule, citations } | { ok: false, error: { code, params } }
 */
export function parseJustification(text, line) {
  const written = text.trim();
  if (written === "") return { ok: true, rule: null, citations: [] };
  const [ruleText] = /^[^\s,]*/.exec(written);
  if (ruleText === "" || /^\d/.test(ruleText)) {
    return { ok: false, error: { code: "missingRuleName", params: { line } } };
  }
  const tokens = written.slice(ruleText.length)
    .replace(/(\d)\s*[-–—]\s*(?=\d)/g, "$1–")
    .split(/[\s,]+/)
    .filter(Boolean);
  const citations = [];
  for (const token of tokens) {
    const citation = readCitation(token);
    if (!citation) return { ok: false, error: { code: "badCitation", params: { line, token } } };
    citations.push(citation);
  }
  return { ok: true, rule: ruleId(ruleText), citations };
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
  let bodyStart = restStart + indent.length;
  const mark = MARK_RE.exec(rest.slice(indent.length));
  if (!indentFits(indent, Boolean(mark))) return fail("badIndent", restStart, bodyStart);
  const depth = mark ? indent.length / 2 : Math.max(indent.length - 1, 0) / 2;

  let fresh = null;
  if (mark) {
    fresh = mark[1].trim();
    if (!isTermName(fresh)) {
      return fail("badFresh", bodyStart, bodyStart + mark[0].trimEnd().length, { name: fresh });
    }
    bodyStart += mark[0].length;
  }

  const body = raw.slice(bodyStart).trimEnd();
  const comma = topLevelComma(body);
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
  if (fresh !== null && kind === "premise") {
    const markStart = restStart + indent.length;
    return fail("badFresh", markStart, markStart + mark[0].trimEnd().length, { name: fresh });
  }
  if (hasCitations && kind !== "step") {
    return fail("unexpectedCitation", bodyStart + comma, bodyStart + body.length);
  }
  const { citations = [], failed } = hasCitations
    ? parseCitations(body.slice(comma + 1), bodyStart + comma + 1, fail)
    : {};
  if (failed) return failed;

  const rule = kind === "step" && ruleText ? ruleId(ruleText) : null;
  return { ok: true, line: { kind, depth, formula, rule, citations, fresh } };
}

/**
 * Indica se a indentação serve: um espaço mais dois por escopo, ou, antes de uma marca `[v]`, dois
 * por escopo (a marca fica onde estaria a barra da caixa que abre).
 */
function indentFits(indent, marked) {
  if (indent.includes("\t")) return false;
  if (marked) return indent.length > 0 && indent.length % 2 === 0;
  return indent.length === 0 || indent.length % 2 === 1;
}

/** A primeira vírgula fora de parênteses, que separa a regra das citações, ou -1. */
function topLevelComma(body) {
  let level = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "(") level += 1;
    else if (char === ")") level = Math.max(level - 1, 0);
    else if (char === "," && level === 0) return index;
  }
  return -1;
}

/** Lê uma linha de etiqueta (`  |  [v]`), ou devolve null se `raw` não tiver essa forma. */
function parseLabelLine(raw, lineStart, number) {
  const match = LABEL_LINE_RE.exec(raw);
  if (!match) return null;
  const [, indent, written] = match;
  const indentStart = raw.indexOf("|") + 1;
  const markStart = indentStart + indent.length;
  const fail = (code, start, end, params = {}) => (
    failure(code, lineStart + start, lineStart + end, { line: number, ...params })
  );
  if (!indentFits(indent, true)) return fail("badIndent", indentStart, markStart);
  const name = written.trim();
  if (!isTermName(name)) return fail("badFresh", markStart, raw.trimEnd().length, { name });
  return { ok: true, label: { name, depth: indent.length / 2 } };
}

/** Lê uma prova; as regras não se validam aqui, porque isso é com o verificador. */
export function parseProof(text) {
  const lines = [];
  const spans = [];
  let pending = null; // a linha de etiqueta à espera da hipótese: { name, depth, start, end }
  const orphan = () => (
    failure("orphanLabel", pending.start, pending.end, { line: lines.length + 1 })
  );
  let offset = 0;
  for (const written of text.split("\n")) {
    const raw = written.replace(/\r$/, "");
    if (raw.trim() !== "") {
      const number = lines.length + 1;
      const labelLine = parseLabelLine(raw, offset, number);
      if (labelLine && !labelLine.ok) return labelLine;
      if (labelLine) {
        if (pending) return orphan();
        pending = { ...labelLine.label, start: offset, end: offset + raw.length };
      } else {
        const result = parseLine(raw, offset, number);
        if (!result.ok) return result;
        const { line } = result;
        if (pending) {
          if (line.kind !== "hypothesis" || line.depth !== pending.depth + 1) return orphan();
          line.label = pending.name;
          pending = null;
        }
        lines.push(line);
        spans.push({ start: offset, end: offset + raw.length });
      }
    }
    offset += written.length + 1;
  }
  if (pending) return orphan();

  const result = createProof(lines);
  if (result.ok) return result;
  const { code, params } = result.error;
  const { start, end } = spans[params.line - 1];
  return failure(code, start, end, params);
}

const citationText = (citation) => (
  citation.kind === "line" ? String(citation.line) : `${citation.from}–${citation.to}`
);

/** A justificação de um passo, como se imprime: `→E, 2, 1`. */
export function formatJustification(rule, citations, ruleLabels = {}) {
  return [rule ? ruleLabel(rule, ruleLabels) : "", ...citations.map(citationText)].join(", ");
}

function justification({ kind, rule, citations }, labels, ruleLabels) {
  if (kind !== "step") return labels[kind];
  return formatJustification(rule, citations, ruleLabels);
}

/** A marca da variável de uma caixa à profundidade `depth`, com a indentação antes dela. */
const mark = (depth, name) => `${" ".repeat(2 * depth)}[${name}]`;

/**
 * Imprime a prova com as justificações em coluna. `labels` tem as palavras { premise, hypothesis }
 * do idioma da página (`proofText.premise` e `proofText.hypothesis`), todas lidas por `parseProof`.
 * `ruleLabels` (`rules.labels`) dá as siglas do idioma, que o `parseProof` também lê.
 */
export function formatProof({ lines }, labels = DEFAULT_LABELS, ruleLabels = {}) {
  const numberWidth = String(lines.length).length;
  const bodies = lines.map(({ depth, formula, fresh = null }) => {
    const written = formula ? format(formula) : EMPTY_FORMULA;
    return fresh === null ? ` ${"  ".repeat(depth)}${written}` : `${mark(depth, fresh)} ${written}`;
  });
  const column = bodies.reduce((widest, body) => Math.max(widest, body.length), 0);
  return lines.flatMap((line, index) => {
    const number = String(index + 1).padStart(numberWidth);
    const written = justification(line, labels, ruleLabels);
    const body = written ? `${bodies[index].padEnd(column)}   ${written}` : bodies[index];
    const numbered = `${number} |${body}`;
    const { label = null } = line;
    return label === null ? [numbered] : [`${" ".repeat(numberWidth)} |${mark(line.depth - 1, label)}`, numbered];
  }).join("\n");
}
