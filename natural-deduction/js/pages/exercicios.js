// Entry da página Exercícios: a lista ou, com `?ex=<id>`, o exercício aberto.
import { findEntry } from "../core/exercise-page.js";
import { mountExerciseDetail, notFoundHtml } from "../ui/exercise-detail.js";
import { mountExerciseList } from "../ui/exercise-list.js";
import { mountLayout } from "../ui/layout.js";
import { storage } from "../ui/storage.js";

mountLayout();

const container = document.getElementById("exercises");
const id = new URLSearchParams(location.search).get("ex");
const entry = id === null ? null : findEntry(id);

if (entry) mountExerciseDetail(container, { entry, storage });
else if (id === null) mountExerciseList(container, { storage, search: location.search });
else container.innerHTML = notFoundHtml();
