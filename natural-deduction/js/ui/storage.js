// Único ponto de acesso ao localStorage. Tudo em try/catch: se o localStorage não existir,
// estiver bloqueado (modo privado) ou cheio, os dados ficam numa cópia em memória e a página
// continua a funcionar durante a sessão.
//
// Chaves usadas (todas com o prefixo nd:v1:):
//   prefs    → { lang, speed }
//   history  → [{ sequent, savedAt }], mais recente primeiro, máx. 20, sem sequentes repetidos
//   progress → { [idDoExercício]: { status, ...outro estado da página } }, ver `core/exercises.js`
//   step     → query string do Passo a passo (sequente, passo e vista), para voltar a ela
//   prove    → query string da última prova aberta em Provar
//   rules    → rascunhos das regras do utilizador (`serializeUserRules`), validados ao carregar

export const STORAGE_PREFIX = "nd:v1:";
export const HISTORY_MAX = 20;

export const DEFAULT_PREFS = Object.freeze({
  lang: null, // último idioma escolhido; só informativo, porque o idioma das páginas vem do URL
  speed: 1, // velocidade do play no Passo a passo (0.5×–2×)
});

/** Velocidades do play. */
export const SPEEDS = [0.5, 1, 1.5, 2];

// Mantém só valores válidos; o resto volta ao valor por omissão.
function cleanPrefs(raw) {
  const prefs = { ...DEFAULT_PREFS };
  if (!raw || typeof raw !== "object") return prefs;
  if (typeof raw.lang === "string") prefs.lang = raw.lang;
  if (SPEEDS.includes(raw.speed)) prefs.speed = raw.speed;
  return prefs;
}

function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry.sequent === "string" && entry.sequent.trim() !== "")
    .slice(0, HISTORY_MAX);
}

function cleanProgress(raw) {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

// Localiza o localStorage do navegador sem rebentar (aceder-lhe pode lançar SecurityError).
function browserBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function backendOf(getBackend) {
  return typeof getBackend === "function" ? getBackend() : getBackend;
}

// Cria um armazenamento sobre um "backend" com getItem/setItem/removeItem (o localStorage,
// ou um stub nos testes). Sem backend funciona só em memória.
export function createStorage(getBackend = browserBackend) {
  const memory = new Map();

  function read(name, clean) {
    const key = STORAGE_PREFIX + name;
    // A cópia em memória é a escrita mais recente desta sessão (null = apagado), por isso
    // tem prioridade; o localStorage só é lido quando ainda não escrevemos nada.
    let text = null;
    if (memory.has(key)) {
      text = memory.get(key);
    } else {
      try {
        text = backendOf(getBackend)?.getItem(key) ?? null;
      } catch {
        // Sem acesso ao localStorage: fica sem valor (valores por omissão).
      }
    }
    try {
      return clean(text == null ? undefined : JSON.parse(text));
    } catch {
      return clean(undefined); // JSON corrompido → valores por omissão
    }
  }

  function write(name, value) {
    const key = STORAGE_PREFIX + name;
    const text = JSON.stringify(value);
    memory.set(key, text);
    try {
      backendOf(getBackend)?.setItem(key, text);
    } catch {
      // Quota cheia ou bloqueado: a cópia em memória chega para esta sessão.
    }
  }

  function remove(name) {
    const key = STORAGE_PREFIX + name;
    memory.set(key, null);
    try {
      backendOf(getBackend)?.removeItem(key);
    } catch {
      // Ignorado, tal como em write().
    }
  }

  return {
    // --- prefs ---
    getPrefs() {
      return read("prefs", cleanPrefs);
    },
    // Atualiza só os campos indicados: setPrefs({ speed: 2 }).
    setPrefs(changes) {
      const prefs = cleanPrefs({ ...read("prefs", cleanPrefs), ...changes });
      write("prefs", prefs);
      return prefs;
    },

    // --- última query de uma página ("step" = Passo a passo, "prove" = Provar) ---
    getLastQuery(page) {
      return read(page, (raw) => (typeof raw === "string" && raw !== "" ? raw : null));
    },
    setLastQuery(page, query) {
      write(page, String(query));
    },
    clearLastQuery(page) {
      remove(page);
    },

    // --- regras do utilizador ---
    getUserRules() {
      return read("rules", (raw) => (Array.isArray(raw) ? raw : []));
    },
    setUserRules(drafts) {
      write("rules", drafts);
    },

    // --- history ---
    getHistory() {
      return read("history", cleanHistory);
    },
    // Põe o sequente no topo; se já lá estava, sai da posição antiga (sem duplicados).
    addToHistory(sequent) {
      const text = String(sequent ?? "").trim();
      if (text === "") return read("history", cleanHistory);
      const others = read("history", cleanHistory).filter((entry) => entry.sequent !== text);
      const history = [{ sequent: text, savedAt: Date.now() }, ...others].slice(0, HISTORY_MAX);
      write("history", history);
      return history;
    },
    clearHistory() {
      remove("history");
    },

    // --- progress ---
    getAllProgress() {
      return read("progress", cleanProgress);
    },
    getProgress(exerciseId) {
      return read("progress", cleanProgress)[exerciseId] ?? null;
    },
    setProgress(exerciseId, data) {
      const progress = { ...read("progress", cleanProgress), [exerciseId]: data };
      write("progress", progress);
      return progress;
    },
    // Sem argumento apaga tudo; com `shouldRemove(id)` apaga só essas entradas (ex.: só os
    // exercícios, deixando o quiz do Aprender).
    resetProgress(shouldRemove) {
      if (typeof shouldRemove !== "function") {
        remove("progress");
        return {};
      }
      const kept = Object.fromEntries(Object.entries(read("progress", cleanProgress)).filter(([id]) => !shouldRemove(id)));
      write("progress", kept);
      return kept;
    },
  };
}

// Instância partilhada pelas páginas.
export const storage = createStorage();
