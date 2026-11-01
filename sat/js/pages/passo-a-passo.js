// Página Passo a passo: input da fórmula (com exemplos e histórico), que depois de escolhida a
// fórmula dá lugar a uma barra (step-bar.js) e volta com "Editar", num cartão por cima do palco
// (desktop) ou numa folha (mobile); Ctrl+Enter resolve e Esc cancela; vista do conjunto S
// (animada ou de prova), árvore, pseudocódigo e timeline; no último passo, o cartão de resultado.
// O segmented DLL | DP troca de algoritmo: no DP (1960) não há árvore, e a vista é a sequência de
// conjuntos com o pseudocódigo do DP e os pares resolvidos em cada eliminação (dp-view.js). Por baixo,
// a comparação DLL × DP do mesmo conjunto (passos, maior S, tempo e mini-gráfico; compare-view.js).
//
// A fórmula pode vir da URL (?f=…, por exemplo do botão "Ver passo a passo" do Resolver), de um
// exemplo ou do input. Ao editar, o DLL volta a correr sozinho (com debounce) quando a fórmula é
// válida. A barra de endereço acompanha o estado: ?f=…&a=dll|dp&step=N&view=proof, o que também
// permite ao Chrome headless fotografar estados específicos. Um conjunto gerado (botão "Gerar")
// acrescenta a semente e as opções do gerador (&seed=…&vars=…&clauses=…&want=…).
import { mountLayout, escapeHtml } from "../ui/layout.js";
import { mountFormulaInput } from "../ui/formula-input.js";
import { mountExamplesMenu } from "../ui/examples-menu.js";
import { mountGenerator, generatorFromParams, generatorParams, runGenerator } from "../ui/generator-panel.js";
import { mountEmptyState } from "../ui/empty-state.js";
import { mountResultCard } from "../ui/result-card.js";
import { shareUrl, copyShareLink } from "../ui/share-link.js";
import { MOBILE_QUERY, closeMenu, openMenu } from "../ui/menu.js";
import { openSheet } from "../ui/sheet.js";
import { handleLatexAction } from "../ui/latex-export.js";
import { mountPrintSheet } from "../ui/print-sheet.js";
import { setSummaryHtml, editButtonHtml, algoMenuHtml, exportMenuHtml, shortcutsMenuHtml, barKeyAction } from "../ui/step-bar.js";
import { mountBarMenus } from "../ui/menu.js";
import { storage } from "../ui/storage.js";
import { parse } from "../core/parser.js";
import { solveDLL } from "../core/dll.js";
import { solveDP } from "../core/dp.js";
import { ALGORITHMS, decodeShare, encodeShare, shareFormula } from "../core/share.js";
import { mountClauseSetView } from "../ui/clause-set-view.js";
import { mountPseudocodeView } from "../ui/pseudocode-view.js";
import { mountTreeView, treeLegendHtml } from "../ui/tree-view.js";
import { mountProofView } from "../ui/proof-view.js";
import { mountTimeline, isTypingTarget } from "../ui/timeline.js";
import { mountDpView } from "../ui/dp-view.js";
import { mountStepCard, renderValuation, stepAnnouncementHtml } from "../ui/step-card.js";
import { valuationAt } from "../core/trace.js";
import { mountCompareView } from "../ui/compare-view.js";
import { stepNumberAt } from "../core/compare.js";
import { playStep } from "../ui/step-motion.js";
import { together } from "../ui/motion.js";
import { t, onLangChange } from "../ui/i18n.js";

mountLayout();

// Tempo sem teclar antes de voltar a correr o DLL com a fórmula nova.
const EDIT_DEBOUNCE_MS = 500;
// Tabs do mobile (a partir do tablet as três zonas estão sempre visíveis) e vistas do conjunto.
const TABS = ["set", "tree", "algo"];
const SET_VIEWS = ["set", "proof"];
// Mobile = abaixo do breakpoint tablet do DESIGN.md; é aí que as zonas viram tabs.
const mobileQuery = matchMedia("(max-width: 767.98px)");

// Sem fórmula no link (ex.: vindo do menu de navegação), volta a última vista nesta página, no mesmo
// passo. Um link com fórmula, semente ou menu manda sempre.
const fromLink = decodeShare(location.search);
const restore = !fromLink.formula && !fromLink.params.seed && !fromLink.params.menu;
const { formula, algorithm, params } = restore ? decodeShare(storage.getLastQuery("step") ?? location.search) : fromLink;

// Estado atual: o conjunto (normalizado pelo parser), o seu trace, o resultado do DLL e, se veio do
// gerador, os parâmetros da semente (gen) que acompanham o link.
let current = null;
// ?view= guarda as duas escolhas numa só: set|proof (tab Conjunto com a vista animada ou de prova),
// tree ou algo (as outras tabs).
let tab = TABS.includes(params.view) ? params.view : "set";
let setView = SET_VIEWS.includes(params.view) ? params.view : "set";
// Algoritmo mostrado: "dll" (com árvore) ou "dp" (o original de 1960, por resolução).
let algo = algorithm;
let editTimer = null;
// Com "Editar" aberto: o que havia antes de editar, para o "Cancelar" repor ({ clauses, gen, step, text }).
let editing = null;

const appEl = document.getElementById("step-app");
const tabsEl = document.getElementById("step-tabs");
const layoutEl = document.getElementById("step-layout");
const zoneEls = document.querySelectorAll(".step-zone");
const timelineEl = document.getElementById("timeline");
// Região role="status" fixa: anuncia aos leitores de ecrã o passo atual e o que aconteceu nele.
const statusEl = document.getElementById("step-status");

/** Query string do estado atual; o passo 0 e a vista "set" são o padrão e não entram no link. */
function currentQuery(index = timeline.index) {
  const view = algo === "dp" ? "set" : tab === "set" ? setView : tab;
  return encodeShare(current.clauses, {
    algorithm: algo,
    params: { ...current.gen, step: index > 0 ? index : null, view: view === "set" ? null : view },
  });
}

function updateUrl() {
  if (!current) return;
  const query = currentQuery();
  history.replaceState(null, "", `${location.pathname}?${query}`);
  storage.setLastQuery("step", query);
}

/** Copia o link do estado atual (fórmula, passo e vista), para abrir outro browser no mesmo ponto. */
function copyLink() {
  copyShareLink(shareUrl(currentQuery()));
}

// --- Vistas do passo ---

const clauseSetEl = document.getElementById("clause-set");
const clauseSet = mountClauseSetView(clauseSetEl);
const proofEl = document.getElementById("proof");
const proof = mountProofView(proofEl, { onSelect: (index) => timeline.go(index) });
// Clicar num nó da árvore salta para o passo em que esse nó foi criado.
const tree = mountTreeView(document.getElementById("tree"), { onSelect: (index) => timeline.go(index) });
const pseudocode = mountPseudocodeView(document.getElementById("pseudocode"), { explanation: false });
const dpView = mountDpView(document.getElementById("dp-view"), { onSelect: (index) => timeline.go(index), compact: true });
const stepCard = mountStepCard(document.getElementById("step-card"));
const valuationEl = document.getElementById("valuation");
const resultEl = document.getElementById("result");
// Comparação DLL × DP do mesmo conjunto (os dois algoritmos, seja qual for o que está a ser visto).
const compare = mountCompareView(document.getElementById("compare"));
const resultCard = mountResultCard(resultEl, { actions: false, announce: false });

// Barra do conjunto: resumo, Editar, o menu do algoritmo, o menu Exportar (link do passo atual e resolução completa
// do algoritmo escolhido, em LaTeX ou PDF pela impressão) e os atalhos.
const algoEl = document.getElementById("step-algo");
const dpViewEl = document.getElementById("dp-view");
function drawAlgoBar() {
  algoEl.innerHTML = `<div class="step-bar__summary"></div><div class="step-bar__actions">${editButtonHtml()}` +
    `${algoMenuHtml(ALGORITHMS, algo)}${exportMenuHtml({ canShare: "share" in navigator })}${shortcutsMenuHtml()}</div>`;
  drawSummary();
  // No DP não há árvore nem tabs: a vista do DP ocupa o lugar das três zonas do DLL.
  layoutEl.dataset.algo = algo;
  tabsEl.hidden = algo === "dp";
  zoneEls.forEach((zone) => { zone.hidden = algo === "dp"; });
  dpViewEl.hidden = algo !== "dp";
}
function drawSummary() {
  if (current) algoEl.querySelector(".step-bar__summary").innerHTML = setSummaryHtml(current.clauses);
}
function runBarAction(action) {
  if (action === "edit") startEdit();
  else if (action === "copy-link") copyLink();
  else if (action === "share") navigator.share({ url: shareUrl(currentQuery()) }).catch(() => {});
  else handleLatexAction(action, current.trace, { algorithm: algo });
}
mountBarMenus(algoEl);
algoEl.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action && current) {
    runBarAction(action.dataset.action);
    return;
  }
  const button = event.target.closest("[data-algo]");
  if (!button) return;
  closeMenu(button.closest("details"), { focus: true });
  if (button.dataset.algo === algo) return;
  algo = button.dataset.algo;
  drawAlgoBar();
  algoEl.querySelector(".step-menu--algo > summary").focus();
  // O mesmo conjunto com o outro algoritmo, a começar do passo 0 (os traces não têm os mesmos passos).
  if (current) load(current.clauses, 0, current.gen);
});

// Atalhos da barra: L, P e ? (sem teclado físico, o botão dos atalhos nem aparece).
document.addEventListener("keydown", (event) => {
  if (!current || editing || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
  const action = barKeyAction(event.key);
  if (!action || window.matchMedia(MOBILE_QUERY).matches) return;
  event.preventDefault();
  if (action !== "shortcuts") return runBarAction(action);
  const menu = algoEl.querySelector(".step-menu--keys");
  if (menu.open) closeMenu(menu, { focus: true });
  else openMenu(menu);
});

// Alterna entre a vista animada do conjunto e a vista de prova (lista numerada de conjuntos).
const viewsEl = document.getElementById("step-views");
function drawViewSwitch() {
  const button = (id, key) =>
    `<button type="button" data-view="${id}" aria-pressed="${setView === id}">${escapeHtml(t(key))}</button>`;
  viewsEl.innerHTML = `<div class="seg sm" role="group" aria-label="${escapeHtml(t("stepView.label"))}">` +
    button("set", "stepView.animated") + button("proof", "stepView.proof") + `</div>`;
  clauseSetEl.hidden = setView !== "set";
  valuationEl.hidden = setView !== "set";
  proofEl.hidden = setView !== "proof";
}
viewsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button || button.dataset.view === setView) return;
  setView = button.dataset.view;
  drawViewSwitch();
  viewsEl.querySelector(`[data-view="${setView}"]`).focus();
  timeline.settle();
  show(timeline.index);
  updateUrl();
});

// Tabs Conjunto | Árvore | Algoritmo (só visíveis no mobile; o CSS esconde as zonas das outras tabs).
// As setas ←/→ vêm do segmented.js, que clica na tab seguinte.
function drawTabs() {
  const button = (id) =>
    `<button type="button" role="tab" id="tab-${id}" aria-controls="zone-${id}" ` +
    `aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}" data-tab="${id}">${escapeHtml(t(`stepTabs.${id}`))}</button>`;
  tabsEl.innerHTML = `<div class="seg" role="tablist" aria-label="${escapeHtml(t("stepTabs.label"))}">` +
    TABS.map(button).join("") + `</div>`;
  layoutEl.dataset.tab = tab;
}
function selectTab(id) {
  if (id === tab) return;
  tab = id;
  drawTabs();
  tabsEl.querySelector(`[data-tab="${tab}"]`).focus();
  // A árvore escondida tinha largura 0: ao aparecer volta a ajustar-se à vista.
  if (tab === "tree" && current) tree.fit();
  updateUrl();
}
tabsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (button) selectTab(button.dataset.tab);
});
// Nos limites do layout, a árvore muda de largura: ajustar de novo.
for (const query of [mobileQuery, matchMedia("(min-width: 1200px)")]) {
  query.addEventListener("change", () => {
    if (current && algo === "dll") tree.fit();
  });
}

onLangChange(() => {
  drawAlgoBar();
  drawViewSwitch();
  drawTabs();
  drawValuation();
});
drawAlgoBar();
drawViewSwitch();
drawTabs();

// Imprimir (botão "Exportar PDF" ou Ctrl+P) mostra a resolução completa, seja qual for o passo atual.
// No DLL a folha tem a prova e a árvore; no DP, a sequência de conjuntos com os pares resolvidos.
mountPrintSheet(() => current?.trace ?? null, () => algo);

function drawValuation() {
  if (current && algo === "dll") valuationEl.innerHTML = renderValuation(valuationAt(current.trace, timeline.index));
}

/**
 * Mostra o passo `index` em todas as vistas; o cartão de resultado só aparece no último passo.
 * Com `animate`, as vistas ficam logo no estado final e devolve a sequência que mostra a mudança
 * por cima delas (js/ui/step-motion.js); quem a gere é a timeline. O anúncio sai antes dela.
 */
function show(index, { animate = false, speed = 1 } = {}) {
  const { trace } = current;
  resultEl.hidden = index < trace.length - 1;
  stepCard.show(trace, index, algo);
  // A região de estado é um nó fixo fora do #step-app: é ela que anuncia o passo aos leitores de ecrã.
  statusEl.innerHTML = stepAnnouncementHtml(trace, index, algo);
  compare.show(current.clauses, current.key, {
    current: algo,
    marker: { algorithm: algo, step: stepNumberAt(trace, algo, index) },
  });
  if (algo === "dp") {
    return dpView.show(trace, index, { animate });
  }
  clauseSet.show(trace, index);
  drawValuation();
  proof.show(trace, index);
  tree.show(trace, index, { animate });
  const glide = pseudocode.show(trace, index, { animate });
  if (!animate) return null;
  return together(glide, playStep(trace, index, { clauseRoot: clauseSetEl, onSettle: clauseSet.settle, valuationRoot: valuationEl, tree }, { speed }));
}

const timeline = mountTimeline(timelineEl, {
  legend: treeLegendHtml,
  onChange(index, options) {
    updateUrl();
    return show(index, options);
  },
});

/**
 * Corre o algoritmo escolhido (DLL ou DP) para `clauses` e mostra o passo `step` (0 = conjunto inicial).
 * `gen` = parâmetros do gerador se o conjunto foi gerado (vão para o link), senão null.
 */
function load(clauses, step = 0, gen = null) {
  clearTimeout(editTimer);
  const { trace, result } = algo === "dp" ? solveDP(clauses) : solveDLL(clauses);
  current = { clauses, trace, result, key: shareFormula(clauses), gen };
  appEl.hidden = false;
  timelineEl.hidden = false;
  drawSummary();
  drawEntry();
  document.body.classList.add("has-timeline");
  emptyState.show(false);
  resultCard.show(clauses, result, { algorithm: algo });
  timeline.setTrace(trace, step);
  show(timeline.index);
  updateUrl();
}

// --- Entrada da fórmula ---

const titleEl = document.getElementById("main").querySelector("h1");
const introEl = document.getElementById("step-intro");
const cancelEl = document.getElementById("step-cancel");
const editorEl = document.getElementById("step-editor");
let closeEditSheet = null; // no mobile, o editor abre numa folha

/**
 * Sem conjunto, o título e o editor. Com conjunto, a barra; o <h1> fica para os leitores de ecrã.
 * Ao editar no desktop, o cartão do editor toma o lugar da barra e o palco fica esbatido e inerte;
 * no mobile, a barra fica por baixo da folha, para o foco voltar ao Editar.
 */
function drawEntry() {
  const hasSet = Boolean(current);
  const card = Boolean(editing && !editing.sheet);
  titleEl.classList.toggle("sr-only", hasSet);
  introEl.hidden = hasSet;
  editorEl.hidden = hasSet && !editing;
  editorEl.classList.toggle("is-card", card);
  algoEl.hidden = !hasSet || card;
  appEl.inert = card;
  cancelEl.hidden = !card;
}

const focusEdit = () => algoEl.querySelector('[data-action="edit"]').focus();

function startEdit() {
  const sheet = window.matchMedia(MOBILE_QUERY).matches;
  editing = { clauses: current.clauses, gen: current.gen, step: timeline.index, text: input.getValue(), sheet };
  drawEntry();
  if (sheet) {
    closeEditSheet = openSheet(editorEl, {
      title: t("stepBar.editTitle"),
      onClose() {
        closeEditSheet = null;
        if (editing) cancelEdit();
      },
    });
  }
  input.focus();
}

// O DLL pode já ter corrido com a fórmula a meio da edição: repõe o conjunto e o passo de antes.
function cancelEdit() {
  const { clauses, gen, step: before, text } = editing;
  editing = null;
  closeEditSheet?.();
  if (current.key !== shareFormula(clauses)) load(clauses, before, gen);
  input.setValue(text);
  drawEntry();
  focusEdit();
}
cancelEl.addEventListener("click", cancelEdit);
// Na folha, o Esc é tratado pelo <dialog>; num menu do editor, fica no menu.
editorEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editing && !editing.sheet) cancelEdit();
});

// Escolher um exemplo (estado vazio ou menu) põe-no no input e mostra logo o passo 0.
function selectFormula(text) {
  input.setValue(text);
  input.submit();
}

const emptyState = mountEmptyState(document.getElementById("empty-state"), { onSelect: selectFormula });

const input = mountFormulaInput(document.getElementById("formula-input"), {
  value: formula ?? "",
  rows: 2,
  submitKey: "stepBar.solve",
  onChange(analysis) {
    // Recalcular ao editar: só com uma fórmula válida e diferente da atual, depois de uma pausa.
    // Sem "Editar" aberto não: a primeira fórmula escolhe-se com Resolver, senão a caixa fechava a meio.
    clearTimeout(editTimer);
    if (!editing || analysis.state !== "ok") return;
    const { clauses } = analysis.result;
    if (current && shareFormula(clauses) === current.key) return;
    editTimer = setTimeout(() => load(clauses), EDIT_DEBOUNCE_MS);
  },
  onSubmit(result, text) {
    storage.addToHistory(text);
    editing = null;
    closeEditSheet?.();
    load(result.clauses);
    focusEdit();
  },
});

mountExamplesMenu(document.getElementById("examples-menu"), {
  open: params.menu === "examples",
  onSelect: selectFormula,
});

// Gerar um conjunto põe-no no input (notação compacta) e mostra logo o passo `step`.
function useGenerated(out, step = 0) {
  const text = shareFormula(out.clauses);
  input.setValue(text);
  storage.addToHistory(text);
  editing = null;
  closeEditSheet?.();
  load(out.clauses, step, out.params);
}

const fromUrl = generatorFromParams(params);
mountGenerator(document.getElementById("generator"), {
  initial: fromUrl,
  open: params.menu === "generator",
  onGenerate(out) {
    useGenerated(out);
    focusEdit();
  },
});

// Fórmula vinda da URL: abre logo no passo pedido (?step=N). Sem fórmula mas com ?seed=…, gera de
// novo o mesmo conjunto. Sem nada: estado vazio com exemplos. Uma fórmula inválida fica no input
// com o erro assinalado.
const step = Number.parseInt(params.step, 10);
const parsed = formula ? parse(formula) : null;
const regenerated = !formula && fromUrl ? runGenerator(fromUrl) : null;
if (parsed?.ok) load(parsed.clauses, step, fromUrl ? generatorParams(fromUrl) : null);
else if (regenerated?.found) useGenerated(regenerated, step);
else emptyState.show(!formula);
