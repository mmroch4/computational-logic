// Modelo de prova em notação de Fitch: linhas, subdeduções e escopos. Módulo puro (sem DOM).
// Uma prova é imutável: `{ lines }`, uma lista plana em que a linha n está em `lines[n - 1]`.
//   linha: { kind, depth, formula, rule, citations }
//   kind: "premise" (só no início, profundidade 0), "hypothesis" (abre uma subdedução) ou "step"
//   formula: nó de `formula.js`, ou null numa linha por preencher
//   rule: identificador da regra (só em "step"; quem o interpreta é o verificador), ou null
//   citations: { kind: "line", line } | { kind: "range", from, to }, pela ordem em que foram escritas
//   strategy: só nas provas geradas, código de `solver.strategies.*`; não conta para o verificador
//   fresh: variável nova da caixa que a linha abre (∀I num passo, ∃E numa hipótese), ou null
//   label: só numa hipótese, a variável da linha de etiqueta logo antes dela, ou null. A linha de
//     etiqueta (`  |  [v]`) abre a caixa do ∀I um nível acima da hipótese e não tem número: guarda-se
//     na hipótese para `lines[n - 1]` continuar a ser a linha n.
//   `strategy`, `fresh` e `label` só aparecem na linha quando não são null: lê-se `line.fresh ?? null`.
// As subdeduções não se guardam: abre uma cada hipótese, cada passo com `fresh` (∀I, sem hipótese) e
// cada linha de etiqueta. Acaba antes da primeira linha menos profunda ou de outra linha que abra uma
// caixa à mesma profundidade (duas subdeduções seguidas, como no ∨E). Uma linha abre no máximo uma
// caixa, além da da etiqueta. Uma subdedução está fechada quando há alguma linha depois dela.
// Contrato: as operações sobre a prova devolvem { ok: true, proof }
//                                             | { ok: false, error: { code, params } }
// As mensagens estão em `proof.errors.*`.

import { isTermName } from "./formula.js";

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

const isFresh = (name) => name === null || (typeof name === "string" && isTermName(name));

function isWellFormed({ kind, depth, rule = null, citations = [], fresh = null, label = null }) {
  if (!KINDS.includes(kind) || !Number.isInteger(depth) || depth < 0) return false;
  if (!Array.isArray(citations) || !citations.every(isCitation)) return false;
  if (!isFresh(fresh) || !isFresh(label)) return false;
  if (label !== null && kind !== "hypothesis") return false;
  if (kind === "premise" && fresh !== null) return false;
  if (kind === "step") return rule === null || typeof rule === "string";
  return rule === null && citations.length === 0;
}

function freezeLine({
  kind, depth, formula = null, rule = null, citations = [], strategy = null, fresh = null, label = null,
}) {
  const line = { kind, depth, formula, rule, citations: Object.freeze([...citations]) };
  if (strategy !== null) line.strategy = strategy;
  if (fresh !== null) line.fresh = fresh;
  if (label !== null) line.label = label;
  return Object.freeze(line);
}

/** Profundidades das caixas que a linha abre, da mais exterior para a mais interior. */
function boxDepths({ kind, depth, fresh = null, label = null }) {
  if (kind === "hypothesis") return label === null ? [depth] : [depth - 1, depth];
  return kind === "step" && fresh !== null ? [depth] : [];
}

/** Quantas caixas continuam abertas na linha, antes de ela abrir as suas. */
function reachable(line) {
  const opened = boxDepths(line);
  return opened.length > 0 ? opened[0] - 1 : line.depth;
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
      const opened = boxDepths(line);
      const fits = opened.length > 0
        ? opened[0] >= 1 && opened[0] <= previousDepth + 1
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
 * contém, e `owner[n]`, o índice da subdedução mais interior que contém a linha n (ou -1). A caixa
 * de uma linha de etiqueta começa na hipótese seguinte, como a da hipótese, e vem antes dela.
 */
function scan(lines) {
  const found = [];
  const owner = [-1];
  const open = [];
  lines.forEach((line, index) => {
    open.length = Math.min(open.length, reachable(line));
    const { fresh = null, label = null } = line;
    for (const depth of boxDepths(line)) {
      const isLabel = label !== null && depth < line.depth;
      found.push({
        from: index + 1,
        to: index + 1,
        depth,
        parent: open.at(-1) ?? -1,
        fresh: isLabel ? label : fresh,
        label: isLabel,
      });
      open.push(found.length - 1);
    }
    for (const subproof of open) found[subproof].to = index + 1;
    owner.push(open.at(-1) ?? -1);
  });
  return { found, owner };
}

/**
 * Subdeduções por ordem de início: { from, to, depth, closed, fresh, label }. `fresh` é a variável da
 * caixa, ou null; `label` diz se a caixa abre numa linha de etiqueta, logo antes da hipótese `from`.
 */
export function subproofs({ lines }) {
  return scan(lines).found.map(({ from, to, depth, fresh, label }) => (
    Object.freeze({ from, to, depth, closed: to < lines.length, fresh, label })
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
  const oldSubproofs = new Map();
  for (const { from, to, label } of scan(proof.lines).found) {
    if (!oldSubproofs.has(`${from}-${to}`)) oldSubproofs.set(`${from}-${to}`, label);
  }
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
      const label = oldSubproofs.get(`${citation.from}-${citation.to}`);
      const subproof = newSubproofs.find((candidate) => candidate.from === from && candidate.label === label);
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
 * ela, a da linha `after`; indicar uma menor fecha subdeduções. Uma linha que abre caixa (hipótese,
 * passo com `fresh`) só pode entrar onde não apanhe as linhas seguintes, que mudariam de escopo sem
 * ninguém o pedir.
 */
export function insertLine(proof, after, line) {
  const { lines } = proof;
  if (after !== 0 && !isLine(proof, after)) return failure("noSuchLine", after);
  const inserted = { kind: "step", depth: lines[after - 1]?.depth ?? 0, ...line };
  const number = after + 1;
  if (!isWellFormed(inserted)) return failure("invalidLine", number);

  const following = lines[after];
  const opened = boxDepths(inserted);
  if (opened.length > 0 && following && reachable(following) >= opened[0]) {
    return failure("capturesLines", number);
  }

  const next = [...lines.slice(0, after), freezeLine(inserted), ...lines.slice(after)];
  const origin = next.map((_, index) => {
    if (index === after) return 0;
    return index < after ? index + 1 : index;
  });
  return rebuild(proof, next, origin);
}

/**
 * Insere `line` mesmo antes da linha n, um passo que abre a caixa do ∀I (`fresh`), e passa a caixa para
 * a linha nova: um passo fica com a marca `[v]`, à mesma profundidade; uma hipótese fica com a linha de
 * etiqueta (`label`), um nível mais dentro, e abre a sua caixa por dentro da do ∀I. A linha n perde a
 * marca e continua na caixa. Os intervalos que começavam em n passam a começar na linha nova.
 */
export function insertAtBoxStart(proof, n, line) {
  if (!isLine(proof, n)) return failure("noSuchLine", n);
  const { lines } = proof;
  const opener = lines[n - 1];
  const variable = opener.fresh ?? null;
  if (opener.kind !== "step" || variable === null) return failure("invalidLine", n);
  const hypothesis = line.kind === "hypothesis";
  const inserted = hypothesis
    ? { ...line, depth: opener.depth + 1, label: variable }
    : { ...line, kind: "step", depth: opener.depth, fresh: variable };
  if (!isWellFormed(inserted) || (!hypothesis && (line.fresh ?? null) !== null)) return failure("invalidLine", n);

  const shift = (number) => (number >= n && number <= lines.length ? number + 1 : number);
  const moveCitation = (citation) => {
    if (citation.kind === "line") return citeLine(shift(citation.line));
    return citeRange(citation.from === n ? n : shift(citation.from), shift(citation.to));
  };
  const unmarked = { ...opener };
  delete unmarked.fresh;
  const moved = [...lines.slice(0, n - 1), unmarked, ...lines.slice(n)]
    .map((old) => ({ ...old, citations: old.citations.map(moveCitation) }));
  return createProof([...moved.slice(0, n - 1), inserted, ...moved.slice(n - 1)]);
}

/**
 * Muda o conteúdo da linha n: `formula`, `rule`, `citations`, `fresh` e `label`, os que vierem em
 * `changes`. O tipo, a profundidade e as caixas não mudam, por isso nenhuma outra linha é afetada: a
 * variável de uma caixa pode mudar de nome e uma hipótese pode ganhar ou perder `fresh`, mas um passo
 * não ganha nem perde a caixa do ∀I, nem uma hipótese a linha de etiqueta (`invalidLine`). Perde-se a
 * estratégia que a linha trazia de uma prova gerada, porque deixa de a descrever.
 */
export function editLine(proof, n, changes) {
  if (!isLine(proof, n)) return failure("noSuchLine", n);
  const current = proof.lines[n - 1];
  const { kind, depth, formula, rule, citations, fresh = null, label = null } = current;
  const edited = { formula, rule, citations, fresh, label, ...changes, kind, depth };
  if (!isWellFormed(edited)) return failure("invalidLine", n);
  if (boxDepths(edited).length !== boxDepths(current).length) return failure("invalidLine", n);
  const lines = proof.lines.with(n - 1, freezeLine(edited));
  return { ok: true, proof: Object.freeze({ lines: Object.freeze(lines) }) };
}

/**
 * Apaga a linha n. Apagar uma linha que abre caixa (hipótese, passo com `fresh`) apaga a caixa
 * inteira, a da linha de etiqueta incluída, porque as linhas dela dependiam dessa hipótese ou dessa
 * variável.
 */
export function deleteLine(proof, n) {
  if (!isLine(proof, n)) return failure("noSuchLine", n);
  const { lines } = proof;
  const to = boxDepths(lines[n - 1]).length > 0
    ? scan(lines).found.find(({ from }) => from === n).to
    : n;
  const kept = lines.map((_, index) => index + 1).filter((line) => line < n || line > to);
  return rebuild(proof, kept.map((line) => lines[line - 1]), kept);
}

/**
 * Abre uma subdedução depois da linha `after`, com `formula` como hipótese. A profundidade por
 * omissão fica dentro do escopo de `after`; para uma subdedução seguida de outra, como no segundo
 * caso do ∨E, usa-se `depth` igual ao da primeira. `depth` é a da caixa mais exterior que se abre.
 * Opções, para as caixas com variável:
 * - `fresh`: a variável nova da caixa, numa hipótese (∃E);
 * - `step: true`, com `fresh`: a caixa do ∀I abre num passo com `formula`, sem hipótese;
 * - `label`: a caixa do ∀I abre numa linha de etiqueta com essa variável, e a hipótese fica uma
 *   profundidade mais dentro.
 */
export function openSubproof(
  proof,
  after,
  formula = null,
  depth = (proof.lines[after - 1]?.depth ?? 0) + 1,
  { fresh = null, step = false, label = null } = {},
) {
  if (step) {
    if (fresh === null || label !== null) return failure("invalidLine", after + 1);
    return insertLine(proof, after, { kind: "step", depth, formula, fresh });
  }
  const hypothesisDepth = label === null ? depth : depth + 1;
  return insertLine(proof, after, { kind: "hypothesis", depth: hypothesisDepth, formula, fresh, label });
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
