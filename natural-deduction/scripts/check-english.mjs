// As páginas EN no Chrome, em todos os estados que só existem depois de o JS correr: procura português
// no texto à vista e nos atributos lidos (aria-label, title, placeholder, alt) e nos metadados.
// Uso: node scripts/check-english.mjs   (arranca o próprio servidor, numa porta livre)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXERCISES } from "../js/core/exercises.js";
import { FIND_ERROR_PUZZLES } from "../js/core/find-error-catalog.js";
import { portugueseSign } from "../tests/helpers/portuguese.js";
import { stateQuery } from "./prove-states.mjs";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const firstMatch = (stream, pattern, what) => new Promise((resolve, reject) => {
  let text = "";
  const timer = setTimeout(() => reject(new Error(`${what} não arrancou a tempo`)), 15000);
  stream.on("data", (chunk) => {
    text += chunk;
    const match = text.match(pattern);
    if (match) {
      clearTimeout(timer);
      resolve(match[1]);
    }
  });
});

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable");
  await page("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  // Sem prova guardada e com movimento reduzido: a lição mostra tudo sem esperar pelo scroll.
  await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await page("Page.addScriptToEvaluateOnNewDocument", {
    source: 'try { localStorage.removeItem("nd:v1:prove"); localStorage.removeItem("nd:v1:step"); } catch {}',
  });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  return { page, evaluate, close: () => socket.close() };
}

// Tudo o que se lê: texto dos nós, mesmo os fechados, e atributos com texto. O nome da outra língua
// (com lang="pt") é a única exceção, porque tem de ser lido em português.
const COLLECT = `(() => {
  const found = [document.title, document.documentElement.lang === "en" ? "" : "html lang: " + document.documentElement.lang];
  for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]']) {
    found.push(document.querySelector(selector)?.content ?? "");
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent.closest("script, style, [lang='pt'], [lang='pt-PT'], [data-lang='pt']")) continue;
    found.push(node.textContent.trim());
  }
  for (const el of document.body.querySelectorAll("[aria-label], [title], [placeholder], [alt], [aria-valuetext]")) {
    if (el.closest("[lang='pt'], [lang='pt-PT'], [data-lang='pt']")) continue;
    for (const name of ["aria-label", "title", "placeholder", "alt", "aria-valuetext"]) {
      if (el.hasAttribute(name)) found.push(el.getAttribute(name));
    }
  }
  return [...new Set(found.filter(Boolean))];
})()`;

const problems = [];

async function scan({ evaluate }, what) {
  const texts = await evaluate(COLLECT);
  for (const text of texts) {
    const sign = portugueseSign(text);
    if (sign) problems.push(`${what}: ${sign.name} «${sign.match}» em «${text.slice(0, 120)}»`);
  }
  return texts.length;
}

async function settled({ evaluate }, expression, tries = 200) {
  for (let i = 0; i < tries; i += 1) {
    if (await evaluate(expression)) return true;
    await sleep(100);
  }
  return false;
}

async function open(client, url, ready) {
  await client.page("Page.navigate", { url });
  const done = await settled(client, `document.readyState === "complete" && document.querySelector(".ftr, footer") !== null && (${ready})`);
  if (!done) throw new Error(`${url}: a página não ficou pronta`);
}

const clickAll = (selector) => `document.querySelectorAll(${JSON.stringify(selector)}).forEach((el) => el.click())`;
const click = (selector) => `document.querySelector(${JSON.stringify(selector)})?.click()`;
const exists = (selector) => `document.querySelector(${JSON.stringify(selector)}) !== null`;

// Um clique que não chega ao estado pedido falhava em silêncio e o estado ficava por ver.
async function reach(client, action, ready, what) {
  await client.evaluate(action);
  if (await settled(client, ready)) await scan(client, what);
  else problems.push(`${what}: o estado não apareceu`);
}

// A ajuda da Provar, nos seus estados: a dica até ao fim, depois a solução.
async function assist(client, what) {
  await reach(client, click('[data-assist="hint"]'), exists(".assist__levels"), `${what}, dica`);
  await client.evaluate(click('[data-assist="more"]'));
  await reach(client, click('[data-assist="more"]'), `document.querySelectorAll(".assist__level").length === 3`, `${what}, dica exata`);
  await reach(client, click('[data-assist="solve"]'), exists('[data-assist="use"]'), `${what}, solução`);
}

// Um sequente em que a prova gerada usa as regras com sigla própria em cada idioma.
const CLASSICAL = encodeURIComponent("|- p | ~p");
const INVALID = encodeURIComponent("p | q |- p");

async function prove(client, origin) {
  await open(client, `${origin}/en/prove`, exists("#sequent"));
  await scan(client, "/en/prove");
  await reach(client, click(".examples-menu summary, details summary"), exists(".examples-menu__item"), "/en/prove, exemplos");

  await open(client, `${origin}/en/prove?${stateQuery("mixed")}`, exists("[data-line]"));
  await scan(client, "/en/prove, prova com erro");
  await reach(client, click('[data-mode="guided"]'), exists(".guided"), "/en/prove, modo guiado");
  await open(client, `${origin}/en/prove?${stateQuery("mixed")}`, exists("[data-assist]"));
  await assist(client, "/en/prove");

  await open(client, `${origin}/en/prove?${stateQuery("complete")}`, exists("[data-line]"));
  await scan(client, "/en/prove, prova completa");

  await open(client, `${origin}/en/prove?s=${CLASSICAL}`, exists("#sequent"));
  await client.evaluate(click("main .btn"));
  if (await settled(client, exists("[data-assist]"), 30)) await assist(client, "/en/prove, regras derivadas");
  else problems.push("/en/prove: a prova clássica não abriu");

  // Sequente inválido: a ajuda dá o contraexemplo, com T/F, e nunca com V.
  await open(client, `${origin}/en/prove?s=${INVALID}`, exists("#sequent"));
  await client.evaluate(click("main .btn"));
  await settled(client, exists("[data-assist]"), 30);
  await reach(client, click('[data-assist="hint"]'), exists(".assist__valuation"), "/en/prove, sequente inválido");
  const values = await client.evaluate('document.querySelector(".assist__valuation")?.textContent ?? ""');
  if (/= V/.test(values)) problems.push(`/en/prove, contraexemplo com V: ${values}`);
}

async function step(client, origin) {
  await open(client, `${origin}/en/step-by-step`, exists("#sequent"));
  await scan(client, "/en/step-by-step");
  const s = encodeURIComponent("p -> q, ~q |- ~p");
  await open(client, `${origin}/en/step-by-step?s=${s}&step=3`, exists(".fitch"));
  await scan(client, "/en/step-by-step, passo 3");
  await open(client, `${origin}/en/step-by-step?s=${s}&step=3&view=tree`, exists(".gentzen"));
  await scan(client, "/en/step-by-step, árvore");
  await open(client, `${origin}/en/step-by-step?s=${CLASSICAL}&step=99`, exists(".fitch"));
  await scan(client, "/en/step-by-step, regras derivadas");
  const labels = await client.evaluate('document.querySelector(".fitch").textContent');
  if (!/RAA|LEM/.test(labels)) problems.push(`/en/step-by-step: a prova clássica não mostrou RAA nem LEM: ${labels}`);
  await open(client, `${origin}/en/step-by-step?s=${INVALID}`, exists(".assist__valuation"));
  await scan(client, "/en/step-by-step, sequente inválido");
}

async function learn(client, origin) {
  const { evaluate } = client;
  await open(client, `${origin}/en/learn`, exists(".quiz__option"));
  await scan(client, "/en/learn");
  await reach(client, clickAll(".lesson-check__option"), '[...document.querySelectorAll(".lesson-check__feedback")].some((el) => el.textContent.trim())', "/en/learn, perguntas respondidas");
  await reach(client, clickAll(".lesson-lab [data-role='solution']"), exists(".lesson-lab [data-state='ok']"), "/en/learn, laboratórios");
  // O quiz até ao fim, a responder sempre à primeira opção.
  for (let i = 0; i < 40 && !(await evaluate(exists(".quiz [data-restart]"))); i += 1) {
    await evaluate(`(document.querySelector(".quiz [data-next]") ?? document.querySelector(".quiz__option"))?.click()`);
    await sleep(50);
    await scan(client, "/en/learn, quiz");
  }
  if (!(await evaluate(exists(".quiz [data-restart]")))) problems.push("/en/learn: o quiz não chegou ao fim");
}

async function exercises(client, origin) {
  await open(client, `${origin}/en/exercises`, 'document.querySelector(".exercise-item") !== null');
  await scan(client, "/en/exercises");
  await open(client, `${origin}/en/exercises?mode=findError`, 'document.querySelector(".exercise-item") !== null');
  await scan(client, "/en/exercises, encontrar o erro");
  // Um exercício por conjunto de regras, para ver todas as frases sobre as regras permitidas.
  const seen = new Set();
  for (const { id, rules } of EXERCISES) {
    const shape = JSON.stringify(Object.keys(typeof rules === "string" ? { [rules]: 1 } : rules ?? {}));
    if (seen.has(shape)) continue;
    seen.add(shape);
    await open(client, `${origin}/en/exercises?ex=${id}`, 'document.querySelector("[data-line], .fitch") !== null');
    await scan(client, `/en/exercises?ex=${id}`);
  }
  for (const { id } of FIND_ERROR_PUZZLES) {
    await open(client, `${origin}/en/exercises?ex=${id}&mode=findError`, 'document.querySelector(".fitch") !== null');
    await scan(client, `/en/exercises?ex=${id}`);
  }
}

// O controlo: a mesma procura numa página PT tem de dar por isso, senão o resto não prova nada.
async function control(client, origin) {
  const before = problems.length;
  await open(client, `${origin}/provar`, exists("#sequent"));
  await scan(client, "controlo");
  if (problems.length === before) problems.push("controlo: a procura não viu português na página PT");
  else problems.length = before;
}

const server = spawn("node", [join(ROOT, "scripts/serve.mjs"), "0"], { stdio: ["ignore", "pipe", "ignore"] });
const profile = mkdtempSync(join(tmpdir(), "nd-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", `--user-data-dir=${profile}`,
  "--remote-debugging-port=0", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

try {
  const [origin, wsUrl] = await Promise.all([
    firstMatch(server.stdout, /(http:\/\/localhost:\d+)\//, "O servidor"),
    firstMatch(chrome.stderr, /DevTools listening on (ws:\/\/\S+)/, "O Chrome"),
  ]);
  const client = await connect(wsUrl);
  await open(client, `${origin}/en`, 'document.querySelector("[data-home-demo]") !== null');
  await scan(client, "/en");
  await prove(client, origin);
  await step(client, origin);
  await learn(client, origin);
  await exercises(client, origin);
  await open(client, `${origin}/en/does-not-exist`, 'document.querySelector(".not-found__title") !== null');
  await scan(client, "404 em EN");
  await control(client, origin);
  client.close();
} catch (error) {
  problems.push(error.stack ?? String(error));
} finally {
  chrome.kill("SIGKILL");
  server.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
const unique = [...new Set(problems)];
for (const problem of unique) console.error(`- ${problem}`);
if (unique.length === 0) console.log("OK páginas EN sem português");
process.exit(unique.length > 0 ? 1 : 0);
