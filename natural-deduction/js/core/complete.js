// Solução automática a partir de uma prova parcial. Módulo puro (sem DOM); corre no Worker.
// Contrato:
//   completeProof(proof, goal, { rules = RULES, known = rules, maxSteps })
//     → { status: "solved", proof, start, reason }
//     | { status: "done" | "invalid" | "noProof" | "unknown" }  com os campos de `hint`
//   start: "scratch"  a prova estava por começar;
//          "partial"  as linhas escritas ficam e o resto é preenchido;
//          "restart"  não deu para as aproveitar, e `reason` ({ key, params } | null) diz porquê.
//
// Primeiro `solve` decide se há solução. Depois seguem-se as dicas até ao fim, porque já sabem ler uma
// prova parcial e não apagam nada. Se pararem numa linha errada ou numa subdedução sem saída, a solução
// é a de `solve`, e o texto avisa. O que sai passou sempre pelo verificador.

import { applyHint, hint, isFinished, withoutTrailingBlank } from "./hints.js";
import { RULES } from "./rules.js";
import { solve } from "./solver.js";
import { verifyProof } from "./verify.js";

/** Quantas linhas se aceitam acrescentar à prova parcial. */
export const MAX_COMPLETION_LINES = 400;

const isUntouched = ({ lines }) => lines.every(({ kind, formula }) => kind === "premise" || (kind === "step" && !formula));

const onlyPremises = ({ lines }) => lines.every(({ kind }) => kind === "premise");

/** A frase que explica porque é que as dicas pararam. */
function stopReason(result) {
  if (result.status === "fixLine") return result.levels[1];
  return result.status === "deadEnd" ? result.levels[0] : null;
}

/** Segue as dicas até ao fim: { proof } ou { reason }. */
function followHints(proof, goal, options) {
  let current = proof;
  for (let count = 0; count < MAX_COMPLETION_LINES; count += 1) {
    const result = hint(current, goal, options);
    if (result.status === "done") return { proof: withoutTrailingBlank(current) };
    if (result.status !== "step") return { reason: stopReason(result) };
    const applied = applyHint(current, result.step);
    if (!applied.ok) return { reason: null };
    current = applied.proof;
  }
  return { reason: null };
}

/** Acaba a prova `proof` de `goal`, ou dá uma nova, se a parcial não servir. */
export function completeProof(proof, goal, { rules = RULES, known = rules, maxSteps } = {}) {
  const whole = solve(goal, { rules, maxSteps });
  if (!whole.ok) return { status: "unknown", error: whole.error };
  if (!whole.valid) return { status: "invalid", counterexample: whole.counterexample };
  if (!whole.provable) return { status: "noProof", witness: whole.witness };
  if (isFinished(proof, goal, rules, known)) return { status: "done" };

  const untouched = isUntouched(proof);
  // Sem nada escrito, a de `solve` é a mais curta. Só com premissas não caberia no editor.
  if (untouched && !onlyPremises(whole.proof)) {
    return { status: "solved", proof: whole.proof, start: "scratch", reason: null };
  }
  const followed = followHints(proof, goal, { rules, known, maxSteps });
  if (followed.proof && verifyProof(followed.proof, goal, rules, known).ok) {
    return { status: "solved", proof: followed.proof, start: untouched ? "scratch" : "partial", reason: null };
  }
  return {
    status: "solved",
    proof: whole.proof,
    start: untouched ? "scratch" : "restart",
    reason: followed.reason ?? null,
  };
}
