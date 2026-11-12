// Verificador com as regras de 1.ª ordem: ∀I, ∀E, ∃I, ∃E, =I, =E, as caixas [v] e as condições.
// As provas são originais: uma por regra da Fig. 2.1 e outras no estilo das soluções dos slides.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProof } from "../js/core/proof-text.js";
import { premiseText } from "../js/core/guided.js";
import { BASE_RULES, FIRST_ORDER_RULES, PROPOSITIONAL_RULES, isFirstOrderRule, ruleSet } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { VERIFY_ERROR_CODES, verifyLine, verifyProof } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";

function read(text) {
  const result = parseProof(text.trim().split("\n").map((line) => line.trim().startsWith("|") ? `  ${line.trim()}` : line.trim()).join("\n"));
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.proof;
}

function goal(text) {
  const result = parseSequent(text);
  assert.ok(result.ok, text);
  return result.sequent;
}

/** A prova demonstra o sequente só com as regras base. */
function proves(sequentText, proofText) {
  const result = verifyProof(read(proofText), goal(sequentText));
  assert.deepEqual(result.lineErrors, [], sequentText);
  assert.ok(result.ok, sequentText);
}

/** A linha n dá o erro `code`, com os parâmetros indicados. */
function failsAt(proofText, n, code, params = {}) {
  const result = verifyLine(read(proofText), n);
  assert.equal(result.ok, false, `linha ${n} devia falhar com ${code}`);
  assert.equal(result.error.code, code, JSON.stringify(result.error));
  for (const [key, value] of Object.entries(params)) assert.equal(result.error.params[key], value, key);
}

test("as regras de 1.ª ordem fazem parte das regras base e do conjunto base", () => {
  assert.deepEqual(BASE_RULES, [...PROPOSITIONAL_RULES, ...FIRST_ORDER_RULES]);
  const ids = new Set(ruleSet("base").map(({ id }) => id));
  for (const id of ["∀I", "∀E", "∃I", "∃E", "=I", "=E"]) assert.ok(ids.has(id), id);
  assert.ok(new Set(ruleSet("completo").map(({ id }) => id)).has("∃E"));
});

test("isFirstOrderRule separa as regras novas, que o solver e os contramodelos põem de parte", () => {
  assert.deepEqual(BASE_RULES.filter(isFirstOrderRule), [...FIRST_ORDER_RULES]);
  assert.deepEqual(BASE_RULES.filter((rule) => !isFirstOrderRule(rule)), [...PROPOSITIONAL_RULES]);
});

test("as caixas [v] em texto, para o modo guiado e a escolha de regra", () => {
  const box = (id) => FIRST_ORDER_RULES.find((rule) => rule.id === id).premises.at(-1);
  assert.equal(premiseText(box("∀I")), "[v] … φ[v/x]");
  assert.equal(premiseText(box("∃E")), "[v] φ[v/x] … ψ");
  assert.equal(premiseText(PROPOSITIONAL_RULES.find((rule) => rule.id === "→I").premises[0]), "[φ] … ψ");
});

test("os códigos novos têm mensagem nos dois idiomas", () => {
  for (const code of ["missingFreshBox", "wrongBox", "notFresh", "variableEscapes", "notSubstitutable"]) {
    assert.ok(VERIFY_ERROR_CODES.includes(code), code);
    assert.equal(typeof pt.verify.errors[code], "string", code);
    assert.equal(typeof en.verify.errors[code], "string", code);
  }
});

// Fig. 2.1, uma regra de cada vez.

test("∀E: de ∀x φ tira-se φ[t/x], com qualquer termo", () => {
  proves("∀x Gosta(x, x) ⊢ Gosta(f(c), f(c))", `
    1 | ∀x Gosta(x, x)          premissa
    2 | Gosta(f(c), f(c))       ∀E, 1`);
  proves("∀x p ⊢ p", `
    1 | ∀x p   premissa
    2 | p      ∀E, 1`);
});

test("∀I: uma caixa [v] num passo, e caixas irmãs podem usar a mesma variável", () => {
  proves("∀x(P(x) ∧ Q(x)) ⊢ ∀x P(x) ∧ ∀x Q(x)", `
    1 | ∀x(P(x) ∧ Q(x))      premissa
    2 |  [a] P(a) ∧ Q(a)     ∀E, 1
    3 |   P(a)               ∧E, 2
    4 | ∀x P(x)              ∀I, 2–3
    5 |  [a] P(a) ∧ Q(a)     ∀E, 1
    6 |   Q(a)               ∧E, 5
    7 | ∀x Q(x)              ∀I, 5–6
    8 | ∀x P(x) ∧ ∀x Q(x)    ∧I, 4, 7`);
});

test("∀I: com linha de etiqueta, a hipótese por dentro cita-se como de costume", () => {
  proves("⊢ ∀x(P(x) → P(x))", `
      |  [v]
    1 |     P(v)          hipótese
    2 |   P(v) → P(v)     →I, 1–1
    3 | ∀x(P(x) → P(x))   ∀I, 1–2`);
  proves("¬∃x P(x) ⊢ ∀x ¬P(x)", `
    1 | ¬∃x P(x)     premissa
      |  [a]
    2 |     P(a)     hipótese
    3 |     ∃x P(x)  ∃I, 2
    4 |     F        FI, 3, 1
    5 |   ¬P(a)      ¬I, 2–4
    6 | ∀x ¬P(x)     ∀I, 2–5`);
});

test("∃I: das mesmas linhas saem várias conclusões, e qualquer uma serve", () => {
  for (const conclusion of ["∃y R(y, c)", "∃y R(c, y)", "∃y R(y, y)"]) {
    proves(`R(c, c) ⊢ ${conclusion}`, `
      1 | R(c, c)   premissa
      2 | ${conclusion}   ∃I, 1`);
  }
});

test("∃E: cita o ∃ e a caixa [v] que abre na hipótese, por qualquer ordem", () => {
  for (const citations of ["1, 2–4", "2–4, 1"]) {
    proves("∃x(P(x) ∧ Q(x)) ⊢ ∃x P(x)", `
      1 | ∃x(P(x) ∧ Q(x))    premissa
      2 |  [a] P(a) ∧ Q(a)   hipótese
      3 |   P(a)             ∧E, 2
      4 |   ∃x P(x)          ∃I, 3
      5 | ∃x P(x)            ∃E, ${citations}`);
  }
});

test("=I e =E: a simetria e a substituição de iguais", () => {
  proves("⊢ f(a) = f(a)", `
    1 | f(a) = f(a)   =I`);
  proves("a = b ⊢ b = a", `
    1 | a = b   premissa
    2 | a = a   =I
    3 | b = a   =E, 1, 2`);
  proves("a = b, Alto(a) ⊢ Alto(b)", `
    1 | a = b     premissa
    2 | Alto(a)   premissa
    3 | Alto(b)   =E, 2, 1`);
  proves("a = b, b = c ⊢ a = c", `
    1 | a = b   premissa
    2 | b = c   premissa
    3 | a = c   =E, 2, 1`);
});

// No estilo das soluções dos slides.

test("trocar dois ∀, com uma caixa dentro de outra", () => {
  proves("∀x∀y R(x, y) ⊢ ∀y∀x R(x, y)", `
    1 | ∀x∀y R(x, y)         premissa
    2 |  [b] ∀x∀y R(x, y)    R, 1
    3 |    [a] ∀y R(a, y)    ∀E, 2
    4 |     R(a, b)          ∀E, 3
    5 |   ∀x R(x, b)         ∀I, 3–4
    6 | ∀y∀x R(x, y)         ∀I, 2–5`);
});

test("∃∀ dá ∀∃, com uma caixa de ∃E dentro de uma de ∀I", () => {
  proves("∃x∀y R(x, y) ⊢ ∀y∃x R(x, y)", `
    1 | ∃x∀y R(x, y)         premissa
    2 |  [b] ∃x∀y R(x, y)    R, 1
    3 |    [a] ∀y R(a, y)    hipótese
    4 |     R(a, b)          ∀E, 3
    5 |     ∃x R(x, b)       ∃I, 4
    6 |   ∃x R(x, b)         ∃E, 2, 3–5
    7 | ∀y∃x R(x, y)         ∀I, 2–6`);
});

test("∃ sobre ∨ e regras proposicionais dentro das caixas", () => {
  proves("∃x(P(x) ∨ Q(x)) ⊢ ∃x P(x) ∨ ∃x Q(x)", `
     1 | ∃x(P(x) ∨ Q(x))           premissa
     2 |  [u] P(u) ∨ Q(u)          hipótese
     3 |     P(u)                  hipótese
     4 |     ∃x P(x)               ∃I, 3
     5 |     ∃x P(x) ∨ ∃x Q(x)     ∨I, 4
     6 |     Q(u)                  hipótese
     7 |     ∃x Q(x)               ∃I, 6
     8 |     ∃x P(x) ∨ ∃x Q(x)     ∨I, 7
     9 |   ∃x P(x) ∨ ∃x Q(x)       ∨E, 2, 3–5, 6–8
    10 | ∃x P(x) ∨ ∃x Q(x)         ∃E, 1, 2–9`);
});

test("a conclusão, as premissas e as citações comparam-se a menos de α", () => {
  proves("∀z P(z) ⊢ ∀y P(y)", `
    1 | ∀x P(x)       premissa
    2 |  [a] P(a)     ∀E, 1
    3 | ∀x P(x)       ∀I, 2–2`);
  proves("∀x P(x), ∀y P(y) → q ⊢ q", `
    1 | ∀x P(x)         premissa
    2 | ∀y P(y) → q     premissa
    3 | q               →E, 1, 2`);
  proves("∃x P(x) ⊢ ∃y P(y)", `
    1 | ∃x P(x)    premissa
    2 | ∃y P(y)    R, 1`);
  const result = verifyProof(read("1 | ∀x P(x, y)  premissa"), goal("∀x P(x, y) ⊢ ∀y P(y, y)"));
  assert.deepEqual(result.extraPremises, []);
  assert.equal(result.conclusionError.code, "wrongConclusion");
});

// Tentativas erradas.

test("erro: a variável da caixa não escapa por uma citação de dentro", () => {
  failsAt(`
    1 | ∀x P(x)       premissa
    2 |  [a] P(a)     ∀E, 1
    3 | ∀x P(x)       ∀I, 2–2
    4 | P(a)          R, 2`, 4, "inaccessibleLine", { cited: "2" });
});

test("erro: v nas premissas, ou noutra linha acessível antes da caixa", () => {
  failsAt(`
    1 | P(a)          premissa
    2 |  [a] P(a)     R, 1
    3 | ∀x P(x)       ∀I, 2–2`, 3, "notFresh", { variable: "a", cited: 1, rule: "∀I" });
  failsAt(`
    1 | ∃x P(x)        premissa
    2 | Q(a)           premissa
    3 |  [a] P(a)      hipótese
    4 |   q            R, 3
    5 | q              ∃E, 1, 3–4`, 5, "notFresh", { variable: "a", cited: 2 });
  failsAt(`
    1 | ∀x∀y R(x, y)         premissa
    2 |  [a] ∀y R(a, y)      ∀E, 1
    3 |    [a] R(a, a)       ∀E, 2
    4 |   ∀y R(y, y)         ∀I, 3–3
    5 | ∀x∀y R(y, y)         ∀I, 2–4`, 4, "notFresh", { variable: "a", cited: 2 });
});

test("erro: no ∀I, v não pode ficar livre em ∀x φ", () => {
  failsAt(`
    1 | ∀y P(y, y)      premissa
    2 |  [a] P(a, a)    ∀E, 1
    3 | ∀x P(x, a)      ∀I, 2–2`, 3, "variableEscapes", { variable: "a", rule: "∀I" });
});

test("erro: no ∃E, v não pode ficar em ψ", () => {
  failsAt(`
    1 | ∃x P(x)    premissa
    2 |  [a] P(a)  hipótese
    3 |   P(a)     R, 2
    4 | P(a)       ∃E, 1, 2–3`, 4, "variableEscapes", { variable: "a", rule: "∃E" });
});

test("erro: captura no ∀E e no ∃I", () => {
  failsAt(`
    1 | ∀x∃y Ama(x, y)    premissa
    2 | ∃y Ama(y, y)      ∀E, 1`, 2, "notSubstitutable", { variable: "x", term: "y", rule: "∀E" });
  failsAt(`
    1 | ∀y R(y, y)        premissa
    2 | ∃x∀y R(x, y)      ∃I, 1`, 2, "notSubstitutable", { variable: "x", term: "y", rule: "∃I" });
});

test("erro: ∀I sem caixa [v]", () => {
  const steps = `
    1 | ∀x P(x)    premissa
    2 | P(a)       ∀E, 1`;
  failsAt(`${steps}\n3 | ∀x P(x)  ∀I, 2–2`, 3, "missingFreshBox", { rule: "∀I" });
  failsAt(`${steps}\n3 | ∀x P(x)  ∀I, 2`, 3, "missingFreshBox", { rule: "∀I" });
  failsAt(`
    1 |   P(a)      hipótese
    2 | ∀x P(x)     ∀I, 1–1`, 2, "missingFreshBox", { rule: "∀I" });
});

test("erro: ∃E sem citar o ∃", () => {
  failsAt(`
    1 | ∃x P(x)    premissa
    2 |  [a] P(a)  hipótese
    3 |   q        FE, 2
    4 | q          ∃E, 2–3`, 4, "missingCitation", { rule: "∃E", expected: 2, found: 1 });
});

test("erro: a caixa citada não é a que a regra pede", () => {
  // O ∀I com uma caixa de ∃E, o →I com uma caixa [v] e o ∃E com uma caixa de ∀I.
  failsAt(`
    1 | ∃x P(x)      premissa
    2 |  [a] P(a)    hipótese
    3 | ∀x P(x)      ∀I, 2–2`, 3, "wrongBox", { rule: "∀I" });
  failsAt(`
    1 | ∃x P(x)      premissa
    2 |  [a] P(a)    hipótese
    3 | P(a) → P(a)  →I, 2–2`, 3, "wrongBox", { rule: "→I" });
  failsAt(`
    1 | ∀x P(x)      premissa
    2 |  [a] P(a)    ∀E, 1
    3 | q            ∃E, 1, 2–2`, 3, "wrongBox", { rule: "∃E" });
});

test("erro: a instância não é a do ∀ citado, ou o =E não troca o que diz", () => {
  failsAt(`
    1 | ∀x P(x, x)   premissa
    2 | P(a, b)      ∀E, 1`, 2, "formulaMismatch", { rule: "∀E" });
  failsAt(`
    1 | a = b        premissa
    2 | P(c)         premissa
    3 | P(b)         =E, 1, 2`, 3, "formulaMismatch", { rule: "=E" });
  failsAt(`
    1 | P(a)         premissa
    2 | ∃x Q(x)      ∃I, 1`, 2, "formulaMismatch", { rule: "∃I" });
});
