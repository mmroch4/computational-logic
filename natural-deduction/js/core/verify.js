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

// 1.ª ordem: o ∀I cita uma caixa [v] sem hipótese (passo com `fresh`, ou linha de etiqueta) e o ∃E uma
// caixa [v] que abre numa hipótese; as outras regras citam caixas sem [v]. O v da caixa liga-se à
// metavariável `fresh` da premissa antes de casar o resto. As condições da regra avaliam-se depois de
// a conclusão casar; «v nova» olha para as linhas acessíveis antes da caixa. A conclusão e as
// premissas do sequente comparam-se a menos de α.

import { displayName, format, metaVariable, occurs, term } from "./formula.js";
import { accessibleFrom, subproofs } from "./proof.js";
import { BASE_RULES } from "./rules.js";
import { PENDING, checkCondition, matchSchema, sameFormula } from "./schema.js";

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
  "missingFreshBox", // { rule }: a regra pede uma caixa [v] e o que se citou não a tem
  "wrongBox", // { rule }: a caixa citada tem ou não tem [v], ou hipótese, ao contrário do que a regra pede
  "notFresh", // { rule, variable, cited }: a variável da caixa já ocorre na linha acessível `cited`
  "variableEscapes", // { rule, variable }: a variável da caixa fica livre na conclusão da regra
  "notSubstitutable", // { rule, variable, term }: a substituição de variable por term seria capturada
];

/** Erros das condições de 1.ª ordem: ganham aos outros quando a regra casa. */
const CONDITION_CODES = ["notFresh", "variableEscapes", "notSubstitutable"];

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
  // Uma linha de etiqueta e a hipótese a seguir abrem duas caixas na mesma linha `from`.
  const starting = all.filter((candidate) => candidate.from === from);
  const exact = starting.filter((candidate) => candidate.to === to);
  const open = starting.some((candidate) => from < n && n <= candidate.to);
  if (open && !exact.some((candidate) => candidate.to < n)) return "openSubproof";
  if (to >= n) return "inaccessibleLine";
  if (exact.length === 0) return "notASubproof";
  if (!exact.some((candidate) => lines[to - 1].depth === candidate.depth)) return "nestedConclusion";
  if (!access.ranges.some((range) => range.from === from && range.to === to)) return "inaccessibleLine";
  return lines[from - 1].formula && lines[to - 1].formula ? null : "emptyCitation";
}

/**
 * A caixa que um intervalo (já validado) cita: { kind, variable }. `kind` é "forall" (caixa [v] sem
 * hipótese: abre num passo ou numa linha de etiqueta), "exists" (hipótese com [v]) ou "plain".
 */
export function rangeBox(lines, { from, to }) {
  const first = lines[from - 1];
  if (first.kind === "step") return { kind: "forall", variable: first.fresh ?? null };
  const label = first.label ?? null;
  if (label !== null && lines[to - 1].depth === first.depth - 1) return { kind: "forall", variable: label };
  const fresh = first.fresh ?? null;
  return fresh === null ? { kind: "plain", variable: null } : { kind: "exists", variable: fresh };
}

/** O tipo de caixa que uma premissa-subdedução pede, como em `rangeBox`. */
function premiseBox({ fresh, hypothesis }) {
  if (!fresh) return "plain";
  return hypothesis === null ? "forall" : "exists";
}

/** Estende a substituição com a premissa ou devolve null, se a citação não tiver a forma dela. */
export function bindPremise(premise, citation, lines, substitution) {
  if (premise.kind === "formula") {
    const match = matchSchema(premise.schema, lines[citation.line - 1].formula, substitution);
    return match.ok ? match.substitution : null;
  }
  const box = rangeBox(lines, citation);
  if (box.kind !== premiseBox(premise)) return null;
  let bound = substitution;
  if (premise.fresh) {
    if (box.variable === null) return null;
    const variable = matchSchema(metaVariable(premise.fresh), term(box.variable), bound);
    if (!variable.ok) return null;
    bound = variable.substitution;
  }
  if (premise.hypothesis !== null) {
    const hypothesis = matchSchema(premise.hypothesis, lines[citation.from - 1].formula, bound);
    if (!hypothesis.ok) return null;
    bound = hypothesis.substitution;
  }
  const conclusion = matchSchema(premise.conclusion, lines[citation.to - 1].formula, bound);
  return conclusion.ok ? conclusion.substitution : null;
}

const citationKindOf = ({ kind }) => (kind === "formula" ? "line" : "range");

/** A primeira linha acessível antes da caixa `citation` onde o nome `name` ocorre, ou null. */
function earlierOccurrence(proof, citation, name) {
  const { lines } = accessibleFrom(proof, citation.from);
  return lines.find((line) => {
    const { formula } = proof.lines[line - 1];
    return formula && occurs(formula, name);
  }) ?? null;
}

/** A primeira condição da regra que falha, como { code, params }, ou null. */
function conditionProblem(rule, substitution, chosen, proof) {
  for (const condition of rule.conditions) {
    const variable = substitution[condition.variable];
    if (condition.kind === "fresh") {
      const index = rule.premises.findIndex(({ fresh }) => fresh === condition.variable);
      const cited = earlierOccurrence(proof, chosen[index], variable.name);
      if (cited !== null) return { code: "notFresh", params: { variable: displayName(variable.name), cited } };
    } else if (checkCondition(condition, substitution) === false) {
      if (condition.kind === "substitutable") {
        const params = { variable: displayName(variable.name), term: format(substitution[condition.term]) };
        return { code: "notSubstitutable", params };
      }
      return { code: "variableEscapes", params: { variable: displayName(variable.name) } };
    }
  }
  return null;
}

/**
 * Experimenta distribuir as citações pelas premissas, porque a ordem é livre.
 * `applicable`: alguma distribuição encaixa nas premissas. `derives`: e dá a fórmula da linha.
 * `problem`: a primeira condição de 1.ª ordem que falhou, ou a captura numa substituição.
 */
function applyRule(rule, formula, citations, proof) {
  const { lines } = proof;
  const used = citations.map(() => false);
  const chosen = [];
  let applicable = false;
  let problem = null;

  const concludes = (conclusion, substitution) => {
    const match = matchSchema(conclusion, formula, substitution);
    if (!match.ok) {
      const { code, params } = match.error;
      if (code === "capture") {
        problem ??= { code: "notSubstitutable", params: { variable: displayName(params.variable), term: format(params.term) } };
      }
      return false;
    }
    if (match.substitution[PENDING]) return false;
    const failed = conditionProblem(rule, match.substitution, chosen, proof);
    problem ??= failed;
    return failed === null;
  };

  function assign(index, substitution) {
    if (index === rule.premises.length) {
      applicable = true;
      return rule.conclusions.some((conclusion) => concludes(conclusion, substitution));
    }
    const premise = rule.premises[index];
    return citations.some((citation, position) => {
      if (used[position] || citation.kind !== citationKindOf(premise)) return false;
      const bound = bindPremise(premise, citation, lines, substitution);
      if (!bound) return false;
      used[position] = true;
      chosen[index] = citation;
      const derived = assign(index + 1, bound);
      used[position] = false;
      return derived;
    });
  }

  const derives = assign(0, {});
  return { applicable, derives, order: chosen, problem };
}

/**
 * As citações da linha n pela ordem das premissas da regra, ou null se nenhuma forma a justificar.
 * Só faz sentido numa linha que passou em `verifyLine`, que é quem vê se as citações são acessíveis.
 */
export function citationsInRuleOrder(proof, n, rules) {
  const line = proof.lines[n - 1];
  for (const form of rules.filter(({ id }) => id === line.rule)) {
    if (form.premises.length === line.citations.length) {
      const { derives, order } = applyRule(form, line.formula, line.citations, proof);
      if (derives) return order;
    }
  }
  return null;
}

const countKind = (items, kind, kindOf) => items.filter((item) => kindOf(item) === kind).length;

/** Aplica uma forma da regra às citações: null se der a fórmula da linha, ou o que falhou. */
function checkForm(rule, line, n, proof) {
  const { citations } = line;
  const expected = rule.premises.length;
  const found = citations.length;
  if (found !== expected) {
    return failure(found < expected ? "missingCitation" : "extraCitation", n, { rule: rule.id, expected, found });
  }
  const ranges = countKind(citations, "range", (citation) => citation.kind);
  if (ranges !== countKind(rule.premises, "range", citationKindOf)) {
    return failure(needsFreshBox(rule) ? "missingFreshBox" : "wrongCitationKind", n, { rule: rule.id });
  }
  const needed = rule.premises.filter(({ kind }) => kind === "subproof").map(premiseBox).sort();
  const given = citations.filter(({ kind }) => kind === "range").map((range) => rangeBox(proof.lines, range).kind).sort();
  if (needed.join() !== given.join()) {
    const missing = needed.some((kind) => kind !== "plain") && given.includes("plain");
    return failure(missing ? "missingFreshBox" : "wrongBox", n, { rule: rule.id });
  }

  const { applicable, derives, problem } = applyRule(rule, line.formula, citations, proof);
  if (derives) return null;
  if (problem) return failure(problem.code, n, { rule: rule.id, ...problem.params });
  return failure(applicable ? "formulaMismatch" : "ruleNotApplicable", n, { rule: rule.id });
}

const needsFreshBox = (rule) => rule.premises.some(({ kind, fresh }) => kind === "subproof" && fresh);

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
    // Um intervalo que não é caixa, numa regra que pede uma caixa [v]: falta a caixa.
    if (code === "notASubproof" && forms.every(needsFreshBox)) {
      return failure("missingFreshBox", n, { rule: line.rule });
    }
    if (code) return failure(code, n, { cited: citationText(citation) });
  }

  // Entre as formas que falham, conta a que chegou mais longe: uma condição de 1.ª ordem que falha,
  // depois citação certa e fórmula errada.
  const failures = forms.map((form) => checkForm(form, line, n, proof));
  if (failures.includes(null)) return { ok: true };
  return failures.find(({ error }) => CONDITION_CODES.includes(error.code))
    ?? failures.find(({ error }) => error.code === "formulaMismatch")
    ?? failures[0];
}

function findConclusionError(lines, goal) {
  const last = lines.at(-1);
  if (!last) return { code: "emptyProof", params: {} };
  const line = lines.length;
  if (last.depth > 0) return { code: "unfinishedProof", params: { line } };
  if (!last.formula || !sameFormula(last.formula, goal.conclusion)) {
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
      && !goal.premises.some((premise) => sameFormula(premise, formula));
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
