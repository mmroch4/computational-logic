// Derivações em árvore: arrumar e escrever em Fitch. Módulo puro (sem DOM).
// Contrato:
//   node(entry, rule, from, strategy), assumption(entry), subderivation(hypothesis, end, strategy)
//     constroem a árvore. `entry` é a fórmula interna da procura, única por fórmula. `from` tem nós e,
//     para as subdeduções, `{ hypothesis, end, strategy }`. Um nó pode aparecer em vários ramos.
//   tidy(derivation) → derivação sem desvios: um nó dá lugar a outro com a mesma fórmula que tenha
//     dentro de si, se esse não depender de nada que ele próprio não dependa. Assim saem os casos de
//     um ∨E que não usam a hipótese, o RA que só repete o que já estava provado e voltas parecidas.
//   writeProof(derivation, premises, { share }) → prova de `proof.js`, em que os passos e as hipóteses
//     guardam `strategy`. Com `share`, o que dois ramos derivam sem precisar das hipóteses deles é
//     escrito uma só vez, antes dos ramos. Nem sempre encurta, porque um ramo pode passar a precisar
//     de R: quem chama compara.
// As estratégias estão em `solver.strategies.*`.

import { citeLine, citeRange, createProof } from "./proof.js";

/** Códigos de estratégia: porque é que o passo ou a hipótese estão na prova. */
export const STRATEGY_CODES = [
  "assumeAntecedent", // hipótese: o antecedente, para provar uma implicação
  "assumeToNegate", // hipótese: φ, para provar ¬φ
  "assumeNegation", // hipótese: a negação do objetivo, para chegar a um absurdo
  "assumeCase", // hipótese: um dos casos de uma disjunção
  "assumeToRefute", // hipótese: uma fórmula de que nada se sabe, para a excluir
  "concludeImplication", // →I
  "concludeNegation", // ¬I
  "concludeByAbsurd", // RA, ou ¬I no caminho ¬I + ¬E
  "joinCases", // ∨E
  "joinConjunction", // ∧I
  "pickDisjunct", // ∨I
  "useConjunction", // ∧E
  "useImplication", // →E com o antecedente já à mão
  "chainImplication", // →E depois de provar o antecedente de propósito
  "removeDoubleNegation", // ¬E
  "reachContradiction", // FI
  "anythingFromAbsurd", // FE
  "excludedMiddle", // TE
  "repeatFact", // R
  "applyRule", // outra regra do conjunto ativo
];

const STRATEGY_OF_RULE = new Map([
  ["→I", "concludeImplication"],
  ["¬I", "concludeNegation"],
  ["RA", "concludeByAbsurd"],
  ["∨E", "joinCases"],
  ["∧I", "joinConjunction"],
  ["∨I", "pickDisjunct"],
  ["∧E", "useConjunction"],
  ["→E", "useImplication"],
  ["¬E", "removeDoubleNegation"],
  ["FI", "reachContradiction"],
  ["FE", "anythingFromAbsurd"],
  ["TE", "excludedMiddle"],
]);

/** A estratégia por omissão de um passo com esta regra. */
export const strategyOf = (rule) => STRATEGY_OF_RULE.get(rule) ?? "applyRule";

/** Passo da derivação. Sem `strategy`, vale a da regra. */
export const node = (entry, rule, from = [], strategy = strategyOf(rule)) => (
  { entry, rule, from, strategy }
);

/** Premissa ou hipótese. */
export const assumption = (entry) => ({ entry, rule: null, from: [], strategy: null });

export const subderivation = (hypothesis, end, strategy) => ({ hypothesis, end, strategy });

const isSubderivation = (source) => "hypothesis" in source;

/** O que está por baixo de `source`, incluindo ele, cada nó uma vez. Pára se `visit` der true. */
function walk(source, visit, seen = new Set()) {
  if (isSubderivation(source)) {
    walk(source.end, visit, seen);
    return;
  }
  if (seen.has(source)) return;
  seen.add(source);
  if (visit(source)) return;
  for (const next of source.from) walk(next, visit, seen);
}

/** `of(fonte)`: as premissas e hipóteses de que ela depende, como bits. */
function createDependencies() {
  const bits = new Map();
  const memo = new Map();
  const bitOf = (item) => {
    if (!bits.has(item)) bits.set(item, 1n << BigInt(bits.size));
    return bits.get(item);
  };

  function of(source) {
    if (isSubderivation(source)) return of(source.end) & ~bitOf(source.hypothesis);
    if (memo.has(source)) return memo.get(source);
    const open = source.rule === null
      ? bitOf(source)
      : source.from.reduce((all, next) => all | of(next), 0n);
    memo.set(source, open);
    return open;
  }

  return { of, bitOf };
}

const sizeOf = (item) => {
  let size = 0;
  walk(item, () => {
    size += 1;
    return false;
  });
  return size;
};

/** Tira os desvios da derivação, de baixo para cima. */
export function tidy(derivation) {
  const dependencies = createDependencies();
  const counts = new Map();
  walk(derivation, ({ entry }) => {
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
    return false;
  });

  /** O nó mais pequeno abaixo de `item` que o pode substituir, ou o próprio `item`. */
  function shortcut(item) {
    if (counts.get(item.entry) < 2) return item;
    const allowed = dependencies.of(item);
    let best = item;
    let bestSize = sizeOf(item);
    walk(item, (inner) => {
      if (inner !== item && inner.entry === item.entry && (dependencies.of(inner) & ~allowed) === 0n) {
        const size = sizeOf(inner);
        if (size < bestSize) [best, bestSize] = [inner, size];
      }
      return false;
    });
    return best;
  }

  const done = new Map();

  function rewriteSource(source) {
    if (!isSubderivation(source)) return rewrite(source);
    const end = rewrite(source.end);
    return end === source.end ? source : { ...source, end };
  }

  function rewrite(item) {
    if (done.has(item)) return done.get(item);
    const from = item.from.map(rewriteSource);
    const same = from.every((source, index) => source === item.from[index]);
    const result = shortcut(same ? item : { ...item, from });
    done.set(item, result);
    return result;
  }

  return rewrite(derivation);
}

/** Escreve a derivação em Fitch. Uma fórmula já acessível no escopo não se deriva de novo. */
export function writeProof(derivation, premises, { share = false } = {}) {
  const lines = [];
  const scopes = [new Map()];
  const dependencies = createDependencies();
  let openBits = 0n;

  const lineOf = (entry) => {
    for (const scope of scopes.toReversed()) {
      if (scope.has(entry.id)) return scope.get(entry.id);
    }
    return null;
  };
  const depth = () => scopes.length - 1;
  const push = (entry, line) => {
    lines.push({ ...line, formula: entry.formula, depth: depth() });
    if (!scopes.at(-1).has(entry.id)) scopes.at(-1).set(entry.id, lines.length);
    return lines.length;
  };

  /** Garante que a última linha do escopo é `end`, com R se ela vier de trás. */
  function finish(end) {
    const line = write(end);
    const closesScope = line === lines.length && lines[line - 1].depth === depth();
    if (!closesScope) {
      push(end.entry, { kind: "step", rule: "R", citations: [citeLine(line)], strategy: "repeatFact" });
    }
  }

  function writeSubproof({ hypothesis, end, strategy }) {
    const outerBits = openBits;
    openBits |= dependencies.bitOf(hypothesis);
    scopes.push(new Map());
    const from = push(hypothesis.entry, { kind: "hypothesis", strategy });
    finish(end);
    scopes.pop();
    openBits = outerBits;
    return citeRange(from, lines.length);
  }

  /** Escreve já o que mais do que um ramo de `item` usa, se puder ficar neste escopo. */
  function writeShared(item) {
    if (!item.from.some(isSubderivation)) return;
    const firstSource = new Map();
    const shared = new Set();
    item.from.forEach((source, index) => walk(source, ({ entry }) => {
      if (firstSource.has(entry) && firstSource.get(entry) !== index) shared.add(entry);
      else firstSource.set(entry, index);
      return false;
    }));
    if (shared.size === 0) return;
    for (const source of item.from) {
      walk(source, (inner) => {
        const fits = (dependencies.of(inner) & ~openBits) === 0n;
        if (!shared.has(inner.entry) || inner.rule === null || !fits) return false;
        if (lineOf(inner.entry) === null) write(inner);
        return true;
      });
    }
  }

  function write(item) {
    const line = lineOf(item.entry);
    if (line !== null) return line;
    if (share) writeShared(item);
    const citations = item.from.map((source) => (
      isSubderivation(source) ? writeSubproof(source) : citeLine(write(source))
    ));
    return push(item.entry, { kind: "step", rule: item.rule, citations, strategy: item.strategy });
  }

  for (const premise of premises) {
    openBits |= dependencies.bitOf(premise);
    lines.push({ kind: "premise", depth: 0, formula: premise.entry.formula });
    if (!scopes[0].has(premise.entry.id)) scopes[0].set(premise.entry.id, lines.length);
  }
  finish(derivation);
  return createProof(lines).proof;
}
