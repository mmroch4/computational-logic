import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToast, TOAST_DURATION_MS } from "../js/ui/toast.js";
import { setLang } from "../js/ui/i18n.js";

test("renderToast: role status (ou alert nos erros), mensagem escapada e botão fechar traduzido", () => {
  setLang("pt", { silent: true });
  const ok = renderToast("Link <copiado>");
  assert.ok(ok.includes('role="status"'));
  assert.ok(ok.includes("Link &lt;copiado&gt;"));
  assert.ok(ok.includes('aria-label="Fechar"'));
  assert.ok(renderToast("x", { error: true }).includes('role="alert"'));
  setLang("en", { silent: true });
  assert.ok(renderToast("x").includes('aria-label="Close"'));
  setLang("pt", { silent: true });
  assert.equal(TOAST_DURATION_MS, 4000);
});
