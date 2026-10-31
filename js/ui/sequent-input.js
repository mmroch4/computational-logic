// Campo de sequente: textarea mono, teclas de símbolos que não fecham o teclado do telemóvel, notação
// detetada com conversão, leitura formatada e erro inline com a coluna e o sítio sublinhado.
//
// As funções exportadas à parte são puras (testáveis em node); só mountSequentInput() mexe no DOM.
import { convertNotation, detectNotation } from "../core/notation.js";
import { formatSequent, parseSequent } from "../core/sequent.js";
import { onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgBodyHtml, msgClasses } from "./message.js";

/** Teclas: o que aparece, o que é inserido e o nome em `sequentInput.symbols.*`. */
export const SYMBOL_KEYS = [
  { name: "not", label: "¬", insert: "¬" },
  { name: "and", label: "∧", insert: " ∧ " },
  { name: "or", label: "∨", insert: " ∨ " },
  { name: "implies", label: "→", insert: " → " },
  { name: "falsum", label: "F", insert: "F" },
  { name: "open", label: "(", insert: "(" },
  { name: "close", label: ")", insert: ")" },
  { name: "comma", label: ",", insert: ", " },
  { name: "turnstile", label: "⊢", insert: " ⊢ " },
];

/** Tempo sem escrever até o erro aparecer: `p ∧` é um erro só se o aluno parar ali. */
export const ERROR_DELAY_MS = 700;

/** Diferença entre o ecrã e a zona visível a partir da qual há teclado virtual aberto. */
const KEYBOARD_MIN_PX = 120;

/** Com teclado virtual, a zona visível encolhe e a altura da janela não. */
export function keyboardOpen(innerHeight, visibleHeight) {
  return innerHeight - visibleHeight > KEYBOARD_MIN_PX;
}

/**
 * Insere `symbol` no lugar da seleção e devolve o texto e o cursor, sem duplicar espaços:
 * « ∧ » a seguir a um espaço fica «∧ ».
 */
export function insertSymbol(value, selStart, selEnd, symbol) {
  const before = value.slice(0, selStart);
  const after = value.slice(selEnd);
  let insert = symbol;
  if (insert.startsWith(" ") && (before === "" || before.endsWith(" "))) insert = insert.trimStart();
  if (insert.endsWith(" ") && after.startsWith(" ")) insert = insert.trimEnd();
  return { value: before + insert + after, caret: before.length + insert.length };
}

/** Estado para um texto: "empty", "error" ou "ok"; o texto vazio só é erro com `showEmptyError`. */
export function analyze(text, { showEmptyError = false } = {}) {
  if (text.trim() === "" && !showEmptyError) return { state: "empty", result: null };
  const result = parseSequent(text);
  return { state: result.ok ? "ok" : "error", result };
}

/** Onde mostrar o erro. Sem ⊢, o parser aponta o texto todo, mas o que falta vem depois dele. */
export function errorRange(error, text) {
  if (error.code !== "missingTurnstile") return { start: error.start, end: error.end };
  const end = text.trimEnd().length;
  return { start: end, end };
}

/** Texto com o intervalo do erro em <mark>; um intervalo vazio marca um espaço naquele sítio. */
export function errorHtml(text, { start, end }) {
  if (start === end) return `${escapeHtml(text.slice(0, start))}<mark>&nbsp;</mark>${escapeHtml(text.slice(start))}`;
  return `${escapeHtml(text.slice(0, start))}<mark>${escapeHtml(text.slice(start, end))}</mark>${escapeHtml(text.slice(end))}`;
}

/** Erro do campo: «Coluna 5:» a negrito e a frase. Conta caracteres, não unidades de UTF-16. */
export function fieldErrorHtml(error, text) {
  const message = escapeHtml(t(`parser.errors.${error.code}`, error.params));
  if (error.code === "emptyInput") return message;
  const column = [...text.slice(0, errorRange(error, text).start)].length + 1;
  return `<b>${escapeHtml(t("sequentInput.column", { column }))}</b> ${message}`;
}

/** Para que notação o botão converte: ASCII só se o texto já estiver todo em símbolos. */
export const conversionTarget = (notation) => (notation === "symbols" ? "ascii" : "symbols");

function renderShell(id) {
  const keys = SYMBOL_KEYS.map(
    ({ name, label }) =>
      `<button type="button" data-symbol="${name}" aria-label="${escapeHtml(t(`sequentInput.symbols.${name}`))}">${escapeHtml(label)}</button>`,
  ).join("");
  return `
    <div class="sequent-input__head">
      <label class="field__label" for="${id}">${escapeHtml(t("sequentInput.label"))}</label>
      <button type="button" class="sequent-input__convert" hidden></button>
    </div>
    <div class="field-box">
      <div class="field-mirror" aria-hidden="true"></div>
      <textarea id="${id}" rows="2" enterkeyhint="go" autocomplete="off" autocapitalize="off" autocorrect="off"
        spellcheck="false" placeholder="${escapeHtml(t("sequentInput.placeholder"))}"
        aria-describedby="${id}-preview ${id}-error"></textarea>
    </div>
    <div class="keys" role="group" aria-label="${escapeHtml(t("sequentInput.symbolsLabel"))}">${keys}</div>
    <p class="${msgClasses("error")} field-error" id="${id}-error" role="alert" hidden></p>
    <p class="preview" id="${id}-preview" hidden></p>`;
}

/**
 * Monta o campo em `container`.
 * - `value`: texto inicial;
 * - `onChange(analysis, text)`: a cada alteração, sem o atraso do erro;
 * - `onSubmit(sequent, text)`: com Enter, só se o sequente for válido.
 * Devolve { getValue, setValue, focus, submit }.
 */
export function mountSequentInput(container, { id = "sequent", value = "", onChange, onSubmit } = {}) {
  let text = value;
  let showEmptyError = false;
  let timer = null;
  let keyboardWasOpen = false;
  const els = {};

  function paint(analysis, { withError }) {
    const invalid = analysis.state === "error" && withError;
    els.textarea.setAttribute("aria-invalid", String(invalid));
    els.mirror.innerHTML = invalid && text.trim() !== "" ? errorHtml(text, errorRange(analysis.result.error, text)) : "";
    els.mirror.scrollTop = els.textarea.scrollTop;
    els.error.hidden = !invalid;
    els.error.innerHTML = invalid ? msgBodyHtml("error", fieldErrorHtml(analysis.result.error, text)) : "";

    const ok = analysis.state === "ok";
    els.preview.hidden = !ok;
    els.preview.textContent = ok ? formatSequent(analysis.result.sequent) : "";

    const notation = detectNotation(text);
    els.convert.hidden = notation === null;
    if (notation !== null) els.convert.textContent = t(`sequentInput.convertTo.${conversionTarget(notation)}`);
  }

  /** Um erro novo espera por uma pausa, mas um erro já à vista acompanha logo o texto ou sai. */
  function update({ immediate = false } = {}) {
    clearTimeout(timer);
    const analysis = analyze(text, { showEmptyError });
    const shown = els.textarea.getAttribute("aria-invalid") === "true";
    const delayed = analysis.state === "error" && !immediate && !shown;
    paint(analysis, { withError: !delayed });
    if (delayed) timer = setTimeout(() => paint(analysis, { withError: true }), ERROR_DELAY_MS);
    onChange?.(analysis, text);
    return analysis;
  }

  function submit() {
    showEmptyError = true;
    const { state, result } = update({ immediate: true });
    if (state === "ok") onSubmit?.(result.sequent, text);
    return state === "ok";
  }

  function setText(next) {
    text = String(next ?? "");
    showEmptyError = false;
    els.textarea.value = text;
    update({ immediate: true });
  }

  function pressKey(name) {
    const { insert } = SYMBOL_KEYS.find((key) => key.name === name);
    const { textarea } = els;
    const next = insertSymbol(textarea.value, textarea.selectionStart, textarea.selectionEnd, insert);
    textarea.value = next.value;
    textarea.focus();
    textarea.setSelectionRange(next.caret, next.caret);
    text = next.value;
    showEmptyError = false;
    update();
  }

  function build() {
    container.innerHTML = renderShell(id);
    els.textarea = container.querySelector("textarea");
    els.mirror = container.querySelector(".field-mirror");
    els.error = container.querySelector(".field-error");
    els.preview = container.querySelector(".preview");
    els.convert = container.querySelector(".sequent-input__convert");
    els.textarea.value = text;

    els.textarea.addEventListener("input", () => {
      text = els.textarea.value;
      showEmptyError = false;
      update();
    });
    els.textarea.addEventListener("scroll", () => {
      els.mirror.scrollTop = els.textarea.scrollTop;
    });
    els.textarea.addEventListener("blur", () => {
      if (text.trim() !== "") update({ immediate: true });
    });
    els.textarea.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      submit();
    });
    els.convert.addEventListener("click", () => {
      const target = conversionTarget(detectNotation(text));
      setText(convertNotation(text, target));
    });
    container.querySelectorAll("[data-symbol]").forEach((button) => {
      // Sem isto, o campo perde o foco ao carregar na tecla e o teclado do telemóvel fecha.
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => pressKey(button.dataset.symbol));
    });
    update({ immediate: true });
  }

  // O teclado virtual tapa a parte de baixo: o campo sobe para o topo, com as teclas à vista.
  function onViewportResize() {
    const open = keyboardOpen(window.innerHeight, window.visualViewport.height);
    if (open && !keyboardWasOpen && document.activeElement === els.textarea) {
      container.scrollIntoView({ block: "start", behavior: "instant" });
    }
    keyboardWasOpen = open;
  }

  container.classList.add("sequent-input");
  build();
  window.visualViewport?.addEventListener("resize", onViewportResize);
  onLangChange(() => {
    const hadFocus = document.activeElement === els.textarea;
    build();
    if (hadFocus) els.textarea.focus();
  });

  return {
    getValue: () => text,
    setValue: setText,
    focus: () => els.textarea.focus(),
    submit,
  };
}
