// Verificação da prova. Módulo puro (sem DOM).
// Contrato:
//   verifyLine(proof, n, rules = BASE_RULES, known = rules)
//     → { ok: true } | { ok: false, error: { code, params } }
//     vê só a linha n e as que ela cita. `rules` é o que se pode usar, como um `ruleSet`, e `known` é
//     tudo o que existe: uma regra de `known` fora de `rules` dá `ruleNotAllowed`. Quem usa um conjunto
//     passa `known` (`RULES` e as regras do utilizador), senão a regra proibida dá `unknownRule`.
//   verifyProof(proof, goal, rules = BASE_RULES, known = rules)
//     → { ok, concludes, extraPremises, lineErrors, conclusionError, usesUserRules }
//     ok: a prova inteira demonstra o sequente `goal`. É o único veredicto: os outros campos dizem
//     o que falta. `concludes` olha só para a última linha, sem garantir que ela foi bem derivada.
//     usesUserRules: alguma linha cita uma regra do utilizador (`user: true` em `known`).
// As mensagens estão em `verify.errors.*`, `verify.conclusion.*` e `verify.extraPremise`.
// Convenções de citação: linhas exteriores acessíveis citam-se sem R, a ordem é livre e uma subdedução
// cita-se como intervalo, mesmo com uma só linha (`2–2`).

import { equals } from "./formula.js";
import { accessibleFrom, subproofs } from "./proof.js";
import { BASE_RULES } from "./rules.js";
import { matchSchema } from "./schema.js";

/** Códigos de erro; todos têm o parâmetro { line }. */
export const VERIFY_ERROR_CODES = [
  "noSuchLine", // a linha a verificar não existe
  "emptyFormula", // a linha ainda não tem fórmula
  "missingRule", // o passo não indica regra
  "unknownRule", // { rule }: a regra não existe
  "ruleNotAllowed", // { rule }: a regra existe, mas o conjunto ativo não a permite
  "noSuchCitation", // { cited }: número de linha que não existe
  "inaccessibleLine", // { cited }: vem depois, ou está dentro de uma subdedução fechada ou alheia
  "openSubproof", // { cited }: a subdedução citada ainda contém esta linha
  "notASubproof", // { cited }: o intervalo não é exatamente uma subdedução
  "nestedConclusion", // { cited }: a última linha do intervalo depende de uma hipótese interior
  "emptyCitation", // { cited }: a citação depende de uma linha sem fórmula
  "missingCitation", // { rule, expected, found }: faltam citações
  "extraCitation", // { rule, expected, found }: há citações a mais
  "wrongCitationKind", // { rule }: uma linha onde a regra pede uma subdedução, ou o inverso
  "ruleNotApplicable", // { rule }: o que foi citado não tem a forma das premissas da regra
  "formulaMismatch", // { rule }: a regra aplica-se, mas não dá a fórmula desta linha
];

/** Erros que querem dizer «falta acabar a linha», e não «a linha está errada». */
const PENDING_CODES = ["emptyFormula", "missingRule", "emptyCitation"];

/** Se o erro `code` só diz que a linha está por acabar. */
export const isPendingCode = (code) => PENDING_CODES.includes(code);

/** Estado de cada linha ("ok", "error" ou "pending") a partir do resultado de `verifyProof`. */
export function lineStates(proof, { lineErrors, extraPremises }) {
  const states = proof.lines.map(() => "ok");
  for (const { code, params } of lineErrors) {
    states[params.line - 1] = isPendingCode(code) ? "pending" : "error";
  }
  for (const line of extraPremises) states[line - 1] = "error";
  return states;
}

/** Porque é que a prova não chega à conclusão pedida. */
export const CONCLUSION_ERROR_CODES = [
  "emptyProof", // a prova não tem linhas
  "unfinishedProof", // { line }: a última linha ainda está dentro de uma subdedução
  "wrongConclusion", // { line }: a última linha não é a conclusão do sequente
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
  if (lines[to - 1].depth !== cited.depth) return "nestedConclusion";
  if (!access.ranges.some((range) => range.from === from && range.to === to)) return "inaccessibleLine";
  return lines[from - 1].formula && lines[to - 1].formula ? null : "emptyCitation";
}

/** Estende a substituição com a premissa ou devolve null, se a citação não tiver a forma dela. */
export function bindPremise(premise, citation, lines, substitution) {
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

/** Aplica uma forma da regra às citações: null se der a fórmula da linha, ou o que falhou. */
function checkForm(rule, line, n, lines) {
  const { citations } = line;
  const expected = rule.premises.length;
  const found = citations.length;
  if (found !== expected) {
    return failure(found < expected ? "missingCitation" : "extraCitation", n, { rule: rule.id, expected, found });
  }
  const ranges = countKind(citations, "range", (citation) => citation.kind);
  if (ranges !== countKind(rule.premises, "range", citationKindOf)) {
    return failure("wrongCitationKind", n, { rule: rule.id });
  }

  const { applicable, derives } = applyRule(rule, line.formula, citations, lines);
  if (derives) return null;
  return failure(applicable ? "formulaMismatch" : "ruleNotApplicable", n, { rule: rule.id });
}

/** Verifica a linha n da prova com as regras permitidas `rules`. */
export function verifyLine(proof, n, rules = BASE_RULES, known = rules) {
  const line = proof.lines[n - 1];
  if (!line) return failure("noSuchLine", n);
  if (!line.formula) return failure("emptyFormula", n);
  if (line.kind !== "step") return { ok: true };
  if (!line.rule) return failure("missingRule", n);

  const forms = rules.filter(({ id }) => id === line.rule);
  if (forms.length === 0) {
    const exists = known.some(({ id }) => id === line.rule);
    return failure(exists ? "ruleNotAllowed" : "unknownRule", n, { rule: line.rule });
  }

  const access = accessibleFrom(proof, n);
  const all = subproofs(proof);
  for (const citation of line.citations) {
    const code = citationProblem(proof, n, citation, access, all);
    if (code) return failure(code, n, { cited: citationText(citation) });
  }

  // Entre as formas que falham, conta a que chegou mais longe: citação certa, fórmula errada.
  const failures = forms.map((form) => checkForm(form, line, n, proof.lines));
  if (failures.includes(null)) return { ok: true };
  return failures.find(({ error }) => error.code === "formulaMismatch") ?? failures[0];
}

function findConclusionError(lines, goal) {
  const last = lines.at(-1);
  if (!last) return { code: "emptyProof", params: {} };
  const line = lines.length;
  if (last.depth > 0) return { code: "unfinishedProof", params: { line } };
  if (!last.formula || !equals(last.formula, goal.conclusion)) {
    return { code: "wrongConclusion", params: { line } };
  }
  return null;
}

/**
 * Verifica todas as linhas e compara a prova com o sequente `goal`. Uma premissa extra é uma fórmula
 * que o sequente não tem, e devolve-se o número da linha. Repetir uma premissa do sequente ou não
 * usar alguma delas não muda o que fica demonstrado, por isso não é erro.
 */
export function verifyProof(proof, goal, rules = BASE_RULES, known = rules) {
  const { lines } = proof;
  const lineErrors = [];
  const extraPremises = [];
  lines.forEach(({ kind, formula }, index) => {
    const result = verifyLine(proof, index + 1, rules, known);
    if (!result.ok) lineErrors.push(result.error);
    const isExtra = kind === "premise" && formula
      && !goal.premises.some((premise) => equals(premise, formula));
    if (isExtra) extraPremises.push(index + 1);
  });
  const conclusionError = findConclusionError(lines, goal);
  const userIds = new Set(known.filter(({ user }) => user).map(({ id }) => id));
  return {
    ok: lineErrors.length === 0 && conclusionError === null && extraPremises.length === 0,
    concludes: conclusionError === null,
    extraPremises,
    lineErrors,
    conclusionError,
    usesUserRules: lines.some(({ kind, rule }) => kind === "step" && userIds.has(rule)),
  };
}
