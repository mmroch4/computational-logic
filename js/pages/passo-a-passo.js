// Página Passo a passo: escolhe-se um sequente, escrito ou dos exemplos, e o player reproduz a prova gerada.
// Com prova aberta, a escolha recolhe-se atrás de «Mudar de sequente». Um sequente inválido mostra o
// contraexemplo no lugar do player.
//
// O endereço acompanha o player, ?s=…&step=N&view=fitch|tree, e o último fica guardado: sem link, volta a
// última prova deste browser. Um link manda sempre. Um link que não dê prova mantém o endereço, para se
// poder corrigir; um sequente submetido aqui passa para o endereço mesmo sem prova.
import { formatSequent } from "../core/sequent.js";
import { ruleSet } from "../core/rules.js";
import { decodeStepLink, encodeStepLink } from "../core/step-link.js";
import { mountExamplesMenu } from "../ui/examples-menu.js";
import { t } from "../ui/i18n.js";
import { escapeHtml, mountLayout } from "../ui/layout.js";
import { msgHtml } from "../ui/message.js";
import { mountSequentInput } from "../ui/sequent-input.js";
import { createSolverWorker } from "../ui/solver-worker.js";
import { mountStepPlayer, outcomeHtml } from "../ui/step-player.js";
import { storage } from "../ui/storage.js";

mountLayout();

const mainEl = document.getElementById("main");
const chooseEl = document.getElementById("step-choose");
const emptyEl = document.getElementById("step-empty");
const changeRowEl = document.getElementById("step-change-row");
const changeEl = document.getElementById("step-change");
const messageEl = document.getElementById("step-message");
const playerEl = document.getElementById("step-player");

const worker = createSolverWorker();
let player = null; // só se monta uma vez, porque liga teclas ao `document`
let shownGoal = null;
let lastRequest = 0;

function say(kind, key, params = {}) {
  messageEl.innerHTML = msgHtml(kind, escapeHtml(t(key, params)));
}

function setChoosing(choosing) {
  chooseEl.hidden = !choosing;
  changeEl.setAttribute("aria-expanded", String(choosing));
}

function setPlayerOpen(open) {
  mainEl.classList.toggle("page-empty", !open);
  mainEl.querySelector("h1").classList.toggle("sr-only", open);
  mainEl.querySelector(".page-empty__lead").hidden = open;
  document.body.classList.toggle("has-timeline", open);
  playerEl.hidden = !open;
  changeRowEl.hidden = !open;
  setChoosing(!open);
}

function writeAddress(goal, state) {
  const query = encodeStepLink(goal, state);
  history.replaceState(null, "", query === "" ? location.pathname : `${location.pathname}?${query}`);
  return query;
}

function showProof(goal, proof, state) {
  // A escolha vai esconder-se: o foco não pode ficar perdido dentro dela.
  const moveFocus = chooseEl.contains(document.activeElement);
  shownGoal = goal;
  setPlayerOpen(true);
  player ??= mountStepPlayer(playerEl, {
    onState(next) {
      const query = writeAddress(shownGoal, next);
      if (query === "") storage.clearLastQuery("step");
      else storage.setLastQuery("step", query);
    },
  });
  player.load(goal, proof, state);
  if (moveFocus) changeEl.focus();
}

function showNoProof(html) {
  player?.clear();
  shownGoal = null;
  setPlayerOpen(false);
  messageEl.innerHTML = html;
}

/** `submitted`: veio desta página, e não de um link; o endereço passa a ser o do sequente. */
async function open({ goal, step = 0, view = player?.view ?? "fitch" }, { submitted = false } = {}) {
  lastRequest += 1;
  const request = lastRequest;
  emptyEl.hidden = true;
  storage.addToHistory(formatSequent(goal));
  examples.refresh();
  say("info", "player.loading");
  const result = await worker.solve(goal, { rules: ruleSet("completo") }).promise;
  if (request !== lastRequest) return;
  const html = outcomeHtml(result, goal);
  if (html === "") {
    messageEl.replaceChildren();
    showProof(goal, result.proof, { step, view });
    return;
  }
  showNoProof(html);
  if (submitted) writeAddress(goal, {});
}

const input = mountSequentInput(document.getElementById("sequent-input"), {
  onSubmit: (goal) => open({ goal }, { submitted: true }),
});

// Aqui não há prova a meio a perder: escolher um exemplo abre-o logo.
const examples = mountExamplesMenu(document.getElementById("examples-menu"), {
  onSelect(sequent) {
    input.setValue(sequent);
    input.submit();
  },
});

document.getElementById("step-start").addEventListener("click", () => input.submit());

changeEl.addEventListener("click", () => {
  const choosing = chooseEl.hidden;
  setChoosing(choosing);
  if (choosing) input.focus();
});

function openLink() {
  const fromLink = decodeStepLink(location.search);
  // O que ficou guardado foi escrito por este site: se já não se ler, não é um link com erro para mostrar.
  const link = fromLink.status === "none" ? decodeStepLink(storage.getLastQuery("step")) : fromLink;
  if (link.status === "ok") {
    input.setValue(formatSequent(link.goal));
    open(link);
  } else if (fromLink.status === "invalid") {
    emptyEl.hidden = true;
    if (fromLink.sequent !== null) input.setValue(fromLink.sequent);
    if (fromLink.error.code === "badSequent") input.submit();
    say("error", `share.errors.${fromLink.error.code}`, fromLink.error.params);
  }
}

openLink();
