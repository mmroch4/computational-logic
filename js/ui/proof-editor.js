// Editor de provas, modo de escrita: uma linha de Fitch com campos, verificada a cada tecla.
// A lógica está em core/editor.js: aqui só se desenha o estado e se ligam o teclado e os botões.
//
// As funções exportadas à parte são puras (testáveis em node); só mountProofEditor() mexe no DOM.
import {
  canRedo, canUndo, createEditor, editorStatus, moveCursor, pressKey, restartEditor, runAction, setText,
  tidyAll, tidyField,
} from "../core/editor.js";
import { RULES, localizeRuleParam, ruleSet } from "../core/rules.js";
import { formatSequent } from "../core/sequent.js";
import { barsHtml, closesAssumptions, depthHtml, lineHtml, stateHtml } from "./fitch-view.js";
import { LOCALES, getLang, onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgBodyHtml, msgClasses, msgHtml } from "./message.js";
import { ERROR_DELAY_MS, SYMBOL_KEYS, insertSymbol } from "./sequent-input.js";

/** Botões da barra de ações, com a tecla para o `aria-keyshortcuts`. */
export const EDITOR_ACTIONS = [
  { name: "add", shortcut: null },
  { name: "open", shortcut: "Control+Enter" },
  { name: "close", shortcut: "Shift+Enter" },
  { name: "remove", shortcut: "Control+Shift+Backspace" },
  { name: "undo", shortcut: "Control+Z" },
  { name: "redo", shortcut: "Control+Y" },
];

/** O ⊢ só faz falta no sequente. */
const PROOF_KEYS = SYMBOL_KEYS.filter(({ name }) => name !== "turnstile");

const ruleLabels = () => LOCALES[getLang()].rules.labels;

/** A frase de uma mensagem de `editorStatus`, com as siglas do idioma. */
export function messageText({ key, params }) {
  return t(key, params.rule ? localizeRuleParam(params, ruleLabels()) : params);
}

function fieldHtml(line, field, value, { label, placeholder, classes = "" }) {
  const id = `proof-${field}-${line}`;
  return `<input id="${id}" class="fitch-edit__field fitch-edit__field--${field}${classes}" type="text" `
    + `data-field="${field}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" `
    + `aria-label="${escapeHtml(label)}" aria-describedby="proof-error-${line}" aria-invalid="false" `
    + 'enterkeyhint="next" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">';
}

/** Uma linha editável; o estado e o erro vêm depois, por `paintRow`. */
export function editableLineHtml(line, index, draft, assumption) {
  const number = index + 1;
  const formula = fieldHtml(number, "formula", draft.formula, {
    label: t("editor.formulaField", { line: number }),
    placeholder: t("editor.formulaPlaceholder"),
    classes: assumption ? " fitch-edit__field--assumption" : "",
  });
  const justification = line.kind === "step"
    ? fieldHtml(number, "justification", draft.justification, {
      label: t("editor.justificationField", { line: number }),
      placeholder: t("editor.justificationPlaceholder"),
    })
    : `<span class="fitch-edit__kind">${escapeHtml(t("proofText.hypothesis"))}</span>`;
  return `<li class="fitch__line fitch-edit__line" data-line="${number}" data-state="pending">`
    + `<span class="fitch__gutter"><span class="fitch__number">${number}</span>${stateHtml("pending")}</span>`
    + `<span class="fitch__body">${barsHtml(line)}${depthHtml(line)}`
    + `<span class="fitch-edit__content"><span class="fitch-edit__fields">${formula}${justification}</span>`
    + `<span class="${msgClasses("error")} fitch-edit__error" id="proof-error-${number}" hidden></span></span>`
    + "</span></li>";
}

function linesHtml({ proof, drafts }) {
  return proof.lines.map((line, index) => {
    const assumption = closesAssumptions(proof.lines, index);
    if (line.kind === "premise") return lineHtml(line, index, { state: "ok", assumption });
    return editableLineHtml(line, index, drafts[index], assumption);
  }).join("");
}

function shellHtml() {
  const actions = EDITOR_ACTIONS.map(({ name, shortcut }) => {
    const keys = shortcut ? ` aria-keyshortcuts="${shortcut}"` : "";
    return `<button type="button" class="btn" data-variant="outline" data-size="sm" data-action="${name}"${keys}>`
      + `${escapeHtml(t(`editor.actions.${name}`))}</button>`;
  }).join("");
  const keys = PROOF_KEYS.map(({ name, label }) => (
    `<button type="button" data-symbol="${name}" aria-label="${escapeHtml(t(`sequentInput.symbols.${name}`))}">${escapeHtml(label)}</button>`
  )).join("");
  return '<div class="fitch fitch--edit" role="group" '
    + `aria-label="${escapeHtml(t("fitch.label"))}"><ol class="fitch__lines"></ol></div>`
    + '<div class="proof-editor__status" role="status"></div>'
    + `<div class="proof-editor__tools" role="group" aria-label="${escapeHtml(t("editor.toolsLabel"))}">${actions}</div>`
    + `<div class="keys" role="group" aria-label="${escapeHtml(t("sequentInput.symbolsLabel"))}">${keys}</div>`
    + `<p class="proof-editor__shortcuts">${escapeHtml(t("editor.shortcuts"))}</p>`;
}

/** A mensagem de baixo da prova: o aviso da última operação, a prova completa ou o que ainda falta. */
export function statusHtml(status, notice) {
  if (notice) return msgHtml("warn", escapeHtml(messageText(notice)));
  if (status.complete) return msgHtml("ok", escapeHtml(t("editor.complete")));
  return status.conclusion ? msgHtml("info", escapeHtml(messageText(status.conclusion))) : "";
}

/**
 * Monta o editor em `container`. Só aparece com `start(goal)`.
 * `onGoalChange(goal)`: ao desfazer ou refazer, o sequente da prova mudou.
 * Devolve { start(goal), getProof() }.
 */
export function mountProofEditor(container, { onGoalChange, rules = ruleSet("completo"), known = RULES } = {}) {
  let editor = null;
  let painting = false;
  let timer = null;
  /** Linhas com o erro já à vista: um erro novo na linha do cursor espera por uma pausa. */
  const shown = new Set();

  const rowOf = (line) => container.querySelector(`.fitch-edit__line[data-line="${line}"]`);
  const inputAt = ({ line, field }) => rowOf(line)?.querySelector(`[data-field="${field}"]`);

  function paintRow(line, { state, message }, hold) {
    const row = rowOf(line);
    if (!row) return;
    const visible = hold ? "pending" : state;
    row.dataset.state = visible;
    row.querySelector(".fitch__state").outerHTML = stateHtml(visible);
    const invalid = visible === "error";
    const fields = row.querySelectorAll(".fitch-edit__field");
    fields.forEach((field) => field.setAttribute("aria-invalid", String(invalid)));
    const box = row.querySelector(".fitch-edit__error");
    const showMessage = message !== null && !hold;
    box.hidden = !showMessage;
    box.className = `${msgClasses(invalid ? "error" : "info")} fitch-edit__error`;
    box.innerHTML = showMessage ? msgBodyHtml(invalid ? "error" : "info", escapeHtml(messageText(message))) : "";
  }

  /** Atualiza estados e mensagens sem tocar nos campos, para não perder o foco nem o cursor do texto. */
  function refresh({ flush = false } = {}) {
    clearTimeout(timer);
    const status = editorStatus(editor, { rules, known });
    let waiting = false;
    status.rows.forEach((row, index) => {
      const line = index + 1;
      if (row.message === null) shown.delete(line);
      const hold = !flush && row.message !== null && line === editor.cursor.line && !shown.has(line);
      if (hold) waiting = true;
      else if (row.message !== null) shown.add(line);
      paintRow(line, row, hold);
    });
    if (waiting) timer = setTimeout(() => refresh({ flush: true }), ERROR_DELAY_MS);
    container.querySelector(".proof-editor__status").innerHTML = statusHtml(status, editor.notice);
    container.querySelector('[data-action="undo"]').disabled = !canUndo(editor);
    container.querySelector('[data-action="redo"]').disabled = !canRedo(editor);
  }

  function focusCursor() {
    const input = inputAt(editor.cursor);
    if (!input) return;
    if (document.activeElement !== input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function paintLines() {
    painting = true;
    container.querySelector(".fitch__lines").innerHTML = linesHtml(editor);
    painting = false;
    shown.clear();
    refresh({ flush: true });
  }

  /** Passa para o estado `next` e mexe só no que mudou. */
  function show(next) {
    const before = editor;
    editor = next;
    if (next.goal !== before.goal) onGoalChange?.(next.goal);
    if (next.drafts === before.drafts) refresh();
    else paintLines();
    focusCursor();
  }

  /** O estado com o campo do cursor arrumado: ao redesenhar as linhas, ele já não tem `focusout`. */
  const tidied = () => tidyField(editor, editor.cursor.line, editor.cursor.field, ruleLabels());

  function pressSymbol(name) {
    const input = inputAt(editor.cursor);
    if (!input) return;
    const { insert } = SYMBOL_KEYS.find((key) => key.name === name);
    const next = insertSymbol(input.value, input.selectionStart, input.selectionEnd, insert);
    input.value = next.value;
    input.focus();
    input.setSelectionRange(next.caret, next.caret);
    editor = setText(editor, editor.cursor.line, editor.cursor.field, next.value);
    refresh();
  }

  function onInput({ target }) {
    if (!target.matches(".fitch-edit__field")) return;
    editor = setText(editor, Number(target.closest("[data-line]").dataset.line), target.dataset.field, target.value);
    refresh();
  }

  function onKeydown(event) {
    if (!event.target.matches(".fitch-edit__field") || event.isComposing) return;
    const { editor: next, handled } = pressKey(tidied(), {
      key: event.key,
      ctrl: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
    });
    if (!handled) return;
    event.preventDefault();
    show(next);
  }

  function onFocusin({ target }) {
    if (!target.matches(".fitch-edit__field")) return;
    const line = Number(target.closest("[data-line]").dataset.line);
    const { field } = target.dataset;
    if (line === editor.cursor.line && field === editor.cursor.field) return;
    editor = moveCursor(editor, line, field);
    refresh();
  }

  function onFocusout({ target }) {
    if (painting || !target.matches(".fitch-edit__field")) return;
    const line = Number(target.closest("[data-line]").dataset.line);
    editor = tidyField(editor, line, target.dataset.field, ruleLabels());
    target.value = editor.drafts[line - 1][target.dataset.field];
    refresh();
  }

  function build() {
    container.innerHTML = shellHtml();
    container.querySelectorAll("[data-action], [data-symbol]").forEach((button) => {
      // Sem isto, o campo perde o foco ao carregar no botão e o teclado do telemóvel fecha.
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("mousedown", (event) => event.preventDefault());
    });
    container.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => show(runAction(tidied(), button.dataset.action)));
    });
    container.querySelectorAll("[data-symbol]").forEach((button) => {
      button.addEventListener("click", () => pressSymbol(button.dataset.symbol));
    });
    paintLines();
  }

  container.classList.add("proof-editor");
  container.addEventListener("input", onInput);
  container.addEventListener("keydown", onKeydown);
  container.addEventListener("focusin", onFocusin);
  container.addEventListener("focusout", onFocusout);

  onLangChange(() => {
    if (!editor) return;
    editor = tidyAll(editor, ruleLabels());
    build();
  });

  return {
    start(goal) {
      if (editor && formatSequent(editor.goal) === formatSequent(goal)) {
        focusCursor();
        return;
      }
      editor = editor ? restartEditor(editor, goal) : createEditor(goal);
      build();
      focusCursor();
    },
    getProof: () => editor?.proof ?? null,
  };
}
