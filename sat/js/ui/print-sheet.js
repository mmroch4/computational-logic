// "Exportar PDF" pela impressão do browser: em vez de uma biblioteca de PDF (que não traz as fontes
// de ¬ e ∨), monta-se uma folha só para impressão com a resolução completa (no DLL, a vista de prova
// e a árvore; no DP, a sequência de conjuntos com os pares resolvidos de cada eliminação), e o CSS de @media print esconde o resto da página (nav, input, timeline) e deixa só o
// rodapé com os créditos. O aluno escolhe "Guardar como PDF" na janela de impressão.
//
// renderPrintSheet() é pura (testável em node); mountPrintSheet() e printTrace() mexem no DOM.
import { APP_NAME } from "./config.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { proofModel, renderProof } from "./proof-view.js";
import { renderDpPrint } from "./dp-view.js";
import { treeModel, renderTree } from "./tree-view.js";

/** Os ids da folha levam um prefixo para não repetirem os das vistas da página (ex.: #proof-heading). */
function prefixIds(html) {
  return html.replace(/ (id|aria-labelledby)="/g, ' $1="print-');
}

/**
 * HTML da folha de impressão no último passo do trace: título e, no DLL, a vista de prova e a
 * árvore; no DP (algorithm = "dp"), a sequência de conjuntos com os pares resolvidos.
 */
export function renderPrintSheet(trace, { algorithm = "dll" } = {}) {
  const last = trace.length - 1;
  const body = algorithm === "dp"
    ? renderDpPrint(trace)
    : renderProof(proofModel(trace, last, { budget: Infinity })) + renderTree(treeModel(trace, last));
  return (
    `<header class="print-sheet__header">` +
    `<p class="print-sheet__app">${escapeHtml(APP_NAME)}</p>` +
    `<h1 class="print-sheet__title">${escapeHtml(t(algorithm === "dp" ? "printSheet.dpTitle" : "printSheet.title"))}</h1>` +
    `</header>` +
    prefixIds(body)
  );
}

/**
 * Prepara a página para imprimir o trace devolvido por `getTrace()` (null = nada para imprimir).
 * `getAlgorithm()` diz qual é a folha ("dll" por omissão, ou "dp").
 * A folha é criada no "beforeprint", por isso também serve o Ctrl+P, e apagada no "afterprint".
 */
export function mountPrintSheet(getTrace, getAlgorithm = () => "dll") {
  let sheet = null;
  window.addEventListener("beforeprint", () => {
    // Pode chegar mais do que um "beforeprint" seguido: fica sempre uma só folha, a do trace atual.
    sheet?.remove();
    sheet = null;
    document.body.classList.remove("is-printing");
    const trace = getTrace();
    if (!trace) return;
    sheet = document.createElement("article");
    sheet.className = "print-sheet";
    sheet.innerHTML = renderPrintSheet(trace, { algorithm: getAlgorithm() });
    document.body.classList.add("is-printing");
    document.querySelector(".ftr")?.before(sheet);
  });
  window.addEventListener("afterprint", () => {
    sheet?.remove();
    sheet = null;
    document.body.classList.remove("is-printing");
  });
}

