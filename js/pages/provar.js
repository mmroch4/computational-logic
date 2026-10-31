// Entry da página Provar: o layout comum, o campo de sequente, com o menu de exemplos, o editor, a ajuda, a
// árvore e a partilha. Um link manda sempre; sem ele, volta a última prova aberta neste browser.
import { formatSequent } from "../core/sequent.js";
import { decodeShare } from "../core/share.js";
import { mountAssistPanel } from "../ui/assist-panel.js";
import { mountExamplesMenu } from "../ui/examples-menu.js";
import { mountLayout } from "../ui/layout.js";
import { mountProofEditor } from "../ui/proof-editor.js";
import { createUrlSync, mountPrintSheet, mountProofShare, shareErrorHtml } from "../ui/proof-share.js";
import { mountSequentInput } from "../ui/sequent-input.js";
import { storage } from "../ui/storage.js";
import { mountTreeView } from "../ui/tree-view.js";

mountLayout();

const editor = mountProofEditor(document.getElementById("proof-editor"), {
  onGoalChange: (goal) => input.setValue(formatSequent(goal)),
  onProofChange: () => {
    assist.reset();
    tree.update();
    share.show();
    sync.schedule();
  },
});

const assist = mountAssistPanel(document.getElementById("proof-assist"), { source: editor });
const tree = mountTreeView(document.getElementById("proof-tree"), { source: editor, onSelect: editor.highlightLine });
const sync = createUrlSync(editor);
const share = mountProofShare(document.getElementById("proof-share"), { source: editor, sync });
mountPrintSheet(editor);

const shareError = document.getElementById("share-error");

/** Põe o sequente no histórico e tira o que estava à espera de uma prova. */
function noteOpened(goal) {
  shareError.innerHTML = "";
  document.getElementById("proof-empty").hidden = true;
  storage.addToHistory(formatSequent(goal));
  examples.refresh();
}

const input = mountSequentInput(document.getElementById("sequent-input"), {
  onSubmit: (sequent) => {
    noteOpened(sequent);
    editor.start(sequent);
  },
});

const examples = mountExamplesMenu(document.getElementById("examples-menu"), { onSelect: input.setValue });
document.getElementById("start-proof").addEventListener("click", () => input.submit());

function openFromLink() {
  const fromLink = decodeShare(location.search);
  // O que ficou guardado foi escrito por este site: se já não se ler, não é um link com erro para mostrar.
  const fromStorage = fromLink.status === "none" ? decodeShare(storage.getLastQuery("prove")) : null;
  const opened = fromStorage ?? fromLink;
  if (opened.status === "ok") {
    input.setValue(formatSequent(opened.goal));
    noteOpened(opened.goal);
    editor.open(opened.goal, opened.proof);
  } else if (fromLink.status === "invalid") {
    if (fromLink.sequent !== null) input.setValue(fromLink.sequent);
    if (fromLink.error.code === "badSequent") input.submit();
    shareError.innerHTML = shareErrorHtml(fromLink.error);
  }
}

openFromLink();
