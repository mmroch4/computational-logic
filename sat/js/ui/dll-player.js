// Interativo da §4 (Aprender): fluxograma SVG do DLL e um mini-player do exemplo com dois ramos.
// Em cada passo o fluxograma realça a caixa atual (na cor da regra) e o caminho até ela, e ao lado
// aparecem a explicação do passo (a mesma do Passo a passo) e os cartões de S.
//
// O mapeamento evento → caixa está em js/core/flowchart.js. As funções render* são puras
// (testadas em node); mountDllPlayer mexe no DOM.
import { t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { literalHtml, clauseHtml } from "./formula-input.js";
import { cardHtml, clauseSetModel, hideLeaving } from "./clause-set-view.js";
import { explanationHtml, pseudocodeModel, stepExplanationHtml } from "./pseudocode-view.js";
import { parse } from "../core/parser.js";
import { solveDLL } from "../core/dll.js";
import { getExample } from "../core/examples.js";
import { FLOW_NODES, FLOW_EDGES, flowchartModel, callOf } from "../core/flowchart.js";
import { lessonFigureHtml } from "./lesson-figure.js";
import { playStep } from "./step-motion.js";

/** O exemplo do player: dois ramos (sem unitárias, ramifica logo à partida). */
const PLAYER_EXAMPLE_ID = "two-branches";

export function playerTrace(exampleId = PLAYER_EXAMPLE_ID) {
  const result = parse(getExample(exampleId).input);
  return { S: result.clauses, trace: solveDLL(result.clauses).trace };
}

// ---------- Geometria do fluxograma (unidades do viewBox) ----------
// Coluna principal ao centro-esquerda, respostas à direita, e à esquerda o corredor das setas de recursão.
const FLOW_VIEW = { width: 360, height: 516 };
const MAIN = { cx: 136, w: 176 };
const SIDE = { cx: 308, w: 96 };
const BOX_H = 34;
const DIAMOND_H = 60;

const LAYOUT = {
  call: { cx: MAIN.cx, cy: 26, w: MAIN.w, h: BOX_H },
  propagate: { cx: MAIN.cx, cy: 90, w: MAIN.w, h: BOX_H },
  isEmpty: { cx: MAIN.cx, cy: 164, w: MAIN.w, h: DIAMOND_H },
  sat: { cx: SIDE.cx, cy: 164, w: SIDE.w, h: BOX_H },
  hasF: { cx: MAIN.cx, cy: 248, w: MAIN.w, h: DIAMOND_H },
  unsat: { cx: SIDE.cx, cy: 248, w: SIDE.w, h: BOX_H },
  select: { cx: MAIN.cx, cy: 322, w: MAIN.w, h: BOX_H },
  tryL: { cx: MAIN.cx, cy: 402, w: MAIN.w, h: DIAMOND_H + 6 },
  thenSat: { cx: SIDE.cx, cy: 402, w: SIDE.w, h: BOX_H },
  tryNotL: { cx: MAIN.cx, cy: 484, w: MAIN.w, h: BOX_H },
};

// Corredor da recursão: x de cada seta a tracejado e a altura a que entra em DLL(S).
const RECURSION = {
  "tryL-call": { x: 30, entry: 20 },
  "tryNotL-call": { x: 14, entry: 32 },
};

const left = (b) => b.cx - b.w / 2;
const right = (b) => b.cx + b.w / 2;
const top = (b) => b.cy - b.h / 2;
const bottom = (b) => b.cy + b.h / 2;

/** Pontos da seta `edge` (polilinha). As setas para baixo saem do fundo; sim → para a direita. */
function edgePoints(edge) {
  const a = LAYOUT[edge.from];
  const b = LAYOUT[edge.to];
  if (edge.recursive) {
    const { x, entry } = RECURSION[edge.id];
    return [[left(a), a.cy], [x, a.cy], [x, entry], [left(b), entry]];
  }
  if (b.cy === a.cy) return [[right(a), a.cy], [left(b), b.cy]];
  return [[a.cx, bottom(a)], [b.cx, top(b)]];
}

function shapeSvg(id, shape) {
  const b = LAYOUT[id];
  if (shape === "decision") {
    const points = [[b.cx, top(b)], [right(b), b.cy], [b.cx, bottom(b)], [left(b), b.cy]];
    return `<polygon class="flow__shape" points="${points.map((p) => p.join(",")).join(" ")}"/>`;
  }
  return `<rect class="flow__shape" x="${left(b)}" y="${top(b)}" width="${b.w}" height="${b.h}" rx="10"/>`;
}

/** Texto da caixa: uma ou duas linhas (a decisão "DLL(S ∪ {l}) satisfazível?" usa duas). */
function labelSvg(id) {
  const b = LAYOUT[id];
  const lines = [t(`learn.dll.flow.${id}`)];
  if (id === "tryL") lines.push(t("learn.dll.flow.tryL2"));
  const code = id === "sat" || id === "unsat" || id === "thenSat" ? "" : " flow__text--code";
  const first = b.cy - ((lines.length - 1) * 15) / 2;
  // No mono, a 12px, o ∪ parece um u: é o único símbolo em sans.
  const textOf = (line) => escapeHtml(line).replaceAll("∪", '<tspan class="flow__union">∪</tspan>');
  return lines
    .map((line, i) => `<text class="flow__text${code}" x="${b.cx}" y="${first + i * 15}">${textOf(line)}</text>`)
    .join("");
}

/** Etiqueta sim/não junto à seta. */
function edgeLabelSvg(edge) {
  if (!edge.label) return "";
  const [[x1, y1], [x2]] = edgePoints(edge);
  const text = escapeHtml(t(`learn.dll.flow.${edge.label}`));
  // Seta para a direita: etiqueta por cima; seta para baixo: etiqueta à direita.
  const [x, y, anchor] = x2 !== x1 ? [(x1 + x2) / 2, y1 - 6, "middle"] : [x1 + 6, y1 + 13, "start"];
  return `<text class="flow__edge-label" x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>`;
}

// Ponta das setas: uma para as setas normais e outra para as do caminho (o marker não herda a cor da seta).
function markerSvg(id, className) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">` +
    `<path d="M0,0 L10,5 L0,10 z" class="${className}"/></marker>`;
}

/** SVG do fluxograma para um modelo de flowchartModel(). */
export function renderFlowchart(model) {
  const rule = model.rule ? ` rule-${model.rule}` : "";
  const edges = FLOW_EDGES.map((edge) => {
    const classes = ["flow__edge"];
    if (edge.recursive) classes.push("flow__edge--recursive");
    if (model.edges.includes(edge.id)) classes.push("is-path");
    const points = edgePoints(edge).map((p) => p.join(",")).join(" ");
    const marker = model.edges.includes(edge.id) ? "flow-arrow-path" : "flow-arrow";
    return `<g class="${classes.join(" ")}" data-edge="${edge.id}"><polyline points="${points}" marker-end="url(#${marker})"/>` +
      `${edgeLabelSvg(edge)}</g>`;
  }).join("");
  const nodes = FLOW_NODES.map(({ id, shape }) => {
    const classes = ["flow__node", `flow__node--${shape}`];
    if (model.nodes.includes(id)) classes.push("is-path");
    if (model.current === id) classes.push("is-current");
    return `<g class="${classes.join(" ")}" data-node="${id}">${shapeSvg(id, shape)}${labelSvg(id)}</g>`;
  }).join("");
  const title = escapeHtml(t("learn.dll.flowTitle"));
  return (
    `<svg class="flow${rule}" viewBox="0 0 ${FLOW_VIEW.width} ${FLOW_VIEW.height}" role="img" aria-label="${title}">` +
    `<defs>${markerSvg("flow-arrow", "flow__arrowhead")}${markerSvg("flow-arrow-path", "flow__arrowhead flow__arrowhead--path")}</defs>` +
    edges + nodes +
    `</svg>`
  );
}

/** Em que chamada estamos: "Chamada inicial DLL(S)" ou "Chamada recursiva · ramo p → ¬q". */
function callHtml(call) {
  if (call.depth === 0) return escapeHtml(t("learn.dll.player.rootCall"));
  const path = call.literals.map((l) => `<span class="lit">${literalHtml(l)}</span>`).join(" → ");
  return `${escapeHtml(t("learn.dll.player.recursiveCall", { depth: call.depth }))} ${path}`;
}

/** Cartões de S no passo (os mesmos do Passo a passo); { } quando S fica vazio. */
function cardsHtml(trace, index) {
  const model = clauseSetModel(trace, index);
  if (model.type === "sat") return `<p class="propagation-diagram__empty">{ }</p>`;
  return `<ol class="clauses">${model.cards.map(cardHtml).join("")}</ol>`;
}

/** HTML completo do player no passo `index`. */
export function renderDllPlayer({ S, trace, index }) {
  const last = trace.length - 1;
  const model = flowchartModel(trace, index);
  const explanation = pseudocodeModel(trace, index).explanation;
  const rule = model.rule ? ` rule-${model.rule}` : "";
  const button = (action, label, disabled) =>
    `<button type="button" class="btn" data-variant="secondary" data-action="${action}"${disabled ? ' aria-disabled="true"' : ""}>${escapeHtml(label)}</button>`;
  const set = `{${S.map(clauseHtml).join(", ")}}`;
  const body =
    `<p class="dll-player__set">S = ${set}</p>` +
    `<div class="dll-player__grid">` +
    `<div class="dll-player__flow">${renderFlowchart(model)}` +
    `<p class="dll-player__legend">${escapeHtml(t("learn.dll.legend"))}</p></div>` +
    `<div class="dll-player__panel">` +
    `<div class="dll-player__controls">` +
    button("first", t("learn.dll.player.first"), index === 0) +
    button("prev", t("learn.dll.player.prev"), index === 0) +
    button("next", t("learn.dll.player.next"), index === last) +
    `</div>` +
    `<p class="dll-player__counter">${escapeHtml(t("learn.dll.player.counter", { n: index + 1, total: trace.length }))}</p>` +
    `<p class="dll-player__call">${callHtml(callOf(trace, index))}</p>` +
    (explanation ? `<p class="dll-player__explain${rule}">${explanationHtml(explanation)}</p>` : "") +
    `<div class="dll-player__cards">${cardsHtml(trace, index)}</div>` +
    `</div>` +
    `</div>`;
  return lessonFigureHtml({ classes: "dll-player", icon: "play", title: t("learn.dll.player.title"), body });
}

/**
 * Região role="status" fixa a seguir a `container` (também usada pelo player do DP): um nó que
 * existe desde o início é anunciado com fiabilidade; um que é substituído pelo innerHTML nem sempre.
 */
export function statusRegion(container) {
  const status = document.createElement("p");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  container.after(status);
  return status;
}

/** "Passo 2 de 5. Propagação unitária: …" em HTML (o contador e a explicação do passo). */
export function playerAnnouncementHtml(index, total, explanation) {
  const counter = escapeHtml(t("learn.dll.player.counter", { n: index + 1, total }));
  return explanation ? `${counter}. ${explanation}` : counter;
}

/** Monta o player em `container`. Devolve { refresh } para redesenhar ao mudar de idioma. */
export function mountDllPlayer(container) {
  if (!container) return { refresh() {} };
  const { S, trace } = playerTrace();
  let index = 0;
  let run = null; // a sequência do passo atual (js/ui/step-motion.js)
  let settled = false; // as cláusulas que saíram neste passo já não se mostram
  // O player é redesenhado inteiro a cada passo; o anúncio para os leitores de ecrã vive num nó fixo.
  const status = statusRegion(container);

  function settle() {
    settled = true;
    hideLeaving(container);
  }

  function draw(focusAction) {
    run?.cancel();
    run = null;
    container.innerHTML = renderDllPlayer({ S, trace, index });
    if (settled) hideLeaving(container);
    if (!focusAction) return;
    status.innerHTML = playerAnnouncementHtml(index, trace.length, stepExplanationHtml(trace, index));
    container.querySelector(`[data-action="${focusAction}"]`)?.focus();
  }

  function go(action) {
    const last = trace.length - 1;
    const before = index;
    if (action === "first") index = 0;
    else if (action === "prev") index = Math.max(0, index - 1);
    else if (action === "next") index = Math.min(last, index + 1);
    else if (action === "last") index = last;
    else return false;
    settled = false;
    draw(action === "last" ? "prev" : action);
    // Como no Passo a passo, só o «Seguinte» mostra a sequência.
    if (action === "next" && index !== before) run = playStep(trace, index, { clauseRoot: container, onSettle: settle });
    return true;
  }

  container.addEventListener("click", (event) => {
    const action = event.target.closest('[data-action]:not([aria-disabled="true"])')?.dataset.action;
    if (action) go(action);
  });
  // Setas do teclado quando o foco está dentro do player (como no Passo a passo).
  container.addEventListener("keydown", (event) => {
    const keys = { ArrowLeft: "prev", ArrowRight: "next", Home: "first", End: "last" };
    if (keys[event.key] && go(keys[event.key])) event.preventDefault();
  });

  draw();
  return { refresh: () => draw() };
}
