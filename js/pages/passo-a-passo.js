// Página Passo a passo: abre o sequente do link no passo e na vista dele, ?s=…&step=N&view=fitch|tree, e o
// endereço acompanha o player. Sem link fica o estado vazio. Um link inválido ou um sequente sem prova
// mantêm o endereço, para se poder corrigir.
import { decodeStepLink, encodeStepLink } from "../core/step-link.js";
import { ruleSet } from "../core/rules.js";
import { t } from "../ui/i18n.js";
import { escapeHtml, mountLayout } from "../ui/layout.js";
import { msgHtml } from "../ui/message.js";
import { createSolverWorker } from "../ui/solver-worker.js";
import { mountStepPlayer, solveOutcome } from "../ui/step-player.js";

mountLayout();

const mainEl = document.getElementById("main");
const messageEl = document.getElementById("step-message");
const playerEl = document.getElementById("step-player");

function say(kind, key, params = {}) {
  messageEl.innerHTML = msgHtml(kind, escapeHtml(t(key, params)));
}

function showPlayer() {
  messageEl.replaceChildren();
  mainEl.classList.remove("page-empty");
  mainEl.querySelector("h1").classList.add("sr-only");
  mainEl.querySelector(".page-empty__lead").hidden = true;
  document.body.classList.add("has-timeline");
  playerEl.hidden = false;
}

async function open({ goal, step, view }) {
  say("info", "player.loading");
  const result = await createSolverWorker().solve(goal, { rules: ruleSet("completo") }).promise;
  const outcome = solveOutcome(result);
  if (outcome) {
    say(outcome.kind, outcome.key, outcome.params);
    return;
  }
  showPlayer();
  const player = mountStepPlayer(playerEl, {
    onState(state) {
      const query = encodeStepLink(goal, state);
      if (query !== "") history.replaceState(null, "", `${location.pathname}?${query}`);
    },
  });
  player.load(goal, result.proof, { step, view });
}

const link = decodeStepLink(location.search);
if (link.status !== "none") mainEl.querySelector(".empty-state").hidden = true;
if (link.status === "invalid") say("error", `share.errors.${link.error.code}`, link.error.params);
if (link.status === "ok") open(link);
