// Catálogo declarativo das regras de inferência. Módulo puro (sem DOM).
// Uma regra é { id, premises, conclusions }:
//   id: o que fica em `rule` numa linha da prova
//   premises: { kind: "formula", schema } | { kind: "subproof", hypothesis, conclusion }
//   conclusions: esquemas alternativos, para as regras com mais do que uma forma (∧E, ∨I)
// As premissas podem ser citadas por qualquer ordem. As metavariáveis são partilhadas entre as
// premissas e a conclusão; a que só aparece na conclusão (o ψ do ∨I) fica com o que lá estiver.

import { parseSchema } from "./schema.js";

function schema(text) {
  const result = parseSchema(text);
  if (!result.ok) throw new Error(`Esquema inválido: ${text}`);
  return result.formula;
}

/** Premissa que é uma subdedução `[hypothesis] … conclusion`. */
export const subproof = (hypothesis, conclusion) => ({ hypothesis, conclusion });

function premise(item) {
  if (typeof item === "string") return Object.freeze({ kind: "formula", schema: schema(item) });
  return Object.freeze({
    kind: "subproof",
    hypothesis: schema(item.hypothesis),
    conclusion: schema(item.conclusion),
  });
}

/** Cria uma regra a partir de esquemas em texto. Uma regra tem sempre pelo menos uma conclusão. */
export function defineRule(id, premises, ...conclusions) {
  return Object.freeze({
    id,
    premises: Object.freeze(premises.map(premise)),
    conclusions: Object.freeze(conclusions.map(schema)),
  });
}

/** Regras base do sistema DN. */
export const BASE_RULES = Object.freeze([
  defineRule("∧I", ["φ", "ψ"], "φ ∧ ψ"),
  defineRule("∧E", ["φ ∧ ψ"], "φ", "ψ"),
  defineRule("∨I", ["φ"], "φ ∨ ψ", "ψ ∨ φ"),
  defineRule("∨E", ["φ ∨ ψ", subproof("φ", "θ"), subproof("ψ", "θ")], "θ"),
  defineRule("¬I", [subproof("φ", "F")], "¬φ"),
  defineRule("¬E", ["¬¬φ"], "φ"),
  defineRule("FI", ["φ", "¬φ"], "F"),
  defineRule("FE", ["F"], "φ"),
  defineRule("→I", [subproof("φ", "ψ")], "φ → ψ"),
  defineRule("→E", ["φ", "φ → ψ"], "ψ"),
  defineRule("R", ["φ"], "φ"),
]);
