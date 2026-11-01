// Exemplos de conjuntos de cláusulas para experimentar o DLL.
//
// Cada exemplo:
//   { id, source, title: { pt, en }, input, expected, model, note: { pt, en } }
//   - source:   "propagation" (só propagação) | "branching" (com ramificação) | "extra" (casos
//               especiais e um exemplo maior); agrupa os exemplos no menu
//   - input:    texto na notação compacta
//   - expected: "sat" | "unsat"
//   - model:    um modelo de referência { variável: boolean } (só nos satisfazíveis; as variáveis
//               que faltam podem ter qualquer valor), ou null
//
// Os testes confirmam o resultado e o modelo de cada exemplo com o solver.

export const EXAMPLE_SOURCES = ["propagation", "branching", "extra"];

export const EXAMPLES = [
  {
    id: "propagation-chain",
    source: "propagation",
    title: {
      pt: "Cadeia de propagações até F",
      en: "Chain of propagations down to F",
    },
    input: "p1, -p1 -p2, p3 p2, -p7 p2, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7",
    expected: "unsat",
    model: null,
    note: {
      pt: "Só propagação: p₁, ¬p₂, p₃ e ¬p₇, depois p₄, p₅, ¬r e p, depois q e ¬p₆, e aparece F.",
      en: "Propagation only: p₁, ¬p₂, p₃ and ¬p₇, then p₄, p₅, ¬r and p, then q and ¬p₆, and F appears.",
    },
  },
  {
    id: "units-only",
    source: "propagation",
    title: {
      pt: "Só cláusulas unitárias",
      en: "Unit clauses only",
    },
    input: "-p q, -p -q r, -p, -r",
    expected: "sat",
    model: { p: false, r: false },
    note: {
      pt: "¬p e ¬r são unitárias; ao propagá-las o conjunto fica vazio.",
      en: "¬p and ¬r are unit clauses; propagating them empties the set.",
    },
  },
  {
    id: "two-branches",
    source: "branching",
    title: {
      pt: "Dois ramos, ambos em F",
      en: "Two branches, both end in F",
    },
    input: "-p -q, -p q, p -q, p q",
    expected: "unsat",
    model: null,
    note: {
      pt: "Os dois ramos (p e ¬p) acabam em {¬q, q} ⇒ {F}.",
      en: "Both branches (p and ¬p) end in {¬q, q} ⇒ {F}.",
    },
  },
  {
    id: "three-vars-a",
    source: "branching",
    title: { pt: "Três variáveis A (insatisfazível)", en: "Three variables A (unsatisfiable)" },
    input: "p q r, -p -q -r, p -q -r, p q -r, -p q, -p r, p -q r",
    expected: "unsat",
    model: null,
    note: {
      pt: "Ramo p falha; no ramo ¬p tens de escolher outra vez (q) e os dois sub-ramos falham.",
      en: "Branch p fails; in branch ¬p you must choose again (q) and both sub-branches fail.",
    },
  },
  {
    id: "three-vars-b",
    source: "branching",
    title: { pt: "Três variáveis B (satisfazível)", en: "Three variables B (satisfiable)" },
    input: "-p q r, p q r, p q -r, p -q r, p -q -r",
    expected: "sat",
    model: { p: true, q: true },
    note: {
      pt: "Escolhendo p, fica só {q ∨ r}.",
      en: "Choosing p, only {q ∨ r} is left.",
    },
  },
  {
    id: "three-vars-c",
    source: "branching",
    title: { pt: "Três variáveis C (cláusula repetida)", en: "Three variables C (repeated clause)" },
    input: "p -q -r, -p q r, -p q r, -p q, -p r",
    expected: "sat",
    model: { p: false, q: false },
    note: {
      pt: "Escolhendo ¬p, fica só {¬q ∨ ¬r}. A cláusula ¬p ∨ q ∨ r aparece duas vezes e colapsa numa só.",
      en: "Choosing ¬p, only {¬q ∨ ¬r} is left. The clause ¬p ∨ q ∨ r appears twice and collapses into one.",
    },
  },
  {
    id: "three-vars-d",
    source: "branching",
    title: { pt: "Três variáveis D (satisfazível)", en: "Three variables D (satisfiable)" },
    input: "p -q r, -p q r, p -q -r, -p q -r, -p -q -r",
    expected: "sat",
    model: { p: false, q: false },
    note: {
      pt: "Escolhendo ¬p, ficam {¬q ∨ r, ¬q ∨ ¬r}.",
      en: "Choosing ¬p, {¬q ∨ r, ¬q ∨ ¬r} is left.",
    },
  },
  {
    id: "three-vars-e",
    source: "branching",
    title: { pt: "Três variáveis E (com retrocesso)", en: "Three variables E (with backtracking)" },
    input: "p -q -r, -p q r, -p -q -r, -p -q r, -p q -r, p q -r",
    expected: "sat",
    model: { p: false, r: false },
    note: {
      pt: "Escolhendo ¬p, ficam {¬q ∨ ¬r, q ∨ ¬r}.",
      en: "Choosing ¬p, {¬q ∨ ¬r, q ∨ ¬r} is left.",
    },
  },
  {
    id: "pigeons-3-2",
    source: "branching",
    title: {
      pt: "3 pombos, 2 poleiros",
      en: "3 pigeons, 2 holes",
    },
    input: "p11 p12, p21 p22, p31 p32, -p11 -p21, -p11 -p31, -p21 -p31, -p12 -p22, -p12 -p32, -p22 -p32",
    expected: "unsat",
    model: null,
    note: {
      pt: "pᵢⱼ: o pombo i está no poleiro j. Três pombos não cabem em dois poleiros; todos os ramos acabam em F.",
      en: "pᵢⱼ: pigeon i is in hole j. Three pigeons do not fit in two holes; every branch ends in F.",
    },
  },
  {
    id: "unit-then-branch",
    source: "branching",
    title: { pt: "Propagar e depois ramificar", en: "Propagate, then branch" },
    input: "s p -q, -p -q -r, -s p -q, -s -p q, -s p -r, -s -q r, s",
    expected: "sat",
    model: { s: true, p: false, q: false, r: false },
    note: {
      pt: "É o único modelo. Propaga s; ramo p falha; ramo ¬p dá ¬q, ¬r e o conjunto vazio.",
      en: "It is the only model. Propagate s; branch p fails; branch ¬p gives ¬q, ¬r and the empty set.",
    },
  },

  // ---- Casos especiais e um exemplo maior ----
  {
    id: "extra-empty-set",
    source: "extra",
    title: { pt: "Conjunto vazio", en: "Empty set" },
    input: "{}",
    expected: "sat",
    model: {},
    note: {
      pt: "Sem cláusulas, não há nada para satisfazer: qualquer valoração serve.",
      en: "With no clauses there is nothing to satisfy: any valuation works.",
    },
  },
  {
    id: "extra-empty-clause",
    source: "extra",
    title: { pt: "Cláusula vazia {F}", en: "Empty clause {F}" },
    input: "{F}",
    expected: "unsat",
    model: null,
    note: {
      pt: "A cláusula vazia (F) não tem literais, por isso nenhuma valoração a satisfaz.",
      en: "The empty clause (F) has no literals, so no valuation satisfies it.",
    },
  },
  {
    id: "extra-tautology",
    source: "extra",
    title: { pt: "Com uma tautologia", en: "With a tautology" },
    input: "p -p, q r, -q",
    expected: "sat",
    model: { p: true, q: false, r: true },
    note: {
      pt: "Propaga ¬q e r; sobra a tautologia p ∨ ¬p, que o DLL não remove, e tem de escolher p.",
      en: "Propagate ¬q and r; the tautology p ∨ ¬p is left, which DLL does not remove, so it has to choose p.",
    },
  },
  {
    id: "extra-8-vars",
    source: "extra",
    title: { pt: "8 variáveis, com retrocesso", en: "8 variables, with backtracking" },
    input: "p1 p2 p3, -p1 p4, -p2 p5, -p4 -p5 p6, -p3 -p6, -p6 p7, -p7 -p1 p8, -p8 -p2, p3 -p5 -p8",
    expected: "sat",
    model: { p1: true, p2: false, p3: true, p4: true, p5: false, p6: false, p7: true, p8: true },
    note: {
      pt: "Há um ramo que acaba em F antes de se encontrar um modelo.",
      en: "One branch ends in F before a model is found.",
    },
  },
];

/** O exemplo com este id, ou null. */
export function getExample(id) {
  return EXAMPLES.find((example) => example.id === id) ?? null;
}

/** Os exemplos de uma fonte, pela ordem da lista. */
export function examplesBySource(source) {
  return EXAMPLES.filter((example) => example.source === source);
}
