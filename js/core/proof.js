// Modelo de prova em notação de Fitch: linhas, subdeduções e escopos. Módulo puro (sem DOM).
// Uma prova é imutável: `{ lines }`, uma lista plana em que a linha n está em `lines[n - 1]`.
//   linha: { kind, depth, formula, rule, citations }
//   kind: "premise" (só no início, profundidade 0), "hypothesis" (abre uma subdedução) ou "step"
//   formula: nó de `formula.js`, ou null numa linha por preencher
//   rule: identificador da regra (só em "step"; quem o interpreta é o verificador), ou null
//   citations: { kind: "line", line } | { kind: "range", from, to }, pela ordem em que foram escritas
//   strategy: só nas provas geradas, código de `solver.strategies.*`; não conta para o verificador
// As subdeduções não se guardam: cada hipótese abre uma, que acaba antes da primeira linha menos
// profunda ou de outra hipótese à mesma profundidade (duas subdeduções seguidas, como no ∨E).
// Uma subdedução tem uma só hipótese e está fechada quando há alguma linha depois dela.
// Contrato: as operações sobre a prova devolvem { ok: true, proof }
//                                             | { ok: false, error: { code, params } }
// As mensagens estão em `proof.errors.*`.

/** Códigos de erro; todos têm o parâmetro { line }. */
export const PROOF_ERROR_CODES = [
  "noSuchLine", // a linha indicada não existe
  "invalidLine", // a linha está mal formada
  "invalidDepth", // a profundidade não encaixa na linha anterior
  "misplacedPremise", // premissa depois de outra coisa, ou dentro de uma subdedução
  "capturesLines", // a hipótese apanharia linhas que vêm a seguir
  "notInSubproof", // não há subdedução para fechar
  "alreadyClosed", // a subdedução já tem linhas depois dela
];

const KINDS = ["premise", "hypothesis", "step"];

const failure = (code, line) => ({ ok: false, error: { code, params: { line } } });

const isLineNumber = (value) => Number.isInteger(value) && value >= 1;

/** Citação de uma linha. */
export const citeLine = (line) => Object.freeze({ kind: "line", line });

/** Citação de um intervalo, normalmente uma subdedução fechada. */
export const citeRange = (from, to) => Object.freeze({ kind: "range", from, to });

function isCitation(citation) {
  if (citation?.kind === "line") return isLineNumber(citation.line);
  if (citation?.kind === "range") {
    return isLineNumber(citation.from) && isLineNumber(citation.to) && citation.from <= citation.to;
  }
  return false;
}

function isWellFormed({ kind, depth, rule = null, citations = [] }) {
  if (!KINDS.includes(kind) || !Number.isInteger(depth) || depth < 0) return false;
  if (!Array.isArray(citations) || !citations.every(isCitation)) return false;
  if (kind === "step") return rule === null || typeof rule === "string";
  return rule === null && citations.length === 0;
}

function freezeLine({ kind, depth, formula = null, rule = null, citations = [], strategy = null }) {
  const line = { kind, depth, formula, rule, citations: Object.freeze([...citations]) };
  return Object.freeze(strategy === null ? line : { ...line, strategy });
}

/** Primeiro erro de estrutura da lista de linhas, ou null. */
function structureError(lines) {
  let previous = null;
  let onlyPremises = true;
  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    if (!isWellFormed(line)) return failure("invalidLine", number);
    const previousDepth = previous?.depth ?? 0;
    if (line.kind === "premise") {
      if (line.depth !== 0 || !onlyPremises) return failure("misplacedPremise", number);
    } else {
      onlyPremises = false;
      const fits = line.kind === "hypothesis"
        ? line.depth >= 1 && line.depth <= previousDepth + 1
        : line.depth <= previousDepth;
      if (!fits) return failure("invalidDepth", number);
    }
    previous = line;
  }
  return null;
}

/** Valida as linhas e devolve a prova imutável. */
export function createProof(lines = []) {
  const error = structureError(lines);
  if (error) return error;
  return { ok: true, proof: Object.freeze({ lines: Object.freeze(lines.map(freezeLine)) }) };
}

/**
 * Lê a estrutura da prova: as subdeduções por ordem de início, cada uma com o índice da que a
 * contém, e `owner[n]`, o índice da subdedução mais interior que contém a linha n (ou -1).
 */
function scan(lines) {
  const found = [];
  const owner = [-1];
  const open = [];
  lines.forEach((line, index) => {
    const reachable = line.kind === "hypothesis" ? line.depth - 1 : line.depth;
    open.length = Math.min(open.length, reachable);
    if (line.kind === "hypothesis") {
      found.push({ from: index + 1, to: index + 1, depth: line.depth, parent: open.at(-1) ?? -1 });
      open.push(found.length - 1);
    }
    for (const subproof of open) found[subproof].to = index + 1;
    owner.push(open.at(-1) ?? -1);
  });
  return { found, owner };
}

/** Subdeduções por ordem de início: { from, to, depth, closed }. */
export function subproofs({ lines }) {
  return scan(lines).found.map(({ from, to, depth }) => (
    Object.freeze({ from, to, depth, closed: to < lines.length })
  ));
}

/** Índices (em `found`) das subdeduções que contêm a linha n, da mais exterior para a mais interior. */
function enclosingIndexes(found, owner, n) {
  const chain = [];
  for (let index = owner[n]; index !== -1; index = found[index].parent) chain.unshift(index);
  return chain;
}

/** Subdeduções que contêm a linha n, da mais exterior para a mais interior. */
export function enclosingSubproofs(proof, n) {
  if (!isLine(proof, n)) return [];
  const { found, owner } = scan(proof.lines);
  const all = subproofs(proof);
  return enclosingIndexes(found, owner, n).map((index) => all[index]);
}

const isLine = ({ lines }, n) => Number.isInteger(n) && n >= 1 && n <= lines.length;

/**
 * O que a linha n pode citar: `lines`, as linhas anteriores fora de subdeduções fechadas, e
 * `ranges`, as subdeduções já fechadas cuja subdedução-mãe contém n (ou que estão no nível de topo).
 * As linhas dentro de uma subdedução fechada só se alcançam pelo intervalo. Uma subdedução que acaba
 * dentro de outra não conta: a última linha dependeria de uma hipótese que nada descarregou.
 */
export function accessibleFrom(proof, n) {
  if (!isLine(proof, n)) return { lines: [], ranges: [] };
  const { found, owner } = scan(proof.lines);
  const inScope = new Set([-1, ...enclosingIndexes(found, owner, n)]);
  const lines = [];
  for (let line = 1; line < n; line += 1) {
    if (inScope.has(owner[line])) lines.push(line);
  }
  const ranges = found
    .filter(({ to, depth, parent }) => to < n && inScope.has(parent) && proof.lines[to - 1].depth === depth)
    .map(({ from, to }) => ({ from, to }));
  return { lines, ranges };
}

/**
 * Aplica `next` e corrige as citações. `origin[i]` é o número antigo da linha i de `next`, ou 0 numa
 * linha nova, cujas citações já vêm na numeração nova.
 * - Uma citação de uma linha apagada desaparece, e o verificador dará «citação em falta». Mudá-la
 *   para outra linha podia validar um passo errado.
 * - Um intervalo que era uma subdedução continua a ser essa subdedução, com o novo fim, e desaparece
 *   com ela. Outro intervalo encolhe para as linhas que restam.
 * - Números que não correspondiam a nenhuma linha ficam como estão, para o verificador os recusar.
 */
function rebuild(proof, next, origin) {
  const error = structureError(next);
  if (error) return error;
  const oldCount = proof.lines.length;
  const renumber = new Map();
  origin.forEach((old, index) => {
    if (old !== 0) renumber.set(old, index + 1);
  });
  const oldSubproofs = new Set(scan(proof.lines).found.map(({ from, to }) => `${from}-${to}`));
  const newSubproofs = scan(next).found;

  const edge = (line, step) => {
    if (line < 1 || line > oldCount) return line;
    for (let old = line; old >= 1 && old <= oldCount; old += step) {
      if (renumber.has(old)) return renumber.get(old);
    }
    return null;
  };

  const moveCitation = (citation) => {
    if (citation.kind === "line") {
      if (citation.line > oldCount) return citation;
      return renumber.has(citation.line) ? citeLine(renumber.get(citation.line)) : null;
    }
    if (oldSubproofs.has(`${citation.from}-${citation.to}`)) {
      const from = renumber.get(citation.from);
      const subproof = newSubproofs.find((candidate) => candidate.from === from);
      return subproof ? citeRange(subproof.from, subproof.to) : null;
    }
    const from = edge(citation.from, 1);
    const to = edge(citation.to, -1);
    return from !== null && to !== null && from <= to ? citeRange(from, to) : null;
  };

  const moved = next.map((line, index) => {
    if (origin[index] === 0) return line;
    return { ...line, citations: line.citations.map(moveCitation).filter(Boolean) };
  });
  return createProof(moved);
}

/**
 * Insere uma linha depois da linha `after` (0 para o início). A profundidade é `line.depth` ou, sem
 * ela, a da linha `after`; indicar uma menor fecha subdeduções. Uma hipótese só pode entrar onde não
 * apanhe as linhas seguintes, que mudariam de escopo sem ninguém o pedir.
 */
export function insertLine(proof, after, line) {
  const { lines } = proof;
  if (after !== 0 && !isLine(proof, after)) return failure("noSuchLine", after);
  const inserted = { kind: "step", depth: lines[after - 1]?.depth ?? 0, ...line };
  const number = after + 1;
  if (!isWellFormed(inserted)) return failure("invalidLine", number);

  const following = lines[after];
  if (inserted.kind === "hypothesis" && following) {
    const staysOutside = following.depth < inserted.depth
      || (following.depth === inserted.depth && following.kind === "hypothesis");
    if (!staysOutside) return failure("capturesLines", number);
  }

  const next = [...lines.slice(0, after), freezeLine(inserted), ...lines.slice(after)];
  const origin = next.map((_, index) => {
    if (index === after) return 0;
    return index < after ? index + 1 : index;
  });
  return rebuild(proof, next, origin);
}

/**
 * Apaga a linha n. Apagar uma hipótese apaga a subdedução inteira, porque as linhas dela dependiam
 * dessa hipótese.
 */
export function deleteLine(proof, n) {
  if (!isLine(proof, n)) return failure("noSuchLine", n);
  const { lines } = proof;
  const to = lines[n - 1].kind === "hypothesis"
    ? scan(lines).found.find(({ from }) => from === n).to
    : n;
  const kept = lines.map((_, index) => index + 1).filter((line) => line < n || line > to);
  return rebuild(proof, kept.map((line) => lines[line - 1]), kept);
}

/**
 * Abre uma subdedução depois da linha `after`, com `formula` como hipótese. A profundidade por
 * omissão fica dentro do escopo de `after`; para uma subdedução seguida de outra, como no segundo
 * caso do ∨E, usa-se `depth` igual ao da primeira.
 */
export function openSubproof(proof, after, formula = null, depth = (proof.lines[after - 1]?.depth ?? 0) + 1) {
  return insertLine(proof, after, { kind: "hypothesis", depth, formula });
}

/**
 * Fecha a subdedução mais interior que contém a linha n, de modo que n seja a última dela. As linhas
 * seguintes dessa subdedução passam para o escopo de fora. Se n já for a última da prova, junta-se
 * uma linha por preencher no escopo de fora, porque só uma linha depois fecha a subdedução.
 */
export function closeSubproof(proof, n) {
  if (!isLine(proof, n)) return failure("noSuchLine", n);
  const { lines } = proof;
  const { found, owner } = scan(lines);
  if (owner[n] === -1) return failure("notInSubproof", n);
  const { to, depth } = found[owner[n]];

  if (to === n) {
    if (n < lines.length) return failure("alreadyClosed", n);
    return insertLine(proof, n, { depth: depth - 1 });
  }
  const next = lines.map((line, index) => {
    const number = index + 1;
    return number > n && number <= to ? { ...line, depth: line.depth - 1 } : line;
  });
  return rebuild(proof, next, lines.map((_, index) => index + 1));
}
