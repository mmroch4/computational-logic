// Sequentes de 1.ª ordem do nível dos slides, para o solver (M3). Escritos para estes testes.

/** Válidos: o solver tem de dar prova a todos, dentro de MAX_STEPS e dos orçamentos do Worker. */
export const VALID_FIRST_ORDER = [
  // ∀ e ∃ com conectivos
  "∀x(P(x) → Q(x)), ∀x P(x) ⊢ ∀x Q(x)",
  "∀x(P(x) → Q(x)), P(a) ⊢ Q(a)",
  "∀x P(x) ⊢ ∃x P(x)",
  "∀x(P(x) ∧ Q(x)) ⊢ ∀x P(x) ∧ ∀x Q(x)",
  "∀x P(x) ∧ ∀x Q(x) ⊢ ∀x(P(x) ∧ Q(x))",
  "∃x(P(x) ∧ Q(x)) ⊢ ∃x P(x) ∧ ∃x Q(x)",
  "∃x P(x) ∨ ∃x Q(x) ⊢ ∃x(P(x) ∨ Q(x))",
  "∃x(P(x) ∨ Q(x)) ⊢ ∃x P(x) ∨ ∃x Q(x)",
  "∀x P(x) ∨ ∀x Q(x) ⊢ ∀x(P(x) ∨ Q(x))",
  "∀x(P(x) → Q(x)), ∃x P(x) ⊢ ∃x Q(x)",
  "∀x(P(x) → Q(x)), ¬Q(a) ⊢ ¬P(a)",
  "∀x(P(x) → Q(x)) ⊢ ∀x P(x) → ∀x Q(x)",
  "∀x(P(x) → Q(x)), ∀x(Q(x) → R(x)) ⊢ ∀x(P(x) → R(x))",
  "∀x(P(x) ∨ Q(x)), ∀x ¬P(x) ⊢ ∀x Q(x)",
  "∃x(P(x) → q), ∀x P(x) ⊢ q",
  "∃x P(x) → q ⊢ ∀x(P(x) → q)",
  "∀x(P(x) → q) ⊢ ∃x P(x) → q",
  "p → ∀x P(x) ⊢ ∀x(p → P(x))",
  "∀x(p ∨ P(x)) ⊢ p ∨ ∀x P(x)",
  "⊢ ∀x(P(x) → P(x))",
  // quantificadores encaixados
  "∃x∀y R(x, y) ⊢ ∀y∃x R(x, y)",
  "∀x∀y R(x, y) ⊢ ∀y∀x R(x, y)",
  "∃x∃y R(x, y) ⊢ ∃y∃x R(x, y)",
  "∀x∃y R(x, y), ∀x∀y(R(x, y) → S(x)) ⊢ ∀x S(x)",
  "∃x P(x), ∀x∀y(P(x) → Q(y)) ⊢ ∀y Q(y)",
  "∃x(P(x) ∧ ∀y(Q(y) → R(x, y))), ∀x(P(x) → ¬R(x, a)) ⊢ ¬Q(a)",
  "∀x∀y(R(x, y) → R(y, x)), R(a, b) ⊢ R(b, a)",
  "∀x∀y∀z(R(x, y) ∧ R(y, z) → R(x, z)), R(a, b), R(b, c) ⊢ R(a, c)",
  "∀x(P(x) → Q(f(x))), P(a) ⊢ ∃y Q(y)",
  // negações de quantificadores e clássico
  "¬∃x P(x) ⊢ ∀x ¬P(x)",
  "∀x ¬P(x) ⊢ ¬∃x P(x)",
  "∃x ¬P(x) ⊢ ¬∀x P(x)",
  "¬∀x P(x) ⊢ ∃x ¬P(x)",
  "∀x(P(x) → ¬Q(x)) ⊢ ¬∃x(P(x) ∧ Q(x))",
  "¬∃x(P(x) ∧ Q(x)) ⊢ ∀x(P(x) → ¬Q(x))",
  "¬∀x∃y R(x, y) ⊢ ∃x∀y ¬R(x, y)",
  "⊢ ∃x(P(x) → ∀y P(y))",
  // igualdade
  "⊢ ∀x x = x",
  "a = b ⊢ b = a",
  "a = b, b = c ⊢ a = c",
  "a = b, P(a) ⊢ P(b)",
  "∀x(x = a → P(x)) ⊢ P(a)",
  "P(a) ⊢ ∀x(x = a → P(x))",
  "⊢ ∀x∀y(x = y → (P(x) → P(y)))",
  "∀x∀y(f(x) = y → R(x, y)) ⊢ ∀x R(x, f(x))",
];

/** Inválidos: nenhum pode dar prova. O último só tem modelos infinitos. */
export const INVALID_FIRST_ORDER = [
  "∃x P(x) ⊢ ∀x P(x)",
  "∀x∃y R(x, y) ⊢ ∃y∀x R(x, y)",
  "∀x(P(x) ∨ Q(x)) ⊢ ∀x P(x) ∨ ∀x Q(x)",
  "∃x P(x) ∧ ∃x Q(x) ⊢ ∃x(P(x) ∧ Q(x))",
  "∀x(P(x) → Q(x)), Q(a) ⊢ P(a)",
  "∃x P(x) → q ⊢ ∃x(P(x) → q) ∧ ¬q",
  "a = b ⊢ P(a)",
  "∀x ¬R(x, x), ∀x∀y∀z(R(x, y) ∧ R(y, z) → R(x, z)), ∀x∃y R(x, y), S(a, b) ⊢ F",
];
