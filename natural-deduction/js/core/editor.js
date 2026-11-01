// Modo de escrita do editor de provas: o estado, as operações e as teclas. Módulo puro (sem DOM).
// O estado é imutável:
//   { goal, proof, drafts, cursor, notice, past, future, group }
//   drafts[n - 1]: o que está escrito na linha n, { formula, justification, formulaError,
//     justificationError }. O texto manda: `proof` guarda só o que dele se conseguiu ler, e uma linha
//     com erro de escrita fica por preencher na prova.
//   cursor: { line, field }, com field "formula" ou "justification". Nunca está numa premissa.
//   notice: { key, params } da última operação recusada, ou null.
//   past, future: fotografias para desfazer e refazer. `group` junta a escrita seguida num só passo.
// As premissas vêm do sequente e não se editam aqui. Há sempre pelo menos uma linha editável.
// Contrato: as operações recebem o estado e devolvem o estado seguinte.
//   pressKey(editor, { key, ctrl, shift, alt }) → { editor, handled }; se `handled` for false, a tecla
//     é do browser (ou do campo de texto).
//   editorStatus(editor, { rules, known }) → { rows, complete, usesUserRules, conclusion }
//     rows[n - 1]: { state: "ok" | "error" | "pending", message: { key, params } | null }.
// As chaves das mensagens são de `parser.errors.*`, `proofText.errors.*`, `verify.*` e `proof.errors.*`.

import { format } from "./formula.js";
import { parseFormula } from "./parser.js";
import { closeSubproof, createProof, deleteLine, editLine, insertLine, openSubproof } from "./proof.js";
import { formatJustification, parseJustification } from "./proof-text.js";
import { isPendingCode, lineStates, verifyProof } from "./verify.js";

/** Passos que se podem desfazer. */
export const UNDO_LIMIT = 200;

/** O que uma linha tem escrito, sem erros: a de uma premissa vem do sequente. */
export const blankDraft = () => ({ formula: "", justification: "", formulaError: null, justificationError: null });

const isBlank = ({ formula, justification }) => formula.trim() === "" && justification.trim() === "";

const sameCitations = (a, b) => a.length === b.length && a.every((citation, index) => (
  citation.kind === b[index].kind && citation.line === b[index].line
    && citation.from === b[index].from && citation.to === b[index].to
));

const isEditable = (proof, line) => proof.lines[line - 1]?.kind !== "premise" && line >= 1 && line <= proof.lines.length;

/** Linha editável mais próxima de `line`, a procurar para baixo só se não houver nenhuma acima. */
function nearestEditable(proof, line) {
  const last = Math.min(line, proof.lines.length);
  for (let candidate = last; candidate >= 1; candidate -= 1) {
    if (isEditable(proof, candidate)) return candidate;
  }
  return proof.lines.findIndex(({ kind }) => kind !== "premise") + 1;
}

const snapshot = ({ goal, proof, drafts, cursor }) => ({ goal, proof, drafts, cursor });

/** O estado seguinte, com a fotografia do atual em `past`, se a mudança se puder desfazer. */
export function commit(editor, changes, group = null) {
  return {
    ...editor,
    ...changes,
    notice: null,
    past: [...editor.past, snapshot(editor)].slice(-UNDO_LIMIT),
    future: [],
    group,
  };
}

/** Uma prova nova para o sequente `goal`: as premissas e uma linha por preencher. */
function freshProof(goal) {
  const premises = goal.premises.map((formula) => ({ kind: "premise", depth: 0, formula }));
  const { proof } = createProof([...premises, { kind: "step", depth: 0 }]);
  const drafts = [...goal.premises.map((formula) => ({ ...blankDraft(), formula: format(formula) })), blankDraft()];
  return { goal, proof, drafts, cursor: { line: proof.lines.length, field: "formula" } };
}

/** Começa o editor no sequente `goal`. */
export const createEditor = (goal) => ({ ...freshProof(goal), notice: null, past: [], future: [], group: null });

/** Troca de sequente; pode desfazer-se, para não se perder a prova que estava aberta. */
export const restartEditor = (editor, goal) => commit(editor, freshProof(goal));

/**
 * Troca a prova por `proof`, já verificada (a solução automática). Pode desfazer-se. Uma prova só com
 * premissas ganha uma linha por preencher, porque o cursor nunca fica numa premissa.
 */
export function loadProof(editor, proof, ruleLabels = {}) {
  const editable = proof.lines.some(({ kind }) => kind !== "premise");
  const filled = editable ? proof : insertLine(proof, proof.lines.length, {}).proof;
  const drafts = filled.lines.map(({ kind, formula, rule, citations }) => ({
    ...blankDraft(),
    formula: formula ? format(formula) : "",
    justification: kind === "step" && rule ? formatJustification(rule, citations, ruleLabels) : "",
  }));
  return commit(editor, { proof: filled, drafts, cursor: { line: filled.lines.length, field: "formula" } });
}

/** Abre o editor já com `proof`, a de um link: não há nada de anterior para desfazer. */
export function openProof(goal, proof, ruleLabels = {}) {
  return { ...loadProof(createEditor(goal), proof, ruleLabels), past: [] };
}

/** Indica se há texto que não se conseguiu ler e que, por isso, não está em `proof`. */
export const hasUnreadText = ({ drafts }) => drafts.some(({ formulaError, justificationError }) => (
  formulaError !== null || justificationError !== null
));

/**
 * Depois de uma operação de estrutura, as citações de `proof` já têm os números novos: passa-os para
 * o texto. Uma justificação com erro de escrita não foi lida, por isso fica como está.
 */
export function syncJustifications(proof, drafts) {
  return drafts.map((draft, index) => {
    const line = proof.lines[index];
    if (line.kind !== "step" || draft.justificationError) return draft;
    const written = parseJustification(draft.justification, index + 1);
    if (sameCitations(written.citations, line.citations)) return draft;
    const [ruleText] = draft.justification.trim().split(/[\s,]/);
    return { ...draft, justification: formatJustification(ruleText, line.citations) };
  });
}

/** Aplica uma operação de estrutura. Se a prova a recusar, só fica o aviso. */
function restructure(editor, result, drafts, cursor) {
  if (!result.ok) {
    const { code, params } = result.error;
    return { ...editor, notice: { key: `proof.errors.${code}`, params }, group: null };
  }
  return commit(editor, { proof: result.proof, drafts: syncJustifications(result.proof, drafts), cursor });
}

export const spliced = (drafts, at, removed, ...added) => [
  ...drafts.slice(0, at), ...added, ...drafts.slice(at + removed),
];

const lineAt = (line) => ({ line, field: "formula" });

/** Muda o texto de um campo; a escrita seguida no mesmo campo desfaz-se de uma vez. */
export function setText(editor, line, field, text) {
  const draft = editor.drafts[line - 1];
  if (!isEditable(editor.proof, line) || draft[field] === text) return editor;

  const next = { ...draft, [field]: text };
  let changes;
  if (field === "formula") {
    const blank = text.trim() === "";
    const read = blank ? null : parseFormula(text);
    next.formulaError = blank || read.ok ? null : read.error;
    changes = { formula: read?.ok ? read.formula : null };
  } else {
    const read = parseJustification(text, line);
    next.justificationError = read.ok ? null : read.error;
    changes = read.ok ? { rule: read.rule, citations: read.citations } : { rule: null, citations: [] };
  }

  const { proof } = editLine(editor.proof, line, changes);
  const group = `${line}:${field}`;
  const drafts = spliced(editor.drafts, line - 1, 1, next);
  if (editor.group === group) return { ...editor, proof, drafts, notice: null, future: [] };
  return commit(editor, { proof, drafts, cursor: { line, field } }, group);
}

/** Muda o cursor; a escrita seguinte já é outro passo a desfazer. */
export function moveCursor(editor, line, field = "formula") {
  if (!isEditable(editor.proof, line)) return editor;
  const hasJustification = editor.proof.lines[line - 1].kind === "step";
  const cursor = { line, field: hasJustification ? field : "formula" };
  return { ...editor, cursor, notice: null, group: null };
}

/**
 * Passa um campo sem erros à forma canónica: `p -> q` dá `p → q`, e a regra fica com a sigla do idioma
 * de `ruleLabels`. Não muda o significado, por isso não conta como passo a desfazer.
 */
export function tidyField(editor, line, field, ruleLabels = {}) {
  const draft = editor.drafts[line - 1];
  const proofLine = editor.proof.lines[line - 1];
  if (!isEditable(editor.proof, line)) return editor;
  let text = draft[field];
  if (field === "formula" && proofLine.formula) text = format(proofLine.formula);
  if (field === "justification" && !draft.justificationError && proofLine.kind === "step") {
    text = formatJustification(proofLine.rule, proofLine.citations, ruleLabels);
  }
  const unchanged = text === draft[field];
  if (unchanged && editor.group === null) return editor;
  const drafts = unchanged ? editor.drafts : spliced(editor.drafts, line - 1, 1, { ...draft, [field]: text });
  return { ...editor, drafts, group: null };
}

/** Passa todos os campos à forma canónica, depois de mudar o idioma. */
export function tidyAll(editor, ruleLabels) {
  let tidied = editor;
  for (let line = 1; line <= editor.proof.lines.length; line += 1) {
    tidied = tidyField(tidyField(tidied, line, "formula", ruleLabels), line, "justification", ruleLabels);
  }
  return tidied;
}

/** Linha nova por baixo do cursor, ao mesmo nível. */
export function addLine(editor) {
  const { line } = editor.cursor;
  return restructure(
    editor,
    insertLine(editor.proof, line, {}),
    spliced(editor.drafts, line, 0, blankDraft()),
    lineAt(line + 1),
  );
}

/**
 * Abre uma subdedução. Numa linha vazia, é ela que passa a hipótese: é assim que se abre o segundo
 * caso de um ∨E depois de fechar o primeiro. Noutra linha, a hipótese fica por baixo, um nível acima.
 */
export function openSubproofAtCursor(editor) {
  const { proof, drafts, cursor: { line } } = editor;
  const current = proof.lines[line - 1];
  if (current.kind === "step" && isBlank(drafts[line - 1])) {
    const removed = deleteLine(proof, line);
    const result = removed.ok ? openSubproof(removed.proof, line - 1, null, current.depth + 1) : removed;
    return restructure(editor, result, drafts, lineAt(line));
  }
  return restructure(editor, openSubproof(proof, line), spliced(drafts, line, 0, blankDraft()), lineAt(line + 1));
}

/**
 * Fecha a subdedução do cursor, e o cursor passa para a primeira linha fora dela. Uma linha vazia sai
 * ela própria, para não ficar uma linha por preencher dentro da subdedução.
 */
export function closeSubproofAtCursor(editor) {
  const { proof, drafts, cursor: { line } } = editor;
  const current = proof.lines[line - 1];

  if (current.kind === "step" && current.depth > 0 && isBlank(drafts[line - 1])) {
    const removed = deleteLine(proof, line);
    const moved = removed.ok ? insertLine(removed.proof, line - 1, { depth: current.depth - 1 }) : removed;
    if (moved.ok) return restructure(editor, moved, drafts, lineAt(line));
  }

  const closed = closeSubproof(proof, line);
  if (closed.ok) {
    const added = closed.proof.lines.length > proof.lines.length;
    return restructure(editor, closed, added ? spliced(drafts, line, 0, blankDraft()) : drafts, lineAt(line + 1));
  }
  if (closed.error.code !== "alreadyClosed") return restructure(editor, closed);
  const after = insertLine(proof, line, { depth: current.depth - 1 });
  return restructure(editor, after, spliced(drafts, line, 0, blankDraft()), lineAt(line + 1));
}

/** Apaga a linha do cursor; numa hipótese, apaga a subdedução toda. A última linha editável só se limpa. */
export function removeLine(editor) {
  const { proof, drafts, cursor: { line } } = editor;
  const result = deleteLine(proof, line);
  if (!result.ok) return restructure(editor, result);

  const removed = proof.lines.length - result.proof.lines.length;
  const kept = spliced(drafts, line - 1, removed);
  if (result.proof.lines.some(({ kind }) => kind !== "premise")) {
    return restructure(editor, result, kept, lineAt(nearestEditable(result.proof, line - 1)));
  }
  const refilled = insertLine(result.proof, result.proof.lines.length, { depth: 0 });
  return restructure(editor, refilled, [...kept, blankDraft()], lineAt(refilled.proof.lines.length));
}

export const canUndo = ({ past }) => past.length > 0;
export const canRedo = ({ future }) => future.length > 0;

/** Desfaz o último passo. */
export function undo(editor) {
  if (!canUndo(editor)) return editor;
  return {
    ...editor,
    ...editor.past.at(-1),
    notice: null,
    past: editor.past.slice(0, -1),
    future: [...editor.future, snapshot(editor)],
    group: null,
  };
}

/** Refaz o último passo desfeito. */
export function redo(editor) {
  if (!canRedo(editor)) return editor;
  return {
    ...editor,
    ...editor.future.at(-1),
    notice: null,
    past: [...editor.past, snapshot(editor)],
    future: editor.future.slice(0, -1),
    group: null,
  };
}

/** Enter: da fórmula passa à justificação; depois dela, ou numa hipótese, abre a linha seguinte. */
function advance(editor) {
  const { line, field } = editor.cursor;
  if (field === "formula" && editor.proof.lines[line - 1].kind === "step") {
    return moveCursor(editor, line, "justification");
  }
  return addLine(editor);
}

/** Linha editável mais próxima na direção `step`, com o cursor no mesmo campo. */
function moveVertically(editor, step) {
  const { line, field } = editor.cursor;
  const target = line + step;
  return isEditable(editor.proof, target) ? moveCursor(editor, target, field) : editor;
}

/** Backspace num campo vazio: volta à fórmula, ou apaga a linha vazia. Doutro modo é do campo de texto. */
function erase(editor) {
  const { proof, drafts, cursor: { line, field } } = editor;
  const draft = drafts[line - 1];
  if (draft[field] !== "") return null;
  if (field === "justification") return moveCursor(editor, line, "formula");
  if (!isBlank(draft)) return null;
  const { kind, depth } = proof.lines[line - 1];
  const follower = proof.lines[line];
  const hasContent = kind === "hypothesis" && follower
    && (follower.depth > depth || (follower.depth === depth && follower.kind !== "hypothesis"));
  const lastEditable = proof.lines.filter((other) => other.kind !== "premise").length === 1;
  return hasContent || (lastEditable && kind === "step") ? null : removeLine(editor);
}

/** O nome da ação da combinação de teclas `press`, ou null. */
export function keyAction({ key, ctrl = false, shift = false, alt = false }) {
  if (alt) return null;
  if (key === "Enter") {
    if (ctrl) return "open";
    return shift ? "close" : "advance";
  }
  if (ctrl) {
    const letter = key.toLowerCase();
    if (letter === "z") return shift ? "redo" : "undo";
    if (letter === "y" && !shift) return "redo";
    return key === "Backspace" && shift ? "remove" : null;
  }
  if (shift) return null;
  if (key === "Backspace") return "erase";
  if (key === "ArrowUp") return "up";
  return key === "ArrowDown" ? "down" : null;
}

const ACTIONS = {
  advance,
  add: addLine,
  open: openSubproofAtCursor,
  close: closeSubproofAtCursor,
  remove: removeLine,
  undo,
  redo,
  up: (editor) => moveVertically(editor, -1),
  down: (editor) => moveVertically(editor, 1),
  erase,
};

/** Aplica a ação `name`; devolve null se ela não tiver nada a fazer aqui. */
export const runAction = (editor, name) => ACTIONS[name](editor);

/** Trata uma tecla carregada num campo do editor. */
export function pressKey(editor, press) {
  const name = keyAction(press);
  const next = name ? runAction(editor, name) : null;
  return next ? { editor: next, handled: true } : { editor, handled: false };
}

/** O problema de escrita da linha: o texto não se lê, e a prova nem sequer o vê. */
function writingMessage({ formulaError, justificationError }) {
  if (formulaError) return { key: `parser.errors.${formulaError.code}`, params: formulaError.params };
  if (justificationError) {
    return { key: `proofText.errors.${justificationError.code}`, params: justificationError.params };
  }
  return null;
}

/** Erros que se veem no próprio campo vazio, sem precisar de frase. */
const SILENT_CODES = ["emptyFormula", "missingRule"];

/** Verifica a prova e diz, linha a linha, o estado e a frase a mostrar. */
export function editorStatus({ goal, proof, drafts }, { rules, known = rules }) {
  const result = verifyProof(proof, goal, rules, known);
  const states = lineStates(proof, result);
  const errors = new Map(result.lineErrors.map((error) => [error.params.line, error]));

  const rows = proof.lines.map((_, index) => {
    const writing = writingMessage(drafts[index]);
    if (writing) return { state: "error", message: writing };
    const error = errors.get(index + 1);
    if (!error || SILENT_CODES.includes(error.code)) return { state: states[index], message: null };
    const { code, params } = error;
    return { state: isPendingCode(code) ? "pending" : "error", message: { key: `verify.errors.${code}`, params } };
  });

  const writingFree = rows.every(({ message }) => message === null);
  const wellFormed = result.lineErrors.length === 0 && writingFree;
  const { conclusionError } = result;
  return {
    rows,
    complete: result.ok,
    usesUserRules: result.usesUserRules,
    conclusion: wellFormed && conclusionError
      ? { key: `verify.conclusion.${conclusionError.code}`, params: conclusionError.params }
      : null,
  };
}
