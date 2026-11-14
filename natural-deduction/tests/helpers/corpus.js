// Corpus de texto proposicional que o site já lê: todas as strings literais de `js/` e `tests/`
// (exercícios, exemplos, lição, derivadas, regras guardadas nos testes, fixtures) que se leem como
// prova, sequente ou fórmula/esquema. Serve o teste de regressão do parser de 1.ª ordem.
//
// `tests/fixtures/propositional-corpus.json` foi gerado com o parser proposicional (commit ce583d4,
// antes da L2) por `node tests/helpers/corpus.js > tests/fixtures/propositional-corpus.json`.
// Não se regenera: é o que garante que a 1.ª ordem não mudou a leitura de nada. Só saíram `forall` e
// `exists`, que eram palavras do código e passaram a reservadas, como manda o `SPEC.md`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "../../js/core/formula.js";
import { parseFormula } from "../../js/core/parser.js";
import { formatProof, parseProof } from "../../js/core/proof-text.js";
import { formatSequent, parseSequent } from "../../js/core/sequent.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return name === "vendor" || name === "__snapshots__" ? [] : sourceFiles(path);
    return /\.m?js$/.test(name) ? [path] : [];
  });
}

/** Strings literais de um ficheiro: "…", '…' e `…` sem interpolação. */
function literals(source) {
  const found = [];
  const re = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\$]|\\.|\$(?!\{))*`/g;
  for (const [written] of source.matchAll(re)) {
    try {
      found.push(new Function(`return ${written}`)());
    } catch {
      // Não era uma string (um apóstrofo num comentário, por exemplo).
    }
  }
  return found;
}

/** Como cada texto se lê hoje: { kind, text, printed }, só para os que se leem. */
export function readCorpus(texts) {
  const entries = [];
  for (const text of texts) {
    if (/^\s*\d+\s*\|/m.test(text)) {
      const result = parseProof(text);
      if (result.ok) entries.push({ kind: "proof", text, printed: formatProof(result.proof) });
    } else if (/⊢|\|-/.test(text)) {
      const result = parseSequent(text);
      if (result.ok) entries.push({ kind: "sequent", text, printed: formatSequent(result.sequent) });
    } else {
      const result = parseFormula(text, { metavariables: true });
      if (result.ok) entries.push({ kind: "formula", text, printed: format(result.formula) });
    }
  }
  return entries;
}

export function collectTexts() {
  const files = [...sourceFiles(join(ROOT, "js")), ...sourceFiles(join(ROOT, "tests"))];
  const texts = new Set(files.flatMap((file) => literals(readFileSync(file, "utf8"))));
  return [...texts].filter((text) => text.trim() !== "").sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(readCorpus(collectTexts()), null, 1)}\n`);
}
