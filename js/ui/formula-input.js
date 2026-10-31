// Input de fórmula: textarea mono, preview formatado em tempo real (¬ ∨ ∧, subscritos), chip com a
// notação detetada, erro inline com a posição sublinhada, avisos discretos, barra de símbolos
// (útil no telemóvel) e Ctrl/⌘+Enter para resolver.
//
// Como no layout.js, as funções render*() e insertSymbol() são puras (testáveis em node);
// só mountFormulaInput() mexe no DOM.
import { detectNotation, parse } from "../core/parser.js";
import { splitVariable } from "../core/literals.js";
import { t, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgBodyHtml, msgClasses, msgHtml } from "./message.js";
import { parserErrorMessage, parserWarningMessage } from "./parser-messages.js";

// Botões da barra de símbolos: o que aparece e o que é inserido no texto.
export const SYMBOLS = [
  { label: "¬", insert: "¬", name: "not" },
  { label: "∨", insert: " ∨ ", name: "or" },
  { label: "∧", insert: " ∧ ", name: "and" },
  { label: "{", insert: "{", name: "open" },
  { label: "}", insert: "}", name: "close" },
  { label: ",", insert: ", ", name: "comma" },
];

/** Variável em HTML com o sufixo numérico em <sub>: "p11" → "p<sub>11</sub>" (copiar dá "p11"). */
export function variableHtml(v) {
  const { base, index } = splitVariable(v);
  return escapeHtml(base) + (index ? `<sub>${index}</sub>` : "");
}

export function literalHtml(l) {
  return (l.neg ? "¬" : "") + variableHtml(l.v);
}

/** Cláusula em HTML (¬p₁ ∨ q); a cláusula vazia é F. */
export function clauseHtml(clause) {
  if (clause.length === 0) return "F";
  return clause.map(literalHtml).join(" ∨ ");
}

/** Conjunto em HTML: "{¬p<sub>1</sub> ∨ q, q}". */
export function setHtml(clauses) {
  return `{${clauses.map(clauseHtml).join(", ")}}`;
}

/**
 * Início do conjunto em HTML: as cláusulas que couberem em `maxChars` e «…» no fim, se faltarem
 * algumas. Mostra sempre a primeira. Conta os caracteres do texto, sem as etiquetas do HTML.
 */
export function setPreviewHtml(clauses, maxChars = 40) {
  let used = 0;
  const shown = [];
  for (const clause of clauses) {
    const html = clauseHtml(clause);
    used += html.replace(/<[^>]+>/g, "").length + 2; // ", " entre cláusulas
    if (shown.length > 0 && used > maxChars) break;
    shown.push(html);
  }
  return `{${shown.join(", ")}${shown.length < clauses.length ? ", …" : ""}}`;
}

/**
 * Texto escrito pelo aluno com o intervalo do erro [start, end) dentro de <mark>.
 * Se o intervalo for vazio ou estiver no fim do texto (falta algo), marca um espaço no fim.
 * Sem posição (erros de tamanho do conjunto inteiro, como tooManyClauses) não marca nada.
 */
export function errorHtml(text, start, end) {
  if (start === undefined) return escapeHtml(text);
  const from = Math.max(0, Math.min(start ?? 0, text.length));
  const to = Math.max(from, Math.min(end ?? from, text.length));
  if (to === from) return `${escapeHtml(text.slice(0, from))}<mark>&nbsp;</mark>${escapeHtml(text.slice(from))}`;
  return (
    escapeHtml(text.slice(0, from)) +
    `<mark>${escapeHtml(text.slice(from, to))}</mark>` +
    escapeHtml(text.slice(to))
  );
}

/**
 * Insere um símbolo no lugar da seleção [selStart, selEnd) e devolve o novo texto e a posição do
 * cursor. Não duplica espaços: " ∨ " a seguir a um espaço fica "∨ ".
 */
export function insertSymbol(value, selStart, selEnd, symbol) {
  const before = value.slice(0, selStart);
  const after = value.slice(selEnd);
  let insert = symbol;
  if (insert.startsWith(" ") && (before === "" || before.endsWith(" "))) insert = insert.trimStart();
  if (insert.endsWith(" ") && after.startsWith(" ")) insert = insert.trimEnd();
  return { value: before + insert + after, caret: before.length + insert.length };
}

/** Erro do campo: «Coluna 11:» a negrito e a mensagem. O texto vazio não tem uma coluna a apontar. */
export function fieldErrorHtml(error) {
  const message = escapeHtml(parserErrorMessage(error, { withPosition: false }));
  if (typeof error.start !== "number" || error.code === "emptyInput") return message;
  return `<b>${escapeHtml(t("parser.atColumn", { column: error.start + 1 }))}</b> ${message}`;
}

/** Um aviso do parser: o título a negrito e a frase; a tautologia é só informação. */
export function warningHtml(warning, { tag = "p" } = {}) {
  const title = escapeHtml(t(`parser.warningTitles.${warning.code}`));
  return msgHtml(warning.code === "tautology" ? "info" : "warn", `<b>${title}</b> ${escapeHtml(parserWarningMessage(warning))}`, { tag });
}

/**
 * Estado do input para um texto: "empty" (nada escrito), "error" ou "ok".
 * `showEmptyError` mostra o erro emptyInput (só depois de o aluno tentar resolver).
 */
export function analyze(text, { showEmptyError = false } = {}) {
  if (text.trim() === "") {
    if (!showEmptyError) return { state: "empty", result: null };
    return { state: "error", result: parse(text) };
  }
  const result = parse(text);
  return { state: result.ok ? "ok" : "error", result };
}

// Atalho mostrado ao aluno: ⌘ no Mac, Ctrl nos outros sistemas.
function shortcutKeys() {
  const platform = typeof navigator === "undefined" ? "" : navigator.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad/i.test(platform) ? "⌘ + Enter" : "Ctrl + Enter";
}

const CLEAR_ICON =
  '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5"/><path d="M4 4v4.5h4.5"/></svg>';

function renderShell(id, rows, submitKey, clearable) {
  const keys = shortcutKeys().split(" + ").map((key) => `<kbd class="kbd-key">${escapeHtml(key)}</kbd>`).join(" + ");
  const symbols = SYMBOLS.map(
    (s) =>
      `<button type="button" data-symbol="${s.name}" ` +
      `aria-label="${escapeHtml(t(`formulaInput.symbols.${s.name}`))}">${escapeHtml(s.label)}</button>`,
  ).join("");
  return `
    <div class="formula-input__head">
      <label class="field__label" for="${id}">${escapeHtml(t("formulaInput.label"))}</label>
      <span class="notation" hidden></span>
    </div>
    <div class="field-box">
      <div class="field-mirror" aria-hidden="true"></div>
      <textarea id="${id}" rows="${rows}"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="${escapeHtml(t("formulaInput.placeholder"))}"
        aria-describedby="${id}-preview ${id}-error ${id}-hint"></textarea>
    </div>
    <p class="preview" id="${id}-preview" hidden></p>
    <p class="${msgClasses("error")} field-error" id="${id}-error" role="alert" hidden></p>
    <ul class="formula-input__warnings" hidden></ul>
    <div class="keys" role="toolbar" aria-label="${escapeHtml(t("formulaInput.symbolsLabel"))}">${symbols}</div>
    <div class="formula-input__actions">
      <button type="button" class="btn formula-input__submit" data-size="lg">${escapeHtml(t(submitKey))}</button>
      ${clearable ? `<button type="button" class="btn formula-input__clear max-md:w-11 max-md:px-0" data-variant="ghost" data-size="lg">${CLEAR_ICON}<span class="max-md:sr-only">${escapeHtml(t("formulaInput.clear"))}</span></button>` : ""}
      <span class="formula-input__hint" id="${id}-hint" aria-label="${escapeHtml(t("formulaInput.shortcut", { keys: shortcutKeys() }))}">${keys}</span>
    </div>`;
}

/**
 * Monta o input dentro de `container`.
 * - `value`: texto inicial (ex.: vindo da URL);
 * - `onSubmit({ clauses, notation, warnings }, text)`: chamado ao resolver, só se a fórmula for válida;
 * - `onChange(analysis, text)`: chamado a cada alteração;
 * - `rows`: altura do textarea em linhas (3; a página Passo a passo usa um input mais compacto);
 * - `submitKey`: chave i18n do botão de resolver;
 * - `showWarnings`: mostra os avisos por baixo do campo (no Resolver vão para o cartão de resultado);
 * - `onClear()`: mostra o botão "Limpar", ao lado de resolver, e responde aos seus cliques.
 * Devolve { getValue, setValue, focus, submit }.
 */
export function mountFormulaInput(container, { id = "formula", value = "", rows = 3, submitKey = "formulaInput.submit", showWarnings = true, onSubmit, onChange, onClear } = {}) {
  let text = value;
  let showEmptyError = false;

  container.classList.add("formula-input");

  const els = {};
  function build() {
    container.innerHTML = renderShell(id, rows, submitKey, Boolean(onClear));
    els.textarea = container.querySelector("textarea");
    els.mirror = container.querySelector(".field-mirror");
    els.notation = container.querySelector(".notation");
    els.preview = container.querySelector(".preview");
    els.error = container.querySelector(".field-error");
    els.warnings = container.querySelector(".formula-input__warnings");
    els.submit = container.querySelector(".formula-input__submit");
    els.textarea.value = text;

    els.textarea.addEventListener("input", () => {
      text = els.textarea.value;
      showEmptyError = false;
      update();
    });
    els.textarea.addEventListener("scroll", () => {
      els.mirror.scrollTop = els.textarea.scrollTop;
    });
    els.textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submit();
      }
    });
    container.querySelectorAll("[data-symbol]").forEach((button) => {
      // pointerdown com preventDefault: o textarea não perde o foco (nem o teclado do telemóvel fecha).
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        const symbol = SYMBOLS.find((s) => s.name === button.dataset.symbol);
        const ta = els.textarea;
        const next = insertSymbol(ta.value, ta.selectionStart, ta.selectionEnd, symbol.insert);
        ta.value = next.value;
        ta.focus();
        ta.setSelectionRange(next.caret, next.caret);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    els.submit.addEventListener("click", submit);
    container.querySelector(".formula-input__clear")?.addEventListener("click", () => onClear());
    update();
  }

  function update() {
    const analysis = analyze(text, { showEmptyError });
    const { state, result } = analysis;
    const invalid = state === "error";

    els.textarea.setAttribute("aria-invalid", String(invalid));
    els.submit.setAttribute("aria-disabled", String(state !== "ok"));

    // Chip da notação: com o ✓ quando a fórmula é válida; num erro diz só em que notação se está a ler.
    const notation = state === "ok" ? result.notation : text.trim() === "" ? null : detectNotation(text);
    els.notation.hidden = notation === null;
    els.notation.classList.toggle("notation--error", invalid);
    if (notation) els.notation.textContent = t(`formulaInput.notationChip.${notation}`);

    // O erro fica sublinhado no próprio campo: o espelho tem o mesmo texto, por baixo e transparente.
    els.mirror.innerHTML = invalid && text.trim() !== "" ? errorHtml(text, result.error.start, result.error.end) : "";
    els.mirror.scrollTop = els.textarea.scrollTop;

    els.preview.innerHTML = state === "ok" ? setHtml(result.clauses) : "";
    els.preview.hidden = state !== "ok";

    els.error.hidden = !invalid;
    els.error.innerHTML = invalid ? msgBodyHtml("error", fieldErrorHtml(result.error)) : "";

    const warnings = state === "ok" && showWarnings ? result.warnings : [];
    els.warnings.hidden = warnings.length === 0;
    els.warnings.innerHTML = warnings.map((w) => warningHtml(w, { tag: "li" })).join("");

    onChange?.(analysis, text);
    return analysis;
  }

  function submit() {
    showEmptyError = true;
    const { state, result } = update();
    if (state === "ok") onSubmit?.(result, text);
    else els.textarea.focus();
  }

  build();
  // Ao mudar de idioma volta a desenhar tudo (rótulos e mensagens), mantendo o texto e o foco.
  onLangChange(() => {
    const hadFocus = document.activeElement === els.textarea;
    build();
    if (hadFocus) els.textarea.focus();
  });

  return {
    getValue: () => text,
    setValue(newText) {
      text = String(newText ?? "");
      showEmptyError = false;
      els.textarea.value = text;
      update();
    },
    focus: () => els.textarea.focus(),
    submit,
  };
}
