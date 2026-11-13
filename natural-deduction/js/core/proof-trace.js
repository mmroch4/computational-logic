// Uma prova gerada como lista de eventos, para o Passo a passo a reproduzir. Módulo puro (sem DOM).
// Contrato:
//   proofTrace(proof) → eventos; o passo N é o índice N, o mesmo número que vai em `?step=N`.
//     { type: "start", premises }                  passo 0: só as premissas
//     { type, line, strategy, cited }              um evento por cada outra linha, pela ordem da prova
//       type: "assume" (hipótese), "discharge" (cita uma subdedução, que fecha), "derive" ou, na última
//         linha, "conclude"
//       strategy: código de `solver.strategies.*`
//       cited: as linhas citadas, com todas as de cada subdedução, por ordem
//   clampStep(index, trace) → o passo dentro do trace, ou 0 se `index` não for um número
//   stepOfLine(trace, line) → o passo que escreveu a linha; as premissas são do passo 0
//   proofAt(proof, trace, index) → { lines } com as linhas já escritas no passo `index`
//   stepNotes(proof, event) → as notas de 1.ª ordem do passo: caixa, variável nova, termo instanciado
// Uma prova cuja conclusão é uma premissa só tem o passo 0.

const citedLines = ({ citations }) => {
  const lines = citations.flatMap((citation) => {
    if (citation.kind === "line") return [citation.line];
    return Array.from({ length: citation.to - citation.from + 1 }, (_, offset) => citation.from + offset);
  });
  return [...new Set(lines)].sort((a, b) => a - b);
};

function eventType(line, isLast) {
  if (isLast) return "conclude";
  if (line.kind === "hypothesis") return "assume";
  return line.citations.some(({ kind }) => kind === "range") ? "discharge" : "derive";
}

/** Os eventos de `proof`, que tem de ser uma prova gerada: as linhas trazem a estratégia. */
export function proofTrace(proof) {
  const premises = proof.lines.filter(({ kind }) => kind === "premise").length;
  const steps = proof.lines.slice(premises).map((line, index, added) => ({
    type: eventType(line, index === added.length - 1),
    line: premises + index + 1,
    strategy: line.strategy,
    cited: line.kind === "step" ? citedLines(line) : [],
  }));
  return [{ type: "start", premises }, ...steps];
}

// O termo que ocupa, em `instance`, o lugar das ocorrências livres de `x` em `body`; null se x não
// ocorre livre (∀E e ∃I vácuos) ou se as fórmulas não batem. As ligadas podem ter outro nome (α).
function instanceTerm(body, x, instance) {
  const visit = (a, b) => {
    if (a.kind === "term" && a.args.length === 0 && a.name === x) return b;
    if (a.kind !== b.kind || a.args.length !== b.args.length) return null;
    if ((a.kind === "forall" || a.kind === "exists") && a.name === x) return null;
    for (const [i, arg] of a.args.entries()) {
      const found = visit(arg, b.args[i]);
      if (found) return found;
    }
    return null;
  };
  return visit(body, instance);
}

const isQuantified = (formula, kind) => formula?.kind === kind;
const boxVariable = (line) => line?.fresh ?? line?.label ?? null;

/**
 * O que um passo de 1.ª ordem acrescenta à estratégia: as caixas, a variável nova e o termo de uma
 * instanciação. → [{ key, params }], com as chaves em `player.firstOrder.*` e os termos e as
 * fórmulas como nós (quem mostra formata-os). Um passo proposicional dá [].
 */
export function stepNotes(proof, event) {
  if (event.line === undefined) return [];
  const line = proof.lines[event.line - 1];
  const notes = [];
  if (line.label) notes.push({ key: "labelBox", params: { variable: line.label } });
  if (line.fresh) notes.push({ key: line.kind === "hypothesis" ? "existsBox" : "forallBox", params: { variable: line.fresh } });
  if (line.kind !== "step") return notes;
  const cited = (index) => {
    const citation = line.citations[index];
    return citation?.kind === "line" ? proof.lines[citation.line - 1].formula : null;
  };
  if (line.rule === "∀E" && isQuantified(cited(0), "forall")) {
    const general = cited(0);
    const instance = instanceTerm(general.args[0], general.name, line.formula);
    if (instance) notes.push({ key: "instantiate", params: { variable: general.name, term: instance, formula: general } });
  }
  if (line.rule === "∃I" && isQuantified(line.formula, "exists") && cited(0)) {
    const instance = instanceTerm(line.formula.args[0], line.formula.name, cited(0));
    if (instance) notes.push({ key: "witness", params: { variable: line.formula.name, term: instance } });
  }
  const range = line.citations.find(({ kind }) => kind === "range");
  const variable = range && boxVariable(proof.lines[range.from - 1]);
  if (variable && line.rule === "∀I") notes.push({ key: "closeForall", params: { variable, bound: line.formula.name } });
  if (variable && line.rule === "∃E") notes.push({ key: "closeExists", params: { variable } });
  return notes;
}

export function clampStep(index, trace) {
  const step = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(Math.max(step, 0), Math.max(trace.length - 1, 0));
}

export const stepOfLine = (trace, line) => Math.max(line - trace[0].premises, 0);

export function proofAt(proof, trace, index) {
  return { lines: proof.lines.slice(0, trace[0].premises + clampStep(index, trace)) };
}
