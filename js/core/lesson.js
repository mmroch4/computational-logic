// Dados da lição (página Aprender): as secções, as provas das figuras e as perguntas curtas.
// O texto está no `aprender.html` e nos locales; aqui fica só o que os testes têm de poder verificar.
//
// Uma secção é `{ id, key }`: `id` é a âncora, igual nos dois idiomas, porque a troca de idioma leva o
// hash; `key` é o nome em `learn.sections.*` e `learn.<key>.*`.
// Uma prova é `{ sequent, text }`, com `text` no formato de `proof-text.js`, e o título em
// `learn.figures.<id>`. Uma pergunta é `{ options, answer }`, com o texto em `learn.checks.<id>.*`.
import { parseProof } from "./proof-text.js";
import { ruleSet } from "./rules.js";
import { parseSequent } from "./sequent.js";
import { verifyProof } from "./verify.js";

export const LESSON_SECTIONS = Object.freeze([
  { id: "prova", key: "proof" },
  { id: "conjuncao", key: "and" },
  { id: "implicacao", key: "implies" },
  { id: "subdeducoes", key: "scope" },
  { id: "disjuncao", key: "or" },
  { id: "negacao", key: "not" },
  { id: "derivadas", key: "derived" },
  { id: "estrategias", key: "strategy" },
  { id: "solidez", key: "meta" },
]);

export const LESSON_PROOFS = Object.freeze({
  firstProof: {
    sequent: "a ∧ b, a → c ⊢ c ∧ b",
    text: `
1 | a ∧ b   premissa
2 | a → c   premissa
3 | a       ∧E, 1
4 | c       →E, 2, 3
5 | b       ∧E, 1
6 | c ∧ b   ∧I, 4, 5`,
  },
});

export const LESSON_CHECKS = Object.freeze({
  firstRule: { options: ["andE", "implE", "andI"], answer: "implE" },
});

/** A prova `id` já lida: `{ goal, proof }`. Os testes garantem que todas se leem. */
export function lessonProof(id) {
  const { sequent, text } = LESSON_PROOFS[id];
  return { goal: parseSequent(sequent).sequent, proof: parseProof(text.trim()).proof };
}

/** Veredicto do verificador para a prova `id`, com todas as regras do site. */
export function verifyLessonProof(id) {
  const { goal, proof } = lessonProof(id);
  return verifyProof(proof, goal, ruleSet("completo"));
}

/** Quantas linhas uma prova mostra antes de se avançar: as premissas, ou a primeira linha se não as houver. */
export const firstRevealed = ({ lines }) => Math.max(1, lines.filter((line) => line.kind === "premise").length);

/**
 * Marcas de `fitchHtml` com `shown` linhas à vista: a última revelada é a atual, exceto nas premissas de
 * partida, e as seguintes ficam `future`, ocupando o lugar, para os botões não fugirem do dedo.
 */
export function revealMarks(proof, shown) {
  const marks = new Map();
  if (shown > firstRevealed(proof)) marks.set(shown, "current");
  for (let line = shown + 1; line <= proof.lines.length; line += 1) marks.set(line, "future");
  return marks;
}
