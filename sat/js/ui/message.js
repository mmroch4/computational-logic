// Mensagens (`.msg`): fundo suave + ícone na cor + texto, nunca só a cor. O toast usa as mesmas.
const svg = (path) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;

const TRIANGLE = '<path d="M12 4 2.5 20h19z"/><path d="M12 10v5M12 17.5v.01"/>';

const KINDS = {
  error: { classes: "msg msg-error", icon: svg(TRIANGLE) },
  warn: { classes: "msg msg-warn", icon: svg(TRIANGLE) },
  info: { classes: "msg msg-info", icon: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>') },
  ok: { classes: "msg msg-ok", icon: svg('<path d="m5 12 5 5 9-10"/>') },
};

/** Classes de uma mensagem do tipo `kind` (error, warn, info, ok). */
export const msgClasses = (kind) => KINDS[kind].classes;

/** O interior de uma mensagem: ícone + `html` (já escapado). */
export const msgBodyHtml = (kind, html) => `${KINDS[kind].icon}<span>${html}</span>`;

/** Uma mensagem completa; `attrs` são atributos extra (ex.: ` role="alert"`). */
export function msgHtml(kind, html, { tag = "p", classes = "", attrs = "" } = {}) {
  const cls = classes ? `${KINDS[kind].classes} ${classes}` : KINDS[kind].classes;
  return `<${tag} class="${cls}"${attrs}>${msgBodyHtml(kind, html)}</${tag}>`;
}
