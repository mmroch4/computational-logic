// Link partilhável da página Provar: sequente e prova ↔ query string. Módulo puro (sem DOM).
//
//   ?s=p -> q, p |- q&p=1.<base64url>&r=1.<base64url>
//
// `s` é o sequente em ASCII, legível. `p` é a versão do formato e, em base64url, um JSON com as linhas
// que não são premissas: [profundidade, fórmula] numa hipótese e [profundidade, fórmula, justificação]
// num passo, com "" no que está por preencher. As premissas vêm sempre do sequente, por isso um link não
// consegue acrescentar nenhuma. Uma prova ainda em branco não leva `p`.
// `r` é a mesma coisa para os rascunhos das regras do utilizador que a prova cita, e só essas: o link
// fica curto, e uma regra que não venha com ele não faz falta. Vão só os esquemas: ao abrir, cada regra
// passa outra vez pela validação de `loadUserRules`, e a que falhar deixa a linha com `unknownRule`.
// O link é dado de fora: ao abrir, cada campo passa pelos mesmos leitores do editor, e só o verificador
// decide depois se as linhas estão certas.
// Contrato:
//   encodeShare(goal, proof, userRules = []) → { query, complete }; `complete` é false se a prova não coube
//     em `SHARE_LIMITS.maxLength`, e nesse caso a query só tem o sequente, ou fica vazia se nem esse couber.
//   decodeShare(search) → { status: "none" }
//     | { status: "ok", goal, proof, userRules: { rules, rejected } }
//     | { status: "invalid", error: { code, params }, sequent }, com `sequent` o texto de `s` ou null.
// As mensagens estão em `share.errors.*`.

import { format } from "./formula.js";
import { convertNotation } from "./notation.js";
import { parseFormula } from "./parser.js";
import { createProof } from "./proof.js";
import { formatJustification, parseJustification } from "./proof-text.js";
import { formatSequent, parseSequent } from "./sequent.js";
import { loadUserRules, rulesUsedBy, serializeUserRules } from "./user-rules.js";

/** Códigos de erro de um link. */
export const SHARE_ERROR_CODES = [
  "tooLong", // a query passa de `SHARE_LIMITS.maxLength`
  "missingSequent", // há prova, mas não há sequente
  "badSequent", // o sequente não se lê
  "unknownVersion", // { version }: link de um formato que este site não conhece
  "badProof", // os dados da prova estão cortados ou alterados
  "badLine", // { line }: uma linha da prova não se lê ou não encaixa na anterior
  "badRules", // os dados das regras estão cortados ou alterados
];

/** Os browsers e a Vercel aceitam mais do que isto, mas um link maior já se parte ao partilhar. */
export const SHARE_LIMITS = { maxLength: 8000 };

const VERSION = "1";

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function toBase64Url(text) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** O texto em `data`, ou null se não for base64url de UTF-8. */
function fromBase64Url(data) {
  if (!BASE64URL_RE.test(data)) return null;
  try {
    const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Mantém a query legível: vírgulas ficam vírgulas e espaços passam a `+`. */
const encodeValue = (text) => encodeURIComponent(text).replace(/%2C/gi, ",").replace(/%20/g, "+");

const isBlank = ({ lines }) => {
  const added = lines.filter(({ kind }) => kind !== "premise");
  return added.length === 1 && added[0].kind === "step" && added[0].depth === 0 && added[0].formula === null
    && added[0].rule === null && added[0].citations.length === 0;
};

function lineEntry({ kind, depth, formula, rule, citations }) {
  const written = formula ? format(formula) : "";
  return kind === "hypothesis" ? [depth, written] : [depth, written, formatJustification(rule, citations)];
}

/** Query string (sem `?`) do sequente `goal` com a prova `proof` e as regras de `userRules` que ela cita. */
export function encodeShare(goal, proof, userRules = []) {
  const sequentPart = `s=${encodeValue(convertNotation(formatSequent(goal), "ascii"))}`;
  if (sequentPart.length > SHARE_LIMITS.maxLength) return { query: "", complete: false };
  if (isBlank(proof)) return { query: sequentPart, complete: true };
  const entries = proof.lines.filter(({ kind }) => kind !== "premise").map(lineEntry);
  const used = serializeUserRules(rulesUsedBy(proof, userRules));
  const rulesPart = used.length > 0 ? `&r=${VERSION}.${toBase64Url(JSON.stringify(used))}` : "";
  const query = `${sequentPart}&p=${VERSION}.${toBase64Url(JSON.stringify(entries))}${rulesPart}`;
  return query.length > SHARE_LIMITS.maxLength ? { query: sequentPart, complete: false } : { query, complete: true };
}

const lineFailure = (line) => ({ failed: { code: "badLine", params: { line } } });

/** A linha da prova lida de `entry`, ou `failed`. `number` é o número dela na prova. */
function readEntry(entry, number) {
  if (!Array.isArray(entry) || entry.length < 2 || entry.length > 3) return lineFailure(number);
  const [depth, written, justification] = entry;
  const isStep = entry.length === 3;
  if (typeof written !== "string" || (isStep && typeof justification !== "string")) return lineFailure(number);

  let formula = null;
  if (written !== "") {
    const read = parseFormula(written);
    if (!read.ok) return lineFailure(number);
    formula = read.formula;
  }
  if (!isStep) return { line: { kind: "hypothesis", depth, formula } };

  const read = parseJustification(justification, number);
  if (!read.ok) return lineFailure(number);
  return { line: { kind: "step", depth, formula, rule: read.rule, citations: read.citations } };
}

/** A lista não vazia guardada num valor `<versão>.<base64url>`, ou `failed` com o código `badCode`. */
function readList(value, badCode) {
  const bad = { failed: { code: badCode, params: {} } };
  const dot = value.indexOf(".");
  const version = dot === -1 ? value : value.slice(0, dot);
  if (dot === -1 || !/^\d+$/.test(version)) return bad;
  if (version !== VERSION) return { failed: { code: "unknownVersion", params: { version } } };

  const text = fromBase64Url(value.slice(dot + 1));
  let list = null;
  try {
    list = text === null ? null : JSON.parse(text);
  } catch {
    // Fica null: é o mesmo caso que dados que não são uma lista.
  }
  return Array.isArray(list) && list.length > 0 ? { list } : bad;
}

/** Lê o valor de `p`, para as premissas de `goal`. */
function readProof(value, goal) {
  const { list: entries, failed: unread } = readList(value, "badProof");
  if (unread) return { failed: unread };

  const premises = goal.premises.map((formula) => ({ kind: "premise", depth: 0, formula }));
  const lines = [...premises];
  for (const entry of entries) {
    const { line, failed } = readEntry(entry, lines.length + 1);
    if (failed) return { failed };
    lines.push(line);
  }
  const result = createProof(lines);
  return result.ok ? { proof: result.proof } : lineFailure(result.error.params.line);
}

/** Uma prova em branco para `goal`, a mesma com que o editor começa. */
function blankProof(goal) {
  const premises = goal.premises.map((formula) => ({ kind: "premise", depth: 0, formula }));
  return createProof([...premises, { kind: "step", depth: 0 }]).proof;
}

/** Lê uma query string, com ou sem `?`. */
export function decodeShare(search) {
  const text = String(search ?? "");
  const invalid = (code, params = {}, sequent = null) => ({ status: "invalid", error: { code, params }, sequent });
  const query = new URLSearchParams(text);
  const written = query.get("s");
  const proofValue = query.get("p");
  if (written === null && proofValue === null) return { status: "none" };
  if (text.length > SHARE_LIMITS.maxLength) return invalid("tooLong");
  if (written === null) return invalid("missingSequent");

  const parsed = parseSequent(written);
  if (!parsed.ok) return invalid("badSequent", {}, written);
  const goal = parsed.sequent;

  const rulesValue = query.get("r");
  const rulesRead = rulesValue === null ? { list: [] } : readList(rulesValue, "badRules");
  if (rulesRead.failed) return invalid(rulesRead.failed.code, rulesRead.failed.params, written);
  const userRules = loadUserRules(rulesRead.list);
  if (proofValue === null) return { status: "ok", goal, proof: blankProof(goal), userRules };

  const { proof, failed } = readProof(proofValue, goal);
  return failed ? invalid(failed.code, failed.params, written) : { status: "ok", goal, proof, userRules };
}
