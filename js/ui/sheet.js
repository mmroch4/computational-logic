/**
 * Folha inferior do mobile, sobre o <dialog> nativo: showModal() já prende o foco, trata o Esc e
 * devolve o foco a quem a abriu. Fecha também com o toque no scrim e ao arrastar para baixo.
 */
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";

/** Arrastar mais do que isto (px) fecha a folha; menos, ela volta ao sítio. */
const DRAG_TO_CLOSE = 80;

const CLOSE_ICON =
  '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/** HTML do topo da folha (pega, título e fechar). */
function sheetHeadHtml(title) {
  const close = escapeHtml(t("sheet.close"));
  return (
    `<span class="sheet-grip" aria-hidden="true"></span>` +
    `<div class="sheet-head"><p class="sheet-title">${escapeHtml(title)}</p>` +
    `<button type="button" class="btn" data-variant="ghost" data-size="icon" data-sheet-close aria-label="${close}" title="${close}">${CLOSE_ICON}</button></div>`
  );
}

// Só um toque fora do retângulo da folha cai no ::backdrop (o evento tem o <dialog> como alvo).
function isBackdropClick(dialog, event) {
  if (event.target !== dialog) return false;
  const box = dialog.getBoundingClientRect();
  return event.clientY < box.top || event.clientY > box.bottom || event.clientX < box.left || event.clientX > box.right;
}

function bindDrag(dialog, close) {
  let startY = null;
  const distance = (event) => Math.max(0, event.clientY - startY);
  dialog.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".sheet-grip, .sheet-head") || event.target.closest("button")) return;
    startY = event.clientY;
    dialog.setPointerCapture(event.pointerId);
  });
  dialog.addEventListener("pointermove", (event) => {
    if (startY !== null) dialog.style.translate = `0 ${distance(event)}px`;
  });
  const release = (event) => {
    if (startY === null) return;
    const dragged = distance(event);
    startY = null;
    dialog.style.translate = "";
    if (dragged > DRAG_TO_CLOSE) close();
  };
  dialog.addEventListener("pointerup", release);
  dialog.addEventListener("pointercancel", release);
}

/**
 * Mostra `content` numa folha, sem o tirar do sítio: o <dialog> nasce ao lado dele e fica no mesmo
 * ramo do DOM, por isso os eventos delegados continuam a chegar aos contentores da página.
 * `onClose` corre uma vez, seja qual for a forma de fechar. Devolve a função que fecha a folha.
 */
export function openSheet(content, { title, onClose }) {
  const dialog = document.createElement("dialog");
  dialog.className = "sheet";
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = sheetHeadHtml(title);
  content.before(dialog);
  dialog.append(content);

  let open = true;
  function finish() {
    if (!open) return;
    open = false;
    dialog.before(content);
    dialog.remove();
    onClose?.();
  }
  function close() {
    if (dialog.open) dialog.close();
    finish();
  }

  dialog.addEventListener("close", finish); // o Esc fecha o <dialog> sem passar por close()
  dialog.addEventListener("click", (event) => {
    if (event.target.closest("dialog") !== dialog) return; // uma folha aberta dentro desta trata-se sozinha
    if (event.target.closest("[data-sheet-close]") || isBackdropClick(dialog, event)) close();
  });
  bindDrag(dialog, close);
  dialog.showModal();
  return close;
}
