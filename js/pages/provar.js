// Entry da página Provar: o layout comum, o campo de sequente, com o menu de exemplos, o editor, a ajuda e
// a árvore.
import { formatSequent } from "../core/sequent.js";
import { mountAssistPanel } from "../ui/assist-panel.js";
import { mountExamplesMenu } from "../ui/examples-menu.js";
import { mountLayout } from "../ui/layout.js";
import { mountProofEditor } from "../ui/proof-editor.js";
import { mountSequentInput } from "../ui/sequent-input.js";
import { mountTreeView } from "../ui/tree-view.js";

mountLayout();

const editor = mountProofEditor(document.getElementById("proof-editor"), {
  onGoalChange: (goal) => input.setValue(formatSequent(goal)),
  onProofChange: () => {
    assist.reset();
    tree.update();
  },
});

const assist = mountAssistPanel(document.getElementById("proof-assist"), { source: editor });
const tree = mountTreeView(document.getElementById("proof-tree"), { source: editor, onSelect: editor.highlightLine });

const input = mountSequentInput(document.getElementById("sequent-input"), {
  onSubmit: (sequent) => {
    document.getElementById("proof-empty").hidden = true;
    editor.start(sequent);
  },
});

mountExamplesMenu(document.getElementById("examples-menu"), { onSelect: input.setValue });
document.getElementById("start-proof").addEventListener("click", () => input.submit());
