#!/usr/bin/env bash
# Verificação do Resolver (M2.6): os 10 exemplos base, 2 erros de sintaxe, o link partilhado, Limpar e Exportar.
# Cada caso abre o Resolver no Chrome headless (via check-page.sh) e confirma o estado no EVAL.
# Uso: scripts/check-resolver.sh [pasta-saída]   (por omissão: tmp/screens/resolver)
set -uo pipefail

# EN=1 corre o mesmo no caminho EN.
SOLVE=/resolver
[ "${EN:-0}" = 1 ] && SOLVE=/en/solver

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/tmp/screens/resolver}"
FAILED=0
export FULL_PAGE=1 CHROME_LANG=pt-PT

run() { # run <nome> <caminho> <eval>
  echo "== $1"
  EVAL="$3" "$ROOT/scripts/check-page.sh" "$2" "$OUT/$1" || FAILED=$((FAILED + 1))
}

# 1) Exemplos base: "id<TAB>query<TAB>EVAL" gerados a partir de js/core/examples.js.
CASES="$(cd "$ROOT" && node --input-type=module -e '
import { EXAMPLES } from "./js/core/examples.js";
import { parse } from "./js/core/parser.js";
import { encodeShare } from "./js/core/share.js";
import { solveDLL } from "./js/core/dll.js";
for (const ex of EXAMPLES.filter((e) => e.source !== "extra")) {
  const query = encodeShare(parse(ex.input).clauses);
  // O cartão tem de dar o resultado esperado do exemplo e, se for satisfazível, mostrar a valoração do DLL
  // (pode não ser o modelo de referência do exemplo: o DLL experimenta primeiro o ramo positivo).
  const want = ex.expected === "sat" ? ".rule-sat" : ".rule-conflict";
  const model = solveDLL(parse(ex.input).clauses).assignment ?? {};
  const chips = Object.entries(model).map(([v, b]) => `${v} = ${b ? "V" : "F"}`);
  const js = `
    const card = document.querySelector("#result ${want}");
    if (!card) throw new Error("${ex.id}: esperava ${ex.expected}");
    const names = [...document.querySelectorAll("#result .result-valuation th")].map((c) => c.textContent.trim());
    const values = [...document.querySelectorAll("#result .result-valuation td")].map((c) => c.textContent.trim());
    const chips = names.map((name, i) => name + " = " + values[i]);
    for (const c of ${JSON.stringify(chips)}) if (!chips.includes(c)) throw new Error("${ex.id}: falta " + c + " em " + chips);
    if (${ex.expected === "sat"} && !document.querySelector(".result-card__verified")) throw new Error("${ex.id}: sem verificação");`;
  console.log([ex.id, query, js.replace(/\n/g, " ")].join("\t"));
}')" || { echo "Não consegui gerar os casos" >&2; exit 1; }

COUNT=0
while IFS=$'\t' read -r id query js; do
  run "$id" "$SOLVE?$query" "$js"
  COUNT=$((COUNT + 1))
done <<< "$CASES"
[ "$COUNT" -eq 10 ] || { echo "Esperava 10 exemplos base, encontrei $COUNT" >&2; FAILED=$((FAILED + 1)); }

# 2) Erros de sintaxe: o erro inline aparece, sem cartão de resultado nem estado vazio.
ERROR_JS='
  const err = document.querySelector(".field-error");
  if (!err || err.hidden || !err.textContent.trim()) throw new Error("sem erro inline");
  if (!document.querySelector("#result").hidden) throw new Error("o cartão não devia aparecer");
  const empty = document.querySelector("#empty-state");
  if (empty && !empty.hidden && empty.textContent.trim()) throw new Error("o estado vazio não devia aparecer");'
run "error-dangling-negation" "$SOLVE?f=p1,+-p1+-" "$ERROR_JS"
run "error-unbalanced" "$SOLVE?f=(p+%E2%88%A8+%C2%ACq+%E2%88%A7+q" "$ERROR_JS"

# 3) Link partilhado: "Copiar link" copia o URL atual, e esse URL reabre a mesma fórmula com o mesmo resultado.
SHARE_QUERY="f=-p+-q,+-p+q,+p+-q,+p+q&a=dll"
run "share-copy" "$SOLVE?$SHARE_QUERY" '
  let copied = null;
  navigator.clipboard.writeText = async (text) => { copied = text; };
  document.querySelector("[data-action=copy-link]").click();
  await new Promise((r) => setTimeout(r, 100));
  if (copied !== location.href) throw new Error("copiou " + copied + " em vez de " + location.href);
  if (!copied.endsWith("?'"$SHARE_QUERY"'")) throw new Error("link inesperado: " + copied);'
run "share-open" "$SOLVE?$SHARE_QUERY" '
  if (!document.querySelector("#result .rule-conflict")) throw new Error("o link não reabriu o resultado");
  const text = document.querySelector("textarea").value;
  if (text !== "-p -q, -p q, p -q, p q") throw new Error("fórmula diferente: " + text);'

# 4) "Limpar", junto do input: apaga a fórmula, o resultado e o link, e funciona sem resultado.
run "clear" "$SOLVE?$SHARE_QUERY" '
  document.querySelector(".formula-input__clear").click();
  if (document.querySelector("textarea").value !== "") throw new Error("a fórmula ficou no input");
  if (!document.getElementById("result").hidden) throw new Error("o resultado ficou no ecrã");
  if (location.search) throw new Error("o link ficou na barra: " + location.search);
  if (document.getElementById("empty-state").hidden) throw new Error("sem o estado vazio");'
run "clear-error" "$SOLVE?f=p1,+-p1+-" '
  document.querySelector(".formula-input__clear").click();
  if (document.querySelector("textarea").value !== "") throw new Error("a fórmula ficou no input");
  if (document.getElementById("empty-state").hidden) throw new Error("sem o estado vazio");'
run "export-menu" "$SOLVE?$SHARE_QUERY" '
  const actions = document.querySelector("#result .result-card__actions");
  if (actions.querySelector("[data-action=clear]")) throw new Error("Limpar ainda está no cartão");
  const menu = actions.querySelector("details.dd");
  if (menu.getBoundingClientRect().right < actions.getBoundingClientRect().right - 1) throw new Error("menu não está à direita");
  menu.querySelector("summary").click();'

if [ "$FAILED" -gt 0 ]; then
  echo "check-resolver: $FAILED caso(s) com erros" >&2
  exit 1
fi
echo "check-resolver: todos os casos sem erros"
