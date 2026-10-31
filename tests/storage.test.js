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

test("as chaves usam o prefixo nd:v1:", () => {
  const ls = fakeLocalStorage();
  createStorage(ls).setPrefs({ speed: 2 });
  assert.equal(STORAGE_PREFIX, "nd:v1:");
  assert.deepEqual([...ls.data.keys()], ["nd:v1:prefs"]);
});

test("prefs: valores por omissão quando não há nada guardado", () => {
  const s = createStorage(fakeLocalStorage());
  assert.deepEqual(s.getPrefs(), DEFAULT_PREFS);
});

test("prefs: setPrefs atualiza só os campos dados e grava com prefixo", () => {
  const ls = fakeLocalStorage();
  const s = createStorage(ls);
  s.setPrefs({ lang: "en" });
  s.setPrefs({ speed: 2 });
  assert.deepEqual(s.getPrefs(), { lang: "en", speed: 2 });
  assert.deepEqual(JSON.parse(ls.data.get(STORAGE_PREFIX + "prefs")), { lang: "en", speed: 2 });
});

test("prefs: valores inválidos voltam ao valor por omissão", () => {
  const s = createStorage(fakeLocalStorage());
  s.setPrefs({ speed: 7, outra: "coisa" });
  assert.equal(s.getPrefs().speed, 1);
  assert.equal("outra" in s.getPrefs(), false);
});

test("prefs: lê o que já estava guardado no localStorage", () => {
  const ls = fakeLocalStorage({ [STORAGE_PREFIX + "prefs"]: JSON.stringify({ lang: "pt", speed: 1.5 }) });
  assert.deepEqual(createStorage(ls).getPrefs(), { lang: "pt", speed: 1.5 });
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
  s.addToHistory("p ⊢ p");
  s.addToHistory("p ∧ q ⊢ q");
  assert.deepEqual(s.getHistory().map((e) => e.sequent), ["p ∧ q ⊢ q", "p ⊢ p"]);
  assert.equal(typeof s.getHistory()[0].savedAt, "number");
});

test("history: sem duplicados (o repetido sobe para o topo) e ignora vazios", () => {
  const s = createStorage(fakeLocalStorage());
  s.addToHistory("a");
  s.addToHistory("b");
  s.addToHistory("  a  ");
  s.addToHistory("   ");
  assert.deepEqual(s.getHistory().map((e) => e.sequent), ["a", "b"]);
});

test("history: no máximo 20 entradas, cai a mais antiga", () => {
  const s = createStorage(fakeLocalStorage());
  for (let i = 1; i <= 25; i++) s.addToHistory(`p${i}`);
  const history = s.getHistory();
  assert.equal(HISTORY_MAX, 20);
  assert.equal(history.length, 20);
  assert.equal(history[0].sequent, "p25");
  assert.equal(history[19].sequent, "p6");
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
  assert.equal(s.getProgress("and-swap"), null);
  s.setProgress("and-swap", { status: "done", hints: 1 });
  s.setProgress("modus-tollens", { status: "started" });
  assert.deepEqual(s.getProgress("and-swap"), { status: "done", hints: 1 });
  assert.deepEqual(Object.keys(s.getAllProgress()).sort(), ["and-swap", "modus-tollens"]);
  s.resetProgress();
  assert.deepEqual(s.getAllProgress(), {});
});

test("progress: reset parcial apaga só as entradas pedidas (e persiste)", () => {
  const backend = fakeLocalStorage();
  const s = createStorage(backend);
  s.setProgress("and-swap", { status: "done" });
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
  assert.deepEqual(s.getHistory().map((e) => e.sequent), ["p"]);
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
  assert.deepEqual(getterQueLanca.getHistory().map((e) => e.sequent), ["q"]);
});

test("se a escrita falhar, não se lê um valor antigo do localStorage", () => {
  const ls = fakeLocalStorage({ [STORAGE_PREFIX + "prefs"]: JSON.stringify({ lang: "pt" }) });
  ls.setItem = () => { throw new Error("QuotaExceededError"); };
  const s = createStorage(ls);
  s.setPrefs({ lang: "en" });
  assert.equal(s.getPrefs().lang, "en");
});

test("lastQuery: guarda a última query de cada página, apaga e ignora lixo", () => {
  const ls = fakeLocalStorage();
  const s = createStorage(ls);
  assert.equal(s.getLastQuery("step"), null);
  s.setLastQuery("step", "s=p&step=2");
  s.setLastQuery("prove", "s=p");
  assert.equal(s.getLastQuery("step"), "s=p&step=2");
  assert.equal(s.getLastQuery("prove"), "s=p");
  assert.equal(JSON.parse(ls.data.get(STORAGE_PREFIX + "step")), "s=p&step=2");
  s.clearLastQuery("prove");
  assert.equal(s.getLastQuery("prove"), null);
  assert.equal(ls.data.has(STORAGE_PREFIX + "prove"), false);
  assert.equal(createStorage(fakeLocalStorage({ [STORAGE_PREFIX + "step"]: "42" })).getLastQuery("step"), null);
  const blocked = createStorage(brokenLocalStorage);
  blocked.setLastQuery("step", "s=p");
  assert.equal(blocked.getLastQuery("step"), "s=p");
});
