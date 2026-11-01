import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorage, DEFAULT_PREFS, HISTORY_MAX, STORAGE_PREFIX } from "../js/ui/storage.js";

// Stub mínimo do localStorage (Map por baixo).
function fakeLocalStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

// localStorage que lança em todas as operações (modo privado / bloqueado).
const brokenLocalStorage = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); },
  removeItem() { throw new Error("SecurityError"); },
};

test("prefs: valores por omissão quando não há nada guardado", () => {
  const s = createStorage(fakeLocalStorage());
  assert.deepEqual(s.getPrefs(), DEFAULT_PREFS);
});

test("prefs: setPrefs atualiza só os campos dados e grava com prefixo", () => {
  const ls = fakeLocalStorage();
  const s = createStorage(ls);
  s.setPrefs({ lang: "en" });
  s.setPrefs({ speed: 2 });
  assert.deepEqual(s.getPrefs(), { lang: "en", speed: 2, algorithm: "dll" });
  assert.deepEqual(JSON.parse(ls.data.get(STORAGE_PREFIX + "prefs")), { lang: "en", speed: 2, algorithm: "dll" });
});

test("prefs: valores inválidos voltam ao valor por omissão", () => {
  const s = createStorage(fakeLocalStorage());
  s.setPrefs({ speed: 7, algorithm: "cdcl" });
  assert.equal(s.getPrefs().speed, 1);
  assert.equal(s.getPrefs().algorithm, "dll");
});

test("prefs: lê o que já estava guardado no localStorage", () => {
  const ls = fakeLocalStorage({ [STORAGE_PREFIX + "prefs"]: JSON.stringify({ lang: "pt", algorithm: "dp" }) });
  assert.deepEqual(createStorage(ls).getPrefs(), { lang: "pt", speed: 1, algorithm: "dp" });
});

test("JSON corrompido não rebenta: devolve valores por omissão", () => {
  const ls = fakeLocalStorage({
    [STORAGE_PREFIX + "prefs"]: "{não é json",
    [STORAGE_PREFIX + "history"]: "[[[",
    [STORAGE_PREFIX + "progress"]: "42",
  });
  const s = createStorage(ls);
  assert.deepEqual(s.getPrefs(), DEFAULT_PREFS);
  assert.deepEqual(s.getHistory(), []);
  assert.deepEqual(s.getAllProgress(), {});
});

test("history: mais recente primeiro", () => {
  const s = createStorage(fakeLocalStorage());
  s.addToHistory("p, -p");
  s.addToHistory("p q, -q");
  assert.deepEqual(s.getHistory().map((e) => e.formula), ["p q, -q", "p, -p"]);
  assert.equal(typeof s.getHistory()[0].savedAt, "number");
});

test("history: sem duplicados (a repetida sobe para o topo) e ignora vazias", () => {
  const s = createStorage(fakeLocalStorage());
  s.addToHistory("a");
  s.addToHistory("b");
  s.addToHistory("  a  ");
  s.addToHistory("   ");
  assert.deepEqual(s.getHistory().map((e) => e.formula), ["a", "b"]);
});

test("history: no máximo 20 entradas, cai a mais antiga", () => {
  const s = createStorage(fakeLocalStorage());
  for (let i = 1; i <= 25; i++) s.addToHistory(`p${i}`);
  const history = s.getHistory();
  assert.equal(HISTORY_MAX, 20);
  assert.equal(history.length, 20);
  assert.equal(history[0].formula, "p25");
  assert.equal(history[19].formula, "p6");
});

test("history: clearHistory apaga tudo", () => {
  const ls = fakeLocalStorage();
  const s = createStorage(ls);
  s.addToHistory("p");
  s.clearHistory();
  assert.deepEqual(s.getHistory(), []);
  assert.equal(ls.data.has(STORAGE_PREFIX + "history"), false);
});

test("progress: por id de exercício, e reset", () => {
  const s = createStorage(fakeLocalStorage());
  assert.equal(s.getProgress("propagation-chain"), null);
  s.setProgress("propagation-chain", { status: "done", hints: 1 });
  s.setProgress("three-vars-a", { status: "started" });
  assert.deepEqual(s.getProgress("propagation-chain"), { status: "done", hints: 1 });
  assert.deepEqual(Object.keys(s.getAllProgress()).sort(), ["propagation-chain", "three-vars-a"]);
  s.resetProgress();
  assert.deepEqual(s.getAllProgress(), {});
});

test("progress: reset parcial apaga só as entradas pedidas (e persiste)", () => {
  const backend = fakeLocalStorage();
  const s = createStorage(backend);
  s.setProgress("propagation-chain", { status: "done" });
  s.setProgress("learn-quiz", { best: 5 });
  assert.deepEqual(s.resetProgress((id) => id !== "learn-quiz"), { "learn-quiz": { best: 5 } });
  assert.deepEqual(createStorage(backend).getAllProgress(), { "learn-quiz": { best: 5 } });
});

test("fallback em memória quando o localStorage lança erros", () => {
  const s = createStorage(brokenLocalStorage);
  assert.deepEqual(s.getPrefs(), DEFAULT_PREFS);
  s.setPrefs({ lang: "en" });
  s.addToHistory("p");
  s.setProgress("x", { status: "done" });
  assert.equal(s.getPrefs().lang, "en");
  assert.deepEqual(s.getHistory().map((e) => e.formula), ["p"]);
  assert.deepEqual(s.getProgress("x"), { status: "done" });
  s.clearHistory();
  assert.deepEqual(s.getHistory(), []);
});

test("fallback em memória quando não há localStorage (Node) e getter que lança", () => {
  const semBackend = createStorage(() => null);
  semBackend.setPrefs({ speed: 0.5 });
  assert.equal(semBackend.getPrefs().speed, 0.5);

  const getterQueLanca = createStorage(() => { throw new Error("SecurityError"); });
  getterQueLanca.addToHistory("q");
  assert.deepEqual(getterQueLanca.getHistory().map((e) => e.formula), ["q"]);
});

test("se a escrita falhar, não se lê um valor antigo do localStorage", () => {
  const ls = fakeLocalStorage({ [STORAGE_PREFIX + "prefs"]: JSON.stringify({ lang: "pt" }) });
  ls.setItem = () => { throw new Error("QuotaExceededError"); };
  const s = createStorage(ls);
  s.setPrefs({ lang: "en" });
  assert.equal(s.getPrefs().lang, "en");
});

test("pseudocódigo: aberto por omissão; o estado fica guardado em dpsat:v1:code-open", () => {
  const backend = new Map();
  const local = { getItem: (k) => backend.get(k) ?? null, setItem: (k, v) => backend.set(k, v), removeItem: (k) => backend.delete(k) };
  const store = createStorage(() => local);
  assert.equal(store.getCodeOpen(), true);
  store.setCodeOpen(false);
  assert.equal(store.getCodeOpen(), false);
  assert.equal(backend.get("dpsat:v1:code-open"), "false");
  assert.equal(createStorage(() => local).getCodeOpen(), false);
});

test("lastQuery: guarda a última query de cada página, apaga e ignora lixo", () => {
  const ls = fakeLocalStorage();
  const s = createStorage(ls);
  assert.equal(s.getLastQuery("step"), null);
  s.setLastQuery("step", "f=p,+-p&a=dll&step=2");
  s.setLastQuery("solve", "f=p&a=dll");
  assert.equal(s.getLastQuery("step"), "f=p,+-p&a=dll&step=2");
  assert.equal(s.getLastQuery("solve"), "f=p&a=dll");
  assert.equal(JSON.parse(ls.data.get(STORAGE_PREFIX + "step")), "f=p,+-p&a=dll&step=2");
  s.clearLastQuery("solve");
  assert.equal(s.getLastQuery("solve"), null);
  assert.equal(ls.data.has(STORAGE_PREFIX + "solve"), false);
  assert.equal(createStorage(fakeLocalStorage({ [STORAGE_PREFIX + "step"]: "42" })).getLastQuery("step"), null);
  const blocked = createStorage(brokenLocalStorage);
  blocked.setLastQuery("step", "f=p");
  assert.equal(blocked.getLastQuery("step"), "f=p");
});
