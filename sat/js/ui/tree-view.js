// Árvore de decisão do Passo a passo, desenhada em SVG à mão:
//   nó     = uma chamada DLL(S) (a raiz é o conjunto de entrada, os outros são S ∪ {l});
//   aresta = a ramificação, com o literal l numa pílula a meio;
//   propagação = um nó por literal propagado, ligado por uma aresta tracejada com o literal ao lado
//                (a cadeia de propagações fica por baixo do nó da chamada, e as ramificações saem dela);
//   folha  = ✗ quando S contém F, ✓ quando S fica vazio.
// O nó do passo atual tem um anel; os nós que ainda não foram visitados ficam esbatidos.
// Clicar num nó (ou Enter/espaço com o foco nele) salta para o passo em que esse nó foi criado.
// Teclado: só o nó atual está na ordem do Tab (tabindex roving); as setas andam entre os nós
// (↑ pai, ↓ primeiro filho, ←/→ vizinhos no mesmo nível), Home vai à raiz e End ao nó atual.
// Zoom: botões +/−/centrar no canto, Ctrl (ou ⌘) + roda e pinça com dois dedos; arrastar move a vista.
//
// As posições vêm do trace completo, por isso a árvore não "salta" ao avançar os passos.
// treeModel() e renderTree() são puras (testáveis em node); só mountTreeView() mexe no DOM.
import { buildTree } from "../core/trace.js";
import { formatSet } from "../core/clauses.js";
import { formatLiteral } from "../core/literals.js";
import { t, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { ruleOf } from "./events.js";
import { mountMenus } from "./menu.js";

/** Medidas do desenho (px no sistema de coordenadas do SVG). */
export const TREE_SIZES = {
  nodeWidth: 140,
  nodeHeight: 44,
  gapX: 20, // entre folhas vizinhas
  gapY: 64, // entre níveis (onde fica a pílula do literal)
  padding: 20,
};

/** Máximo de caracteres do conjunto dentro do nó (o resto vai para o title). */
const NODE_TEXT_MAX = 16;

/** Limites do zoom (1 = tamanho real) e o fator de cada clique em +/−. */
export const ZOOM = { min: 0.4, max: 2, factor: 1.25 };

/** Mantém o zoom dentro dos limites (arredondado a 3 casas para não acumular erros). */
export function clampZoom(zoom) {
  return Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, zoom)) * 1000) / 1000;
}

/** Zoom depois de um clique em + (direction = 1) ou − (direction = -1). */
export function zoomStep(zoom, direction) {
  return clampZoom(zoom * ZOOM.factor ** direction);
}

/** Zoom depois de um movimento da roda (deltaY > 0 = afastar), proporcional ao movimento. */
export function wheelZoom(zoom, deltaY) {
  return clampZoom(zoom * Math.exp(-deltaY * 0.002));
}

/** Zoom com que a árvore (width × height) cabe na vista; nunca acima do tamanho real. */
export function fitZoom(width, height, viewWidth, viewHeight) {
  if (!width || !height) return 1;
  return clampZoom(Math.min(1, viewWidth / width, viewHeight / height));
}

/**
 * Máximo de caracteres do conjunto no title e no aria-label do nó. Nos exemplos o
 * conjunto cabe sempre inteiro; com centenas de cláusulas o rótulo seria ilegível e cada passo
 * redesenhava megabytes de texto (M8.5).
 */
export const NODE_TITLE_MAX = 240;

// Cada cláusula formatada ocupa pelo menos 3 caracteres ("p, "), por isso com mais do que
// NODE_TITLE_MAX / 3 cláusulas o texto passa sempre do máximo e o resto nunca se chega a ver.
const SET_TEXT_CLAUSES = NODE_TITLE_MAX / 3 + 1;

// Texto de cada conjunto já formatado (só o começo, nos conjuntos grandes). Os conjuntos do trace
// nunca mudam e a árvore é redesenhada a cada passo, por isso cada conjunto só é formatado uma vez.
// Com as propagações há um nó por literal propagado: numa fórmula grande são milhares de conjuntos.
const setTextCache = new WeakMap();
function setText(S) {
  let text = setTextCache.get(S);
  if (text === undefined) {
    text = S.length > SET_TEXT_CLAUSES ? formatSet(S.slice(0, SET_TEXT_CLAUSES)) : formatSet(S);
    setTextCache.set(S, text);
  }
  return text;
}

/** Corta um texto longo com reticências. */
export function truncate(text, max = NODE_TEXT_MAX) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Nó em que está o passo `index`: start → raiz; unit/branch/conflict/sat → o nó do evento;
 * backtrack → o nó para onde se volta; limit/result → o nó do último evento com nó.
 */
export function currentNodeOf(trace, index) {
  for (let i = Math.min(index, trace.length - 1); i >= 0; i--) {
    const e = trace[i];
    if (e.type === "backtrack") return e.to;
    if (e.node !== undefined) return e.node;
  }
  return 0;
}

/**
 * Posições dos nós: as folhas ficam lado a lado pela ordem da pesquisa (ramo l antes de l̃) e
 * cada nó interno fica centrado por cima dos filhos. Devolve { pos: [{ x, y }], width, height }
 * com (x, y) = canto superior esquerdo de cada nó.
 */
export function layoutTree(tree, sizes = TREE_SIZES) {
  const { nodeWidth, nodeHeight, gapX, gapY, padding } = sizes;
  const pos = [];
  let nextLeaf = 0;
  let maxDepth = 0;

  function place(id) {
    const node = tree.nodes[id];
    maxDepth = Math.max(maxDepth, node.depth);
    let column;
    if (node.children.length === 0) {
      column = nextLeaf++;
    } else {
      const columns = node.children.map(place);
      column = (columns[0] + columns[columns.length - 1]) / 2;
    }
    pos[id] = {
      x: padding + column * (nodeWidth + gapX),
      y: padding + node.depth * (nodeHeight + gapY),
    };
    return column;
  }

  if (!tree.root) return { pos, width: 0, height: 0 };
  place(0);
  return {
    pos,
    width: 2 * padding + nextLeaf * nodeWidth + (nextLeaf - 1) * gapX,
    height: 2 * padding + (maxDepth + 1) * nodeHeight + maxDepth * gapY,
  };
}

/**
 * A árvore desenhada: cada chamada DLL(S) do buildTree vira uma cadeia
 *   nó da chamada (S ∪ {l}) ┄ l₁ ┄ propagação ┄ l₂ ┄ propagação …
 * com um nó por literal propagado, pela ordem da propagação; as ramificações saem do último nó da
 * cadeia. Devolve { root, nodes, tails } no formato do layoutTree, com nodes[id] = {
 *   id, parent, children, depth, literal,
 *   call,   // id da chamada no buildTree (o "nó n" dos textos)
 *   unit,   // índice do literal em call.units; -1 no nó da própria chamada
 * } e tails[call] = id do último nó da cadeia dessa chamada.
 */
function expandTree(tree) {
  const nodes = [];
  const tails = [];

  function add(call, unit, literal, parent, depth) {
    const id = nodes.length;
    nodes.push({ id, parent, children: [], depth, literal, call, unit });
    if (parent !== null) nodes[parent].children.push(id);
    return id;
  }

  function visit(callId, parent, depth) {
    const call = tree.nodes[callId];
    let id = add(callId, -1, call.literal, parent, depth);
    call.units.forEach((literal, j) => {
      id = add(callId, j, literal, id, ++depth);
    });
    tails[callId] = id;
    for (const child of call.children) visit(child, id, depth + 1);
  }

  if (tree.root) visit(0, null, 0);
  return { root: nodes[0] ?? null, nodes, tails };
}

/**
 * O que a árvore mostra no passo `index`:
 *   { width, height, current, rule, nodes: [{ id, call, kind, x, y, literal, S, status, visited, faded, current, step, leaf }],
 *     edges: [{ from, to, kind, literal, visited, faded, path, x1, y1, x2, y2 }] }
 * kind = "call" (uma chamada DLL(S), a seguir a uma ramificação) ou "unit" (uma propagação);
 * as arestas têm o kind do nó para onde vão. id = posição no desenho; call = o "nó n" da chamada.
 * status ∈ "open" | "sat" | "conflict" (o que se sabe da chamada até este passo; "future" se o nó
 * ainda não foi visitado). step = índice do evento que cria o nó (para onde salta um clique).
 * faded = o nó ou a aresta está num ramo que acabou em F (sem saída, enquanto a raiz ainda está em
 * aberto: quando tudo falhou, a árvore fica toda com a cor do conflito). path = a aresta está no
 * caminho até «satisfazível». rule = o evento do passo, que dá a cor ao anel do nó atual.
 */
export function treeModel(trace, index, sizes = TREE_SIZES) {
  const full = buildTree(trace);
  if (!full.root) return { width: 0, height: 0, current: null, rule: null, nodes: [], edges: [] };
  const shown = expandTree(full);
  const upTo = buildTree(trace, index);
  const { pos, width, height } = layoutTree(shown, sizes);

  const nodes = shown.nodes.map((node) => {
    const call = full.nodes[node.call];
    const seen = upTo.nodes[node.call];
    const isCall = node.unit < 0;
    // Um nó de propagação só está visitado depois de o seu literal ter sido propagado.
    const visited = Boolean(seen) && (isCall || seen.units.length > node.unit);
    return {
      id: node.id,
      call: node.call,
      kind: isCall ? "call" : "unit",
      x: pos[node.id].x,
      y: pos[node.id].y,
      literal: node.literal,
      // Nó da chamada: S ∪ {l} (a raiz é o conjunto de entrada); propagação: o conjunto depois dela.
      S: isCall ? call.S : call.unitSets[node.unit],
      status: visited ? seen.status : "future",
      visited,
      faded: false,
      current: false,
      step: isCall ? (call.events[0] ?? 0) : call.unitEvents[node.unit],
      leaf: node.children.length === 0,
    };
  });

  // Nó atual: o último nó já visitado da cadeia da chamada em que está o passo.
  let current = shown.tails[currentNodeOf(trace, index)];
  while (!nodes[current].visited && shown.nodes[current].unit >= 0) current = shown.nodes[current].parent;
  nodes[current].current = true;

  const allFailed = nodes[0].status === "conflict";
  for (const node of nodes) node.faded = node.status === "conflict" && !allFailed;

  const edges = shown.nodes
    .filter((node) => node.parent !== null)
    .map((node) => {
      const from = pos[node.parent];
      const to = pos[node.id];
      return {
        from: node.parent,
        to: node.id,
        kind: nodes[node.id].kind,
        literal: node.literal,
        visited: nodes[node.id].visited,
        faded: nodes[node.id].faded,
        path: nodes[node.id].status === "sat",
        x1: from.x + sizes.nodeWidth / 2,
        y1: from.y + sizes.nodeHeight,
        x2: to.x + sizes.nodeWidth / 2,
        y2: to.y,
      };
    });

  return { width, height, current, rule: ruleOf(trace[index]), nodes, edges };
}

/**
 * O que mudou de um modelo para o seguinte, em índices de `nodes` e de `edges`:
 *   { entered: [nó], enteredEdges: [aresta], faded: [nó], fadedEdges: [aresta], pathEdges: [aresta] }.
 */
export function treeChanges(before, after) {
  const newly = (list, was, field) => list.flatMap((item, i) => (item[field] && !was[i][field] ? [i] : []));
  return {
    entered: newly(after.nodes, before.nodes, "visited"),
    enteredEdges: newly(after.edges, before.edges, "visited"),
    faded: newly(after.nodes, before.nodes, "faded"),
    fadedEdges: newly(after.edges, before.edges, "faded"),
    pathEdges: newly(after.edges, before.edges, "path"),
  };
}

/**
 * Para onde vai o foco quando o aluno carrega em `key` com o foco no nó `id`:
 *   ↑ pai · ↓ primeiro filho (o ramo l, à esquerda) · ←/→ nó anterior/seguinte no mesmo nível ·
 *   Home raiz · End nó atual. Devolve o id do nó, ou null se não houver para onde ir.
 */
export function treeNeighbor(model, id, key) {
  const node = model.nodes.find((n) => n.id === id);
  if (!node) return null;
  const byX = (a, b) => a.x - b.x;
  switch (key) {
    case "ArrowUp":
      return model.edges.find((e) => e.to === id)?.from ?? null;
    case "ArrowDown": {
      const children = model.edges.filter((e) => e.from === id).map((e) => model.nodes.find((n) => n.id === e.to));
      return children.sort(byX)[0]?.id ?? null;
    }
    case "ArrowLeft":
    case "ArrowRight": {
      const level = model.nodes.filter((n) => n.y === node.y).sort(byX);
      const next = level[level.indexOf(node) + (key === "ArrowRight" ? 1 : -1)];
      return next?.id ?? null;
    }
    case "Home":
      return model.nodes[0]?.id ?? null;
    case "End":
      return model.current;
    default:
      return null;
  }
}

/** Texto do estado do nó (para o leitor de ecrã e para o title). */
function statusText(node) {
  return t(`tree.status.${node.status}`);
}

/** Nome curto escrito no nó: "raiz", "nó n" ou "propagação". */
function nodeName(node) {
  return node.kind === "unit" ? t("tree.unitNode") : t("tree.node", { id: node.call });
}

/**
 * Rótulo completo do nó, com o conjunto cortado em NODE_TITLE_MAX. Vai só no <title> do nó, que é
 * também o nome acessível de um <g role="button"> (SVG-AAM); repeti-lo num aria-label duplicava o
 * texto de milhares de nós numa fórmula grande.
 */
function nodeTitle(node) {
  const set = truncate(setText(node.S), NODE_TITLE_MAX);
  return node.kind === "unit"
    ? t("tree.unitLabel", { id: node.call, literal: formatLiteral(node.literal), set, status: statusText(node) })
    : t("tree.nodeLabel", { id: node.call, set, status: statusText(node) });
}

// Ícone das folhas, desenhado só quando já se sabe o resultado (nunca só cor: há também o texto).
const LEAF_ICON = { sat: "✓", conflict: "✗" };

// Aresta de ramificação: linha cheia com o literal l numa pílula a meio.
// Aresta de propagação: linha tracejada com o literal ao lado, sem pílula.
function edgeSvg(edge) {
  const midX = (edge.x1 + edge.x2) / 2;
  const midY = (edge.y1 + edge.y2) / 2;
  const label = formatLiteral(edge.literal);
  const cls = ["tree-edge", !edge.visited && "tree-edge--future", edge.faded && "tree-edge--faded", edge.path && "tree-edge--path"]
    .filter(Boolean).join(" ");
  if (edge.kind === "unit") {
    return `<g class="${cls} tree-edge--unit">` +
      `<line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}"/>` +
      `<text class="tree-edge__unit" x="${midX + 8}" y="${midY}">${escapeHtml(label)}</text></g>`;
  }
  const pillWidth = Math.max(32, 12 + label.length * 8);
  return `<g class="${cls}">` +
    `<line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}"/>` +
    `<rect class="tree-edge__pill" x="${midX - pillWidth / 2}" y="${midY - 11}" width="${pillWidth}" height="22" rx="11"/>` +
    `<text class="tree-edge__label" x="${midX}" y="${midY}">${escapeHtml(label)}</text></g>`;
}

function nodeSvg(node, sizes) {
  const { nodeWidth: w, nodeHeight: h } = sizes;
  const set = setText(node.S);
  const title = nodeTitle(node);
  const classes = ["tree-node", `tree-node--${node.status}`];
  if (node.kind === "unit") classes.push("tree-node--unit");
  if (node.current) classes.push("tree-node--current");
  if (node.faded) classes.push("tree-node--faded");
  const icon = node.leaf && LEAF_ICON[node.status]
    ? `<text class="tree-node__icon" x="${w - 12}" y="16">${LEAF_ICON[node.status]}</text>`
    : "";
  return `<g class="${classes.join(" ")}" transform="translate(${node.x} ${node.y})" data-node="${node.id}" ` +
    `data-step="${node.step}" role="button" tabindex="${node.current ? 0 : -1}"` +
    `${node.current ? ' aria-current="step"' : ""}>` +
    `<title>${escapeHtml(title)}</title>` +
    `<rect class="tree-node__ring" x="-4" y="-4" width="${w + 8}" height="${h + 8}" rx="14"/>` +
    `<rect class="tree-node__box" width="${w}" height="${h}" rx="10"/>` +
    `<text class="tree-node__label" x="10" y="15">${escapeHtml(nodeName(node))}</text>` +
    icon +
    `<text class="tree-node__set" x="10" y="33">${escapeHtml(truncate(set))}</text></g>`;
}

const ICONS = {
  in: '<path d="M12 5v14M5 12h14"/>',
  out: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
};

/** Controlos de zoom no canto do canvas (desativados nos limites). */
function zoomControlsHtml(zoom) {
  const button = (action, disabled) =>
    `<button type="button" class="btn" data-variant="ghost" data-size="icon" data-zoom="${action}" ` +
    `aria-label="${escapeHtml(t(`tree.zoom.${action}`))}" title="${escapeHtml(t(`tree.zoom.${action}`))}"` +
    `${disabled ? ' aria-disabled="true"' : ""}>` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${ICONS[action]}</svg></button>`;
  return `<div class="tree-zoom" role="group" aria-label="${escapeHtml(t("tree.zoom.label"))}">` +
    button("out", zoom <= ZOOM.min) + button("in", zoom >= ZOOM.max) + button("fit", false) + `</div>`;
}

/** Medidas da árvore compacta (nós pequenos só com "nó n" e ✓/✗, para comparar tamanhos). */
export const COMPACT_TREE_SIZES = { nodeWidth: 64, nodeHeight: 32, gapX: 10, gapY: 48, padding: 12 };

/**
 * Nó compacto: só o número e o ícone da folha; o conjunto fica no title. Uma propagação é um ponto
 * na linha tracejada (e o ícone ao lado, se for a folha), para que as caixas sejam só as chamadas
 * DLL(S) e batam certo com o número de nós que a lição escreve ao lado da árvore.
 */
function compactNodeSvg(node, sizes) {
  const { nodeWidth: w, nodeHeight: h } = sizes;
  const icon = node.leaf && LEAF_ICON[node.status] ? LEAF_ICON[node.status] : "";
  const unit = node.kind === "unit" ? " tree-node--unit" : "";
  const head = `<g class="tree-node tree-node--static tree-node--${node.status}${unit}" ` +
    `transform="translate(${node.x} ${node.y})" data-node="${node.id}" role="img">` +
    `<title>${escapeHtml(nodeTitle(node))}</title>`;
  if (node.kind === "unit") {
    return head +
      `<line class="tree-node__chain" x1="${w / 2}" y1="0" x2="${w / 2}" y2="${node.leaf ? h / 2 : h}"/>` +
      `<circle class="tree-node__dot" cx="${w / 2}" cy="${h / 2}" r="5"/>` +
      (icon ? `<text class="tree-node__compact" x="${w / 2 + 16}" y="${h / 2}">${icon}</text>` : "") +
      `</g>`;
  }
  const text = `${t("tree.node", { id: node.call })}${icon ? ` ${icon}` : ""}`;
  return head +
    `<rect class="tree-node__box" width="${w}" height="${h}" rx="10"/>` +
    `<text class="tree-node__compact" x="${w / 2}" y="${h / 2}">${escapeHtml(text)}</text></g>`;
}

/**
 * Só o SVG da árvore compacta, sem botões nem zoom e com nós que não se clicam (para a lição,
 * onde a árvore é uma imagem). Usar com treeModel(trace, último passo, COMPACT_TREE_SIZES).
 */
export function compactTreeSvg(model, label = t("tree.label"), sizes = COMPACT_TREE_SIZES) {
  if (model.nodes.length === 0) return "";
  return `<svg class="tree-view__svg tree-view__svg--compact" viewBox="0 0 ${model.width} ${model.height}" ` +
    `width="${model.width}" height="${model.height}" role="group" aria-label="${escapeHtml(label)}">` +
    model.edges.map(edgeSvg).join("") +
    model.nodes.map((node) => compactNodeSvg(node, sizes)).join("") +
    `</svg>`;
}

/**
 * Acima deste número de nós a árvore não anima a opacidade dos nós: com milhares de nós (as
 * propagações de uma fórmula grande) as transições custavam ~100 ms a cada passo, e numa árvore
 * desse tamanho não se vê a transição de um nó.
 */
const LARGE_TREE_NODES = 400;

/** Legenda da árvore: estados dos nós e arestas; a forma ou a marca dizem o estado, além da cor. */
export function treeLegendHtml() {
  const item = (id, mark) => `<li class="lg"><i class="lg--${id}" aria-hidden="true">${mark}</i>${escapeHtml(t(`tree.legend.${id}`))}</li>`;
  return `<ul class="tree-legend" aria-label="${escapeHtml(t("tree.legend.label"))}">` +
    item("open", "") + item("current", "") + item("conflict", "✕") + item("sat", "✓") + item("future", "") +
    item("branch", "p") + item("unit", "") + `</ul>`;
}

/** Botão com o ícone de informação que abre a legenda (num popover; no mobile, numa folha). */
export function treeLegendMenuHtml() {
  const label = escapeHtml(t("tree.legend.label"));
  return (
    `<details class="dd end tree-legend-menu" data-sheet-title="${label}">` +
    `<summary class="btn" data-variant="ghost" data-size="icon" aria-label="${label}" title="${label}">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg></summary>` +
    `<div class="pop dd-panel"><p class="grp max-md:hidden">${label}</p>${treeLegendHtml()}</div>` +
    `</details>`
  );
}

/** HTML da árvore para um modelo de treeModel(), desenhada com o zoom dado (1 = tamanho real). */
export function renderTree(model, sizes = TREE_SIZES, zoom = 1, title = t("tree.heading")) {
  const heading = `<h2 class="tree-view__heading" id="tree-heading">${escapeHtml(title)}</h2>`;
  if (model.nodes.length === 0) return `<section class="tree-view" aria-labelledby="tree-heading">${heading}</section>`;
  // Arestas primeiro, para os nós ficarem por cima das linhas.
  const svg =
    `<svg class="tree-view__svg${model.nodes.length > LARGE_TREE_NODES ? " tree-view__svg--large" : ""}" data-ring="${model.rule ?? ""}" width="${model.width * zoom}" height="${model.height * zoom}" ` +
    `viewBox="0 0 ${model.width} ${model.height}" role="group" aria-label="${escapeHtml(t("tree.label"))}">` +
    model.edges.map(edgeSvg).join("") +
    model.nodes.map((node) => nodeSvg(node, sizes)).join("") +
    `</svg>`;
  return `
    <section class="tree-view" aria-labelledby="tree-heading">
      <div class="tree-view__head">${heading}${treeLegendMenuHtml()}</div>
      <div class="tree-view__frame">
        <div class="tree-view__canvas">${svg}</div>
        <p class="tree-view__hint">${escapeHtml(t("tree.hint"))}</p>
        ${zoomControlsHtml(zoom)}
      </div>
    </section>`;
}

/**
 * Monta a árvore em `container`. Devolve { show(trace, index, { animate }), fit(), changes() }.
 * changes() dá os elementos que o último passo mudou, para a animação do passo (js/ui/step-motion.js).
 * onSelect(step) é chamado quando o aluno escolhe um nó (clique, Enter ou espaço); title() dá outro
 * título à árvore, no idioma atual.
 * O zoom e a posição da vista vivem aqui (fora do HTML); cada passo só troca os nós que mudaram.
 */
export function mountTreeView(container, { onSelect, title } = {}) {
  let current = null;
  let model = null; // o último treeModel desenhado (para as setas)
  let zoom = 1;
  let changes = null; // o treeChanges do último passo

  const canvasEl = () => container.querySelector(".tree-view__canvas");
  mountMenus(container); // o botão da legenda

  /** Faz scroll até ao nó se ele estiver fora da vista (ou sempre, com center = true). */
  function reveal(node, center = false) {
    const canvas = canvasEl();
    if (!node || !canvas) return;
    const box = node.getBoundingClientRect();
    const view = canvas.getBoundingClientRect();
    if (center || box.left < view.left || box.right > view.right) {
      canvas.scrollLeft += box.left - view.left - (view.width - box.width) / 2;
    }
    if (center || box.top < view.top || box.bottom > view.bottom) {
      canvas.scrollTop += box.top - view.top - (view.height - box.height) / 2;
    }
  }
  const revealCurrent = (center = false) => reveal(container.querySelector(".tree-node--current"), center);

  function updateButtons() {
    const zoomOut = container.querySelector('[data-zoom="out"]');
    const zoomIn = container.querySelector('[data-zoom="in"]');
    zoomOut?.setAttribute("aria-disabled", String(zoom <= ZOOM.min));
    zoomIn?.setAttribute("aria-disabled", String(zoom >= ZOOM.max));
  }

  /**
   * Muda o zoom sem redesenhar: só o tamanho do SVG (o viewBox fica igual). O ponto do desenho que
   * está debaixo de `anchor` (o rato, o meio da pinça ou o centro da vista) fica no mesmo sítio.
   */
  function setZoom(next, anchor) {
    const canvas = canvasEl();
    const svg = canvas?.querySelector("svg");
    next = clampZoom(next);
    if (!svg || next === zoom) return;
    canvas.classList.remove("is-following");
    const view = canvas.getBoundingClientRect();
    const point = anchor ?? { clientX: view.left + view.width / 2, clientY: view.top + view.height / 2 };
    const before = svg.getBoundingClientRect();
    const x = (point.clientX - before.left) / zoom; // coordenadas no desenho, sem zoom
    const y = (point.clientY - before.top) / zoom;
    zoom = next;
    svg.setAttribute("width", svg.viewBox.baseVal.width * zoom);
    svg.setAttribute("height", svg.viewBox.baseVal.height * zoom);
    const after = svg.getBoundingClientRect();
    canvas.scrollLeft += after.left + x * zoom - point.clientX;
    canvas.scrollTop += after.top + y * zoom - point.clientY;
    updateButtons();
  }

  /**
   * "Centrar" (e o início de cada fórmula): a árvore toda à vista (se couber acima do zoom mínimo)
   * e o nó atual ao centro.
   */
  function fit() {
    const canvas = canvasEl();
    const svg = canvas?.querySelector("svg");
    if (!svg) return;
    const style = getComputedStyle(canvas);
    const maxHeight = (parseFloat(style.maxHeight) || canvas.clientHeight) - parseFloat(style.paddingBottom);
    const { width, height } = svg.viewBox.baseVal;
    setZoom(fitZoom(width, height, canvas.clientWidth, maxHeight));
    revealCurrent(true);
  }

  /**
   * Passo seguinte da mesma fórmula: as posições não mudam (vêm do trace completo), por isso só se
   * trocam os nós e as arestas cujo estado mudou, em vez de refazer o SVG todo. Numa árvore com
   * milhares de nós isto é a diferença entre um passo fluido e um passo que prende a página (M8.5).
   * No SVG estão primeiro as arestas e depois os nós, pela ordem do modelo.
   */
  function patch(svg, before, after) {
    const elements = svg.children;
    after.edges.forEach((edge, i) => {
      const old = before.edges[i];
      if (edge.visited !== old.visited) elements[i].classList.toggle("tree-edge--future", !edge.visited);
      if (edge.faded !== old.faded) elements[i].classList.toggle("tree-edge--faded", edge.faded);
      if (edge.path !== old.path) elements[i].classList.toggle("tree-edge--path", edge.path);
    });
    after.nodes.forEach((node, i) => {
      const old = before.nodes[i];
      if (node.status === old.status && node.current === old.current && node.faded === old.faded && node.S === old.S) return;
      const holder = document.createElementNS(svg.namespaceURI, "svg");
      holder.innerHTML = nodeSvg(node, TREE_SIZES);
      elements[after.edges.length + i].replaceWith(holder.firstElementChild);
    });
  }

  let drawnTrace = null; // trace do SVG desenhado (null = redesenhar tudo, ex.: mudou o idioma)

  function draw(animate = false) {
    if (!current) return;
    const active = container.contains(document.activeElement) ? document.activeElement : null;
    const focused = active?.dataset?.node !== undefined
      ? `[data-node="${active.dataset.node}"]`
      : active?.dataset?.zoom ? `[data-zoom="${active.dataset.zoom}"]` : null;
    const next = treeModel(current.trace, current.index);
    const svg = canvasEl()?.querySelector("svg");
    if (svg && model && drawnTrace === current.trace) {
      patch(svg, model, next);
      svg.dataset.ring = next.rule ?? "";
      changes = treeChanges(model, next);
    } else {
      changes = null;
      const old = canvasEl();
      const scroll = old ? { left: old.scrollLeft, top: old.scrollTop } : null;
      container.innerHTML = renderTree(next, TREE_SIZES, zoom, title?.());
      drawnTrace = current.trace;
      const canvas = canvasEl();
      if (canvas && scroll) {
        canvas.scrollLeft = scroll.left;
        canvas.scrollTop = scroll.top;
      }
    }
    model = next;
    if (focused && !container.contains(document.activeElement)) container.querySelector(focused)?.focus();
    // Mantém o nó atual à vista quando a árvore é maior do que o canvas. No passo animado, a vista
    // desliza até ele (o scroll suave é do CSS, só para quem não pediu movimento reduzido).
    canvasEl()?.classList.toggle("is-following", animate);
    revealCurrent();
  }
  onLangChange(() => {
    drawnTrace = null;
    draw();
  });

  function select(target) {
    const node = target.closest?.(".tree-node");
    if (node && onSelect) onSelect(Number(node.dataset.step));
  }

  // Arrastar e pinça com pointer events (rato, caneta e toque). O clique só conta se não houve
  // arrasto: abaixo de DRAG_THRESHOLD px é um clique num nó; acima move a vista.
  const DRAG_THRESHOLD = 4;
  const pointers = new Map(); // pointerId → { clientX, clientY }
  let drag = null; // { x, y, left, top } no início do arrasto
  let pinch = null; // { distance, zoom } no início da pinça
  let dragged = false;

  const distance = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const middle = ([a, b]) => ({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 });

  function startDrag(point) {
    const canvas = canvasEl();
    canvas.classList.remove("is-following");
    drag = { x: point.clientX, y: point.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
  }

  container.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.(".tree-view__canvas")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pointers.size === 1) {
      dragged = false;
      startDrag(event);
    } else if (pointers.size === 2) {
      pinch = { distance: distance([...pointers.values()]), zoom };
      drag = null;
    }
  });

  container.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    const canvas = canvasEl();
    if (!canvas) return;
    if (pinch && pointers.size === 2) {
      const points = [...pointers.values()];
      dragged = true;
      setZoom(pinch.zoom * (distance(points) / pinch.distance), middle(points));
    } else if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!dragged && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      if (!dragged) {
        dragged = true;
        canvas.classList.add("is-dragging");
        try {
          canvas.setPointerCapture(event.pointerId); // continua a receber o movimento fora do canvas
        } catch {
          // o ponteiro já não está ativo: arrasta sem captura
        }
      }
      canvas.scrollLeft = drag.left - dx;
      canvas.scrollTop = drag.top - dy;
    }
  });

  function endPointer(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) startDrag([...pointers.values()][0]); // continua a arrastar com o dedo que ficou
    if (pointers.size === 0) {
      drag = null;
      canvasEl()?.classList.remove("is-dragging");
    }
  }
  container.addEventListener("pointerup", endPointer);
  container.addEventListener("pointercancel", endPointer);

  // Depois de um arrasto, o clique que o browser envia no fim não escolhe nenhum nó.
  container.addEventListener("click", (event) => {
    if (!dragged) return;
    dragged = false;
    if (event.target.closest?.(".tree-view__canvas")) event.stopPropagation();
  }, true);

  // Ctrl/⌘ + roda (e a pinça do trackpad, que o browser envia como roda com ctrlKey): zoom no rato.
  // A roda sozinha continua a fazer scroll à página.
  container.addEventListener("wheel", (event) => {
    if (!(event.ctrlKey || event.metaKey) || !event.target.closest?.(".tree-view__canvas")) return;
    event.preventDefault();
    setZoom(wheelZoom(zoom, event.deltaY), event);
  }, { passive: false });

  container.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-zoom]");
    if (button) {
      const action = button.dataset.zoom;
      if (action === "fit") fit();
      else setZoom(zoomStep(zoom, action === "in" ? 1 : -1));
      return;
    }
    select(event.target);
  });
  container.addEventListener("keydown", (event) => {
    const node = event.target.closest?.(".tree-node");
    if (!node || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation(); // o espaço aqui escolhe o nó, não faz play na timeline
      select(event.target);
      return;
    }
    if (!model || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation(); // as setas aqui andam na árvore, não mudam o passo da timeline
    const target = treeNeighbor(model, Number(node.dataset.node), event.key);
    if (target === null) return;
    const next = container.querySelector(`.tree-node[data-node="${target}"]`);
    next?.focus({ preventScroll: true });
    reveal(next);
  });

  return {
    show(trace, index, { animate = false } = {}) {
      const newTrace = trace !== current?.trace;
      current = { trace, index };
      draw(animate);
      if (newTrace) fit(); // uma fórmula nova começa com a árvore toda à vista
    },
    // Volta a ajustar: útil quando a árvore estava escondida (largura 0), como na tab Árvore do mobile.
    fit,
    changes() {
      const svg = canvasEl()?.querySelector("svg");
      if (!svg || !changes) return { nodes: [], edges: [], faded: [], fadedEdges: [], pathEdges: [] };
      const edgeAt = (i) => svg.children[i];
      const nodeAt = (i) => svg.children[model.edges.length + i];
      return {
        nodes: changes.entered.map(nodeAt),
        edges: changes.enteredEdges.map(edgeAt),
        faded: changes.faded.map(nodeAt),
        fadedEdges: changes.fadedEdges.map(edgeAt),
        pathEdges: changes.pathEdges.map(edgeAt),
      };
    },
  };
}
