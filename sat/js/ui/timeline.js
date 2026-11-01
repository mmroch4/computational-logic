// Timeline do Passo a passo: anterior · play/pausa · seguinte, um slider de passos com um ponto na
// cor de cada evento e rótulos nos momentos-chave, o contador "Passo 7 de 23" e a velocidade
// (0.5×–2×, guardada nas prefs), num menu que no mobile é a folha «Reprodução».
// Atalhos de teclado: ← → (passo), espaço (play/pausa), Home/End (início/fim).
//
// O passo N é o índice N do trace (0 = start, o último = result), o mesmo número que vai no
// ?step=N da URL. As funções de cima são puras (testáveis em node); só mountTimeline() mexe no DOM.
import { t, onLangChange } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { eventChipHtml, ruleOf } from "./events.js";
import { mountMenus, closeMenu } from "./menu.js";
import { storage as defaultStorage } from "./storage.js";
import { formatLiteral } from "../core/literals.js";

export { ruleOf };

/** Velocidades disponíveis (as mesmas que storage.js aceita nas prefs). */
export const SPEEDS = [0.5, 1, 1.5, 2];

/** Tempo entre passos no play à velocidade 1×. */
const PLAY_INTERVAL_MS = 900;

/** Milissegundos entre dois passos do play para uma velocidade (2× = metade do tempo). */
export function playDelay(speed) {
  return Math.round(PLAY_INTERVAL_MS / (SPEEDS.includes(speed) ? speed : 1));
}

/** Marcas do slider: [{ index, rule, left }] só para os eventos com cor; left em % (0–100). */
export function timelineMarks(trace) {
  const last = Math.max(trace.length - 1, 1);
  return trace
    .map((event, index) => ({ index, rule: ruleOf(event), left: (index / last) * 100 }))
    .filter((mark) => mark.rule !== null);
}

/** Mantém o passo dentro do trace (0 … último). */
export function clampStep(index, trace) {
  const n = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(Math.max(n, 0), Math.max(trace.length - 1, 0));
}

/** Que ação faz uma tecla: "prev" | "next" | "toggle" | "first" | "last" | null. */
export function keyAction(key) {
  switch (key) {
    case "ArrowLeft":
      return "prev";
    case "ArrowRight":
      return "next";
    case " ":
    case "Spacebar":
      return "toggle";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

// Ícones 24×24 com traço/preenchimento em currentColor.
const ICONS = {
  prev: '<path d="M15 6 9 12l6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>' +
    '<rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
};

function icon(id) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[id]}</svg>`;
}

/** Texto do slider para leitores de ecrã: "Passo 7 de 23: propagação unitária". */
export function stepLabel(trace, index) {
  const counter = t("timeline.counter", { i: index, n: Math.max(trace.length - 1, 0) });
  const type = trace[index]?.type;
  return type ? `${counter}: ${t(`timeline.event.${type}`)}` : counter;
}

// Classes por inteiro, para o Tailwind e o CSS as encontrarem.
const DOT_CLASS = {
  unit: "d-unit",
  branch: "d-branch",
  conflict: "d-conflict",
  sat: "d-sat",
  backtrack: "d-back",
  resolution: "d-res",
};
const LABEL_CLASS = {
  start: "text-text-subtle",
  branch: "text-ev-branch",
  conflict: "text-ev-conflict",
  backtrack: "text-ev-back",
  sat: "text-ev-sat",
  unsat: "text-ev-conflict",
};

// O rótulo de um momento-chave, ou null nos passos que não o são.
function labelKind(event) {
  if (event.type === "start") return "start";
  if (event.type === "branch" || event.type === "conflict" || event.type === "backtrack" || event.type === "sat") return event.type;
  if (event.type === "result" && event.sat === false) return "unsat";
  return null;
}

/**
 * Rótulos por baixo do slider: início, ramificações, conflitos, retrocessos e resultado, com pelo
 * menos `minGap` % entre eles para não se taparem. O resultado ganha sempre ao rótulo anterior.
 * Devolve [{ index, kind, left, literal }].
 */
export function timelineLabels(trace, { minGap = 10 } = {}) {
  const last = Math.max(trace.length - 1, 1);
  const labels = [];
  trace.forEach((event, index) => {
    const kind = labelKind(event);
    if (!kind) return;
    const left = (index / last) * 100;
    if (kind === "sat" || kind === "unsat") {
      // Alinhado à direita, o resultado ocupa para trás o dobro do espaço de um rótulo centrado.
      while (labels.length > 1 && left - labels.at(-1).left < minGap * 2) labels.pop();
    } else if (labels.length > 0 && left - labels.at(-1).left < minGap) {
      return;
    }
    labels.push({ index, kind, left, literal: event.literal ?? null });
  });
  return labels;
}

function labelText({ kind, literal }) {
  return t(`timeline.labels.${kind}`, { l: literal ? formatLiteral(literal) : "" });
}

/**
 * HTML da timeline (estrutura). O estado que muda a cada passo (valor do slider, contador,
 * play/pausa, botões desativados) é aplicado por syncTimeline(), sem redesenhar.
 */
export function renderTimeline(trace, { speed = 1, legend = "" } = {}) {
  const last = Math.max(trace.length - 1, 0);
  const dots = timelineMarks(trace)
    .map((m) => `<i class="tl-dot ${DOT_CLASS[m.rule]}" style="left: ${m.left.toFixed(3)}%"></i>`)
    .join("");
  const labels = timelineLabels(trace)
    .map((l) => `<span class="tl-label ${LABEL_CLASS[l.kind]}" style="left: ${l.left.toFixed(3)}%">${escapeHtml(labelText(l))}</span>`)
    .join("");
  const speedLabel = escapeHtml(t("timeline.speed"));
  const speeds = SPEEDS.map((s) => `<button type="button" data-speed="${s}" aria-pressed="${s === speed}">${s}×</button>`).join("");
  const stepButton = (role) => `<button type="button" class="btn" data-variant="ghost" data-size="icon" data-role="${role}"
    aria-label="${escapeHtml(t(`timeline.${role}`))}" title="${escapeHtml(t(`timeline.${role}`))} (${role === "prev" ? "←" : "→"})">${icon(role)}</button>`;

  return `
    <section class="timeline" aria-label="${escapeHtml(t("timeline.label"))}">
      <div class="tl">
        <div class="tl-buttons">
          ${stepButton("prev")}
          <button type="button" class="play" data-role="play"></button>
          ${stepButton("next")}
        </div>
        <div class="tl-track">
          <div class="tl-rail" aria-hidden="true">
            <span class="tl-fill"></span>
            ${dots}
            <span class="tl-tip" data-role="tip" hidden></span>
          </div>
          <input type="range" class="tl-range" data-role="range" min="0" max="${last}" step="1" value="0"
            aria-label="${escapeHtml(t("timeline.slider"))}">
          <div class="tl-labels" aria-hidden="true">${labels}</div>
        </div>
        <p class="tl-counter" data-role="counter"></p>
        <details class="dd end" data-sheet-title="${escapeHtml(t("timeline.menu"))}">
          <summary class="btn" data-variant="ghost" data-size="sm" data-role="speed" aria-label="${speedLabel}: ${speed}×" title="${speedLabel}">${speed}×</summary>
          <div class="menu dd-panel tl-menu">
            <p class="grp">${speedLabel}</p>
            <div class="seg" role="group" aria-label="${speedLabel}">${speeds}</div>
            <hr class="md:hidden">
            <button type="button" class="md:hidden" data-role="first">${escapeHtml(t("timeline.first"))}</button>
            <button type="button" class="md:hidden" data-role="last">${escapeHtml(t("timeline.last"))}</button>
            ${legend ? `<details class="tl-legend md:hidden"><summary>${escapeHtml(t("timeline.legend"))}</summary>${legend}</details>` : ""}
          </div>
        </details>
      </div>
    </section>`;
}

/** Aplica o estado { index, playing } aos elementos de uma timeline já desenhada. */
function syncTimeline(root, trace, { index, playing }) {
  const last = Math.max(trace.length - 1, 0);
  const $ = (role) => root.querySelector(`[data-role="${role}"]`);

  $("counter").textContent = t("timeline.counter", { i: index, n: last });
  const range = $("range");
  range.value = String(index);
  range.setAttribute("aria-valuetext", stepLabel(trace, index));
  root.querySelector(".timeline").style.setProperty("--progress", `${last === 0 ? 0 : (index / last) * 100}%`);

  $("prev").setAttribute("aria-disabled", String(index === 0));
  $("next").setAttribute("aria-disabled", String(index === last));

  const play = $("play");
  const label = t(playing ? "timeline.pause" : "timeline.play");
  play.innerHTML = icon(playing ? "pause" : "play");
  play.setAttribute("aria-label", label);
  play.title = `${label} (${t("timeline.spaceKey")})`;
  play.setAttribute("aria-pressed", String(playing));
}

// Teclas que não devem ser apanhadas quando o foco está num campo de texto ou num select.
export function isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && el.type !== "range";
}

/**
 * Monta a timeline em `container`.
 *   onChange(index, { animate, speed }): chamado sempre que o passo muda. animate = true só para
 *     a frente (seguinte e play); o resto mostra logo o estado, porque voltar atrás com animação
 *     baralhava a ordem causal. Pode devolver a sequência do passo ({ finished, cancel() }, ver
 *     js/ui/motion.js): o play espera por ela, e qualquer interação a meio cancela-a.
 *   store: armazenamento das prefs (por omissão o de storage.js), para a velocidade.
 *   legend: função que dá o HTML da legenda da árvore, para a folha «Reprodução» do mobile.
 * Devolve { setTrace(trace, index), go(index), play(), pause(), settle(), get index() }.
 * settle() cancela a sequência do passo, para mostrar logo o estado final.
 */
export function mountTimeline(container, { onChange = () => {}, store = defaultStorage, legend } = {}) {
  let trace = [];
  let index = 0;
  let playing = false;
  let timer = null;
  let run = null; // a sequência do passo atual
  let speed = store.getPrefs().speed;

  function sync() {
    if (!container.firstElementChild) return;
    syncTimeline(container, trace, { index, playing });
    if (container.querySelector(".tl-range:focus-visible")) showTip(index);
  }

  // Chip do passo por cima do slider: no hover e enquanto o slider tem o foco do teclado.
  function showTip(step) {
    const tip = container.querySelector('[data-role="tip"]');
    const rule = ruleOf(trace[step]);
    tip.hidden = rule === null;
    if (rule === null) return;
    tip.innerHTML = eventChipHtml(rule, `${step} · ${t(`events.${rule}`)}`);
    tip.style.setProperty("--left", `${(step / Math.max(trace.length - 1, 1)) * 100}%`);
  }

  function hideTip() {
    const tip = container.querySelector('[data-role="tip"]');
    if (tip) tip.hidden = true;
  }

  function draw() {
    const focused = container.contains(document.activeElement) ? document.activeElement.dataset.role : null;
    container.innerHTML = renderTimeline(trace, { speed, legend: legend?.() });
    sync();
    if (focused) container.querySelector(`[data-role="${focused}"]`)?.focus();
  }

  function go(target, { animate = false } = {}) {
    const next = clampStep(target, trace);
    if (next === index) return;
    settle();
    index = next;
    sync();
    run = onChange(index, { animate, speed }) ?? null;
  }

  function settle() {
    run?.cancel();
    run = null;
  }

  function stopTimer() {
    clearTimeout(timer);
    timer = null;
  }

  // O passo seguinte chega ao fim do intervalo, mas nunca antes de acabar a sequência do passo atual.
  function schedule() {
    const scheduled = setTimeout(async () => {
      await run?.finished;
      if (timer === scheduled) tick();
    }, playDelay(speed));
    timer = scheduled;
  }

  // Parar sem cancelar: no último passo, o play acaba mas a sequência desse passo ainda corre.
  function stopPlaying() {
    stopTimer();
    playing = false;
    sync();
  }

  function tick() {
    go(index + 1, { animate: true });
    if (index >= trace.length - 1) stopPlaying();
    else schedule();
  }

  function play() {
    if (playing || trace.length < 2) return;
    playing = true;
    // No fim, o play recomeça do início.
    if (index >= trace.length - 1) go(0);
    sync();
    schedule();
  }

  function pause() {
    stopTimer();
    settle();
    if (playing) stopPlaying();
  }

  // Navegação manual pausa o play (o aluno quer controlar o passo).
  function manual(action) {
    pause();
    if (action === "prev") go(index - 1);
    else if (action === "next") go(index + 1, { animate: true });
    else if (action === "first") go(0);
    else if (action === "last") go(trace.length - 1);
  }

  function toggle() {
    if (playing) pause();
    else play();
  }

  container.addEventListener("click", (event) => {
    const role = event.target.closest("[data-role]")?.dataset.role;
    if (role === "play") toggle();
    else if (role === "prev" || role === "next") manual(role);
    else if (role === "first" || role === "last") {
      closeMenu(event.target.closest("details"));
      manual(role);
    }
    const button = event.target.closest("[data-speed]");
    if (button) setSpeed(Number(button.dataset.speed));
  });

  container.addEventListener("pointermove", (event) => {
    const rail = event.target.closest?.(".tl-track")?.querySelector(".tl-rail");
    if (!rail) return;
    const box = rail.getBoundingClientRect();
    showTip(clampStep(Math.round(((event.clientX - box.left) / box.width) * (trace.length - 1)), trace));
  });
  container.addEventListener("pointerout", (event) => {
    if (event.target.closest?.(".tl-track") && !event.relatedTarget?.closest?.(".tl-track")) hideTip();
  });
  container.addEventListener("focusin", (event) => {
    if (event.target.matches(".tl-range:focus-visible")) showTip(index);
  });
  container.addEventListener("focusout", (event) => {
    if (event.target.matches(".tl-range")) hideTip();
  });

  container.addEventListener("input", (event) => {
    if (event.target.dataset.role !== "range") return;
    pause();
    go(Number(event.target.value));
  });

  function setSpeed(next) {
    speed = next;
    store.setPrefs({ speed });
    const summary = container.querySelector('[data-role="speed"]');
    summary.textContent = `${speed}×`;
    summary.setAttribute("aria-label", `${t("timeline.speed")}: ${speed}×`);
    container.querySelectorAll("[data-speed]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === speed));
    });
    // Se está a tocar, o próximo passo já usa a velocidade nova.
    if (playing) {
      stopTimer();
      schedule();
    }
  }

  document.addEventListener("keydown", (event) => {
    if (!container.firstElementChild || event.altKey || event.ctrlKey || event.metaKey) return;
    const action = keyAction(event.key);
    if (!action || isTypingTarget(event.target)) return;
    const tag = event.target?.tagName;
    // Num botão ou <summary>, o espaço já o carrega; no slider, as setas/Home/End já mexem no valor (evento input).
    if (action === "toggle" && (tag === "BUTTON" || tag === "A" || tag === "SUMMARY")) return;
    if (action !== "toggle" && event.target?.dataset?.role === "range") return;
    event.preventDefault();
    if (action === "toggle") toggle();
    else manual(action);
  });

  mountMenus(container);
  onLangChange(() => {
    settle();
    draw();
  });

  return {
    setTrace(newTrace, startIndex = 0) {
      pause();
      trace = newTrace;
      index = clampStep(startIndex, trace);
      draw();
    },
    go: (target) => {
      pause();
      go(target);
    },
    play,
    pause,
    settle,
    get index() {
      return index;
    },
    get playing() {
      return playing;
    },
  };
}
