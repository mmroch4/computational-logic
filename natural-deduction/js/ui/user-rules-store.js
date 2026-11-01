// As regras do utilizador deste browser, partilhadas por Provar e Exercícios. Sem DOM. O `localStorage`
// só guarda rascunhos, por isso cada carregamento volta a validar tudo.
//
// createUserRuleStore(backing = storage) dá:
//   list()              → as regras ativas
//   isSessionOnly(id)   → a regra veio de um link e não ficou guardada
//   rejected            → as regras guardadas que já não passam na validação
//   add(rule)           → guarda uma regra de `createUserRule`
//   remove(id)          → apaga a regra, guardada ou só desta sessão
//   applyLink(rules)    → { added, replaced }: as regras de um link, ver `mergeUserRules`
//   subscribe(listener) → `listener()` a cada mudança
import {
  combineUserRules, loadUserRules, mergeUserRules, serializeUserRules,
} from "../core/user-rules.js";
import { storage } from "./storage.js";

export function createUserRuleStore(backing = storage) {
  const { rules: loaded, rejected } = loadUserRules(backing.getUserRules());
  let saved = [...loaded];
  let session = [];
  const listeners = new Set();

  function changed() {
    backing.setUserRules(serializeUserRules(saved));
    listeners.forEach((listener) => listener());
  }

  return {
    list: () => combineUserRules(saved, session),
    isSessionOnly: (id) => session.some((rule) => rule.id === id),
    rejected,
    add(rule) {
      saved = [...saved, rule];
      changed();
    },
    remove(id) {
      saved = saved.filter((rule) => rule.id !== id);
      session = session.filter((rule) => rule.id !== id);
      changed();
    },
    applyLink(rules) {
      const merged = mergeUserRules(saved, rules);
      const { added, replaced } = merged;
      if (added.length === 0 && replaced.length === 0) return { added, replaced };
      saved = merged.saved;
      session = merged.session;
      changed();
      return { added, replaced };
    },
    subscribe(listener) {
      listeners.add(listener);
    },
  };
}
