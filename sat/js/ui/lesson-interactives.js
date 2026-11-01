// Interativos da lição (Aprender): cada secção pode ter um, e o texto delas está no aprender.html.
// Vêm num módulo à parte porque a lição é texto: o primeiro desenho não fica à espera deles.
import { onLangChange } from "./i18n.js";
import { mountSatExplorer } from "./sat-explorer.js";
import { mountNotationConverter } from "./notation-converter.js";
import { mountPropagationLab, renderRulesDiagram } from "./propagation-lab.js";
import { renderPseudocode } from "./pseudocode-view.js";
import { mountDllPlayer } from "./dll-player.js";
import { mountSelectCompare } from "./select-compare.js";
import { renderHistoryFigure } from "./history-view.js";
import { mountDpPlayer } from "./dp-player.js";
import { mountQuiz } from "./quiz-view.js";
import { storage } from "./storage.js";

// Dá a vez ao browser: montar tudo de seguida prendia a página numa tarefa longa.
const nextTask = () => new Promise((resolve) => setTimeout(resolve));

// Um desenho estático também tem de voltar a ser feito ao mudar de idioma.
function drawn(id, draw) {
  const el = document.getElementById(id);
  const refresh = () => el && (el.innerHTML = draw());
  refresh();
  return refresh;
}

/** Cada passo monta um interativo e devolve o que o atualiza quando o idioma muda. */
const STEPS = [
  () => mountSatExplorer(document.getElementById("sat-explorer")).refresh,
  () => mountNotationConverter(document.getElementById("notation-converter")).refresh,
  () => drawn("propagation-rules", renderRulesDiagram),
  () => mountPropagationLab(document.getElementById("propagation-lab")).refresh,
  // §4: o pseudocódigo (sem linha realçada) e o mini-player com o fluxograma.
  () => drawn("dll-pseudocode", () => renderPseudocode({ rule: null, lines: [], explanation: null }, { headingLevel: 3 })),
  () => mountDllPlayer(document.getElementById("dll-player")).refresh,
  () => mountSelectCompare(document.getElementById("select-compare")).refresh,
  // §6: o DP de 1960 (eliminação por resolução): figura do exemplo 2 e o player com a comparação com o DLL.
  () => drawn("history-figure", renderHistoryFigure),
  () => mountDpPlayer(document.getElementById("dp-player")).refresh,
  // §7: quiz com o melhor resultado guardado em progress.
  () => mountQuiz(document.getElementById("quiz-box"), { storage }).refresh,
];

/** Monta os interativos, um por tarefa, e acompanha o idioma (também o que muda a meio da montagem). */
export async function mountLessonInteractives() {
  const refreshers = [];
  onLangChange(() => refreshers.forEach((refresh) => refresh()));
  for (const step of STEPS) {
    refreshers.push(step());
    await nextTask();
  }
}
