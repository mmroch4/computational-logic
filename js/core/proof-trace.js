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

export function clampStep(index, trace) {
  const step = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(Math.max(step, 0), Math.max(trace.length - 1, 0));
}

export const stepOfLine = (trace, line) => Math.max(line - trace[0].premises, 0);

export function proofAt(proof, trace, index) {
  return { lines: proof.lines.slice(0, trace[0].premises + clampStep(index, trace)) };
}
