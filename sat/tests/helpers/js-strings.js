// Extrai os literais de texto de um ficheiro JS (sem os comentários), para os testes de i18n.
// Um scanner simples: percorre o código carácter a carácter e devolve cada string ('…', "…") e
// cada parte fixa de um template (`…${…}…`), com a linha onde começa. Os comentários e as regex
// literais são saltados. Os templates aninhados dentro de ${…} também são percorridos.

/** @returns {{ value: string, line: number, template: boolean }[]} */
export function stringLiterals(source) {
  const out = [];
  let i = 0;
  let line = 1;
  // Pilha de templates abertos: cada entrada conta as chavetas abertas dentro do ${…} atual.
  const templateDepth = [];
  let lastSignificant = ""; // último carácter de código, para distinguir "/" de regex e de divisão

  function readQuoted(quote) {
    const start = line;
    let value = "";
    i++;
    while (i < source.length && source[i] !== quote) {
      if (source[i] === "\\") { value += source[i + 1]; i += 2; continue; }
      if (source[i] === "\n") line++;
      value += source[i++];
    }
    i++;
    out.push({ value, line: start, template: false });
  }

  // Lê a parte fixa de um template até ao fim (`) ou até ao próximo ${.
  function readTemplatePart() {
    const start = line;
    let value = "";
    while (i < source.length) {
      const c = source[i];
      if (c === "\\") { value += source[i + 1]; i += 2; continue; }
      if (c === "`") { i++; out.push({ value, line: start, template: true }); return false; }
      if (c === "$" && source[i + 1] === "{") {
        i += 2;
        out.push({ value, line: start, template: true });
        templateDepth.push(0);
        return true;
      }
      if (c === "\n") line++;
      value += c;
      i++;
    }
    return false;
  }

  function skipRegex() {
    i++;
    let inClass = false;
    while (i < source.length && source[i] !== "\n") {
      const c = source[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
      i++;
    }
    i++;
    while (/[a-z]/.test(source[i] ?? "")) i++;
  }

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && next === "/") { while (i < source.length && source[i] !== "\n") i++; continue; }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end < 0 ? source.length : end + 2;
      line += (source.slice(i, stop).match(/\n/g) || []).length;
      i = stop;
      continue;
    }
    if (c === "/" && (lastSignificant === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSignificant))) {
      skipRegex();
      lastSignificant = ")";
      continue;
    }
    if (c === '"' || c === "'") { readQuoted(c); lastSignificant = c; continue; }
    if (c === "`") { i++; readTemplatePart(); lastSignificant = "`"; continue; }
    if (templateDepth.length) {
      if (c === "{") templateDepth[templateDepth.length - 1]++;
      if (c === "}") {
        if (templateDepth[templateDepth.length - 1] === 0) {
          templateDepth.pop();
          i++;
          readTemplatePart();
          lastSignificant = "`";
          continue;
        }
        templateDepth[templateDepth.length - 1]--;
      }
    }
    lastSignificant = c;
    i++;
  }
  return out;
}

/**
 * Diz se um literal parece texto para o utilizador ler. Tira as etiquetas HTML (inteiras ou
 * cortadas pelo ${…}) e os valores de atributos e procura duas palavras seguidas ou letras
 * acentuadas. Seletores, classes, eventos e caminhos não passam.
 */
export function looksLikeVisibleText(value) {
  let text = value
    .replace(/<[^>]*>/g, " ")   // etiquetas completas
    .replace(/^[^<]*>/, " ")     // fim de uma etiqueta aberta noutro pedaço do template
    .replace(/<[^>]*$/, " ")     // início de uma etiqueta que fecha noutro pedaço
    .replace(/[\w-]+="[^"]*"?/g, " "); // atributos soltos (a="…")
  if (/^[\w./-]+\.(js|css|html|tex|png|svg)$/.test(text.trim())) return false;
  return /[A-Za-zÀ-ÿ]{2,}[  ]+[A-Za-zÀ-ÿ]{2,}/.test(text) || /[À-ÿ]/.test(text);
}
