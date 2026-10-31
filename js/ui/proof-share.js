// Partilhar e exportar a prova: o link no endereço e na área de transferência, o LaTeX e a impressão.
// Em vez de uma biblioteca de PDF, que não traz as fontes de ¬ e ∨, monta-se uma folha só para impressão,
// e o aluno escolhe «Guardar como PDF». A folha nasce no `beforeprint`, por isso também serve o Ctrl+P.
//
// As funções exportadas à parte são puras (testáveis em node); só as mount*() mexem no DOM.
// `source` é o editor: { getProof(), getGoal(), hasUnreadText() }. O `createUrlSync` recebe também
// `getUserRules()`, com as regras próprias ativas, para o link levar as que a prova cita.
import { proofToLatex } from "../core/latex.js";
import { formatSequent } from "../core/sequent.js";
import { encodeShare } from "../core/share.js";
import { APP_NAME } from "./config.js";
import { fitchHtml } from "./fitch-view.js";
import { LOCALES, getLang, onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { storage } from "./storage.js";

/** Pausa antes de mexer no endereço: o Safari recusa mais de 100 `replaceState` em 30 s. */
const URL_DELAY_MS = 300;

const TEX_FILENAME = "prova.tex";

/** Link absoluto desta página com a query `query` (sem `?`). */
export const shareUrl = (query, where) => `${where.origin}${where.pathname}${query ? `?${query}` : ""}`;

/** O documento LaTeX, com as frases e as siglas do idioma da página. */
export function latexDocument(goal, proof) {
  const { proofText, rules } = LOCALES[getLang()];
  return proofToLatex(goal, proof, {
    text: (key, params) => t(`latex.${key}`, params),
    labels: proofText,
    ruleLabels: rules.labels,
    app: APP_NAME,
  });
}

/** A folha de impressão: o nome do site, o sequente e a prova, sem marcas de estado. */
export function printSheetHtml(goal, proof) {
  return `<header><p class="print-sheet__app">${escapeHtml(APP_NAME)}</p>`
    + `<h1 class="print-sheet__title">${escapeHtml(t("share.printTitle"))}</h1>`
    + `<p class="print-sheet__sequent">${escapeHtml(formatSequent(goal))}</p></header>${fitchHtml(proof)}`;
}

/** A mensagem de um link inválido: o que aconteceu e o que fazer. */
export function shareErrorHtml({ code, params }) {
  return msgHtml("error", `<b>${escapeHtml(t("share.errors.heading"))}</b> ${escapeHtml(t(`share.errors.${code}`, params))}`);
}

/** O aviso das regras que um link trouxe: `added` e `replaced` de `applyLink`, `rejected` do link. */
export function linkRulesHtml({ added, replaced, rejected }) {
  const names = (list) => list.join(", ");
  const refused = rejected.map(({ name }) => name).filter(Boolean);
  const parts = [];
  if (added.length > 0) parts.push(msgHtml("info", escapeHtml(t("share.rulesAdded", { names: names(added) }))));
  if (replaced.length > 0) parts.push(msgHtml("warn", escapeHtml(t("share.rulesReplaced", { names: names(replaced) }))));
  if (rejected.length > 0) parts.push(msgHtml("warn", escapeHtml(t("share.rulesRejected", { names: names(refused) || "?" }))));
  return parts.join("");
}

/**
 * Mantém o endereço igual à prova aberta, para recarregar não a perder e para o idioma a levar consigo.
 * Devolve { schedule(), flush() }; `flush()` dá o resultado de `encodeShare` e aplica-o já.
 */
export function createUrlSync(source) {
  let timer = null;

  function flush() {
    clearTimeout(timer);
    timer = null;
    const shared = encodeShare(source.getGoal(), source.getProof(), source.getUserRules());
    const { pathname, hash } = location;
    try {
      history.replaceState(null, "", `${pathname}${shared.query ? `?${shared.query}` : ""}${hash}`);
    } catch {
      // Demasiadas mudanças seguidas: fica para a próxima.
    }
    storage.setLastQuery("prove", shared.query);
    return shared;
  }

  addEventListener("pagehide", () => {
    if (timer !== null) flush();
  });

  return {
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(flush, URL_DELAY_MS);
    },
    flush,
  };
}

function downloadTex(text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-tex;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = TEX_FILENAME;
  document.body.append(link);
  link.click();
  link.remove();
  // Dá tempo ao browser para começar o download antes de libertar o URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const BUTTONS = [["copy-link", "copyLink"], ["copy-latex", "copyLatex"], ["download-tex", "downloadTex"], ["print", "print"]];

/** Monta os botões em `container`, que fica vazio até `show()`: só há o que exportar com uma prova aberta. */
export function mountProofShare(container, { source, sync }) {
  /** A última resposta, { kind, key }, para sobreviver a redesenhar. */
  let status = null;

  function paintStatus() {
    const box = container.querySelector(".proof-share__status");
    if (box) box.innerHTML = status ? msgHtml(status.kind, escapeHtml(t(status.key))) : "";
  }

  function say(kind, key) {
    status = { kind, key };
    paintStatus();
  }

  async function copy(text, done, failed, doneKind = "ok") {
    try {
      await navigator.clipboard.writeText(text);
      say(doneKind, done);
    } catch {
      say("warn", failed);
    }
  }

  function copyLink() {
    const { query, complete } = sync.flush();
    if (!complete) {
      say("warn", "share.tooLong");
      return;
    }
    const unread = source.hasUnreadText();
    copy(shareUrl(query, location), unread ? "share.linkCopiedUnread" : "share.linkCopied", "share.linkFailed", unread ? "warn" : "ok");
  }

  const latex = () => latexDocument(source.getGoal(), source.getProof());

  const ACTIONS = {
    "copy-link": copyLink,
    "copy-latex": () => copy(latex(), "share.latexCopied", "share.latexFailed"),
    "download-tex": () => downloadTex(latex()),
    print: () => window.print(),
  };

  function build() {
    const buttons = BUTTONS.map(([action, key]) => (
      `<button type="button" class="btn" data-variant="outline" data-share="${action}">${escapeHtml(t(`share.${key}`))}</button>`
    )).join("");
    container.innerHTML = `<div class="proof-share__actions" role="group" aria-label="${escapeHtml(t("share.label"))}">${buttons}</div>`
      + '<div class="proof-share__status" role="status"></div>';
    paintStatus();
  }

  container.classList.add("proof-share");
  container.addEventListener("click", ({ target }) => {
    const action = target.closest("[data-share]");
    if (action) ACTIONS[action.dataset.share]();
  });
  onLangChange(() => {
    if (container.childElementCount > 0) build();
  });

  return {
    /** A prova mudou: mostra os botões e tira a resposta anterior, que já não vale. */
    show() {
      status = null;
      if (container.childElementCount === 0) build();
      paintStatus();
    },
  };
}

/** Prepara a impressão da prova de `source`; sem prova, imprime-se a página como está. */
export function mountPrintSheet(source) {
  let sheet = null;

  function clear() {
    sheet?.remove();
    sheet = null;
    document.body.classList.remove("is-printing");
  }

  addEventListener("beforeprint", () => {
    // Pode chegar mais do que um `beforeprint` seguido: fica sempre uma só folha.
    clear();
    const proof = source.getProof();
    if (!proof) return;
    sheet = document.createElement("article");
    sheet.className = "print-sheet";
    sheet.innerHTML = printSheetHtml(source.getGoal(), proof);
    document.body.classList.add("is-printing");
    document.querySelector(".ftr")?.before(sheet);
  });
  addEventListener("afterprint", clear);
}
