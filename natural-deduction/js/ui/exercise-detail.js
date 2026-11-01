// Página Exercícios, um exercício aberto: o enunciado, as regras permitidas e o modo. Numa prova, o editor
// e a ajuda de Provar, com as regras do exercício; em «encontra o passo errado», o desafio. Resolver guarda
// o progresso e oferece o exercício seguinte.
//
// A prova não se guarda: voltar ao exercício começa de novo. Uma prova que veio da solução automática não
// conta para o progresso, até se recarregar a página.
//
// As funções *Html são puras; só mountExerciseDetail() mexe no DOM e no storage.
import { createEditor } from "../core/editor.js";
import { entryStatus, nextExercise, ruleDetails } from "../core/exercise-page.js";
import { checkAttempt, exerciseGoal, recordMark } from "../core/exercises.js";
import { activeRules } from "../core/user-rules.js";
import { mountAssistPanel } from "./assist-panel.js";
import { exerciseHref, ruleNames, sequentHtml } from "./exercise-list.js";
import { mountFindError } from "./find-error.js";
import { spokenProse, readAsHtml } from "./fitch-view.js";
import { onLangChange, pagePath, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { mountProofEditor } from "./proof-editor.js";
import { createUserRuleStore } from "./user-rules-store.js";

const BACK_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 6-6 6 6 6"/></svg>';

const proseHtml = (text) => readAsHtml(escapeHtml(text), spokenProse(text));

const listHref = (mode) => pagePath("exercises") + (mode === "proof" ? "" : `?mode=${mode}`);

const backHtml = (mode) => (
  `<a class="exercise-detail__back" href="${listHref(mode)}">${BACK_ICON}${escapeHtml(t("exercises.back"))}</a>`
);

/** O que se pode usar. A nota das regras próprias só interessa a quem as tem. */
export function rulesHtml(exercise, hasUserRules) {
  const { allowed, proves, userRules } = ruleDetails(exercise);
  const items = allowed.map((id) => `<li>${escapeHtml(ruleNames([id]))}</li>`).join("");
  const label = escapeHtml(t("exercises.rulesLabel"));
  const provesNote = proves.length > 0
    ? `<p class="exercise-rules__note">${proseHtml(t("exercises.provesRule", { rules: ruleNames(proves) }))}</p>`
    : "";
  const userNote = hasUserRules
    ? `<p class="exercise-rules__note">${escapeHtml(t(`exercises.userRules.${userRules ? "on" : "off"}`))}</p>`
    : "";
  return `<div class="exercise-rules"><p class="exercise-rules__label" id="exercise-rules-label">${label}</p>`
    + `<ul class="exercise-rules__list" role="list" aria-labelledby="exercise-rules-label">${items}</ul>${provesNote}${userNote}</div>`;
}

/** As pistas do autor, fechadas: quem quiser tentar sozinho não as vê sem querer. */
export function authorHintsHtml({ hints = [] }) {
  if (hints.length === 0) return "";
  const items = hints.map((key) => `<li>${proseHtml(t(`exercises.hints.${key}`))}</li>`).join("");
  return `<details class="exercise-hints"><summary>${escapeHtml(t("exercises.hintsLabel"))}</summary><ol>${items}</ol></details>`;
}

/** O cabeçalho: voltar, nível, estado guardado e enunciado. `status` vem de `entryStatus`. */
export function detailHeadHtml({ mode, exercise, status, hasUserRules }) {
  const title = mode === "proof" ? sequentHtml(exercise.sequent) : escapeHtml(t("exercises.modes.findError"));
  const titleClass = mode === "proof" ? "exercise-detail__title exercise-detail__title--sequent" : "exercise-detail__title";
  const body = mode === "proof" ? rulesHtml(exercise, hasUserRules) + authorHintsHtml(exercise) : "";
  return `${backHtml(mode)}<p class="exercise-detail__eyebrow"><span>${escapeHtml(t("exercises.level", { level: exercise.level }))}</span>`
    + `<span data-status="${status}">${escapeHtml(t(`exercises.status.${status}`))}</span></p>`
    + `<h1 class="${titleClass}">${title}</h1>${body}`;
}

/** Depois de resolver: o que contou e para onde ir. `outcome`: "solved", "solvedWithUserRules" ou "assisted". */
export function resultHtml(mode, outcome, next) {
  const kind = outcome === "assisted" ? "info" : "ok";
  const link = next
    ? `<a class="btn" href="${exerciseHref(next.id)}">${escapeHtml(t("exercises.next"))}</a>`
    : `<a class="btn" href="${listHref(mode)}">${escapeHtml(t("exercises.back"))}</a>`;
  return msgHtml(kind, escapeHtml(t(`exercises.result.${outcome}`))) + link;
}

export function notFoundHtml() {
  return `<div class="exercise-detail">${backHtml("proof")}${msgHtml("warn", escapeHtml(t("exercises.notFound")))}</div>`;
}

/** Monta a página de `entry` ({ mode, exercise }, de `findEntry`) em `container`. */
export function mountExerciseDetail(container, { entry, storage, userRules = createUserRuleStore() }) {
  const { mode, exercise } = entry;
  container.innerHTML = '<div class="exercise-detail"><div class="exercise-detail__head"></div>'
    + '<div class="exercise-detail__play"></div><div class="exercise-result" role="status"></div></div>';
  const head = container.querySelector(".exercise-detail__head");
  const play = container.querySelector(".exercise-detail__play");
  const result = container.querySelector(".exercise-result");
  /** O último resultado, para o voltar a desenhar se o idioma mudar. */
  let outcome = null;

  function paintHead() {
    const status = entryStatus(storage.getProgress(exercise.id));
    head.innerHTML = detailHeadHtml({ mode, exercise, status, hasUserRules: userRules.list().length > 0 });
  }

  function paintResult() {
    const next = outcome && nextExercise(mode, storage.getAllProgress(), exercise.id);
    const html = outcome ? resultHtml(mode, outcome, next) : "";
    // Reescrever o mesmo texto numa região viva faria o leitor de ecrã repeti-lo.
    if (result.dataset.painted !== html) {
      result.innerHTML = html;
      result.dataset.painted = html;
    }
  }

  function record(mark) {
    storage.setProgress(exercise.id, recordMark(storage.getProgress(exercise.id), mark));
    outcome = mark;
    paintHead();
    paintResult();
  }

  function mountProof() {
    play.innerHTML = '<div id="proof-editor"></div><div id="proof-assist"></div>';
    const goal = exerciseGoal(exercise);
    let assisted = false;

    function onProofChange() {
      assist.reset();
      const { mark } = checkAttempt(exercise, editor.getProof(), userRules.list());
      if (!mark) outcome = null;
      else if (assisted) outcome = "assisted";
      else {
        record(mark);
        return;
      }
      paintResult();
    }

    const editor = mountProofEditor(play.querySelector("#proof-editor"), { ...activeRules(exercise, userRules.list()), onProofChange });
    const source = {
      ...editor,
      useProof(proof) {
        assisted = true;
        editor.useProof(proof);
      },
    };
    const assist = mountAssistPanel(play.querySelector("#proof-assist"), { source });
    // `open`, e não `start`: ao abrir a página, o teclado do telemóvel não deve tapar o enunciado.
    editor.open(goal, createEditor(goal).proof);
  }

  paintHead();
  if (mode === "proof") mountProof();
  else mountFindError(play, { puzzle: exercise, onSolved: record });
  onLangChange(() => {
    paintHead();
    paintResult();
  });
}
