#!/usr/bin/env bash
# Verificação do Passo a passo (M3.7): a cadeia de propagações bate com os conjuntos (1)–(6) da
# resolução à mão, e os dois ramos e os pombos (3 em 2) mostram a árvore completa no último passo.
# Cada caso abre a página no Chrome headless (via check-page.sh) e confirma o estado no EVAL.
# Uso: scripts/check-step.sh [pasta-saída]   (por omissão: tmp/screens/step)
set -uo pipefail

# EN=1 corre o mesmo no caminho EN.
export STEP=/passo-a-passo
[ "${EN:-0}" = 1 ] && STEP=/en/step-by-step

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/tmp/screens/step}"
FAILED=0
export FULL_PAGE=1 CHROME_LANG=pt-PT

run() { # run <nome> <caminho> <eval>
  echo "== $1"
  EVAL="$3" "$ROOT/scripts/check-page.sh" "$2" "$OUT/$1" || FAILED=$((FAILED + 1))
}

# "nome<TAB>query<TAB>EVAL" gerados a partir de js/core (os conjuntos esperados são os da resolução à mão).
CASES="$(cd "$ROOT" && node --input-type=module -e '
import { getExample } from "./js/core/examples.js";
import { parse } from "./js/core/parser.js";
import { encodeShare } from "./js/core/share.js";
import { formatSet } from "./js/core/clauses.js";
import { solveDLL } from "./js/core/dll.js";
import { buildTree } from "./js/core/trace.js";

const clausesOf = (id) => parse(getExample(id).input).clauses;
const query = (id, params) => process.env.STEP + "?" + encodeShare(clausesOf(id), { params });

// Texto dos conjuntos no ecrã sem espaços e com os subscritos como dígitos (p₁₁ → p11).
const NORM = `const norm = (s) => s.replace(/[₀-₉]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x2050)).replace(/\\s+/g, "");`;
const show = (text) => formatSet(parse(text).clauses).replace(/[₀-₉]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x2050)).replace(/\s+/g, "");

// Cadeia de propagações: conjuntos (1)–(4) da resolução à mão, tal e qual; (6) é {F}. O (5) agrupa
// literais escolhidos por outra ordem, por isso não aparece igual.
const byHand = [
  getExample("propagation-chain").input,
  "-p2, p3 p2, -p7 p2, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7",
  "p3, -p7, -p3 p4, -p3 p5, -p4 -p q, -p5 -p6 r, -p -q p6, p p7, -r p7",
  "p4, p5, -p4 -p q, -p5 -p6 r, -p -q p6, p, -r",
].map(show);
const proofJs = `${NORM}
  const items = [...document.querySelectorAll("#proof .proof__step")];
  const sets = items.filter((b) => b.querySelector(".proof__num")).map((b) => norm(b.querySelector(".proof__set").textContent));
  const want = ${JSON.stringify(byHand)};
  // (1) é o conjunto inicial; (2) aplica p1, (3) aplica ¬p2, (4) aplica p3 e ¬p7 (dois passos nossos).
  const pick = [sets[0], sets[1], sets[2], sets[4]];
  want.forEach((w, k) => { if (pick[k] !== w) throw new Error("conjunto " + (k + 1) + ": " + pick[k] + " ≠ " + w); });
  if (sets.at(-1) !== "{F}") throw new Error("o último conjunto devia ser {F}: " + sets.at(-1));
  if (document.querySelector("#proof .proof__step--branch")) throw new Error("o exemplo 1 não ramifica");
  if (!document.querySelector("#proof .proof__step--conflict")) throw new Error("falta a conclusão S contém F");
  if (!document.querySelector("#result .rule-conflict")) throw new Error("o cartão devia dizer insatisfazível");
  if (document.querySelector("#proof .is-future")) throw new Error("no último passo não há passos futuros");`;

// Árvore completa: no último passo todos os nós foram visitados (chamadas e propagações), folhas com ✗ e nenhuma ✓.
const treeJs = (id) => {
  const nodes = buildTree(solveDLL(clausesOf(id)).trace).nodes;
  const leaves = nodes.filter((n) => n.children.length === 0).length;
  const units = nodes.reduce((sum, n) => sum + n.units.length, 0);
  // Uma caixa por chamada DLL(S) e um nó por literal propagado, com aresta tracejada.
  return `
  const nodes = document.querySelectorAll("#tree .tree-node:not(.tree-node--unit)");
  if (nodes.length !== ${nodes.length}) throw new Error("${id}: " + nodes.length + " nós, esperava ${nodes.length}");
  const units = document.querySelectorAll("#tree .tree-node--unit").length;
  const dashed = document.querySelectorAll("#tree .tree-edge--unit").length;
  if (units !== ${units} || dashed !== ${units}) throw new Error("${id}: " + units + " propagações e " + dashed + " arestas tracejadas, esperava ${units}");
  if (document.querySelector("#tree .tree-node--future, #tree .tree-edge--future")) throw new Error("${id}: ramos por visitar");
  if (document.querySelector("#tree .tree-node--sat")) throw new Error("${id}: não devia haver folhas ✓");
  const icons = [...document.querySelectorAll("#tree .tree-node__icon")].map((i) => i.textContent);
  if (icons.length !== ${leaves} || icons.some((i) => i !== "✗")) throw new Error("${id}: folhas " + icons);
  if (!document.querySelector("#tree .tree-node--current")) throw new Error("${id}: sem nó atual");
  if (!document.querySelector("#result .rule-conflict")) throw new Error("${id}: devia ser insatisfazível");`;
};

const cases = [
  ["exemplo1-prova-fim", query("propagation-chain", { step: 99, view: "proof" }), proofJs],
  ["exemplo1-passo4", query("propagation-chain", { step: 4 }),
    `if (!/4/.test(document.querySelector(".timeline")?.textContent ?? "")) throw new Error("timeline sem o passo 4");`],
  ["exemplo2-arvore-fim", query("two-branches", { step: 99, view: "tree" }), treeJs("two-branches")],
  ["pombos-arvore-fim", query("pigeons-3-2", { step: 99, view: "tree" }), treeJs("pigeons-3-2")],
];
for (const [name, path, js] of cases) console.log([name, path, js.replace(/\n/g, " ")].join("\t"));
')" || { echo "Não consegui gerar os casos" >&2; exit 1; }

while IFS=$'\t' read -r name path js; do
  run "$name" "$path" "$js"
done <<< "$CASES"

# Link partilhável (M4.3): "Copiar link" na barra das vistas copia o URL do passo e da vista atuais,
# e esse URL reabre a página no mesmo ponto.
SHARE_QUERY="f=p,+-p+q,+-q+r,+-r&a=dll&step=3&view=proof"
run "share-copy" "$STEP?$SHARE_QUERY" '
  let copied = null;
  navigator.clipboard.writeText = async (text) => { copied = text; };
  document.querySelector("#step-algo [data-action=copy-link]").click();
  await new Promise((r) => setTimeout(r, 100));
  if (copied !== location.href) throw new Error("copiou " + copied + " em vez de " + location.href);
  if (!copied.endsWith("?'"$SHARE_QUERY"'")) throw new Error("link inesperado: " + copied);
  const toast = document.querySelector(".toast-region .toast__message");
  if (!toast || !/^Link cop/.test(toast.textContent)) throw new Error("sem o toast do link copiado");'
run "share-open" "$STEP?$SHARE_QUERY" '
  if (document.querySelector("[data-role=range]").value !== "3") throw new Error("o link não abriu no passo 3");
  if (document.querySelector("#proof").hidden) throw new Error("o link não abriu a vista de prova");'

if [ "$FAILED" -gt 0 ]; then
  echo "FALHOU: $FAILED caso(s)" >&2
  exit 1
fi
echo "OK: todos os casos passaram"
