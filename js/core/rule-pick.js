// Escolher a regra de uma linha no modo de escrita: escolhe-se a regra e depois as linhas que ela cita,
// uma de cada vez, e a justificação escreve-se sozinha. Módulo puro (sem DOM).
//
// A linha já escrita restringe o que se pode citar. Por isso, em `c`, ∧E só aceita linhas com `c` de um dos
// lados. Com a linha vazia, a regra diz qual é a fórmula, e essa também se escreve.
// Contrato:
//   pickableRules(rules) → ids, sem repetições
//   pickState(editor, line, id, cited, { rules }) → um de
//     { status: "refused", conclusions }: a regra não conclui a fórmula da linha.
//     { status: "select", premise: { kind, text }, step, total, candidates }: `candidates` são citações.
//     { status: "done", citations, results }: `results` são fórmulas possíveis; [null] diz que a regra não
//       a fixa, e quem escreve é o utilizador.
//   applyPick(editor, line, { id, citations, formula }, ruleLabels) → estado seguinte
// `cited` é uma lista de citações de `proof.js`.

import { moveCursor, setText } from "./editor.js";
import { format } from "./formula.js";
import { assignments, citableFrom, instanceOf } from "./guided.js";
import { accessibleFrom, citeLine, citeRange } from "./proof.js";
import { formatJustification } from "./proof-text.js";
import { matchSchema } from "./schema.js";

export const pickableRules = (rules) => [...new Set(rules.map(({ id }) => id))];

/** Cada forma e conclusão possível, com o que a fórmula da linha já fixa. */
function startingPoints(forms, target) {
  return forms.flatMap((form, formIndex) => form.conclusions.flatMap((conclusion, conclusionIndex) => {
    const match = target ? matchSchema(conclusion, target) : { ok: true, substitution: {} };
    return match.ok ? [{ form, conclusion, key: `${formIndex}:${conclusionIndex}`, substitution: match.substitution }] : [];
  }));
}

/** Troca as metavariáveis já conhecidas, para o pedido mostrar `a ∧ ψ` depois de se escolher `a`. */
function partly(schema, substitution) {
  if (schema.kind === "meta") return substitution[schema.name] ?? schema;
  return { ...schema, args: schema.args.map((arg) => partly(arg, substitution)) };
}

function premiseOf(premise, substitution) {
  if (premise.kind === "formula") return { kind: "line", text: format(partly(premise.schema, substitution)) };
  const hypothesis = format(partly(premise.hypothesis, substitution));
  return { kind: "range", text: `[${hypothesis}] … ${format(partly(premise.conclusion, substitution))}` };
}

const sameCitation = (a, b) => a.kind === b.kind && a.line === b.line && a.from === b.from && a.to === b.to;

const bindings = (start, cited, lines) => (
  [...assignments(start.form.premises, cited, lines, start.substitution)].map((found) => ({ ...start, ...found }))
);

function finished(complete) {
  const byConclusion = new Map();
  for (const branch of complete) if (!byConclusion.has(branch.key)) byConclusion.set(branch.key, branch);
  const formulas = [...byConclusion.values()].map(({ conclusion, substitution }) => instanceOf(conclusion, substitution));
  if (formulas.includes(null)) return [null];
  return [...new Map(formulas.map((formula) => [format(formula), formula])).values()];
}

/** Se o que falta citar existe na prova: uma linha que deixa a regra a meio não se oferece. */
function completes(start, cited, items, lines) {
  const found = bindings(start, cited, lines);
  if (found.some(({ form, cited: used }) => used.size === form.premises.length)) return true;
  return found.length > 0 && items.some((item) => (
    !cited.some((other) => sameCitation(other, item)) && completes(start, [...cited, item], items, lines)
  ));
}

export function pickState(editor, line, id, cited, { rules }) {
  const { lines } = editor.proof;
  const forms = rules.filter((rule) => rule.id === id);
  const starts = startingPoints(forms, lines[line - 1].formula);
  if (starts.length === 0) {
    const conclusions = [...new Set(forms.flatMap((form) => form.conclusions.map(format)))].join(" · ");
    return { status: "refused", conclusions };
  }

  const branches = starts.flatMap((start) => bindings(start, cited, lines));
  const complete = branches.filter(({ form, cited: used }) => used.size === form.premises.length);
  if (complete.length > 0) return { status: "done", citations: cited, results: finished(complete) };

  const available = citableFrom(editor.proof, accessibleFrom(editor.proof, line));
  const items = [...available.lines.map(citeLine), ...available.ranges.map(({ from, to }) => citeRange(from, to))];
  const candidates = items.filter((item) => (
    !cited.some((other) => sameCitation(other, item))
    && starts.some((start) => completes(start, [...cited, item], items, lines))
  ));
  const { form, substitution, cited: used } = branches[0];
  const position = form.premises.findIndex((_, index) => !used.has(index));
  return {
    status: "select",
    premise: premiseOf(form.premises[position], substitution),
    step: cited.length + 1,
    total: form.premises.length,
    candidates,
  };
}

/** Escreve a justificação e, se a linha estiver vazia, a fórmula. Sem fórmula, o cursor fica nesse campo. */
export function applyPick(editor, line, { id, citations, formula }, ruleLabels = {}) {
  const written = editor.proof.lines[line - 1].formula;
  const withFormula = formula && !written ? setText(editor, line, "formula", format(formula)) : editor;
  const next = setText(withFormula, line, "justification", formatJustification(id, citations, ruleLabels));
  return moveCursor(next, line, formula || written ? "justification" : "formula");
}
