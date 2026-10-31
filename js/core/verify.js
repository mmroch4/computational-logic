// Verificação de uma linha da prova, sem olhar para as outras linhas além das que ela cita.
// Módulo puro (sem DOM).
// Contrato:
//   verifyLine(proof, n, rules = BASE_RULES) → { ok: true } | { ok: false, error: { code, params } }
// As mensagens estão em `verify.errors.*`.
// Convenções de citação: linhas exteriores acessíveis citam-se sem R, a ordem é livre e uma subdedução
// cita-se como intervalo, mesmo com uma só linha (`2–2`).

import { accessibleFrom, subproofs } from "./proof.js";
import { BASE_RULES } from "./rules.js";
import { matchSchema } from "./schema.js";

/** Códigos de erro; todos têm o parâmetro { line }. */
export const VERIFY_ERROR_CODES = [
  "noSuchLine", // a linha a verificar não existe
  "emptyFormula", // a linha ainda não tem fórmula
  "missingRule", // o passo não indica regra
  "unknownRule", // { rule }: a regra não está no catálogo em uso
  "noSuchCitation", // { cited }: número de linha que não existe
  "inaccessibleLine", // { cited }: vem depois, ou está dentro de uma subdedução fechada ou alheia
  "openSubproof", // { cited }: a subdedução citada ainda contém esta linha
  "notASubproof", // { cited }: o intervalo não é exatamente uma subdedução
  "emptyCitation", // { cited }: a citação depende de uma linha sem fórmula
  "missingCitation", // { rule, expected, found }: faltam citações
  "extraCitation", // { rule, expected, found }: há citações a mais
  "wrongCitationKind", // { rule }: uma linha onde a regra pede uma subdedução, ou o inverso
  "ruleNotApplicable", // { rule }: o que foi citado não tem a forma das premissas da regra
  "formulaMismatch", // { rule }: a regra aplica-se, mas não dá a fórmula desta linha
];

const failure = (code, line, params = {}) => ({ ok: false, error: { code, params: { line, ...params } } });

const citationText = (citation) => (
  citation.kind === "line" ? String(citation.line) : `${citation.from}–${citation.to}`
);

/** Código do que torna a citação inválida para a linha n, ou null. */
function citationProblem(proof, n, citation, access, all) {
  const { lines } = proof;
  if (citation.kind === "line") {
    if (citation.line > lines.length) return "noSuchCitation";
    if (!access.lines.includes(citation.line)) return "inaccessibleLine";
    return lines[citation.line - 1].formula ? null : "emptyCitation";
  }

  const { from, to } = citation;
  if (to > lines.length) return "noSuchCitation";
  const cited = all.find((candidate) => candidate.from === from);
  if (cited && from < n && n <= cited.to) return "openSubproof";
  if (to >= n) return "inaccessibleLine";
  if (cited?.to !== to) return "notASubproof";
  if (!access.ranges.some((range) => range.from === from && range.to === to)) return "inaccessibleLine";
  return lines[from - 1].formula && lines[to - 1].formula ? null : "emptyCitation";
}

/** Estende a substituição com a premissa ou devolve null, se a citação não tiver a forma dela. */
function bindPremise(premise, citation, lines, substitution) {
  if (premise.kind === "formula") {
    const match = matchSchema(premise.schema, lines[citation.line - 1].formula, substitution);
    return match.ok ? match.substitution : null;
  }
  const hypothesis = matchSchema(premise.hypothesis, lines[citation.from - 1].formula, substitution);
  if (!hypothesis.ok) return null;
  const conclusion = matchSchema(premise.conclusion, lines[citation.to - 1].formula, hypothesis.substitution);
  return conclusion.ok ? conclusion.substitution : null;
}

const citationKindOf = ({ kind }) => (kind === "formula" ? "line" : "range");

/**
 * Experimenta distribuir as citações pelas premissas, porque a ordem é livre.
 * `applicable`: alguma distribuição encaixa nas premissas. `derives`: e dá a fórmula da linha.
 */
function applyRule(rule, formula, citations, lines) {
  const used = citations.map(() => false);
  let applicable = false;

  function assign(index, substitution) {
    if (index === rule.premises.length) {
      applicable = true;
      return rule.conclusions.some((conclusion) => matchSchema(conclusion, formula, substitution).ok);
    }
    const premise = rule.premises[index];
    return citations.some((citation, position) => {
      if (used[position] || citation.kind !== citationKindOf(premise)) return false;
      const bound = bindPremise(premise, citation, lines, substitution);
      if (!bound) return false;
      used[position] = true;
      const derived = assign(index + 1, bound);
      used[position] = false;
      return derived;
    });
  }

  const derives = assign(0, {});
  return { applicable, derives };
}

const countKind = (items, kind, kindOf) => items.filter((item) => kindOf(item) === kind).length;

/** Verifica a linha n da prova com o catálogo `rules`. */
export function verifyLine(proof, n, rules = BASE_RULES) {
  const line = proof.lines[n - 1];
  if (!line) return failure("noSuchLine", n);
  if (!line.formula) return failure("emptyFormula", n);
  if (line.kind !== "step") return { ok: true };
  if (!line.rule) return failure("missingRule", n);

  const rule = rules.find(({ id }) => id === line.rule);
  if (!rule) return failure("unknownRule", n, { rule: line.rule });

  const { citations } = line;
  const access = accessibleFrom(proof, n);
  const all = subproofs(proof);
  for (const citation of citations) {
    const code = citationProblem(proof, n, citation, access, all);
    if (code) return failure(code, n, { cited: citationText(citation) });
  }

  const expected = rule.premises.length;
  const found = citations.length;
  if (found !== expected) {
    return failure(found < expected ? "missingCitation" : "extraCitation", n, { rule: rule.id, expected, found });
  }
  const ranges = countKind(citations, "range", (citation) => citation.kind);
  if (ranges !== countKind(rule.premises, "range", citationKindOf)) {
    return failure("wrongCitationKind", n, { rule: rule.id });
  }

  const { applicable, derives } = applyRule(rule, line.formula, citations, proof.lines);
  if (derives) return { ok: true };
  return failure(applicable ? "formulaMismatch" : "ruleNotApplicable", n, { rule: rule.id });
}
