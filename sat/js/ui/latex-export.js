// Exportar um trace do DLL ou do DP para LaTeX: copiar o documento para o clipboard ou descarregá-lo como .tex.
// O documento vem de js/core/latex.js (puro); aqui só se juntam as frases do idioma atual, o nome da
// ferramenta e as ações do browser (clipboard, download e toast).
import { dpTraceToLatex, traceToLatex } from "../core/latex.js";
import { APP_NAME } from "./config.js";
import { t } from "./i18n.js";
import { showToast } from "./toast.js";

/** Nome do ficheiro descarregado (dll.tex ou dp.tex). */
export const texFilename = (algorithm = "dll") => `${algorithm}.tex`;

/**
 * Documento LaTeX completo do trace, com as frases no idioma atual (PT ou EN).
 * algorithm: "dll" (prova + árvore) ou "dp" (sequência de conjuntos + pares resolvidos).
 */
export function latexDocument(trace, { algorithm = "dll" } = {}) {
  const toLatex = algorithm === "dp" ? dpTraceToLatex : traceToLatex;
  return toLatex(trace, { text: (key, params) => t(`latex.${key}`, params), app: APP_NAME });
}

async function copyLatex(trace, options) {
  try {
    await navigator.clipboard.writeText(latexDocument(trace, options));
    showToast(t("latexExport.copied"));
  } catch {
    showToast(t("latexExport.copyFailed"), { error: true });
  }
}

function downloadTex(trace, options = {}) {
  const blob = new Blob([latexDocument(trace, options)], { type: "application/x-tex;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = texFilename(options.algorithm);
  document.body.append(link);
  link.click();
  link.remove();
  // Dar tempo ao browser para começar o download antes de libertar o URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Responde a um clique num dos botões de exportar (os de latexButtonsHtml() e o "Exportar PDF" de
 * print-sheet.js, que abre a janela de impressão); devolve true se era um deles.
 * options.algorithm: "dll" (por omissão) ou "dp".
 */
export function handleLatexAction(action, trace, options = {}) {
  if (action === "copy-latex") copyLatex(trace, options);
  else if (action === "download-tex") downloadTex(trace, options);
  else if (action === "print-pdf") window.print();
  else return false;
  return true;
}
