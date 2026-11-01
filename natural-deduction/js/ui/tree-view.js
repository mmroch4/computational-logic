// Vista só de leitura da árvore de Gentzen, com scroll próprio. Selecionar uma fórmula diz de que linha
// da prova ela veio, aqui e, por `onSelect`, no editor. A conversão está em core/tree.js.
//
// As funções exportadas à parte são puras (testáveis em node); só mountTreeView() mexe no DOM.
import { format } from "../core/formula.js";
import { ruleLabel } from "../core/rules.js";
import { proofTree } from "../core/tree.js";
import { formulaHtml, justificationText, spokenProse } from "./fitch-view.js";
import { LOCALES, getLang, onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";

const labelsHtml = (labels) => (labels.length > 0 ? `<sup>${labels.join(",")}</sup>` : "");

/** A descrição de uma linha da prova, igual para o leitor de ecrã e para a legenda. */
export function lineCaption(proof, line) {
  const source = proof.lines[line - 1];
  return t("tree.line", { line, formula: format(source.formula), why: justificationText(source) });
}

function formulaButton(node, proof, inner) {
  return `<button type="button" class="gt__formula" data-tree-line="${node.line}" tabindex="-1" `
    + `aria-label="${escapeHtml(spokenProse(lineCaption(proof, node.line)))}">${inner}</button>`;
}

/** A que distância anda cada tecla entre as fórmulas; `Home` e `End` vão aos extremos. */
const TREE_KEYS = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/** O índice para onde a tecla `key` leva, em `count` fórmulas, ou null se não for uma tecla da árvore. */
export function treeKeyTarget(key, index, count) {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (!(key in TREE_KEYS)) return null;
  return Math.min(count - 1, Math.max(0, index + TREE_KEYS[key]));
}

function nodeHtml(node, proof, labels) {
  if (node.kind === "assumption") {
    const text = formulaHtml(node.formula);
    const inner = node.label === null ? text : `[${text}]${labelsHtml([node.label])}`;
    return `<div class="gt gt--leaf">${formulaButton(node, proof, `<span>${inner}</span>`)}</div>`;
  }
  const above = node.premises.map((premise) => nodeHtml(premise, proof, labels)).join("");
  const rule = `${escapeHtml(ruleLabel(node.rule, labels))}${labelsHtml(node.discharges)}`;
  return `<div class="gt"><div class="gt__premises">${above}</div>`
    + `<div class="gt__bar"></div><span class="gt__rule">${rule}</span>`
    + `${formulaButton(node, proof, `<span>${formulaHtml(node.formula)}</span>`)}</div>`;
}

/** A árvore, com tabindex para quem usa só o teclado também a conseguir deslocar. */
export function treeHtml(tree, proof) {
  return `<div class="gentzen" tabindex="0" role="group" aria-label="${escapeHtml(t("tree.label"))}">`
    + `<div class="gentzen__inner">${nodeHtml(tree, proof, LOCALES[getLang()].rules.labels)}</div></div>`;
}

/**
 * O interior do painel, para o resultado `shown` de `proofTree`. Com `status: "note"`, mostra só a chave
 * `key`. `hint` é a chave da nota por cima da árvore.
 */
export function treeBodyHtml(shown, proof, hint = "tree.hint") {
  if (shown.status === "note") return `<p class="tree-panel__note">${escapeHtml(t(shown.key))}</p>`;
  if (shown.status === "unfinished") return `<p class="tree-panel__note">${escapeHtml(t("tree.unfinished"))}</p>`;
  if (shown.status === "tooLarge") return msgHtml("warn", escapeHtml(t("tree.tooLarge", { limit: shown.limit })));
  return `<p class="tree-panel__note">${escapeHtml(t(hint))}</p>${treeHtml(shown.tree, proof)}`
    + '<p class="tree-panel__caption"></p>';
}

/**
 * Monta o painel em `container`, que fica vazio até `update()`: só há árvore com uma prova aberta.
 * `source` é o editor: { getProof(), getGoal(), getRules() }; quem quiser outra árvore que não a da prova
 * acabada dá `getShown()`, que devolve o `shown`, e já não precisa de `getGoal` nem de `getRules`.
 * `onSelect(line)` recebe a linha da fórmula selecionada, ou null quando a árvore muda.
 * Com `collapsible`, o painel é uma secção que nasce fechada e fica como estava a cada redesenho.
 */
export function mountTreeView(container, { source, onSelect, hint = "tree.hint", collapsible = false }) {
  let shown = null;
  let proof = null;

  const formulas = () => Array.from(container.querySelectorAll("[data-tree-line]"));

  function select(button) {
    const line = Number(button.dataset.treeLine);
    container.querySelectorAll("[data-tree-line]").forEach((item) => {
      item.toggleAttribute("data-selected", item.dataset.treeLine === button.dataset.treeLine);
    });
    container.querySelector(".tree-panel__caption").textContent = lineCaption(proof, line);
    onSelect(line);
  }

  function paint() {
    const left = container.querySelector(".gentzen")?.scrollLeft ?? 0;
    const title = `<h2 class="tree-panel__title">${escapeHtml(t("tree.title"))}</h2>`;
    const body = treeBodyHtml(shown, proof, hint);
    const open = container.querySelector("details")?.open ? " open" : "";
    container.innerHTML = collapsible
      ? `<details class="tree-panel__section"${open}><summary class="tree-panel__toggle">${title}</summary>`
        + `<div class="tree-panel__body">${body}</div></details>`
      : title + body;
    const scroller = container.querySelector(".gentzen");
    if (scroller) scroller.scrollLeft = left;
    // Uma árvore tem muitas fórmulas: o Tab para só numa, a conclusão, e as setas andam entre elas.
    formulas().at(-1)?.setAttribute("tabindex", "0");
    onSelect(null);
  }

  const onPoint = ({ target }) => {
    const button = target.closest("[data-tree-line]");
    if (button) select(button);
  };

  function onFocusin(event) {
    const button = event.target.closest("[data-tree-line]");
    if (!button) return;
    formulas().forEach((item) => item.setAttribute("tabindex", item === button ? "0" : "-1"));
    onPoint(event);
  }

  function onKeydown(event) {
    const button = event.target.closest("[data-tree-line]");
    if (!button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const items = formulas();
    const next = treeKeyTarget(event.key, items.indexOf(button), items.length);
    if (next === null) return;
    event.preventDefault();
    items[next].focus();
  }

  container.classList.add("tree-panel");
  container.addEventListener("click", onPoint);
  container.addEventListener("focusin", onFocusin);
  container.addEventListener("keydown", onKeydown);
  container.addEventListener("mouseover", onPoint);
  onLangChange(() => {
    if (shown) paint();
  });

  return {
    update() {
      proof = source.getProof();
      shown = source.getShown ? source.getShown() : proofTree(proof, source.getGoal(), source.getRules());
      paint();
    },
  };
}
