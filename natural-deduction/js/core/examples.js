// Sequentes de exemplo da página Provar, originais. O título de cada um está em `examples.items.<id>`
// e o do grupo em `examples.groups.<id>`. Os testes passam-nos todos pelo solver e pelo verificador.

export const EXAMPLE_GROUPS = Object.freeze([
  {
    id: "direct",
    examples: [
      { id: "chain", sequent: "a → b, b → c, a ⊢ c" },
      { id: "swap", sequent: "s ∧ t ⊢ t ∧ s" },
    ],
  },
  {
    id: "subproofs",
    examples: [
      { id: "curry", sequent: "a ∧ b → c ⊢ a → b → c" },
      { id: "cases", sequent: "a ∨ b, a → c, b → c ⊢ c" },
      { id: "contrapositive", sequent: "s → t ⊢ ¬t → ¬s" },
    ],
  },
  {
    id: "classical",
    examples: [
      { id: "peirce", sequent: "⊢ ((a → b) → a) → a" },
      { id: "excludedMiddle", sequent: "⊢ s ∨ ¬s" },
    ],
  },
  {
    id: "firstOrder",
    examples: [
      { id: "forallBox", sequent: "∀x(P(x) → Q(x)), ∀x P(x) ⊢ ∀x Q(x)" },
      { id: "existsBox", sequent: "∀x(P(x) → Q(x)), ∃x P(x) ⊢ ∃x Q(x)" },
      { id: "swapQuantifiers", sequent: "∃x∀y R(x, y) ⊢ ∀y∃x R(x, y)" },
      { id: "negateExists", sequent: "¬∃x P(x) ⊢ ∀x ¬P(x)" },
      { id: "symmetry", sequent: "a = b ⊢ b = a" },
    ],
  },
  {
    id: "invalid",
    examples: [
      { id: "converse", sequent: "a → b, b ⊢ a" },
      { id: "someToAll", sequent: "∃x P(x) ⊢ ∀x P(x)" },
    ],
  },
]);

/** O exemplo com este id, ou null. */
export function findExample(id) {
  return EXAMPLE_GROUPS.flatMap((group) => group.examples).find((example) => example.id === id) ?? null;
}
