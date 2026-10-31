// Vercel Web Analytics: sem cookies e sem banner. Só no domínio de produção: fora dele a rota não
// existe, e o pedido daria um erro na consola.
import { SITE_URL } from "./config.js";

const SCRIPT_SRC = "/_vercel/insights/script.js";

export function loadAnalytics(hostname = location.hostname) {
  if (hostname !== new URL(SITE_URL).hostname) return false;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  const script = document.createElement("script");
  script.defer = true;
  script.src = SCRIPT_SRC;
  document.head.append(script);
  return true;
}
