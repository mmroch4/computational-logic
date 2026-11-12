// Esquemas: fórmulas com metavariáveis (φ, ψ, θ), como `φ ∧ ψ` ou `¬¬φ`. Módulo puro (sem DOM).
// Um esquema é uma fórmula com nós `meta`. Átomos e F são literais: `p` só corresponde a `p`.
// Uma substituição é um objeto { φ: fórmula, ... } e nunca é alterado.
//
// 1.ª ordem: `t`, `t1`, `t2` são metavariáveis de termo (`metaTerm`, ficam com um termo) e `x`, `y`,
// `v` de variável (`metaVariable`, ficam com um termo sem argumentos). A variável de um quantificador
// num esquema é uma metavariável de variável: `∀x φ` casa com `∀y P(y)` e dá x ↦ y. O nó
// `φ[t/x]` (`subst`) é a substituição sem captura das ocorrências livres de x em φ.
//
// Contrato:
//   parseSchema(text)                         → resultado de `parseFormula`
//   matchSchema(schema, formula, substitution = {}) → { ok: true, substitution }
//                                                   | { ok: false, error: { code, params } }
//   applySubstitution(schema, substitution)   → { ok: true, formula }
//                                             | { ok: false, error: { code, params } }
//   checkCondition(condition, substitution)   → true | false | null (fica para o verificador)
// `matchSchema` aceita uma substituição já feita: é assim que as premissas e a conclusão de uma
// regra partilham as metavariáveis. Estes erros são internos: o verificador traduz-os nos seus.
//
// Um `φ[t/x]` só se resolve quando se sabe φ e x (procura t percorrendo φ e a fórmula em paralelo),
// ou quando há dois com o mesmo φ e x e os dois termos já são conhecidos (o =E: φ sai da comparação
// das duas fórmulas). Até lá fica adiado na chave PENDING da substituição, que só existe se houver
// algo por resolver e passa de uma chamada de `matchSchema` para a seguinte.

import {
  VARIABLE_METAVARIABLES, equals, isFree, isSubstitutable, occurs, substitute, term,
} from "./formula.js";
import { INPUT_LIMITS, parseFormula } from "./parser.js";

/** Códigos de erro. */
export const SCHEMA_ERROR_CODES = [
  "mismatch", // { expected, found }: subfórmulas que diferem na forma
  "metavariableConflict", // { metavariable, bound, found }: duas fórmulas para a mesma metavariável
  "unboundMetavariable", // { metavariable }: metavariável sem fórmula na substituição
  "tooLarge", // { size, max }: a instância tem mais nós do que INPUT_LIMITS.maxChars
  "capture", // { formula, variable, term }: φ[t/x] com x não substituível por t em φ
];

/** Chave da substituição com os `φ[t/x]` adiados: [{ schema, formula }]. */
export const PENDING = "pending";

/**
 * Condições declarativas das regras de 1.ª ordem. `variable` e `term` são nomes de metavariáveis e
 * `formula` é um esquema.
 *   fresh:          { variable }            v nova: não ocorre antes da caixa (só o verificador sabe)
 *   notIn:          { variable, formula }   v não ocorre na fórmula, nem ligada
 *   substitutable:  { variable, term, formula }  x substituível por t na fórmula
 *   notFree:        { variable, formula }   v não está livre na fórmula
 */
export const CONDITION_KINDS = ["fresh", "notIn", "substitutable", "notFree"];

const failure = (code, params) => ({ ok: false, error: { code, params } });

const QUANTIFIER_KINDS = new Set(["forall", "exists"]);
const isQuantifier = (node) => QUANTIFIER_KINDS.has(node.kind);
const isVariableTerm = (node) => node.kind === "term" && node.args.length === 0;
/** Num esquema, a variável de um quantificador é uma metavariável se tiver um destes nomes. */
const isMetaBinder = (node) => isQuantifier(node) && VARIABLE_METAVARIABLES.includes(node.name);

/** Lê um esquema: a notação das fórmulas, com metavariáveis. */
export function parseSchema(text) {
  return parseFormula(text, { metavariables: true });
}

/** Liga `name` a `value`, ou confirma que já estava ligado ao mesmo. Devolve um erro, ou null. */
function bind(bindings, name, value) {
  const bound = bindings[name];
  if (!bound) {
    bindings[name] = value;
    return null;
  }
  if (equals(bound, value)) return null;
  return failure("metavariableConflict", { metavariable: name, bound, found: value });
}

/** Devolve o primeiro erro, ou null. Acrescenta a `bindings` o que encontrar e a `pending` os φ[t/x]. */
function collect(schema, formula, bindings, pending) {
  switch (schema.kind) {
    case "meta":
      return bind(bindings, schema.name, formula);
    case "metaTerm":
      if (formula.kind !== "term") return failure("mismatch", { expected: schema, found: formula });
      return bind(bindings, schema.name, formula);
    case "metaVariable":
      if (!isVariableTerm(formula)) return failure("mismatch", { expected: schema, found: formula });
      return bind(bindings, schema.name, formula);
    case "subst":
      pending.push({ schema, formula });
      return null;
    default:
  }
  const sameName = isMetaBinder(schema) || schema.name === formula.name;
  const sameShape = schema.kind === formula.kind && sameName && schema.args.length === formula.args.length;
  if (!sameShape) return failure("mismatch", { expected: schema, found: formula });
  if (isMetaBinder(schema)) {
    const error = bind(bindings, schema.name, term(formula.name));
    if (error) return error;
  }
  for (let i = 0; i < schema.args.length; i += 1) {
    const error = collect(schema.args[i], formula.args[i], bindings, pending);
    if (error) return error;
  }
  return null;
}

/** O erro de captura, se x não for substituível por t em φ. */
function captureError(phi, x, t) {
  return isSubstitutable(phi, x, t) ? null : failure("capture", { formula: phi, variable: x, term: t });
}

/**
 * φ[t/x] = formula, com φ e x conhecidos: percorre as duas e encontra t nas ocorrências livres de x.
 * Sem ocorrências livres, φ tem de ser igual à fórmula e t fica por ligar.
 */
function solveKnown({ schema, formula }, bindings) {
  const [, termSchema] = schema.args;
  const phi = bindings[schema.args[0].name];
  const x = bindings[schema.args[2].name].name;
  let found = null;
  let conflict = false;
  const walk = (left, right, shadowed) => {
    if (!shadowed && isVariableTerm(left) && left.name === x) {
      if (right.kind !== "term") return false;
      if (found && !equals(found, right)) conflict = true;
      found ??= right;
      return !conflict;
    }
    if (left.kind !== right.kind || left.name !== right.name || left.args.length !== right.args.length) return false;
    const inner = shadowed || (isQuantifier(left) && left.name === x);
    return left.args.every((arg, i) => walk(arg, right.args[i], inner));
  };
  if (!walk(phi, formula, false)) {
    return conflict
      ? failure("metavariableConflict", { metavariable: termSchema.name, bound: found, found: formula })
      : failure("mismatch", { expected: schema, found: formula });
  }
  if (!found) return null;
  return collect(termSchema, found, bindings, []) ?? captureError(phi, x, found);
}

/** Um nome que não ocorre em nenhum dos nós. */
function freshName(nodes) {
  for (let i = 0; ; i += 1) {
    const name = i === 0 ? "x" : `x${i}`;
    if (!nodes.some((node) => occurs(node, name))) return name;
  }
}

/**
 * φ[t1/x] = a e φ[t2/x] = b, com t1 e t2 conhecidos e φ por saber: φ é a e b onde coincidem e x
 * onde a tem t1 e b tem t2. Assim o =E reescreve só as ocorrências que mudaram.
 */
function solvePair(first, second, bindings) {
  const [phiSchema, , xSchema] = first.schema.args;
  const t1 = bindings[first.schema.args[1].name];
  const t2 = bindings[second.schema.args[1].name];
  const x = bindings[xSchema.name]?.name ?? freshName([first.formula, second.formula, t1, t2]);
  const variable = term(x);
  const build = (left, right) => {
    if (equals(left, right)) return left;
    if (equals(left, t1) && equals(right, t2)) return variable;
    if (left.kind !== right.kind || left.name !== right.name || left.args.length !== right.args.length) return null;
    const args = [];
    for (let i = 0; i < left.args.length; i += 1) {
      const arg = build(left.args[i], right.args[i]);
      if (!arg) return null;
      args.push(arg);
    }
    return Object.freeze({ ...left, args: Object.freeze(args) });
  };
  const phi = build(first.formula, second.formula);
  if (!phi || !equals(substitute(phi, x, t1), first.formula) || !equals(substitute(phi, x, t2), second.formula)) {
    return failure("mismatch", { expected: second.schema, found: second.formula });
  }
  const error = captureError(phi, x, t1) ?? captureError(phi, x, t2);
  if (error) return error;
  bindings[phiSchema.name] = phi;
  bindings[xSchema.name] = variable;
  return null;
}

const sameSubject = (a, b) => (
  a.schema.args[0].name === b.schema.args[0].name && a.schema.args[2].name === b.schema.args[2].name
);

/** Resolve o que já der. Devolve um erro, ou null; `pending` fica só com o que não se resolveu. */
function resolve(bindings, pending) {
  for (let progress = true; progress;) {
    progress = false;
    for (let i = 0; i < pending.length; i += 1) {
      const [phi, , x] = pending[i].schema.args;
      if (bindings[phi.name] && bindings[x.name]) {
        const [item] = pending.splice(i, 1);
        const error = solveKnown(item, bindings);
        if (error) return error;
        progress = true;
        i -= 1;
      }
    }
    const known = (item) => Boolean(bindings[item.schema.args[1].name]);
    for (let i = 0; i < pending.length && !progress; i += 1) {
      const j = pending.findIndex((other, k) => k > i && sameSubject(pending[i], other) && known(other));
      if (j !== -1 && known(pending[i]) && !bindings[pending[i].schema.args[0].name]) {
        const [first, second] = [pending[i], pending[j]];
        pending.splice(j, 1);
        pending.splice(i, 1);
        const error = solvePair(first, second, bindings);
        if (error) return error;
        progress = true;
      }
    }
  }
  return null;
}

/** Procura a substituição que transforma `schema` em `formula`, a estender `substitution`. */
export function matchSchema(schema, formula, substitution = {}) {
  const { [PENDING]: before = [], ...bindings } = substitution;
  const pending = [...before];
  const error = collect(schema, formula, bindings, pending) ?? resolve(bindings, pending);
  if (error) return error;
  if (pending.length > 0) bindings[PENDING] = Object.freeze(pending);
  return { ok: true, substitution: Object.freeze(bindings) };
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
 * Um `φ[t/x]` fica φ com t no lugar das ocorrências livres de x, e falha se t for capturado.
 * O tamanho é limitado porque uma instância pode ter o dobro da profundidade dos seus operandos, e
 * o `equals` esgota a pilha a partir de cerca do dobro de INPUT_LIMITS.maxChars.
 */
export function applySubstitution(schema, substitution) {
  let nodes = 0;
  let unbound = null;
  let capture = null;

  const lookup = (name) => {
    const value = substitution[name];
    if (!value) unbound ??= name;
    return value;
  };

  function build(current) {
    if (["meta", "metaTerm", "metaVariable"].includes(current.kind)) {
      const value = lookup(current.name);
      if (!value) return current;
      nodes += size(value);
      return value;
    }
    if (current.kind === "subst") {
      const [phi, t, x] = current.args.map((arg) => lookup(arg.name));
      if (!phi || !t || !x) return current;
      if (!isSubstitutable(phi, x.name, t)) {
        capture ??= { formula: phi, variable: x.name, term: t };
        return current;
      }
      const value = substitute(phi, x.name, t);
      nodes += size(value);
      return value;
    }
    nodes += 1;
    if (current.args.length === 0) return current;
    const args = [];
    for (const arg of current.args) args.push(build(arg));
    const rebuilt = { ...current, args: Object.freeze(args) };
    if (isMetaBinder(current)) rebuilt.name = lookup(current.name)?.name ?? current.name;
    return Object.freeze(rebuilt);
  }

  const formula = build(schema);
  if (unbound) return failure("unboundMetavariable", { metavariable: unbound });
  if (capture) return failure("capture", capture);
  const max = INPUT_LIMITS.maxChars;
  if (nodes > max) return failure("tooLarge", { size: nodes, max });
  return { ok: true, formula };
}

/**
 * Avalia uma condição com a substituição de uma regra: true, false, ou null se faltar uma
 * metavariável ou se a condição precisar da prova (`fresh`, que é o verificador a avaliar).
 */
export function checkCondition(condition, substitution) {
  if (!CONDITION_KINDS.includes(condition.kind)) throw new Error(`Condição desconhecida: ${condition.kind}`);
  if (condition.kind === "fresh") return null;
  const variable = substitution[condition.variable];
  const formula = applySubstitution(condition.formula, substitution);
  if (!variable || !formula.ok) return null;
  const x = variable.name;
  switch (condition.kind) {
    case "notIn":
      return !occurs(formula.formula, x);
    case "notFree":
      return !isFree(formula.formula, x);
    default: {
      const t = substitution[condition.term];
      return t ? isSubstitutable(formula.formula, x, t) : null;
    }
  }
}
