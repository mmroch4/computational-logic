// Painel das regras do utilizador em Provar: a lista, apagar e o esquema-tipo, com pré-visualização,
// resultado da validação e contraexemplo. O que cada texto vale decide-se em core/rule-form.js.
//
// As funções exportadas à parte são puras (testáveis em node); só mountUserRulesPanel() mexe no DOM.
// `store` vem de user-rules-store.js.
import { displayName, format } from "../core/formula.js";
import {
  checkForm, emptyForm, formulaPremise, subproofPremise,
} from "../core/rule-form.js";
import { USER_RULE_ERROR_CODES, USER_RULE_LIMITS } from "../core/user-rules.js";
import { onLangChange, t } from "./i18n.js";
import { escapeHtml } from "./layout.js";
import { msgHtml } from "./message.js";
import { ERROR_DELAY_MS, SYMBOL_KEYS, insertSymbol } from "./sequent-input.js";

/** As teclas do esquema: as metavariáveis primeiro, porque é com elas que se escreve uma regra. */
export const SCHEMA_KEYS = [
  { name: "phi", label: "φ", insert: "φ" },
  { name: "psi", label: "ψ", insert: "ψ" },
  { name: "theta", label: "θ", insert: "θ" },
  ...SYMBOL_KEYS.filter(({ name }) => !["comma", "turnstile"].includes(name)),
];

/** A frase de um erro de `checkForm`, que pode vir de `user-rules.js`, do parser ou da semântica. */
export function ruleErrorText({ code, params }) {
  if (USER_RULE_ERROR_CODES.includes(code)) return t(`userRules.errors.${code}`, params);
  return t(`${code === "tooManyVariables" ? "semantics" : "parser"}.errors.${code}`, params);
}

function premiseHtml(premise) {
  if (premise.kind === "formula") return `<span class="rule-scheme__premise">${escapeHtml(format(premise.schema))}</span>`;
  const text = `[${format(premise.hypothesis)}] … ${format(premise.conclusion)}`;
  return `<span class="rule-scheme__premise">${escapeHtml(text)}</span>`;
}

/** A regra como numa tabela: as premissas, o traço, a conclusão e o nome. */
export function ruleSchemeHtml({ premises, conclusions: [conclusion] }, name) {
  const top = premises.length > 0 ? `<span class="rule-scheme__premises">${premises.map(premiseHtml).join("")}</span>` : "";
  return `<span class="rule-scheme">${top}<span class="rule-scheme__bar" aria-hidden="true"></span>`
    + `<span class="rule-scheme__conclusion">${escapeHtml(format(conclusion))}</span>`
    + `<span class="rule-scheme__name">${escapeHtml(name)}</span></span>`;
}

/** A lista das regras, com o botão de apagar. */
export function ruleListHtml(rules, isSessionOnly = () => false) {
  if (rules.length === 0) return `<p class="rules-panel__empty">${escapeHtml(t("rulesPanel.empty"))}</p>`;
  const items = rules.map((rule) => {
    const session = isSessionOnly(rule.id) ? `<span class="rules-panel__tag">${escapeHtml(t("rulesPanel.sessionOnly"))}</span>` : "";
    return `<li class="rules-panel__item">${ruleSchemeHtml(rule, rule.id)}${session}`
      + `<button type="button" class="btn" data-variant="outline" data-size="sm" data-delete-rule="${escapeHtml(rule.id)}" `
      + `aria-label="${escapeHtml(t("rulesPanel.deleteRule", { name: rule.id }))}">${escapeHtml(t("rulesPanel.delete"))}</button></li>`;
  }).join("");
  return `<ul class="rules-panel__list">${items}</ul>`;
}

function valuationHtml({ valuation, freeVariables }) {
  const items = valuation.map(([name, value]) => (
    `<li>${escapeHtml(`${displayName(name)} = ${t(`assist.values.${value}`)}`)}</li>`
  )).join("");
  const list = items ? `<ul class="assist__valuation" aria-label="${escapeHtml(t("assist.valuationLabel"))}">${items}</ul>` : "";
  const others = freeVariables ? `<p class="assist__note">${escapeHtml(t("assist.otherValues"))}</p>` : "";
  return list + others;
}

/** O resultado da validação, para um estado de `checkForm`. */
export function resultHtml(check) {
  switch (check.status) {
    case "unsound":
      return msgHtml("error", escapeHtml(t("userRules.errors.unsound")))
        + `<p class="assist__note">${escapeHtml(t("rulesPanel.tested", { formula: format(check.formula) }))}</p>`
        + valuationHtml(check);
    case "invalid":
      return msgHtml("error", escapeHtml(ruleErrorText(check.error)));
    case "unnamed":
      return msgHtml("ok", escapeHtml(`${t("rulesPanel.sound")} ${t("rulesPanel.needsName")}`));
    case "ready":
      return msgHtml("ok", escapeHtml(t("rulesPanel.sound")));
    case "incomplete":
      return `<p class="assist__note">${escapeHtml(t("rulesPanel.needsConclusion"))}</p>`;
    default:
      return "";
  }
}

const fieldHtml = (id, field, value, label, attrs = "") => (
  `<input id="${id}" class="input rules-form__input" type="text" data-rule-field="${field}" ${attrs}`
  + `value="${escapeHtml(value)}" aria-label="${escapeHtml(label)}" aria-invalid="false" autocomplete="off" `
  + 'autocapitalize="off" autocorrect="off" spellcheck="false">'
);

/** Uma premissa do formulário: uma fórmula, ou a hipótese e a conclusão de uma subdedução. */
export function premiseRowHtml(premise, index) {
  const number = index + 1;
  const key = `data-index="${index}" `;
  const fields = premise.kind === "formula"
    ? fieldHtml(`rule-premise-${index}`, "text", premise.text, t("rulesPanel.premiseField", { number }), key)
    : `<span class="rules-form__bracket" aria-hidden="true">[</span>`
      + fieldHtml(`rule-premise-${index}-hypothesis`, "hypothesis", premise.hypothesis, t("rulesPanel.hypothesisField", { number }), key)
      + '<span class="rules-form__bracket" aria-hidden="true">] …</span>'
      + fieldHtml(`rule-premise-${index}-conclusion`, "conclusion", premise.conclusion, t("rulesPanel.subproofConclusionField", { number }), key);
  return `<div class="rules-form__premise">${fields}`
    + `<button type="button" class="btn" data-variant="outline" data-size="sm" data-remove-premise="${index}" `
    + `aria-label="${escapeHtml(t("rulesPanel.removePremise", { number }))}">×</button></div>`;
}

function formHtml(form) {
  const full = form.premises.length >= USER_RULE_LIMITS.maxPremises ? " disabled" : "";
  const keys = SCHEMA_KEYS.map(({ name, label }) => (
    `<button type="button" data-schema-key="${name}" aria-label="${escapeHtml(t(`rulesPanel.keys.${name}`, {}))}">${escapeHtml(label)}</button>`
  )).join("");
  return '<form class="rules-form" novalidate>'
    + `<h3 class="rules-panel__heading">${escapeHtml(t("rulesPanel.newRule"))}</h3>`
    + `<p class="assist__note">${escapeHtml(t("rulesPanel.help"))}</p>`
    + `<label class="field__label" for="rule-name">${escapeHtml(t("rulesPanel.name"))}</label>`
    + `<input id="rule-name" class="input rules-form__input" type="text" data-rule-field="name" value="${escapeHtml(form.name)}" `
    + `maxlength="${USER_RULE_LIMITS.maxName}" aria-invalid="false" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">`
    + `<p class="field__label">${escapeHtml(t("rulesPanel.premises"))}</p>`
    + `<div class="rules-form__premises">${form.premises.map(premiseRowHtml).join("")}</div>`
    + '<div class="rules-form__add">'
    + `<button type="button" class="btn" data-variant="outline" data-size="sm" data-add-premise="formula"${full}>${escapeHtml(t("rulesPanel.addPremise"))}</button>`
    + `<button type="button" class="btn" data-variant="outline" data-size="sm" data-add-premise="subproof"${full}>${escapeHtml(t("rulesPanel.addSubproof"))}</button>`
    + "</div>"
    + `<label class="field__label" for="rule-conclusion">${escapeHtml(t("rulesPanel.conclusion"))}</label>`
    + fieldHtml("rule-conclusion", "conclusion", form.conclusion, t("rulesPanel.conclusion"))
    + `<div class="keys rules-form__keys" role="group" aria-label="${escapeHtml(t("sequentInput.symbolsLabel"))}">${keys}</div>`
    + `<div class="rules-form__preview" aria-label="${escapeHtml(t("rulesPanel.preview"))}" role="group" hidden></div>`
    + '<div class="rules-form__result" role="status"></div>'
    + `<button type="submit" class="btn rules-form__save">${escapeHtml(t("rulesPanel.save"))}</button>`
    + "</form>";
}

/** O id do campo onde está um erro. */
export function errorFieldId({ field, index, part }, form) {
  if (field === "name") return "rule-name";
  if (field === "conclusion") return "rule-conclusion";
  if (field !== "premise" || index === undefined) return null;
  return form.premises[index]?.kind === "subproof" ? `rule-premise-${index}-${part ?? "hypothesis"}` : `rule-premise-${index}`;
}

/** Monta o painel em `container`. */
export function mountUserRulesPanel(container, { store }) {
  let form = emptyForm();
  let timer = null;
  /** O que aconteceu à última regra: { kind, key, params }. */
  let status = null;
  let lastField = null;
  let errorShown = false;

  const inputs = () => container.querySelectorAll("[data-rule-field]");
  const check = () => checkForm(form, store.list());

  function paintStatus() {
    const box = container.querySelector(".rules-panel__status");
    if (box) box.innerHTML = status ? msgHtml(status.kind, escapeHtml(t(status.key, status.params))) : "";
  }

  function paintList() {
    const rules = store.list();
    container.querySelector("summary span").textContent = t("rulesPanel.toggle", { count: rules.length });
    container.querySelector(".rules-panel__rules").innerHTML = ruleListHtml(rules, store.isSessionOnly);
  }

  function paintCheck(current, { withError }) {
    const failed = current.status === "invalid" || current.status === "unsound";
    const hidden = failed && !withError;
    errorShown = failed && withError;
    const preview = container.querySelector(".rules-form__preview");
    preview.hidden = !current.rule;
    preview.innerHTML = current.rule
      ? ruleSchemeHtml(current.rule, form.name.trim() || t("rulesPanel.noName"))
      : "";
    container.querySelector(".rules-form__result").innerHTML = hidden ? "" : resultHtml(current);
    const wrong = current.status === "invalid" && withError ? errorFieldId(current.error, form) : null;
    inputs().forEach((input) => input.setAttribute("aria-invalid", String(input.id === wrong)));
  }

  /** Um erro novo espera por uma pausa, como nos outros campos; um já à vista acompanha logo o texto. */
  function update({ immediate = false } = {}) {
    clearTimeout(timer);
    const current = check();
    const failed = current.status === "invalid" || current.status === "unsound";
    const wait = failed && !immediate && !errorShown;
    paintCheck(current, { withError: !wait });
    if (wait) timer = setTimeout(() => paintCheck(current, { withError: true }), ERROR_DELAY_MS);
    return current;
  }

  function rebuildForm(focusId) {
    container.querySelector(".rules-panel__form").innerHTML = formHtml(form);
    update({ immediate: true });
    if (focusId) container.querySelector(`#${focusId}`)?.focus();
  }

  function setField(input) {
    const { ruleField: field, index } = input.dataset;
    if (index === undefined) form = { ...form, [field]: input.value };
    else {
      const premises = form.premises.map((premise, at) => (at === Number(index) ? { ...premise, [field]: input.value } : premise));
      form = { ...form, premises };
    }
  }

  function save() {
    const current = update({ immediate: true });
    if (current.status === "ready") {
      store.add(current.rule);
      status = { kind: "ok", key: "rulesPanel.saved", params: { name: current.rule.id } };
      form = emptyForm();
      lastField = null;
      rebuildForm("rule-name");
      paintStatus();
      return;
    }
    if (current.status === "empty" || current.status === "unnamed" || current.status === "incomplete") {
      container.querySelector(current.status === "incomplete" ? "#rule-conclusion" : "#rule-name")?.focus();
      if (current.status === "empty") container.querySelector(".rules-form__result").innerHTML = resultHtml({ status: "incomplete" });
    } else if (current.status === "invalid") {
      const id = errorFieldId(current.error, form);
      if (id) container.querySelector(`#${id}`)?.focus();
    }
  }

  function pressKey(name) {
    const input = lastField && container.contains(lastField) ? lastField : container.querySelector("#rule-conclusion");
    const { insert } = SCHEMA_KEYS.find((key) => key.name === name);
    const next = insertSymbol(input.value, input.selectionStart, input.selectionEnd, insert);
    input.value = next.value;
    input.focus();
    input.setSelectionRange(next.caret, next.caret);
    setField(input);
    update();
  }

  function onClick({ target }) {
    const deleting = target.closest("[data-delete-rule]");
    const adding = target.closest("[data-add-premise]");
    const removing = target.closest("[data-remove-premise]");
    const key = target.closest("[data-schema-key]");
    if (deleting) {
      const name = deleting.dataset.deleteRule;
      store.remove(name);
      status = { kind: "info", key: "rulesPanel.deleted", params: { name } };
      paintStatus();
      container.querySelector("summary").focus();
    } else if (adding) {
      const index = form.premises.length;
      const subproof = adding.dataset.addPremise === "subproof";
      form = { ...form, premises: [...form.premises, subproof ? subproofPremise() : formulaPremise()] };
      rebuildForm(subproof ? `rule-premise-${index}-hypothesis` : `rule-premise-${index}`);
    } else if (removing) {
      const index = Number(removing.dataset.removePremise);
      form = { ...form, premises: form.premises.filter((_, at) => at !== index) };
      rebuildForm(null);
      container.querySelector("[data-add-premise]").focus();
    } else if (key) {
      pressKey(key.dataset.schemaKey);
    }
  }

  function build() {
    container.innerHTML = '<details class="rules-panel"><summary class="rules-panel__toggle"><span></span></summary>'
      + '<div class="rules-panel__body"><div class="rules-panel__status" role="status"></div>'
      + `<div class="rules-panel__rules"></div><div class="rules-panel__rejected"></div>`
      + '<div class="rules-panel__form"></div></div></details>';
    paintList();
    paintStatus();
    const lost = store.rejected.map(({ name }) => name).filter(Boolean);
    if (store.rejected.length > 0) {
      container.querySelector(".rules-panel__rejected").innerHTML = msgHtml("warn", escapeHtml(t("rulesPanel.rejected", { names: lost.join(", ") || "?" })));
    }
    rebuildForm(null);
  }

  container.addEventListener("click", onClick);
  container.addEventListener("input", ({ target }) => {
    if (!target.matches("[data-rule-field]")) return;
    status = null;
    paintStatus();
    setField(target);
    update();
  });
  container.addEventListener("focusin", ({ target }) => {
    if (target.matches("[data-rule-field]")) lastField = target;
  });
  container.addEventListener("focusout", ({ target }) => {
    if (target.matches("[data-rule-field]") && errorShown === false) update({ immediate: true });
  });
  container.addEventListener("submit", (event) => {
    event.preventDefault();
    save();
  });
  // Sem isto, o campo perde o foco ao carregar na tecla e o teclado do telemóvel fecha.
  for (const type of ["pointerdown", "mousedown"]) {
    container.addEventListener(type, (event) => {
      if (event.target.closest("[data-schema-key]")) event.preventDefault();
    });
  }
  store.subscribe(() => {
    paintList();
    update({ immediate: true });
  });
  onLangChange(build);
  build();

  return {
    /** Abre o painel, para mostrar as regras que um link trouxe. */
    open() {
      container.querySelector("details").open = true;
    },
  };
}
