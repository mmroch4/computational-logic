// Endereço do Passo a passo: sequente, passo e vista ↔ query string. Módulo puro (sem DOM).
//
//   ?s=p -> q, p |- q&step=3&view=tree
//
// A prova não vai no link: gera-se outra vez a partir do sequente, e o solver é determinista. O passo 0 e
// a vista `fitch` são o padrão e não entram no link. O `s` lê-se como em `share.js`, com os mesmos erros;
// um `step` ou uma `view` que não se percebam valem o padrão, porque o sequente continua a dar para abrir.
// Contrato:
//   encodeStepLink(goal, { step, view }) → query sem `?`; vazia se o sequente não couber num link
//   decodeStepLink(search) → { status: "none" } | { status: "ok", goal, step, view }
//     | { status: "invalid", error: { code, params }, sequent }
// O `step` lido ainda não foi limitado à prova, que aqui não se conhece: isso é o `clampStep`.

import { blankProof, decodeShare, encodeShare } from "./share.js";

export const STEP_VIEWS = ["fitch", "tree"];

export function encodeStepLink(goal, { step = 0, view = "fitch" } = {}) {
  const { query } = encodeShare(goal, blankProof(goal));
  if (query === "") return "";
  return query + (step > 0 ? `&step=${step}` : "") + (view === "fitch" ? "" : `&view=${view}`);
}

function readStep(value) {
  if (value === null || !/^\d+$/.test(value)) return 0;
  const step = Number(value);
  return Number.isSafeInteger(step) ? step : 0;
}

export function decodeStepLink(search) {
  const query = new URLSearchParams(String(search ?? ""));
  const written = query.get("s");
  if (written === null) return { status: "none" };
  const read = decodeShare(new URLSearchParams({ s: written }).toString());
  if (read.status !== "ok") return read;
  const view = query.get("view");
  return { status: "ok", goal: read.goal, step: readStep(query.get("step")), view: STEP_VIEWS.includes(view) ? view : "fitch" };
}
