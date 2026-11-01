// Semântica proposicional: avaliação, tabela de verdade, tautologias e validade de sequentes.
// Módulo puro (sem DOM).
//
// Uma valoração é um Map { nome → boolean }. Não é um objeto porque `constructor` é um nome de átomo
// válido. As metavariáveis contam como variáveis proposicionais, para as regras do utilizador.
// Contrato:
//   variablesOf(formulas)      → nomes por ordem natural (p, p2, p10, q)
//   evaluate(formula, valuation) → boolean; lança um erro se faltar uma variável
//   truthTable(formulas)       → { ok: true, table: { variables, rows: [{ values, results }] } }
//   checkSequent(sequent)      → { ok: true, valid, counterexample: Map | null }
//   checkTautology(formula)    → igual a checkSequent(⊢ formula)
// Os três últimos devolvem { ok: false, error: { code, params } } com variáveis a mais.
//
// As linhas vão de tudo V a tudo F, com a primeira variável a mudar mais devagar. O contraexemplo é
// parcial: fixa o menor número de variáveis tal que, seja qual for o valor das outras, as premissas
// são verdadeiras e a conclusão é falsa. Em caso de empate, ganha o que surge primeiro na tabela.

import { sequent } from "./sequent.js";

/**
 * Máximo de variáveis. A procura do contraexemplo mínimo passa por 3ⁿ combinações: com 12 são 531 441,
 * e a tabela tem 4096 linhas.
 */
export const MAX_VARIABLES = 12;

/** Códigos de erro. As mensagens estão em `semantics.errors.*`. */
export const SEMANTICS_ERROR_CODES = [
  "tooManyVariables", // { count, max }
];

const compareNames = (a, b) => a.localeCompare(b, "en", { numeric: true });

function collectVariables(formula, names) {
  if (formula.kind === "atom" || formula.kind === "meta") names.add(formula.name);
  for (const arg of formula.args) collectVariables(arg, names);
}

/** Variáveis de `formulas`, sem repetições e por ordem natural. */
export function variablesOf(formulas) {
  const names = new Set();
  for (const formula of formulas) collectVariables(formula, names);
  return [...names].sort(compareNames);
}

/** Valor de `formula` na valoração. Fora da lógica proposicional, não há valor a calcular. */
export function evaluate(formula, valuation) {
  const { kind, name, args } = formula;
  switch (kind) {
    case "falsum":
      return false;
    case "not":
      return !evaluate(args[0], valuation);
    case "and":
      return evaluate(args[0], valuation) && evaluate(args[1], valuation);
    case "or":
      return evaluate(args[0], valuation) || evaluate(args[1], valuation);
    case "implies":
      return !evaluate(args[0], valuation) || evaluate(args[1], valuation);
    case "atom":
    case "meta": {
      const value = valuation.get(name);
      if (args.length > 0 || value === undefined) throw new Error(`Sem valor para: ${name}`);
      return value;
    }
    default:
      throw new Error(`Fórmula sem tabela de verdade: ${kind}`);
  }
}

/** Valores das variáveis na linha `row`: o bit mais significativo é a primeira variável e 0 é V. */
function rowValues(row, count) {
  return Array.from({ length: count }, (_, i) => ((row >> (count - 1 - i)) & 1) === 0);
}

/** Tabela de verdade: `values` segue `variables` e `results` segue `formulas`. */
export function truthTable(formulas) {
  const variables = variablesOf(formulas);
  const count = variables.length;
  if (count > MAX_VARIABLES) {
    return { ok: false, error: { code: "tooManyVariables", params: { count, max: MAX_VARIABLES } } };
  }
  const rows = [];
  for (let row = 0; row < 2 ** count; row += 1) {
    const values = rowValues(row, count);
    const valuation = new Map(variables.map((name, i) => [name, values[i]]));
    rows.push({ values, results: formulas.map((formula) => evaluate(formula, valuation)) });
  }
  return { ok: true, table: { variables, rows } };
}

/**
 * Melhor padrão de valores contido em `isCounterexample` (uma flag por linha da tabela).
 * Um padrão é um número em base 3 com um dígito por variável: 0 é V, 1 é F e 2 deixa-a livre. Um
 * padrão com uma variável livre cobre os dois que a fixam, e esses têm índices menores, por isso a
 * ordem crescente resolve-os primeiro. Essa ordem também desempata pela ordem da tabela.
 */
function smallestPattern(isCounterexample, count) {
  const covered = new Uint8Array(3 ** count);
  let best = -1;
  let bestFree = -1;
  for (let pattern = 0; pattern < covered.length; pattern += 1) {
    let rest = pattern;
    let place = 1;
    let row = 0;
    let free = 0;
    let freePlace = 0;
    for (let bit = 0; bit < count; bit += 1) {
      const digit = rest % 3;
      rest = (rest - digit) / 3;
      if (digit === 2) {
        free += 1;
        freePlace = place;
      } else {
        row += digit * 2 ** bit;
      }
      place *= 3;
    }
    covered[pattern] =
      free === 0 ? isCounterexample[row] : covered[pattern - freePlace] & covered[pattern - 2 * freePlace];
    if (covered[pattern] && free > bestFree) {
      best = pattern;
      bestFree = free;
    }
  }
  return best;
}

/** Valoração parcial que corresponde a `pattern`, por ordem das variáveis. */
function patternValuation(pattern, variables) {
  const valuation = new Map();
  variables.forEach((name, i) => {
    const digit = Math.floor(pattern / 3 ** (variables.length - 1 - i)) % 3;
    if (digit !== 2) valuation.set(name, digit === 0);
  });
  return valuation;
}

/** Decide o sequente. Se for inválido, devolve o contraexemplo mínimo. */
export function checkSequent({ premises, conclusion }) {
  const built = truthTable([...premises, conclusion]);
  if (!built.ok) return built;
  const { variables, rows } = built.table;
  const isCounterexample = Uint8Array.from(rows, ({ results }) => {
    const premisesHold = results.slice(0, -1).every(Boolean);
    return premisesHold && !results[results.length - 1] ? 1 : 0;
  });
  if (!isCounterexample.includes(1)) return { ok: true, valid: true, counterexample: null };
  const pattern = smallestPattern(isCounterexample, variables.length);
  return { ok: true, valid: false, counterexample: patternValuation(pattern, variables) };
}

/** Decide se `formula` é tautologia. O contraexemplo é o de `⊢ formula`. */
export function checkTautology(formula) {
  return checkSequent(sequent([], formula));
}
