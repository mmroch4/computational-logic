// Figuras de uma regra na lição: o esquema, quando se usa, um exemplo e o erro comum. O erro comum também
// existe sozinho, para os enganos que não são de uma regra só.
//
// As regras derivadas têm figura própria: o esquema, quando se usa e a prova de cada forma, lida do catálogo.
//
// `lessonMistakeHtml`, `lessonRuleHtml` e `lessonDerivedHtml` são puras. Marca-se no `aprender.html` com
// `data-lesson-rule="andIntro"`, `data-lesson-mistake="closedLine"` ou `data-lesson-derived="deMorgan"`.
import { LESSON_DERIVED, LESSON_RULES, lessonDerivedForms, lessonMistake, lessonProof, ruleSchemaLines } from "../core/lesson.js";
import { ruleLabel } from "../core/rules.js";
import { formatSequent } from "../core/sequent.js";
import { fitchHtml, readAsHtml, spokenProse } from "./fitch-view.js";
import { LOCALES, getLang, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { lessonFigureHtml } from "./lesson-figure.js";
import { msgHtml } from "./message.js";

const proseHtml = (text) => readAsHtml(escapeHtml(text), spokenProse(text));

const sequentHtml = (goal) => `<p class="lesson-rule__sequent">${proseHtml(formatSequent(goal))}</p>`;

/** A prova errada, só com a linha do erro assinalada, seguida da explicação. */
function mistakeBodyHtml(id) {
  const { goal, proof, line } = lessonMistake(id);
  const states = proof.lines.map((_, index) => (index + 1 === line ? "error" : null));
  const headline = t("learn.ruleFigure.wrongLine", { line });
  return (
    `${sequentHtml(goal)}<div class="lesson-proof__view">${fitchHtml(proof, { states })}</div>` +
    msgHtml("warn", `<b>${escapeHtml(headline)}</b> ${proseHtml(t(`learn.mistakes.${id}`))}`)
  );
}

function schemaHtml(ruleId) {
  const lines = ruleSchemaLines(ruleId).map((line) => `<li>${proseHtml(line)}</li>`).join("");
  return `<ul class="lesson-rule__schema" role="list">${lines}</ul>`;
}

/** A figura da regra `id` de `LESSON_RULES`. */
export function lessonRuleHtml(id) {
  const { rule, example, mistake } = LESSON_RULES[id];
  const { goal, proof } = lessonProof(example);
  const label = ruleLabel(rule, LOCALES[getLang()].rules.labels);
  const body =
    `${schemaHtml(rule)}<p class="lesson-rule__when">${proseHtml(t(`learn.rules.${id}.when`))}</p>` +
    `<h3 class="lesson-rule__heading">${escapeHtml(t("learn.ruleFigure.example"))}</h3>` +
    `${sequentHtml(goal)}<div class="lesson-proof__view">${fitchHtml(proof)}</div>` +
    `<h3 class="lesson-rule__heading">${escapeHtml(t("learn.ruleFigure.mistake"))}</h3>` +
    mistakeBodyHtml(mistake);
  return lessonFigureHtml({
    classes: "lesson-rule", icon: "proof", title: `${t(`learn.rules.${id}.name`)} (${label})`, body,
  });
}

/** A figura da derivada `id` de `LESSON_DERIVED`, com a prova de cada forma. */
export function lessonDerivedHtml(id) {
  const { rule } = LESSON_DERIVED[id];
  const label = ruleLabel(rule, LOCALES[getLang()].rules.labels);
  const forms = lessonDerivedForms(id)
    .map(({ goal, proof }) => `${sequentHtml(goal)}<div class="lesson-proof__view">${fitchHtml(proof)}</div>`)
    .join("");
  const body =
    `${schemaHtml(rule)}<p class="lesson-rule__when">${proseHtml(t(`learn.derivedRules.${id}.when`))}</p>` +
    `<h3 class="lesson-rule__heading">${escapeHtml(t("learn.ruleFigure.baseProof"))}</h3>${forms}`;
  return lessonFigureHtml({
    classes: "lesson-derived", icon: "proof", title: `${t(`learn.derivedRules.${id}.name`)} (${label})`, body,
  });
}

/** A figura de um erro, fora de uma regra, com o título em `learn.figures.<id>`. */
export function lessonMistakeHtml(id) {
  return lessonFigureHtml({ classes: "lesson-rule", icon: "proof", title: t(`learn.figures.${id}`), body: mistakeBodyHtml(id) });
}
