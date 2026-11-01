// Esquemas: fórmulas com metavariáveis (φ, ψ, θ), como `φ ∧ ψ` ou `¬¬φ`. Módulo puro (sem DOM).
// Um esquema é uma fórmula com nós `meta`. Átomos e F são literais: `p` só corresponde a `p`.
// Uma substituição é um objeto { φ: fórmula, ... } e nunca é alterado.
// Contrato:
//   parseSchema(text)                         → resultado de `parseFormula`
//   matchSchema(schema, formula, substitution = {}) → { ok: true, substitution }
//                                                   | { ok: false, error: { code, params } }
//   applySubstitution(schema, substitution)   → { ok: true, formula }
//                                             | { ok: false, error: { code, params } }
// `matchSchema` aceita uma substituição já feita: é assim que as premissas e a conclusão de uma
// regra partilham as metavariáveis. Estes erros são internos: o verificador traduz-os nos seus.

import { equals } from "./formula.js";
import { INPUT_LIMITS, parseFormula } from "./parser.js";

/** Códigos de erro. */
export const SCHEMA_ERROR_CODES = [
  "mismatch", // { expected, found }: subfórmulas que diferem na forma
  "metavariableConflict", // { metavariable, bound, found }: duas fórmulas para a mesma metavariável
  "unboundMetavariable", // { metavariable }: metavariável sem fórmula na substituição
  "tooLarge", // { size, max }: a instância tem mais nós do que INPUT_LIMITS.maxChars
];

const failure = (code, params) => ({ ok: false, error: { code, params } });

/** Lê um esquema: a notação das fórmulas, com metavariáveis. */
export function parseSchema(text) {
  return parseFormula(text, { metavariables: true });
}

/** Devolve o primeiro erro, ou null. Acrescenta a `bindings` o que encontrar. */
function collect(schema, formula, bindings) {
  if (schema.kind === "meta") {
    const bound = bindings[schema.name];
    if (!bound) {
      bindings[schema.name] = formula;
      return null;
    }
    if (equals(bound, formula)) return null;
    return failure("metavariableConflict", { metavariable: schema.name, bound, found: formula });
  }
  const sameShape =
    schema.kind === formula.kind && schema.name === formula.name && schema.args.length === formula.args.length;
  if (!sameShape) return failure("mismatch", { expected: schema, found: formula });
  for (let i = 0; i < schema.args.length; i += 1) {
    const error = collect(schema.args[i], formula.args[i], bindings);
    if (error) return error;
  }
  return null;
}

/** Procura a substituição que transforma `schema` em `formula`, a estender `substitution`. */
export function matchSchema(schema, formula, substitution = {}) {
  const bindings = { ...substitution };
  return collect(schema, formula, bindings) ?? { ok: true, substitution: Object.freeze(bindings) };
}

// As instâncias partilham subárvores, por isso o tamanho fica em cache: os nós são imutáveis.
const SIZES = new WeakMap();

function size(formula) {
  let total = SIZES.get(formula);
  if (total === undefined) {
    total = 1;
    for (const arg of formula.args) total += size(arg);
    SIZES.set(formula, total);
  }
  return total;
}

/**
 * Substitui as metavariáveis em simultâneo: o que entra pela substituição não volta a ser substituído.
 * O tamanho é limitado porque uma instância pode ter o dobro da profundidade dos seus operandos, e
 * o `equals` esgota a pilha a partir de cerca do dobro de INPUT_LIMITS.maxChars.
 */
export function applySubstitution(schema, substitution) {
  let nodes = 0;
  let unbound = null;

  function build(current) {
    if (current.kind === "meta") {
      const value = substitution[current.name];
      if (!value) {
        unbound ??= current.name;
        return current;
      }
      nodes += size(value);
      return value;
    }
    nodes += 1;
    if (current.args.length === 0) return current;
    const args = [];
    for (const arg of current.args) args.push(build(arg));
    return Object.freeze({ ...current, args: Object.freeze(args) });
  }

  const formula = build(schema);
  if (unbound) return failure("unboundMetavariable", { metavariable: unbound });
  const max = INPUT_LIMITS.maxChars;
  if (nodes > max) return failure("tooLarge", { size: nodes, max });
  return { ok: true, formula };
}
