// Entry da página Provar: o layout comum e o campo de sequente, com o menu de exemplos.
import { mountExamplesMenu } from "../ui/examples-menu.js";
import { mountLayout } from "../ui/layout.js";
import { mountSequentInput } from "../ui/sequent-input.js";

mountLayout();

const input = mountSequentInput(document.getElementById("sequent-input"));
mountExamplesMenu(document.getElementById("examples-menu"), { onSelect: input.setValue });
