// A prova que se escreve sozinha na página inicial. Cada fotograma é o que o editor mostraria nesse
// momento: os estados vêm do verificador, sobre a prova até aí, e não de uma lista escrita à mão.
//
//   homeDemo() → { sequent, goal, proof, frames }
//   frames[i]: { kind, line, shown, view, states, marks, complete }
//     kind      `start`, `hypothesis`, `writing` (fórmula sem regra), `checked` ou `complete`;
//     line      a linha em causa (no `start`, a última premissa);
//     view      a prova para desenhar: as linhas por escrever vão lá, para guardarem o lugar;
//     states    de `lineStates`, só para as `shown` linhas já escritas;
//     marks     para `fitchHtml`: a linha atual e as `future`.
import { parseProof } from "./proof-text.js";
import { ruleSet } from "./rules.js";
import { parseSequent } from "./sequent.js";
import { lineStates, verifyProof } from "./verify.js";

export const HOME_DEMO = Object.freeze({
  sequent: "a → b, c → ¬b ⊢ a → ¬c",
  text: `
1 | a → b     premissa
2 | c → ¬b    premissa
3 |   a       hip
4 |   b       →E, 1, 3
5 |     c     hip
6 |     ¬b    →E, 2, 5
7 |     F     FI, 4, 6
8 |   ¬c      ¬I, 5–7
9 | a → ¬c    →I, 3–8`,
});

/** A prova com `shown` linhas escritas; em `writing`, a última ainda não tem regra. */
function writtenLines({ lines }, shown, writing) {
  const written = lines.slice(0, shown);
  if (writing) written[shown - 1] = { ...written[shown - 1], rule: null, citations: [] };
  return written;
}

function frame(goal, proof, rules, { kind, line, writing = false }) {
  const written = { ...proof, lines: writtenLines(proof, line, writing) };
  const result = verifyProof(written, goal, rules);
  const marks = new Map();
  if (kind !== "start") marks.set(line, "current");
  for (let future = line + 1; future <= proof.lines.length; future += 1) marks.set(future, "future");
  return {
    kind: result.ok ? "complete" : kind,
    line,
    shown: line,
    view: { ...proof, lines: [...written.lines, ...proof.lines.slice(line)] },
    states: lineStates(written, result),
    marks,
    complete: result.ok,
  };
}

export function homeDemo() {
  const { sequent, text } = HOME_DEMO;
  const goal = parseSequent(sequent).sequent;
  const { proof } = parseProof(text.trim());
  const rules = ruleSet("base");
  const premises = proof.lines.filter(({ kind }) => kind === "premise").length;
  const frames = [frame(goal, proof, rules, { kind: "start", line: premises })];
  proof.lines.forEach(({ kind }, index) => {
    const line = index + 1;
    if (kind === "hypothesis") frames.push(frame(goal, proof, rules, { kind: "hypothesis", line }));
    if (kind !== "step") return;
    frames.push(frame(goal, proof, rules, { kind: "writing", line, writing: true }));
    frames.push(frame(goal, proof, rules, { kind: "checked", line }));
  });
  return { sequent, goal, proof, frames };
}
