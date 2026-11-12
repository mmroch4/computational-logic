// Contramodelos finitos pequenos, só para os testes: percorre todas as estruturas com domínio de 1 a
// `maxSize` elementos e devolve a primeira em que as premissas valem e a conclusão não. Os nomes livres
// são constantes (os parâmetros das caixas incluídos), o `=` é a identidade e um átomo sem argumentos é
// um valor de verdade. Um tamanho com mais de `budget` estruturas salta-se: a procura nunca diz que um
// sequente é válido, só que não encontrou contramodelo até esse tamanho.

const keyOf = (name, arity) => `${name}/${arity}`;

/** Predicados, funções e constantes das fórmulas, cada um com a sua aridade. */
function signatureOf(formulas) {
  const predicates = new Map();
  const functions = new Map();
  const constants = new Set();

  function visitTerm(node, bound) {
    if (node.args.length === 0) {
      if (!bound.has(node.name)) constants.add(node.name);
      return;
    }
    functions.set(keyOf(node.name, node.args.length), node.args.length);
    for (const arg of node.args) visitTerm(arg, bound);
  }

  function visit(node, bound) {
    if (node.kind === "atom") {
      predicates.set(keyOf(node.name, node.args.length), node.args.length);
      for (const arg of node.args) visitTerm(arg, bound);
    } else if (node.kind === "eq") {
      for (const arg of node.args) visitTerm(arg, bound);
    } else if (node.kind === "forall" || node.kind === "exists") {
      visit(node.args[0], new Set(bound).add(node.name));
    } else {
      for (const arg of node.args) visit(arg, bound);
    }
  }

  for (const formula of formulas) visit(formula, new Set());
  return { predicates, functions, constants };
}

/** As casas de uma estrutura com `size` elementos: uma por entrada de tabela, com quantos valores pode ter. */
function layoutOf({ predicates, functions, constants }, size) {
  const offsets = new Map();
  const ranges = [];
  const place = (key, cells, values) => {
    offsets.set(key, ranges.length);
    for (let i = 0; i < cells; i += 1) ranges.push(values);
  };
  for (const [key, arity] of predicates) place(`P:${key}`, size ** arity, 2);
  for (const [key, arity] of functions) place(`f:${key}`, size ** arity, size);
  for (const name of constants) place(`c:${name}`, 1, size);
  return { offsets, ranges };
}

function evaluator(offsets, values, size) {
  const indexOf = (args, env) => args.reduce((index, arg) => index * size + termValue(arg, env), 0);

  function termValue(node, env) {
    if (node.args.length === 0) {
      return env.has(node.name) ? env.get(node.name) : values[offsets.get(`c:${node.name}`)];
    }
    return values[offsets.get(`f:${keyOf(node.name, node.args.length)}`) + indexOf(node.args, env)];
  }

  function holds(node, env) {
    switch (node.kind) {
      case "atom":
        return values[offsets.get(`P:${keyOf(node.name, node.args.length)}`) + indexOf(node.args, env)] === 1;
      case "eq":
        return termValue(node.args[0], env) === termValue(node.args[1], env);
      case "falsum":
        return false;
      case "not":
        return !holds(node.args[0], env);
      case "and":
        return holds(node.args[0], env) && holds(node.args[1], env);
      case "or":
        return holds(node.args[0], env) || holds(node.args[1], env);
      case "implies":
        return !holds(node.args[0], env) || holds(node.args[1], env);
      case "forall":
      case "exists": {
        const wanted = node.kind === "exists";
        for (let element = 0; element < size; element += 1) {
          if (holds(node.args[0], new Map(env).set(node.name, element)) === wanted) return wanted;
        }
        return !wanted;
      }
      default:
        throw new Error(`Fórmula desconhecida: ${node.kind}`);
    }
  }

  return (formula) => holds(formula, new Map());
}

/**
 * O primeiro contramodelo do sequente com domínio até `maxSize`, ou null. O contramodelo é
 * { size, values }, com os valores pela ordem de `layoutOf`.
 */
export function finiteCountermodel({ premises, conclusion }, { maxSize = 3, budget = 4096 } = {}) {
  const signature = signatureOf([...premises, conclusion]);
  for (let size = 1; size <= maxSize; size += 1) {
    const { offsets, ranges } = layoutOf(signature, size);
    const total = ranges.reduce((product, values) => product * values, 1);
    if (total > budget) break;
    const values = new Int32Array(ranges.length);
    const holds = evaluator(offsets, values, size);
    for (let count = 0; count < total; count += 1) {
      if (premises.every(holds) && !holds(conclusion)) return { size, values: [...values] };
      for (let cell = 0; cell < values.length; cell += 1) {
        values[cell] += 1;
        if (values[cell] < ranges[cell]) break;
        values[cell] = 0;
      }
    }
  }
  return null;
}
