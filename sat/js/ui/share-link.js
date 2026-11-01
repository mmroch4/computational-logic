// Link partilhável (M4.3): o mesmo toast em todas as páginas que recebem
// uma fórmula (Resolver, Passo a passo e, no M6, Exercícios). A query string vem de js/core/share.js
// (encodeShare); aqui só se junta a página atual e se copia para o clipboard.
import { t } from "./i18n.js";
import { showToast } from "./toast.js";

/** Link absoluto desta página com a query string `query` (sem "?"), ex.: …/resolver?f=p,+-p&a=dll. */
export function shareUrl(query, where = location) {
  return `${where.origin}${where.pathname}?${query}`;
}

/** Copia o link para o clipboard e mostra o toast "Link copiado" (ou o erro, se não houver permissão). */
export async function copyShareLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast(t("shareLink.copied"));
    return true;
  } catch {
    // Sem permissão ou sem HTTPS: o link também está na barra de endereço (as páginas mantêm-na atualizada).
    showToast(t("shareLink.copyFailed"), { error: true });
    return false;
  }
}
