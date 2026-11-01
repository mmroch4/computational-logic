/** Fórmula aleatória em notação compacta: 1–7 variáveis, cláusulas de 1 a 3 literais. */
export function randomFormula(random) {
  const randInt = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  const nVars = randInt(1, 7);
  const nClauses = randInt(1, 4 * nVars + 2);
  const clauses = [];
  for (let i = 0; i < nClauses; i++) {
    const size = randInt(1, 3);
    const literals = [];
    for (let j = 0; j < size; j++) literals.push((random() < 0.5 ? "-" : "") + "p" + randInt(1, nVars));
    clauses.push(literals.join(" "));
  }
  return clauses.join(", ");
}
