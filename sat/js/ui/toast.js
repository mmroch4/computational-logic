// Toasts: mensagens curtas no canto inferior (desktop à direita; mobile acima da tab bar).
// Somem ao fim de 4s, exceto os erros (role="alert"), que ficam até o aluno os fechar.
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgBodyHtml, msgClasses } from "./message.js";

export const TOAST_DURATION_MS = 4000;

const CLOSE_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/** HTML de um toast (puro). */
export function renderToast(message, { error = false } = {}) {
  const role = error ? "alert" : "status";
  const kind = error ? "error" : "ok";
  return (
    `<div class="${msgClasses(kind)} toast" role="${role}">` +
    `${msgBodyHtml(kind, `<span class="toast__message">${escapeHtml(message)}</span>`)}` +
    `<button type="button" class="toast__close" aria-label="${escapeHtml(t("toast.close"))}">${CLOSE_ICON}</button>` +
    `</div>`
  );
}

/** Região única dos toasts, criada no fim do <body> na primeira utilização. */
function toastRegion() {
  let region = document.querySelector(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    document.body.append(region);
  }
  return region;
}

/** Mostra um toast. Devolve uma função que o fecha. */
export function showToast(message, { error = false } = {}) {
  const region = toastRegion();
  region.insertAdjacentHTML("beforeend", renderToast(message, { error }));
  const toast = region.lastElementChild;
  const close = () => toast.remove();
  toast.querySelector(".toast__close").addEventListener("click", close);
  if (!error) setTimeout(close, TOAST_DURATION_MS);
  return close;
}
