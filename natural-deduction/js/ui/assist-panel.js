// Painel de ajuda da prova: dicas em 3 níveis, solução com cancelamento e contraexemplo. A procura
// corre no Worker, e o que se mostra sai de core/assist.js.
//
// `createAssist` trata dos pedidos, sem DOM; `assistBodyHtml` é puro; só mountAssistPanel() mexe no DOM.
// `source` é o editor: { getProof(), getGoal(), getRules(), useProof(proof) }.
import {
  IDLE, canRevealMore, errorKey, panelFromResult, revealMore, searching,
} from "../core/assist.js";
import { format } from "../core/formula.js";
import { valuationHtml } from "./counterexample.js";
import { fitchHtml, readAsHtml, spokenProse } from "./fitch-view.js";
import { onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { messageText } from "./proof-editor.js";
import { createSolverWorker } from "./solver-worker.js";

const LEVEL_NAMES = ["strategy", "rule", "exact"];

const BULB = '<path d="M15 14c.2-1 .7-1.7 1.5-2.5A5 5 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>';
const SPARKLES = '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>';
const ic = (path) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;

const button = (action, label, variant = "outline", path = null) => (
  `<button type="button" class="btn" data-variant="${variant}" data-assist="${action}">${path ? ic(path) : ""}${escapeHtml(label)}</button>`
);

function hintHtml({ target, levels, revealed, ...panel }) {
  const targetText = target ? t("hints.target", { target: format(target) }) : "";
  const heading = target
    ? `<p class="assist__target">${readAsHtml(escapeHtml(targetText), spokenProse(targetText))}</p>`
    : "";
  const items = levels.slice(0, revealed).map((level, index) => (
    `<li class="assist__level"><strong>${escapeHtml(t(`assist.levels.${LEVEL_NAMES[index]}`))}</strong>`
    + `${escapeHtml(messageText(level))}</li>`
  )).join("");
  const more = canRevealMore({ ...panel, revealed }) ? button("more", t("assist.more")) : "";
  return `${heading}<ol class="assist__levels">${items}</ol>${more}`;
}

function invalidHtml(panel) {
  const text = msgHtml("warn", escapeHtml(t(panel.hasPremises ? "assist.invalid" : "assist.invalidNoPremises")));
  return text + valuationHtml(panel);
}

function solutionHtml({ proof, start, reason }) {
  const kind = start === "restart" ? "warn" : "ok";
  const why = reason ? `<p class="assist__note">${escapeHtml(messageText(reason))}</p>` : "";
  return msgHtml(kind, escapeHtml(t(`assist.solution.${start}`))) + why + fitchHtml(proof)
    + button("use", t("assist.use"), "primary");
}

function failedHtml({ error }) {
  // O tempo esgotado e o limite de passos não são erros de quem usa: dizem só que a procura parou.
  const kind = error.code === "workerFailed" || error.code === "unverifiedProof" ? "error" : "warn";
  return msgHtml(kind, escapeHtml(t(errorKey(error), error.params)));
}

const VIEWS = {
  idle: () => `<p class="assist__empty">${escapeHtml(t("assist.empty"))}</p>`,
  searching: ({ task }) => msgHtml("info", escapeHtml(t(`assist.searching.${task}`))) + button("cancel", t("assist.cancel")),
  hint: hintHtml,
  solution: solutionHtml,
  invalid: invalidHtml,
  done: () => msgHtml("ok", escapeHtml(t("assist.done"))),
  noProof: () => msgHtml("warn", escapeHtml(t("solver.noProof"))),
  cancelled: () => msgHtml("info", escapeHtml(t("solver.errors.cancelled"))),
  failed: failedHtml,
};

/** O interior do painel, para um estado de core/assist.js. */
export const assistBodyHtml = (panel) => VIEWS[panel.view](panel);

/**
 * Os pedidos ao Worker. `onChange(panel)` corre a cada mudança de estado. Só interessa o último pedido:
 * a resposta de um pedido substituído, ou de uma prova que entretanto mudou, é ignorada.
 */
export function createAssist({ source, worker, onChange }) {
  let panel = IDLE;
  let running = null;

  function set(next) {
    panel = next;
    onChange(panel);
  }

  /** Larga a tarefa em curso sem dizer nada: quem a pediu já não quer saber dela. */
  function drop() {
    const job = running;
    running = null;
    job?.cancel();
  }

  function request(task) {
    drop();
    const proof = source.getProof();
    const goal = source.getGoal();
    const options = source.getRules();
    const job = task === "hint" ? worker.hint(proof, goal, options) : worker.complete(proof, goal, options);
    running = job;
    set(searching(task));
    job.promise.then((result) => {
      if (running !== job) return;
      running = null;
      set(panelFromResult(result, goal));
    });
  }

  return {
    getPanel: () => panel,
    /** Uma dica já pedida para esta prova só revela o nível seguinte. */
    askHint() {
      if (panel.view === "hint") set(revealMore(panel));
      else request("hint");
    },
    askSolution: () => request("solve"),
    more: () => set(revealMore(panel)),
    cancel: () => running?.cancel(),
    use() {
      if (panel.view === "solution") source.useProof(panel.proof);
    },
    reset() {
      drop();
      if (panel !== IDLE) set(IDLE);
    },
  };
}

/** Monta o painel em `container`, que fica vazio até `reset()`: só há ajuda com uma prova aberta. */
export function mountAssistPanel(container, { source, worker = createSolverWorker() }) {
  const assist = createAssist({ source, worker, onChange: paintBody });
  const ACTIONS = { hint: assist.askHint, solve: assist.askSolution, more: assist.more, cancel: assist.cancel, use: assist.use };

  function paintBody(panel) {
    const body = container.querySelector(".assist__body");
    if (!body) return;
    const hadFocus = body.contains(document.activeElement);
    body.innerHTML = assistBodyHtml(panel);
    if (hadFocus) (body.querySelector("[data-assist]") ?? container.querySelector('[data-assist="hint"]')).focus();
  }

  function build() {
    container.innerHTML = `<div class="assist__actions" role="group" aria-label="${escapeHtml(t("assist.label"))}">`
      + `${button("hint", t("assist.hint"), "outline", BULB)}${button("solve", t("assist.solve"), "outline", SPARKLES)}</div>`
      + '<div class="assist__body" aria-live="polite"></div>';
    paintBody(assist.getPanel());
  }

  container.classList.add("assist");
  container.addEventListener("click", ({ target }) => {
    const action = target.closest("[data-assist]");
    if (action) ACTIONS[action.dataset.assist]();
  });
  onLangChange(() => {
    if (container.childElementCount > 0) build();
  });

  return {
    reset() {
      if (container.childElementCount === 0) build();
      assist.reset();
    },
  };
}
