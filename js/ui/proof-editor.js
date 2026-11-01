// Editor de provas, com dois modos sobre o mesmo estado. A escrever, cada linha de Fitch tem campos,
// verificados a cada tecla. No modo guiado, as linhas são botões: seleciona-se o que citar e escolhe-se
// a regra. A lógica está em core/editor.js e core/guided.js: aqui só se desenha e se ligam os eventos.
//
// As funções exportadas à parte são puras (testáveis em node); só mountProofEditor() mexe no DOM.
import {
  canRedo, canUndo, createEditor, editorStatus, hasUnreadText, keyAction, loadProof, moveCursor, openProof, pressKey,
  restartEditor, runAction, setText, tidyAll, tidyField,
} from "../core/editor.js";
import { format } from "../core/formula.js";
import {
  applyOutcome, focusObjective, guidedAnchor, guidedLines, guidedRules, outcomeLabel, toggleSelection,
} from "../core/guided.js";
import { RULES, localizeRuleParam, ruleLabel, ruleSet } from "../core/rules.js";
import { formatSequent } from "../core/sequent.js";
import {
  barsHtml, closesAssumptions, depthHtml, formulaReadHtml, justificationText, lineHtml, readAsHtml, spokenFormula,
  spokenProse, stateHtml, whyHtml,
} from "./fitch-view.js";
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

/** No modo guiado, as linhas nascem das regras. */
const GUIDED_ACTIONS = ["close", "remove", "undo", "redo"];

/** Os dois modos do editor. */
export const EDITOR_MODES = ["write", "guided"];

/** O ⊢ só faz falta no sequente. */
const PROOF_KEYS = SYMBOL_KEYS.filter(({ name }) => name !== "turnstile");

/** Quantas linhas se anunciam de uma vez: um desfazer pode mudar a prova toda. */
const MAX_ANNOUNCED = 3;

const ruleLabels = () => LOCALES[getLang()].rules.labels;

/** A frase de uma mensagem de `editorStatus`, com as siglas do idioma. */
export function messageText({ key, params }) {
  return t(key, params.rule ? localizeRuleParam(params, ruleLabels()) : params);
}

/** O que muda na linha quando se ouve: o estado e a mensagem. */
const rowKey = ({ state, message }) => `${state}:${message ? messageText(message) : ""}`;

/**
 * O que dizer ao leitor de ecrã quando as linhas passam de `before` para `after`: uma frase por linha
 * que mudou, até `MAX_ANNOUNCED`. Sem `before`, ou com outro número de linhas, a mudança é a da prova, e
 * quem a fez já sabe: não há nada a dizer.
 */
export function announcementText(before, after) {
  if (!before || before.length !== after.length) return "";
  const changed = after.flatMap((row, index) => (rowKey(row) === rowKey(before[index]) ? [] : [{ row, line: index + 1 }]));
  const spoken = changed.slice(0, MAX_ANNOUNCED).map(({ row, line }) => {
    const detail = row.message ? ` ${messageText(row.message)}` : "";
    return `${t(`fitch.announce.${row.state}`, { line })}${detail}`;
  });
  if (changed.length > MAX_ANNOUNCED) spoken.push(t("fitch.moreChanges", { count: changed.length - MAX_ANNOUNCED }));
  return spokenProse(spoken.join(" "));
}

function fieldHtml(line, field, value, { label, placeholder, classes = "", prefix }) {
  const id = `${prefix}-${field}-${line}`;
  return `<input id="${id}" class="fitch-edit__field fitch-edit__field--${field}${classes}" type="text" `
    + `data-field="${field}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" `
    + `aria-label="${escapeHtml(label)}" aria-describedby="${prefix}-reading-${line} ${prefix}-error-${line}" aria-invalid="false" `
    + 'enterkeyhint="next" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">';
}

/**
 * Uma linha editável; o estado e o erro vêm depois, por `paintRow`. `prefix` começa os ids, para uma página
 * poder ter mais do que um editor.
 */
export function editableLineHtml(line, index, draft, assumption, prefix = "proof") {
  const number = index + 1;
  const formula = fieldHtml(number, "formula", draft.formula, {
    prefix,
    label: t("editor.formulaField", { line: number }),
    placeholder: t("editor.formulaPlaceholder"),
    classes: assumption ? " fitch-edit__field--assumption" : "",
  });
  const justification = line.kind === "step"
    ? fieldHtml(number, "justification", draft.justification, {
      prefix,
      label: t("editor.justificationField", { line: number }),
      placeholder: t("editor.justificationPlaceholder"),
    })
    : `<span class="fitch-edit__kind">${escapeHtml(t("proofText.hypothesis"))}</span>`;
  return `<li class="fitch__line fitch-edit__line" data-line="${number}" data-state="pending">`
    + `<span class="fitch__gutter"><span class="fitch__number">${number}</span>${stateHtml("pending")}</span>`
    + `<span class="fitch__body">${barsHtml(line)}${depthHtml(line)}`
    + `<span class="fitch-edit__content"><span class="fitch-edit__fields">${formula}${justification}</span>`
    + `<span class="sr-only" id="${prefix}-reading-${number}"></span>`
    + `<span class="${msgClasses("error")} fitch-edit__error" id="${prefix}-error-${number}" hidden></span></span>`
    + "</span></li>";
}

function linesHtml({ proof, drafts }, prefix) {
  return proof.lines.map((line, index) => {
    const assumption = closesAssumptions(proof.lines, index);
    if (line.kind === "premise") return lineHtml(line, index, { state: "ok", assumption });
    return editableLineHtml(line, index, drafts[index], assumption, prefix);
  }).join("");
}

/** Uma linha no modo guiado: `row` vem de `guidedLines` e `status` de `editorStatus`. */
export function guidedLineHtml(line, index, { row, status, assumption, target }) {
  const number = index + 1;
  const formulaClasses = assumption ? "fitch__formula fitch__formula--assumption" : "fitch__formula";
  const pending = row.role === "current" || row.role === "objective";
  const why = pending ? t(row.role === "current" ? "guided.current" : "guided.pending") : justificationText(line);
  const pressed = row.role === "citable" ? ` aria-pressed="${row.selected}"` : "";
  const current = row.role === "current" ? ' aria-current="true"' : "";
  const locked = row.role === "locked" ? " disabled" : "";
  const tone = status.state === "error" ? "error" : "info";
  const message = status.message
    ? `<span class="${msgClasses(tone)} fitch-edit__error">${msgBodyHtml(tone, escapeHtml(messageText(status.message)))}</span>`
    : "";
  return `<li class="fitch__line fitch-pick__line" data-line="${number}" data-state="${status.state}" data-role="${row.role}">`
    + `<button type="button" class="fitch-pick" data-pick="${number}"${pressed}${current}${locked}>`
    + `<span class="fitch__gutter"><span class="fitch__number">${number}</span>${stateHtml(status.state)}</span>`
    + `<span class="fitch__body">${barsHtml(line)}${depthHtml(line)}`
    + `<span class="${formulaClasses}">${formulaReadHtml(line.formula ?? target)}</span></span>`
    + `${whyHtml(why)}</button>${message}</li>`;
}

/** O painel das regras: o objetivo, um botão por regra, a escolha entre passos e o motivo pedido. */
export function guidedPanelHtml({ anchor, rules, choice, reason, complete = false }) {
  let heading = t(complete ? "guided.noneLeft" : "guided.noObjective");
  if (!complete && anchor.target) heading = t("guided.objective", { line: anchor.line, formula: format(anchor.target) });
  const labels = ruleLabels();
  const buttons = rules.map(({ id, outcomes }) => (
    `<button type="button" class="guided__rule" data-rule="${escapeHtml(id)}" aria-disabled="${outcomes.length === 0}">`
    + `${escapeHtml(ruleLabel(id, labels))}</button>`
  )).join("");
  const options = choice
    ? choice.outcomes.map((outcome, index) => (
      `<button type="button" class="guided__choice" data-choice="${index}" aria-label="${escapeHtml(spokenProse(outcomeLabel(outcome)))}">`
      + `${escapeHtml(outcomeLabel(outcome))}</button>`
    )).join("")
    : "";
  const choices = choice
    ? `<div class="guided__choices" role="group" aria-label="${escapeHtml(t("guided.choose"))}">`
      + `<p>${escapeHtml(t("guided.choose"))}</p>${options}</div>`
    : "";
  // O motivo é anunciado pelo `.proof-editor__live`: este bloco nasce de novo a cada desenho.
  return `<p class="guided__objective">${readAsHtml(escapeHtml(heading), spokenProse(heading))}</p>`
    + `<p class="guided__hint">${escapeHtml(t("guided.hint"))}</p>`
    + `<div class="guided__rules" role="group" aria-label="${escapeHtml(t("guided.rulesLabel"))}">${buttons}</div>`
    + choices
    + `<div class="guided__reason">${reason ? msgHtml("info", escapeHtml(messageText(reason))) : ""}</div>`;
}

function modesHtml(mode) {
  const buttons = EDITOR_MODES.map((name) => (
    `<button type="button" data-mode="${name}" aria-pressed="${name === mode}">${escapeHtml(t(`editor.modes.${name}`))}</button>`
  )).join("");
  return `<div class="seg" role="group" aria-label="${escapeHtml(t("editor.modesLabel"))}">${buttons}</div>`;
}

function shellHtml(mode) {
  const guided = mode === "guided";
  const shownActions = EDITOR_ACTIONS.filter(({ name }) => !guided || GUIDED_ACTIONS.includes(name));
  const actions = shownActions.map(({ name, shortcut }) => {
    const keys = shortcut ? ` aria-keyshortcuts="${shortcut}"` : "";
    return `<button type="button" class="btn" data-variant="outline" data-size="sm" data-action="${name}"${keys}>`
      + `${escapeHtml(t(`editor.actions.${name}`))}</button>`;
  }).join("");
  const keys = PROOF_KEYS.map(({ name, label }) => (
    `<button type="button" data-symbol="${name}" aria-label="${escapeHtml(t(`sequentInput.symbols.${name}`))}">${escapeHtml(label)}</button>`
  )).join("");
  const writing = `<div class="keys" role="group" aria-label="${escapeHtml(t("sequentInput.symbolsLabel"))}">${keys}</div>`
    + `<p class="proof-editor__shortcuts">${escapeHtml(t("editor.shortcuts"))}</p>`;
  return modesHtml(mode)
    + '<div class="fitch fitch--edit" role="group" '
    + `aria-label="${escapeHtml(t("fitch.label"))}"><ol class="fitch__lines" role="list"></ol></div>`
    + '<div class="sr-only proof-editor__live" role="status"></div>'
    + '<div class="proof-editor__status" role="status"></div>'
    + (guided ? '<div class="guided"></div>' : "")
    + `<div class="proof-editor__tools" role="group" aria-label="${escapeHtml(t("editor.toolsLabel"))}">${actions}</div>`
    + (guided ? "" : writing);
}

/** A mensagem de baixo da prova: o aviso da última operação, a prova completa ou o que ainda falta. */
export function statusHtml(status, notice) {
  if (notice) return msgHtml("warn", escapeHtml(messageText(notice)));
  if (status.complete) {
    const mark = status.usesUserRules ? ` <b>${escapeHtml(t("userRules.mark"))}.</b>` : "";
    return msgHtml("ok", escapeHtml(t("editor.complete")) + mark);
  }
  return status.conclusion ? msgHtml("info", escapeHtml(messageText(status.conclusion))) : "";
}

/**
 * Monta o editor em `container`. Só aparece com `start(goal)`.
 * `onGoalChange(goal)`: ao desfazer ou refazer, o sequente da prova mudou.
 * `onProofChange()`: a prova mudou, por isso o que se disse sobre ela deixou de valer.
 * Devolve { start(goal), open(goal, proof), getProof(), getGoal(), getRules(), setRules({ rules, known }),
 * hasUnreadText(), highlightLine(line), useProof(proof) }.
 * `idPrefix` e `mode` servem a lição, que tem vários editores e abre no modo guiado.
 */
export function mountProofEditor(container, options = {}) {
  const { onGoalChange, onProofChange, idPrefix = "proof" } = options;
  let { rules = ruleSet("completo"), known = RULES } = options;
  let editor = null;
  let seenProof = null;
  let painting = false;
  let timer = null;
  let mode = options.mode ?? "write";
  /** Modo guiado: o que está selecionado, a regra à espera de uma escolha e o motivo à vista. */
  let selection = [];
  let choice = null;
  let reason = null;
  /** A linha destacada de fora, ou null. */
  let highlighted = null;
  /** Linhas com o erro já à vista: um erro novo na linha do cursor espera por uma pausa. */
  const shown = new Set();
  /** As linhas como foram anunciadas pela última vez: só se fala do que mudou. */
  let announced = null;

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
    const { formula } = editor.proof.lines[line - 1];
    const spoken = formula === null ? "" : `${spokenFormula(formula)}. `;
    row.querySelector(`#${idPrefix}-reading-${line}`).textContent = spoken + t(`fitch.states.${visible}`);
  }

  /** A escrever, uma linha à espera não fala: `seen` são as linhas como estão à vista. */
  function announce(seen, extra = "") {
    const text = [announcementText(announced, seen), spokenProse(extra)].filter(Boolean).join(" ");
    announced = seen;
    if (text) container.querySelector(".proof-editor__live").textContent = text;
  }

  function paintFooter(status) {
    const box = container.querySelector(".proof-editor__status");
    const html = statusHtml(status, editor.notice);
    // Reescrever o mesmo texto numa região viva faria o leitor de ecrã repeti-lo a cada tecla.
    if (box.dataset.painted !== html) {
      box.innerHTML = html;
      box.dataset.painted = html;
    }
    container.querySelector('[data-action="undo"]').disabled = !canUndo(editor);
    container.querySelector('[data-action="redo"]').disabled = !canRedo(editor);
  }

  /** O destaque pedido de fora, que tem de sobreviver a redesenhar as linhas. */
  function paintHighlight() {
    container.querySelectorAll(".fitch--edit [data-line]").forEach((row) => {
      row.toggleAttribute("data-highlight", Number(row.dataset.line) === highlighted);
    });
  }

  /** O botão com o foco, para o voltar a encontrar depois de redesenhar. */
  function focusedSelector() {
    const active = document.activeElement;
    if (!active || !container.contains(active)) return null;
    const name = ["pick", "rule"].find((key) => key in active.dataset);
    return name ? `[data-${name}="${CSS.escape(active.dataset[name])}"]` : null;
  }

  /**
   * No modo guiado o foco não volta a um campo. Se o botão que o tinha desapareceu ou ficou desativado
   * (a escolha de um passo, Desfazer sem nada a desfazer), passa para o objetivo ou para a primeira regra.
   */
  function rescueFocus(hadFocus) {
    const active = document.activeElement;
    if (!hadFocus || (container.contains(active) && !active.disabled)) return;
    (container.querySelector(".fitch-pick[aria-current]") ?? container.querySelector("[data-rule]"))?.focus();
  }

  function paintGuided(status) {
    const focused = focusedSelector();
    const anchor = guidedAnchor(editor);
    const rows = guidedLines(editor, selection);
    container.querySelector(".fitch__lines").innerHTML = editor.proof.lines.map((line, index) => guidedLineHtml(line, index, {
      row: rows[index],
      status: status.rows[index],
      assumption: closesAssumptions(editor.proof.lines, index),
      target: index + 1 === anchor.line ? anchor.target : null,
    })).join("");
    container.querySelector(".guided").innerHTML = guidedPanelHtml({
      anchor,
      rules: guidedRules(editor, selection, { rules, known }),
      choice,
      reason,
      complete: status.complete,
    });
    if (focused) container.querySelector(focused)?.focus();
  }

  /** Atualiza estados e mensagens sem tocar nos campos, para não perder o foco nem o cursor do texto. */
  function refresh({ flush = false } = {}) {
    clearTimeout(timer);
    if (editor.proof !== seenProof) {
      seenProof = editor.proof;
      onProofChange?.();
    }
    const status = editorStatus(editor, { rules, known });
    if (mode === "guided") {
      const hadFocus = container.contains(document.activeElement);
      paintGuided(status);
      paintFooter(status);
      rescueFocus(hadFocus);
      paintHighlight();
      announce(status.rows, guidedNews());
      return;
    }
    let waiting = false;
    const seen = status.rows.map((row, index) => {
      const line = index + 1;
      if (row.message === null) shown.delete(line);
      const hold = !flush && row.message !== null && line === editor.cursor.line && !shown.has(line);
      if (hold) waiting = true;
      else if (row.message !== null) shown.add(line);
      paintRow(line, row, hold);
      return hold ? { state: "pending", message: null } : row;
    });
    if (waiting) timer = setTimeout(() => refresh({ flush: true }), ERROR_DELAY_MS);
    paintFooter(status);
    paintHighlight();
    announce(seen);
  }

  /** O que só o modo guiado tem a dizer: a recusa de uma regra ou que é preciso escolher o passo. */
  function guidedNews() {
    if (reason) return messageText(reason);
    return choice ? t("guided.choose") : "";
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
    if (mode === "guided") {
      refresh();
      return;
    }
    painting = true;
    container.querySelector(".fitch__lines").innerHTML = linesHtml(editor, idPrefix);
    painting = false;
    shown.clear();
    refresh({ flush: true });
  }

  function clearGuided() {
    selection = [];
    choice = null;
    reason = null;
  }

  /** Passa para o estado `next` e mexe só no que mudou. */
  function show(next) {
    const before = editor;
    editor = next;
    if (next.proof !== before.proof || next.cursor !== before.cursor) clearGuided();
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

  function pickLine(number) {
    const { role, item } = guidedLines(editor, selection)[number - 1];
    if (role === "objective") {
      show(moveCursor(editor, number));
      return;
    }
    if (role !== "citable") return;
    selection = toggleSelection(selection, item);
    choice = null;
    reason = null;
    refresh();
  }

  function pickRule(id) {
    const { outcomes, reason: refused } = guidedRules(editor, selection, { rules, known }).find((rule) => rule.id === id);
    choice = outcomes.length > 1 ? { id, outcomes } : null;
    reason = refused;
    if (outcomes.length === 1) show(applyOutcome(editor, outcomes[0], ruleLabels()));
    else refresh();
  }

  function onGuidedClick({ target }) {
    const pick = target.closest("[data-pick]");
    const rule = target.closest("[data-rule]");
    const option = target.closest("[data-choice]");
    if (pick) pickLine(Number(pick.dataset.pick));
    else if (rule) pickRule(rule.dataset.rule);
    else if (option) show(applyOutcome(editor, choice.outcomes[Number(option.dataset.choice)], ruleLabels()));
  }

  function setMode(name) {
    if (name === mode) return;
    mode = name;
    clearGuided();
    editor = tidyAll(editor, ruleLabels());
    if (mode === "guided") editor = focusObjective(editor);
    build();
    container.querySelector(`[data-mode="${name}"]`).focus();
  }

  function onKeydown(event) {
    if (mode === "guided") {
      const name = keyAction({ key: event.key, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey });
      if (name !== "undo" && name !== "redo") return;
      event.preventDefault();
      show(runAction(editor, name));
      return;
    }
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
    announced = null;
    container.innerHTML = shellHtml(mode);
    container.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
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
  container.addEventListener("click", onGuidedClick);
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
      clearGuided();
      build();
      focusCursor();
    },
    /** Abre a prova de um link. Sem foco: ao abrir a página, o teclado do telemóvel não deve saltar. */
    open(goal, proof) {
      editor = openProof(goal, proof, ruleLabels());
      if (mode === "guided") editor = focusObjective(editor);
      clearGuided();
      build();
    },
    getProof: () => editor?.proof ?? null,
    getGoal: () => editor?.goal ?? null,
    getRules: () => ({ rules, known }),
    /** As regras mudaram (criar ou apagar uma regra própria): a prova é a mesma, os estados não. */
    setRules(next) {
      ({ rules, known } = next);
      if (!editor) return;
      clearGuided();
      refresh({ flush: true });
    },
    hasUnreadText: () => editor !== null && hasUnreadText(editor),
    highlightLine(line) {
      highlighted = line;
      paintHighlight();
    },
    useProof(proof) {
      show(loadProof(tidied(), proof, ruleLabels()));
    },
  };
}
