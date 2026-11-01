// A demonstração da página inicial no Chrome a 390px: arranca ao entrar no ecrã, pausa, acaba na prova
// completa, repete, não mexe na página e, com movimento reduzido, mostra logo a prova toda.
// Uso: node scripts/check-home.mjs   (arranca o próprio servidor, numa porta livre)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/home");
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
  await page("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  return { page, evaluate, close: () => socket.close() };
}

const problems = [];
const check = (condition, what) => {
  if (!condition) problems.push(what);
};

async function writeScreenshot(page, name) {
  const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  mkdirSync(SCREENS, { recursive: true });
  writeFileSync(join(SCREENS, `${name}.png`), Buffer.from(data, "base64"));
}

async function settled({ evaluate }, expression, tries = 200) {
  for (let i = 0; i < tries; i += 1) {
    if (await evaluate(expression)) return true;
    await sleep(100);
  }
  return false;
}

const DEMO = 'document.querySelector("[data-home-demo]")';
const frame = `Number(${DEMO}.dataset.frame)`;
const playing = `${DEMO}.dataset.playing === "true"`;
const label = `${DEMO}.querySelector("[data-role=toggle]").textContent`;
const visibleLines = `[...${DEMO}.querySelectorAll(".fitch__line")].filter((line) => getComputedStyle(line).visibility === "visible").length`;
const demoHeight = `${DEMO}.getBoundingClientRect().height`;
const pageHeight = "document.documentElement.scrollHeight";
const reserved = `parseFloat(getComputedStyle(${DEMO}).minHeight)`;

async function open(client, url) {
  await client.page("Page.navigate", { url });
  const ready = await settled(client, `document.readyState === "complete" && ${DEMO}?.dataset.frame !== undefined`);
  if (!ready) throw new Error(`${url}: a demonstração não apareceu`);
}

const tapToggle = (client) => client.evaluate(`${DEMO}.querySelector("[data-role=toggle]").click()`);

async function playThrough(client, origin) {
  const { evaluate, page } = client;
  await open(client, `${origin}/`);
  await evaluate(`${DEMO}.scrollIntoView({ block: "center", behavior: "instant" })`);
  check(await settled(client, `${frame} >= 2`), "a demonstração não arrancou ao entrar no ecrã");
  const height = await evaluate(pageHeight);
  check(await evaluate(`document.documentElement.scrollWidth`) <= 390, "transbordo horizontal");
  await writeScreenshot(page, "1-a-meio");

  await tapToggle(client);
  const paused = await evaluate(frame);
  await sleep(1500);
  check(await evaluate(frame) === paused, "a pausa não parou a demonstração");
  check(await evaluate(label) === "Continuar", `botão em pausa: ${await evaluate(label)}`);

  await tapToggle(client);
  check(await evaluate(label) === "Pausar", `botão a reproduzir: ${await evaluate(label)}`);
  check(await settled(client, `!(${playing})`, 400), "a demonstração não acabou");
  check(await evaluate(visibleLines) === 9, `linhas à vista no fim: ${await evaluate(visibleLines)}`);
  check(await evaluate(`${DEMO}.querySelectorAll('[data-state="ok"]').length`) === 9, "nem todas as linhas estão certas");
  check(await evaluate(`${DEMO}.querySelector(".msg-ok") !== null`), "sem a mensagem de prova completa");
  check(await evaluate(label) === "Ver outra vez", `botão no fim: ${await evaluate(label)}`);
  check(await evaluate(pageHeight) === height, "a altura da página mudou durante a demonstração");
  const reservedHeight = await evaluate(reserved);
  const finalHeight = await evaluate(demoHeight);
  check(finalHeight <= reservedHeight, `a demonstração (${finalHeight}px) passa do lugar guardado (${reservedHeight}px)`);
  await writeScreenshot(page, "2-fim");

  await tapToggle(client);
  check(await settled(client, `${playing} && ${frame} <= 3`), "«Ver outra vez» não voltou ao início");
}

async function reducedMotion(client, origin) {
  const { evaluate, page } = client;
  await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await open(client, `${origin}/`);
  await evaluate(`${DEMO}.scrollIntoView({ block: "center", behavior: "instant" })`);
  await sleep(1500);
  check(!(await evaluate(playing)), "com movimento reduzido, a demonstração arrancou sozinha");
  check(await evaluate(visibleLines) === 9, "com movimento reduzido, falta prova");
  check(await evaluate(`${DEMO}.querySelector(".msg-ok") !== null`), "com movimento reduzido, falta a conclusão");
  await page("Emulation.setEmulatedMedia", { features: [] });
}

async function english(client, origin) {
  const { evaluate } = client;
  await open(client, `${origin}/en`);
  await evaluate(`${DEMO}.scrollIntoView({ block: "center", behavior: "instant" })`);
  check(await settled(client, `${frame} >= 1`), "EN: a demonstração não arrancou");
  check(await evaluate(label) === "Pause", `EN: botão: ${await evaluate(label)}`);
  const caption = await evaluate(`${DEMO}.querySelector(".home-demo__caption [role=img]").textContent`);
  check(/^Line \d/.test(caption), `EN: legenda: ${caption}`);
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
  await playThrough(client, origin);
  await reducedMotion(client, origin);
  await english(client, origin);
  client.close();
} catch (error) {
  problems.push(error.stack ?? String(error));
} finally {
  chrome.kill("SIGKILL");
  server.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
for (const problem of problems) console.error(`- ${problem}`);
if (problems.length === 0) console.log("OK página inicial");
process.exit(problems.length > 0 ? 1 : 0);
