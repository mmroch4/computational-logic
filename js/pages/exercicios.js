// Página Exercícios: lista dos exercícios (com estado e dificuldade) e "Gerar novo".
import { mountLayout } from "../ui/layout.js";
import { onLangChange } from "../ui/i18n.js";
import { mountExercises } from "../ui/exercise-list.js";
import { storage } from "../ui/storage.js";

mountLayout();
const exercises = mountExercises(document.getElementById("exercises"), { storage, search: location.search });
onLangChange(() => exercises.refresh());
