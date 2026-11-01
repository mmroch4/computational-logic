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
import { closeMenu, mountMenus } from "./menu.js";
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

const icon = (path) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
const SHARE_ICON = '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>';

const ITEMS = [
  { action: "copy-link", key: "copyLink", path: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>' },
  { action: "copy-latex", key: "copyLatex", path: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>' },
  { action: "download-tex", key: "downloadTex", path: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>' },
  { action: "print", key: "print", path: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>' },
];

/**
 * Monta o menu em `container`, que fica vazio até `show()`: só há o que exportar com uma prova aberta.
 * A resposta de cada ação aparece em `statusBox`, fora do menu.
 */
export function mountProofShare(container, { source, sync, statusBox }) {
  /** A última resposta, { kind, key }, para sobreviver a redesenhar. */
  let status = null;

  function paintStatus() {
    statusBox.innerHTML = status ? msgHtml(status.kind, escapeHtml(t(status.key))) : "";
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
    const label = escapeHtml(t("share.label"));
    const items = ITEMS.map(({ action, key, path }) => (
      `<button type="button" data-share="${action}">${icon(path)}<span>${escapeHtml(t(`share.${key}`))}</span></button>`
    )).join("");
    container.innerHTML = `<details class="dd end" data-sheet-title="${label}">`
      + `<summary class="btn" data-variant="outline" data-size="icon" aria-label="${label}" title="${label}">${icon(SHARE_ICON)}</summary>`
      + `<div class="menu dd-panel">${items}</div></details>`;
    paintStatus();
  }

  container.classList.add("proof-share");
  mountMenus(container);
  // Na folha do telemóvel, o painel sai do contentor: o clique tem de se ouvir no próprio painel.
  document.addEventListener("click", ({ target }) => {
    const action = target.closest("[data-share]");
    if (!action) return;
    closeMenu(container.querySelector("details"), { focus: true });
    ACTIONS[action.dataset.share]();
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
