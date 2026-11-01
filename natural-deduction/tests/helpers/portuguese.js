// Deteta texto português num texto que devia estar em inglês. Procura o que o inglês não tem: letras
// acentuadas, palavras frequentes ou da terminologia da cadeira, e as siglas PT das regras. Tem de
// continuar a importar-se sem DOM: é usado nos testes e em scripts/check-english.mjs.

const WORDS = [
  "ainda", "ajuda", "anterior", "apagar", "aprender", "avançar", "cada", "citar", "como", "copiar", "dedução",
  "depois", "dica", "dicas", "dos", "das", "ela", "ele", "em", "entre", "escreve", "escrever", "esta", "este",
  "exemplo", "exemplos", "exercício", "exercícios", "falta", "fechar", "fórmula", "fórmulas", "guardar",
  "hipótese", "hipóteses", "início", "linha", "linhas", "mais", "mostrar", "nas", "nos", "nova", "novo", "numa",
  "num", "não", "ou", "para", "passo", "passos", "pela", "pelo", "por", "porque", "premissa", "premissas",
  "próximo", "prova", "provar", "provas", "que", "quando", "regra", "regras", "resolvido", "secção", "sem",
  "sequente", "sequentes", "seguinte", "solução", "subdedução", "subdeduções", "tem", "todas", "todos", "uma",
  "valoração", "verdade", "ver", "voltar",
];

const SIGNS = [
  { name: "letra acentuada", pattern: /[áàâãçéêíóôõú]/i },
  { name: "aspas de PT", pattern: /[«»]/ },
  { name: "sigla PT", pattern: /(?<![\p{L}\p{N}_-])(?:RA|TE|SH|SD)(?![\p{L}\p{N}_-])/u },
  { name: "palavra PT", pattern: new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${WORDS.join("|")})(?![\\p{L}\\p{N}_-])`, "iu") },
];

/** O primeiro sinal de português em `text`, como `{ name, match }`, ou `null`. */
export function portugueseSign(text) {
  for (const { name, pattern } of SIGNS) {
    const found = text.match(pattern);
    if (found) return { name, match: found[0] };
  }
  return null;
}
