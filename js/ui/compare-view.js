// Comparação DLL × DP no Passo a passo: fechada, uma linha com os passos de cada algoritmo; aberta, o
// mesmo conjunto resolvido pelos dois, com o resultado, o nº de passos, o tamanho máximo de S e o
// tempo médio, e um mini-gráfico do tamanho de S ao longo dos passos (o DLL sobe e desce porque
// volta atrás; o DP nunca volta, mas a resolução pode fazer o conjunto crescer).
//
// Os números vêm de js/core/compare.js. renderCompare/chartSvg são puras (testadas em node);
// mountCompareView mexe no DOM.
import { t, getLang, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { compareAlgorithms } from "../core/compare.js";

const SIDES = ["dll", "dp"];
const CHEVRON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';

// Geometria do gráfico (unidades do viewBox; o SVG estica à largura do cartão).
const CHART = { width: 320, height: 132, left: 34, right: 10, top: 10, bottom: 26 };
// Com mais pontos do que isto, só a linha (os círculos ficavam colados).
const MAX_DOTS = 40;

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat(getLang() === "en" ? "en" : "pt-PT", { maximumFractionDigits: digits }).format(value);
}

/** Tempo em ms, legível: "< 0,01 ms", "0,05 ms", "12 ms". */
export function formatMs(ms) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 0.01) return t("compare.msBelow", { value: formatNumber(0.01, 2) });
  return t("compare.ms", { value: formatNumber(ms, ms < 10 ? 2 : 0) });
}

function resultLabel(result) {
  if (result.limited) return t("compare.result.limited");
  return t(result.sat ? "compare.result.sat" : "compare.result.unsat");
}

/**
 * Mini-gráfico do tamanho de S por passo, com as duas linhas na mesma escala.
 * marker = { algorithm, step }: o passo que o aluno está a ver (um círculo maior), ou null.
 */
export function chartSvg(out, marker = null) {
  const { width, height, left, right, top, bottom } = CHART;
  const maxSteps = Math.max(1, out.dll.steps, out.dp.steps);
  const maxSize = Math.max(1, out.dll.maxSize, out.dp.maxSize);
  const x = (step) => left + (step / maxSteps) * (width - left - right);
  const y = (size) => top + (1 - size / maxSize) * (height - top - bottom);
  const round = (n) => Math.round(n * 10) / 10;

  const line = (side) => {
    const { sizes } = out[side];
    const points = sizes.map((size, i) => `${round(x(i))},${round(y(size))}`).join(" ");
    const dots = sizes.length <= MAX_DOTS
      ? sizes.map((size, i) => `<circle cx="${round(x(i))}" cy="${round(y(size))}" r="2.5"/>`).join("")
      : "";
    return `<g class="compare-chart__series compare-chart__series--${side}"><polyline points="${points}"/>${dots}</g>`;
  };

  let markerSvg = "";
  if (marker && out[marker.algorithm]) {
    const size = out[marker.algorithm].sizes[marker.step];
    if (size !== undefined) {
      markerSvg = `<circle class="compare-chart__marker compare-chart__marker--${marker.algorithm}" ` +
        `cx="${round(x(marker.step))}" cy="${round(y(size))}" r="5"/>`;
    }
  }

  const axisY = height - bottom;
  return (
    `<svg class="compare-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("compare.chart.label", {
      dll: out.dll.maxSize, dp: out.dp.maxSize,
    }))}">` +
    `<line class="compare-chart__axis" x1="${left}" y1="${top}" x2="${left}" y2="${axisY}"/>` +
    `<line class="compare-chart__axis" x1="${left}" y1="${axisY}" x2="${width - right}" y2="${axisY}"/>` +
    `<text class="compare-chart__tick" x="${left - 6}" y="${top + 4}" text-anchor="end">${maxSize}</text>` +
    `<text class="compare-chart__tick" x="${left - 6}" y="${axisY}" text-anchor="end">0</text>` +
    `<text class="compare-chart__tick" x="${left}" y="${axisY + 16}">0</text>` +
    `<text class="compare-chart__tick" x="${width - right}" y="${axisY + 16}" text-anchor="end">${maxSteps}</text>` +
    `<text class="compare-chart__tick" x="${(left + width - right) / 2}" y="${axisY + 16}" text-anchor="middle">${escapeHtml(t("compare.chart.x"))}</text>` +
    line("dll") + line("dp") + markerSvg +
    `</svg>`
  );
}

/** A frase que interpreta os números (o que o aluno deve tirar da comparação). */
export function summaryText(out) {
  const { dll, dp } = out;
  const params = { dllSteps: dll.steps, dpSteps: dp.steps, dllMax: dll.maxSize, dpMax: dp.maxSize, next: dp.limitSize };
  if (dp.result.limited) {
    return t(dp.limitSize === null ? "compare.summary.limitedSteps" : "compare.summary.limited", params);
  }
  const onlyUnits = dll.result.stats.branches === 0 && dp.result.stats.eliminations === 0;
  if (onlyUnits) return t("compare.summary.same", params);
  if (dp.maxSize > dll.maxSize) return t("compare.summary.dpGrows", params);
  if (dp.steps < dll.steps) return t("compare.summary.dpFewer", params);
  return t("compare.summary.other", params);
}

/** Linha fechada: «DLL 9 passos · DP 4 passos · os dois dão satisfazível», com o algoritmo visto primeiro. */
export function lineText(out, current = "dll") {
  const sides = current === "dp" ? ["dp", "dll"] : SIDES;
  const steps = sides.map((side) => t("compare.line", { name: t(`stepAlgo.${side}`), n: out[side].steps }));
  const limited = out.dll.result.limited || out.dp.result.limited;
  const same = out.dll.result.sat === out.dp.result.sat;
  if (limited || !same) return steps.join(" · ");
  return [...steps, t(out.dll.result.sat ? "compare.bothSat" : "compare.bothUnsat")].join(" · ");
}

/** HTML da comparação; `current` = algoritmo que está a ser visto ("dll" | "dp"); `open` = aberta ou colapsada. */
export function renderCompare(out, { current = "dll", marker = null, open = false } = {}) {
  const head = SIDES.map((side) =>
    `<th scope="col" class="compare__col${side === current ? " compare__col--current" : ""}">` +
    `<span class="compare__swatch compare__swatch--${side}" aria-hidden="true"></span>${escapeHtml(t(`compare.sides.${side}`))}</th>`
  ).join("");
  const row = (key, cell) =>
    `<tr><th scope="row">${escapeHtml(t(`compare.rows.${key}`))}</th>` +
    SIDES.map((side) => `<td class="${side === current ? "compare__col--current" : ""}">${escapeHtml(cell(out[side]))}</td>`).join("") +
    `</tr>`;
  return `
    <section class="compare" aria-labelledby="compare-heading">
      <details class="compare__details"${open ? " open" : ""}>
      <summary class="compare__toggle">
        <h2 class="compare__heading" id="compare-heading">
          <span class="compare__if-closed">${escapeHtml(t("compare.title", { other: t(`stepAlgo.${current === "dp" ? "dll" : "dp"}`) }))}</span>
          <span class="compare__if-open">${escapeHtml(t("compare.heading"))}</span>
        </h2>
        <span class="compare__line compare__if-closed">${escapeHtml(lineText(out, current))}</span>
        <span class="compare__line compare__if-open">${escapeHtml(summaryText(out))}</span>
        <span class="compare__more"><span class="compare__if-open">${escapeHtml(t("compare.collapse"))}</span>${CHEVRON}</span>
      </summary>
      <div class="compare__grid">
        <table class="tbl compare__table">
          <thead><tr><td></td>${head}</tr></thead>
          <tbody>
            ${row("result", (s) => resultLabel(s.result))}
            ${row("steps", (s) => formatNumber(s.steps))}
            ${row("maxSize", (s) => t("compare.clauses", { n: s.maxSize }))}
            ${row("time", (s) => formatMs(s.ms))}
          </tbody>
        </table>
        <figure class="compare__figure">
          ${chartSvg(out, marker)}
          <figcaption class="compare__caption">${escapeHtml(t("compare.chart.caption"))}</figcaption>
        </figure>
      </div>
      <p class="compare__note">${escapeHtml(t("compare.intro"))} ${escapeHtml(t("compare.timeNote"))}</p>
      </details>
    </section>`;
}

/**
 * Monta a comparação em `container`. show(clauses, key, options) calcula (só quando o conjunto muda,
 * depois de a página pintar o passo) e desenha; options = { current, marker }.
 */
export function mountCompareView(container) {
  let state = null;
  let timer = null;
  // Cada passo redesenha a comparação: o aberto/colapsado do aluno fica aqui para sobreviver.
  let open = false;

  function draw() {
    if (state?.out) container.innerHTML = renderCompare(state.out, { ...state.options, open });
  }

  // O evento toggle não sobe pela árvore: só se apanha em captura.
  container.addEventListener("toggle", (event) => { open = event.target.open; }, true);

  function show(clauses, key, options = {}) {
    if (state?.key === key) {
      state.options = options;
      draw();
      return;
    }
    clearTimeout(timer);
    state = { key, out: null, options };
    container.innerHTML = "";
    // O DP pode demorar em conjuntos grandes e o tempo é medido com várias execuções:
    // calcula-se a seguir, para não atrasar o primeiro passo.
    timer = setTimeout(() => {
      state.out = compareAlgorithms(clauses);
      draw();
    }, 0);
  }

  function clear() {
    clearTimeout(timer);
    state = null;
    container.innerHTML = "";
  }

  onLangChange(draw);
  return { show, clear };
}
