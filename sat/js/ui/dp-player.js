// Interativo da §6 (Aprender): o DP de 1960 passo a passo, em três conjuntos à escolha.
//   - dois ramos, ambos em F: eliminar p e propagar ¬q chega a F em dois passos (a figura de cima);
//   - 3 pombos, 2 poleiros: o DP também chega a F, com menos passos do que o DLL;
//   - 4 pombos, 3 poleiros: a resolução faz o conjunto crescer de 22 para 59 cláusulas, enquanto o
//     DLL nunca passa das 23. É a explosão de que fala o texto, e a razão do DLL de 1962.
// Cada passo usa a vista do DP do Passo a passo (pseudocódigo, pares resolvidos e sequência de
// conjuntos) e, por baixo, o mini-gráfico da comparação com o DLL, com o passo atual marcado.
//
// As funções dpPlayerRun/renderDpPlayer são puras (testadas em node); mountDpPlayer mexe no DOM.
import { t, pagePath } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { renderDp, stepExplanationHtml } from "./dp-view.js";
import { statusRegion, playerAnnouncementHtml } from "./dll-player.js";
import { chartSvg, summaryText } from "./compare-view.js";
import { parse } from "../core/parser.js";
import { solveDP } from "../core/dp.js";
import { getExample } from "../core/examples.js";
import { compareAlgorithms, stepNumberAt } from "../core/compare.js";
import { encodeShare } from "../core/share.js";
import { lessonFigureHtml } from "./lesson-figure.js";

/** n pombos e m poleiros: cada pombo i está num poleiro (pᵢ₁ ∨ … ∨ pᵢₘ) e dois pombos não partilham um poleiro. */
export function pigeonFormula(pigeons, holes) {
  const clauses = [];
  for (let i = 1; i <= pigeons; i++) {
    clauses.push(Array.from({ length: holes }, (_, j) => `p${i}${j + 1}`).join(" "));
  }
  for (let j = 1; j <= holes; j++) {
    for (let a = 1; a <= pigeons; a++) {
      for (let b = a + 1; b <= pigeons; b++) clauses.push(`-p${a}${j} -p${b}${j}`);
    }
  }
  return clauses.join(", ");
}

/** Os conjuntos do player, do mais pequeno ao que explode. */
export const DP_PLAYER_EXAMPLES = [
  { id: "two-branches", input: getExample("two-branches").input },
  { id: "pigeons-3-2", input: getExample("pigeons-3-2").input },
  { id: "pigeons-4-3", input: pigeonFormula(4, 3) },
];

/** Trace do DP e comparação com o DLL (sem medir tempos) para o conjunto `id`. */
export function dpPlayerRun(id = DP_PLAYER_EXAMPLES[0].id) {
  const example = DP_PLAYER_EXAMPLES.find((e) => e.id === id) ?? DP_PLAYER_EXAMPLES[0];
  const S = parse(example.input).clauses;
  return { id: example.id, S, trace: solveDP(S).trace, out: compareAlgorithms(S, { timing: false }) };
}

/** HTML completo do player no passo `index` de `run` (o resultado de dpPlayerRun). */
export function renderDpPlayer(run, index) {
  const { id, S, trace, out } = run;
  const last = trace.length - 1;
  const choices = DP_PLAYER_EXAMPLES.map((e) =>
    `<button type="button" data-example="${e.id}" aria-pressed="${e.id === id}">` +
    `${escapeHtml(t(`learn.history.player.examples.${e.id}`))}</button>`
  ).join("");
  const button = (action, label, disabled) =>
    `<button type="button" class="btn" data-variant="secondary" data-action="${action}"${disabled ? ' aria-disabled="true"' : ""}>${escapeHtml(label)}</button>`;
  const marker = { algorithm: "dp", step: stepNumberAt(trace, "dp", index) };
  const link = `${pagePath("step")}?${encodeShare(S, { algorithm: "dp" })}`;
  const body =
    `<div class="seg sm lesson-choices" role="group" aria-label="${escapeHtml(t("learn.history.player.examplesLabel"))}">${choices}</div>` +
    `<p class="dp-player__about">${escapeHtml(t(`learn.history.player.about.${id}`, { n: S.length }))}</p>` +
    `<div class="dll-player__controls">` +
    button("first", t("learn.dll.player.first"), index === 0) +
    button("prev", t("learn.dll.player.prev"), index === 0) +
    button("next", t("learn.dll.player.next"), index === last) +
    `</div>` +
    `<p class="dll-player__counter">${escapeHtml(t("learn.dll.player.counter", { n: index + 1, total: trace.length }))}</p>` +
    renderDp(trace, index, { headingLevel: 3 }) +
    `<div class="dp-player__compare">` +
    `<p class="dp-player__legend">` +
    `<span class="compare__swatch compare__swatch--dll" aria-hidden="true"></span>${escapeHtml(t("compare.sides.dll"))} ` +
    `<span class="compare__swatch compare__swatch--dp" aria-hidden="true"></span>${escapeHtml(t("compare.sides.dp"))}</p>` +
    chartSvg(out, marker) +
    `<p class="dp-player__summary">${escapeHtml(summaryText(out))}</p>` +
    `<p class="dp-player__open"><a href="${escapeHtml(link)}">${escapeHtml(t("learn.history.player.open"))}</a></p>` +
    `</div>`;
  return lessonFigureHtml({ classes: "dll-player dp-player", icon: "cross", title: t("learn.history.player.title"), body });
}

/** Monta o player em `container`. Devolve { refresh } para redesenhar ao mudar de idioma. */
export function mountDpPlayer(container) {
  if (!container) return { refresh() {} };
  let run = dpPlayerRun();
  let index = 0;
  // Anúncio do passo para os leitores de ecrã, num nó fixo (o player é redesenhado inteiro).
  const status = statusRegion(container);

  function draw(focus) {
    container.innerHTML = renderDpPlayer(run, index);
    if (!focus) return;
    status.innerHTML = playerAnnouncementHtml(index, run.trace.length, stepExplanationHtml(run.trace, index));
    container.querySelector(focus)?.focus();
  }

  function go(action) {
    const last = run.trace.length - 1;
    if (action === "first") index = 0;
    else if (action === "prev") index = Math.max(0, index - 1);
    else if (action === "next") index = Math.min(last, index + 1);
    else if (action === "last") index = last;
    else return false;
    draw(`[data-action="${action === "last" ? "prev" : action}"]`);
    return true;
  }

  container.addEventListener("click", (event) => {
    const example = event.target.closest("[data-example]")?.dataset.example;
    if (example) {
      if (example !== run.id) {
        run = dpPlayerRun(example);
        index = 0;
      }
      draw(`[data-example="${example}"]`);
      return;
    }
    const step = event.target.closest("[data-step]")?.dataset.step;
    if (step !== undefined) {
      index = Number(step);
      draw(`[data-step="${step}"]`);
      return;
    }
    const action = event.target.closest('[data-action]:not([aria-disabled="true"])')?.dataset.action;
    if (action) go(action);
  });
  // Setas do teclado quando o foco está dentro do player (como no player da §4).
  container.addEventListener("keydown", (event) => {
    const keys = { ArrowLeft: "prev", ArrowRight: "next", Home: "first", End: "last" };
    if (keys[event.key] && go(keys[event.key])) event.preventDefault();
  });

  draw();
  return { refresh: () => draw() };
}
