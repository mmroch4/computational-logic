// Página Resolver: input de fórmula (M2.1), menu de exemplos com histórico (M2.2), cartão de
// resultado (M2.3) e as suas ações: passo a passo e exportar (M2.4). Gerador de
// fórmulas com semente na URL (M4.4).
//
// Estados da página (M2.5):
// - vazio: sem resultado → dica e 3 exemplos clicáveis (empty-state.js);
// - erro: a fórmula não é válida → o erro aparece no input e a cábula da notação no lugar da dica;
// - resultado: o cartão (satisfazível, insatisfazível ou limite de passos atingido); se o aluno
//   editar a fórmula depois de resolver, o cartão fica marcado como desatualizado.
import { mountLayout } from "../ui/layout.js";
import { mountFormulaInput } from "../ui/formula-input.js";
import { mountExamplesMenu } from "../ui/examples-menu.js";
import { mountGenerator, generatorFromParams, generatorParams, runGenerator } from "../ui/generator-panel.js";
import { mountResultCard } from "../ui/result-card.js";
import { mountEmptyState, mountNotationHelp } from "../ui/empty-state.js";
import { shareUrl, copyShareLink } from "../ui/share-link.js";
import { handleLatexAction } from "../ui/latex-export.js";
import { mountPrintSheet } from "../ui/print-sheet.js";
import { t } from "../ui/i18n.js";
import { storage } from "../ui/storage.js";
import { solveDLL } from "../core/dll.js";
import { decodeShare, encodeShare, shareFormula } from "../core/share.js";

mountLayout();

// A fórmula pode vir da URL (?f=…), por exemplo da fórmula rápida da página inicial. Sem fórmula,
// semente ou menu no link, volta a última fórmula resolvida nesta página.
const fromLink = decodeShare(location.search);
const restore = !fromLink.formula && !fromLink.params.seed && !fromLink.params.menu;
const { formula, params } = restore ? decodeShare(storage.getLastQuery("solve") ?? location.search) : fromLink;

// Fórmula gerada que está no input: { text, params } com a semente e as opções do gerador, que
// acompanham o link enquanto o aluno não mudar a fórmula. null = a fórmula não veio do gerador.
let generated = null;

/** Query string do conjunto `clauses` (com a semente, se a fórmula veio do gerador). */
function queryFor(clauses) {
  return encodeShare(clauses, { params: generated?.params ?? {} });
}

/** Responde ao menu Exportar; o link é o desta página para o conjunto `clauses` (`…/resolver?f=…&a=dll`). */
function runExport(action, clauses) {
  if (action === "copy-link") copyShareLink(shareUrl(queryFor(clauses)));
  else if (action === "share") navigator.share({ url: shareUrl(queryFor(clauses)) }).catch(() => {});
  else handleLatexAction(action, solvedTrace);
}

// O texto que deu o resultado mostrado (null = não há resultado) e o trace do DLL (para o LaTeX).
let solvedText = null;
let solvedTrace = null;
let inputState = "empty";

function refreshState(text) {
  const hasError = inputState === "error" && text.trim() !== "";
  emptyState.show(solvedText === null && !hasError);
  notationHelp.show(solvedText === null && hasError);
  resultCard.setStale(solvedText !== null && text.trim() !== solvedText.trim());
}

const resultCard = mountResultCard(document.getElementById("result"), { onExport: runExport });

// Imprimir (menu Exportar do cartão ou Ctrl+P) mostra a prova e a árvore da fórmula resolvida.
mountPrintSheet(() => solvedTrace);

// Escolher um exemplo põe-no no input e resolve logo (estado vazio e menu de exemplos).
function selectFormula(text) {
  input.setValue(text);
  input.submit();
}

const emptyState = mountEmptyState(document.getElementById("empty-state"), { onSelect: selectFormula });
const notationHelp = mountNotationHelp(document.getElementById("notation-help"));

const input = mountFormulaInput(document.getElementById("formula-input"), {
  value: formula ?? "",
  rows: 2,
  showWarnings: false,
  onChange(analysis, text) {
    inputState = analysis.state;
    refreshState(text);
  },
  onSubmit(result, text) {
    solvedText = text;
    if (generated && text.trim() !== generated.text) generated = null;
    // Cada fórmula válida resolvida entra no histórico do menu de exemplos.
    storage.addToHistory(text);
    // result.clauses já vem normalizado pelo parser (sem repetidos).
    const started = performance.now();
    const solved = solveDLL(result.clauses);
    const elapsedMs = performance.now() - started;
    solvedTrace = solved.trace;
    resultCard.show(result.clauses, solved.result, { warnings: result.warnings, elapsedMs });
    // A barra de endereço passa a ter o link partilhável da fórmula resolvida (sem novo item no histórico).
    const query = queryFor(result.clauses);
    history.replaceState(null, "", `${location.pathname}?${query}`);
    storage.setLastQuery("solve", query);
    refreshState(text);
  },
  onClear() {
    solvedText = null;
    solvedTrace = null;
    input.setValue("");
    resultCard.clear();
    history.replaceState(null, "", location.pathname);
    storage.clearLastQuery("solve");
    input.focus();
  },
});

// Escolher um exemplo (ou uma fórmula do histórico) põe-na no input e resolve logo.
mountExamplesMenu(document.getElementById("examples-menu"), {
  open: params.menu === "examples",
  onSelect: selectFormula,
});

// Gerar uma fórmula põe-na no input (notação compacta) e resolve logo; a semente vai para a URL.
function useGenerated(out) {
  generated = { text: shareFormula(out.clauses), params: out.params };
  selectFormula(generated.text);
}

// ?seed=… (com vars, clauses e want) volta a gerar o mesmo conjunto; com ?f=… a fórmula manda e a
// semente só fica no link e no gerador.
const fromUrl = generatorFromParams(params);
mountGenerator(document.getElementById("generator"), {
  initial: fromUrl,
  open: params.menu === "generator",
  onGenerate: useGenerated,
});

// Uma fórmula vinda da URL é resolvida logo ao abrir a página.
if (formula) {
  if (fromUrl) generated = { text: formula.trim(), params: generatorParams(fromUrl) };
  input.submit();
} else if (fromUrl) {
  const out = runGenerator(fromUrl);
  if (out.found) useGenerated(out);
}
