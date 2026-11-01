// Fórmulas e regras em palavras, para leitores de ecrã: por omissão, muitos saltam ¬, ∧ ou →, e uma
// negação que não se ouve muda a prova. `words` é `speech` no locale do idioma.

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const SYMBOLS = { "¬": "not", "∧": "and", "∨": "or", "→": "implies", "⊢": "turnstile", "(": "open", ")": "close" };
const TOKENS = /\p{L}[\p{L}\p{N}_]*|[¬∧∨→⊢()]/gu;
const PROSE_SYMBOLS = /[¬∧∨→⊢]/g;
const RULE_SYMBOLS = /[¬∧∨→]/g;
const RANGE = /(\d+)–(\d+)/g;

const plainDigits = (text) => [...text].map((char) => {
  const digit = SUBSCRIPT_DIGITS.indexOf(char);
  return digit === -1 ? char : ` ${digit}`;
}).join("").replace(/(\d) (?=\d)/g, "$1");

/** Texto de `format` ou `formatSequent` em palavras. F sozinho é sempre o falso: `atom()` reserva-o. */
export function speakFormula(text, words) {
  return (text.match(TOKENS) ?? []).map((token) => {
    if (token === "F") return words.falsum;
    return SYMBOLS[token] ? words[SYMBOLS[token]] : plainDigits(token);
  }).join(" ");
}

/** Uma frase que traz símbolos: só eles mudam, por isso o texto à volta fica igual. */
export function speakProse(text, words) {
  return text.replace(PROSE_SYMBOLS, (symbol) => ` ${words[SYMBOLS[symbol]]} `).replace(/ {2,}/g, " ").trim();
}

/** Uma justificação (`→E, 1, 3` ou `¬I, 3–5`): nas siglas, o símbolo lê-se como o nome do conectivo. */
export function speakJustification(text, words) {
  return text
    .replace(RULE_SYMBOLS, (symbol) => `${words.connectives[SYMBOLS[symbol]]} `)
    .replace(RANGE, (_, from, to) => words.range.replace("{from}", from).replace("{to}", to));
}
