// Semântica de 1.ª ordem em estruturas finitas: avaliação, procura de contramodelos e o resultado de
// três estados dos sequentes de 1.ª ordem. Módulo puro (sem DOM).
//
// Uma estrutura tem domínio {0, …, size − 1} e interpreta cada símbolo pela sua aridade:
//   { size,
//     constants:  [{ name, value }],
//     functions:  [{ name, arity, table: [{ args: [elementos], value }] }],   // tabela completa
//     predicates: [{ name, arity, extension: [[elementos]] }] }               // tuplos verdadeiros
// Um nome livre (variável de caixa incluída) é uma constante; um átomo sem argumentos é um predicado
// 0-ário, verdadeiro se a extensão tiver o tuplo vazio. O `=` é a identidade. Listas por ordem natural.
// Contrato:
//   signatureOf(formulas)                  → { constants, functions, predicates } (nomes e aridades)
//   evaluateIn(formula, structure, env?)   → boolean; lança um erro se faltar um símbolo
//   isCountermodel(sequent, structure)     → premissas verdadeiras e conclusão falsa
//   findCountermodel(sequent, options?)    → { status: "found", structure, checked, steps }
//                                            | { status: "exhausted", checked, steps }
//   firstOrderVerdict(sequent, { prove? }) → { status: "invalid", structure } | { status: "valid", proof }
//                                            | { status: "unknown" }
// A procura percorre os tamanhos de 1 a `maxSize`, estrutura a estrutura, e para ao fim de `budget`
// passos de avaliação. Nunca afirma que um sequente é válido: sem contramodelo, o resultado é "exhausted". Todo o
// contramodelo devolvido é reavaliado com `evaluateIn` antes de sair.

const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });

/**
 * Domínio máximo e orçamento em passos de avaliação, fixados por `tests/performance/budgets.test.js`:
 * esgotar o orçamento leva cerca de 150 ms com quatro ou cinco quantificadores encaixados.
 */
export const COUNTERMODEL_LIMITS = Object.freeze({ maxSize: 4, budget: 2_000_000 });

const keyOf = (name, arity) => `${name}/${arity}`;
const byName = (a, b) => natural(a.name, b.name) || a.arity - b.arity;

/** Constantes, funções e predicados das fórmulas, cada um com a sua aridade. */
export function signatureOf(formulas) {
  const constants = new Set();
  const functions = new Map();
  const predicates = new Map();

  function visitTerm(node, bound) {
    if (node.args.length === 0) {
      if (!bound.has(node.name)) constants.add(node.name);
      return;
    }
    functions.set(keyOf(node.name, node.args.length), { name: node.name, arity: node.args.length });
    for (const arg of node.args) visitTerm(arg, bound);
  }

  function visit(node, bound) {
    switch (node.kind) {
      case "atom":
        predicates.set(keyOf(node.name, node.args.length), { name: node.name, arity: node.args.length });
        for (const arg of node.args) visitTerm(arg, bound);
        return;
      case "eq":
        for (const arg of node.args) visitTerm(arg, bound);
        return;
      case "forall":
      case "exists":
        visit(node.args[0], new Set(bound).add(node.name));
        return;
      case "falsum":
      case "not":
      case "and":
      case "or":
      case "implies":
        for (const arg of node.args) visit(arg, bound);
        return;
      default:
        throw new Error(`Fórmula sem semântica de 1.ª ordem: ${node.kind}`);
    }
  }

  for (const formula of formulas) visit(formula, new Set());
  return {
    constants: [...constants].sort(natural),
    functions: [...functions.values()].sort(byName),
    predicates: [...predicates.values()].sort(byName),
  };
}

// Compilação de uma fórmula para uma função sobre uma tabela plana de valores. As variáveis ligadas
// ocupam casas de `env`, por profundidade; as constantes, funções e predicados leem `values[offset + i]`,
// com o índice dos argumentos em base `size`.

function compile(formula, offsets, size, scope = new Map(), meter = { steps: 0 }) {
  const indexOf = (args, scope) => {
    const parts = args.map((arg) => compileTerm(arg, scope));
    return (values, env) => {
      let index = 0;
      for (const part of parts) index = index * size + part(values, env);
      return index;
    };
  };

  function compileTerm(node, scope) {
    if (node.args.length === 0) {
      if (scope.has(node.name)) {
        const slot = scope.get(node.name);
        return (values, env) => env[slot];
      }
      const offset = offsets.get(`c:${node.name}`);
      return (values) => values[offset];
    }
    const offset = offsets.get(`f:${keyOf(node.name, node.args.length)}`);
    const index = indexOf(node.args, scope);
    return (values, env) => values[offset + index(values, env)];
  }

  function compileFormula(node, scope, depth) {
    const [first, second] = node.args;
    const sub = (arg) => compileFormula(arg, scope, depth);
    switch (node.kind) {
      case "atom": {
        const offset = offsets.get(`P:${keyOf(node.name, node.args.length)}`);
        const index = indexOf(node.args, scope);
        return (values, env) => values[offset + index(values, env)] === 1;
      }
      case "eq": {
        const left = compileTerm(first, scope);
        const right = compileTerm(second, scope);
        return (values, env) => left(values, env) === right(values, env);
      }
      case "falsum":
        return () => false;
      case "not": {
        const arg = sub(first);
        return (values, env) => !arg(values, env);
      }
      case "and": {
        const left = sub(first);
        const right = sub(second);
        return (values, env) => left(values, env) && right(values, env);
      }
      case "or": {
        const left = sub(first);
        const right = sub(second);
        return (values, env) => left(values, env) || right(values, env);
      }
      case "implies": {
        const left = sub(first);
        const right = sub(second);
        return (values, env) => !left(values, env) || right(values, env);
      }
      case "forall":
      case "exists": {
        // A casa é a profundidade, não o tamanho do âmbito: uma variável que tapa outra ocupa casa nova.
        const slot = depth;
        const body = compileFormula(first, new Map(scope).set(node.name, slot), depth + 1);
        const wanted = node.kind === "exists";
        return (values, env) => {
          for (let element = 0; element < size; element += 1) {
            meter.steps += 1;
            env[slot] = element;
            if (body(values, env) === wanted) return wanted;
          }
          return !wanted;
        };
      }
      default:
        throw new Error(`Fórmula sem semântica de 1.ª ordem: ${node.kind}`);
    }
  }

  return compileFormula(formula, scope, scope.size);
}

const depthOf = (node) =>
  (node.kind === "forall" || node.kind === "exists" ? 1 : 0) + node.args.reduce((max, arg) => Math.max(max, depthOf(arg)), 0);

/** Casas da tabela plana de uma estrutura com `size` elementos, e quantos valores cada uma admite. */
function layoutOf({ constants, functions, predicates }, size) {
  const offsets = new Map();
  const ranges = [];
  const place = (key, cells, values) => {
    offsets.set(key, ranges.length);
    for (let i = 0; i < cells; i += 1) ranges.push(values);
  };
  for (const { name, arity } of predicates) place(`P:${keyOf(name, arity)}`, size ** arity, 2);
  for (const { name, arity } of functions) place(`f:${keyOf(name, arity)}`, size ** arity, size);
  for (const name of constants) place(`c:${name}`, 1, size);
  return { offsets, ranges };
}

/** Número de casas de `layoutOf(signature, size)`, sem as criar. */
function cellCountOf({ constants, functions, predicates }, size) {
  let cells = constants.length;
  for (const { arity } of [...predicates, ...functions]) cells += size ** arity;
  return cells;
}

/** Os tuplos de `arity` elementos de {0, …, size − 1}, pela ordem do índice em base `size`. */
function tuples(size, arity) {
  const result = [];
  const total = size ** arity;
  for (let index = 0; index < total; index += 1) {
    const tuple = new Array(arity);
    for (let position = arity - 1, rest = index; position >= 0; position -= 1) {
      tuple[position] = rest % size;
      rest = Math.floor(rest / size);
    }
    result.push(tuple);
  }
  return result;
}

/** A tabela plana de `structure`, pela ordem de `layoutOf`. Lança um erro se faltar um símbolo. */
function flatten(signature, structure) {
  const { size } = structure;
  const { offsets, ranges } = layoutOf(signature, size);
  const values = new Int32Array(ranges.length);
  const missing = (what) => {
    throw new Error(`A estrutura não interpreta ${what}`);
  };
  const inDomain = (element) => {
    if (!Number.isInteger(element) || element < 0 || element >= size) missing(`o elemento ${element}`);
    return element;
  };
  const indexOf = (args) => args.reduce((index, element) => index * size + inDomain(element), 0);

  for (const { name, arity } of signature.predicates) {
    const entry = structure.predicates.find((item) => item.name === name && item.arity === arity) ?? missing(keyOf(name, arity));
    const offset = offsets.get(`P:${keyOf(name, arity)}`);
    for (const tuple of entry.extension) values[offset + indexOf(tuple)] = 1;
  }
  for (const { name, arity } of signature.functions) {
    const entry = structure.functions.find((item) => item.name === name && item.arity === arity) ?? missing(keyOf(name, arity));
    const offset = offsets.get(`f:${keyOf(name, arity)}`);
    const seen = new Set();
    for (const { args, value } of entry.table) {
      seen.add(indexOf(args));
      values[offset + indexOf(args)] = inDomain(value);
    }
    if (seen.size !== size ** arity) missing(`${keyOf(name, arity)} em todos os argumentos`);
  }
  for (const name of signature.constants) {
    const entry = structure.constants.find((item) => item.name === name) ?? missing(name);
    values[offsets.get(`c:${name}`)] = inDomain(entry.value);
  }
  return { offsets, values };
}

/** A estrutura legível que corresponde à tabela plana. */
function readStructure(signature, offsets, values, size) {
  return {
    size,
    constants: signature.constants.map((name) => ({ name, value: values[offsets.get(`c:${name}`)] })),
    functions: signature.functions.map(({ name, arity }) => {
      const offset = offsets.get(`f:${keyOf(name, arity)}`);
      return { name, arity, table: tuples(size, arity).map((args, index) => ({ args, value: values[offset + index] })) };
    }),
    predicates: signature.predicates.map(({ name, arity }) => {
      const offset = offsets.get(`P:${keyOf(name, arity)}`);
      return { name, arity, extension: tuples(size, arity).filter((_, index) => values[offset + index] === 1) };
    }),
  };
}

/**
 * Valor de `formula` em `structure`. `env` (Map nome → elemento) dá valor a variáveis livres; um nome
 * livre fora do `env` lê-se como constante da estrutura.
 */
export function evaluateIn(formula, structure, env = new Map()) {
  const signature = signatureOf([formula]);
  const assigned = signature.constants.filter((name) => env.has(name));
  const constants = signature.constants.filter((name) => !env.has(name));
  const { offsets, values } = flatten({ ...signature, constants }, structure);
  const holds = compile(formula, offsets, structure.size, new Map(assigned.map((name, slot) => [name, slot])));
  const slots = new Int32Array(assigned.length + depthOf(formula));
  assigned.forEach((name, slot) => {
    slots[slot] = env.get(name);
  });
  return holds(values, slots);
}

/** Verdadeiro se as premissas valem em `structure` e a conclusão não. */
export function isCountermodel({ premises, conclusion }, structure) {
  return premises.every((premise) => evaluateIn(premise, structure)) && !evaluateIn(conclusion, structure);
}

/**
 * Procura uma estrutura finita onde as premissas valem e a conclusão não, com domínio de 1 a
 * `maxSize` elementos. O orçamento conta passos de avaliação: um por estrutura e um por elemento
 * percorrido num quantificador, para o tempo não crescer com o encaixe dos quantificadores. A procura
 * para na primeira estrutura que o ultrapasse. `checked` conta as estruturas avaliadas e `steps` os passos.
 */
export function findCountermodel(goal, { maxSize = COUNTERMODEL_LIMITS.maxSize, budget = COUNTERMODEL_LIMITS.budget } = {}) {
  const { premises, conclusion } = goal;
  const formulas = [conclusion, ...premises];
  const signature = signatureOf(formulas);
  const depth = formulas.reduce((max, formula) => Math.max(max, depthOf(formula)), 0);
  const env = new Int32Array(depth);
  const meter = { steps: 0 };
  let checked = 0;
  const exhausted = () => ({ status: "exhausted", checked, steps: meter.steps });

  for (let size = 1; size <= maxSize; size += 1) {
    // Uma aridade alta faria uma tabela enorme antes de o orçamento contar: com mais casas do que
    // passos, a procura não ia longe, e os domínios maiores só têm mais casas.
    if (cellCountOf(signature, size) > budget) return exhausted();
    const { offsets, ranges } = layoutOf(signature, size);
    const [refutes, ...holds] = formulas.map((formula) => compile(formula, offsets, size, new Map(), meter));
    const values = new Int32Array(ranges.length);
    for (;;) {
      if (meter.steps >= budget) return exhausted();
      checked += 1;
      meter.steps += 1;
      if (!refutes(values, env) && holds.every((premise) => premise(values, env))) {
        const structure = readStructure(signature, offsets, values, size);
        if (!isCountermodel(goal, structure)) throw new Error("Contramodelo que não falha o sequente");
        return { status: "found", structure, checked, steps: meter.steps };
      }
      let cell = 0;
      for (; cell < values.length; cell += 1) {
        values[cell] += 1;
        if (values[cell] < ranges[cell]) break;
        values[cell] = 0;
      }
      if (cell === values.length) break;
    }
  }
  return exhausted();
}

/**
 * Resultado de três estados de um sequente de 1.ª ordem. A procura do contramodelo vem primeiro, porque
 * tem orçamento fixo; depois, `prove(sequent)` (opcional) devolve uma prova ou null. Sem uma nem outro,
 * "unknown": não se afirma que não há prova.
 */
export function firstOrderVerdict(goal, { prove = null, limits = COUNTERMODEL_LIMITS } = {}) {
  const search = findCountermodel(goal, limits);
  if (search.status === "found") return { status: "invalid", structure: search.structure };
  const proof = prove ? prove(goal) : null;
  if (proof) return { status: "valid", proof };
  return { status: "unknown" };
}
