// «Encontra o passo errado» no Chrome a 390px: um desafio até ao fim, à mão e com o teclado.
// Uso: node scripts/check-find-error.mjs   (arranca o próprio servidor, numa porta livre)
// Monta cada desafio à mão na /exercicios, para os correr todos; a página em si: scripts/check-exercises.sh.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/find-error");
const WIDTH = 390;
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
  await page("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 844, deviceScaleFactor: 2, mobile: true });

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
  const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  mkdirSync(SCREENS, { recursive: true });
  writeFileSync(join(SCREENS, `${name}.png`), Buffer.from(data, "base64"));
}

/** Monta o desafio `id` no <main> e guarda em `window.solved` o que o `onSolved` recebe. */
const mount = (id) => `(async () => {
  const { FIND_ERROR_PUZZLES } = await import("/js/core/find-error.js");
  const { mountFindError } = await import("/js/ui/find-error.js");
  const main = document.querySelector("main");
  main.className = "wrap";
  main.replaceChildren();
  const box = document.createElement("div");
  main.append(box);
  window.solved = [];
  window.puzzle = FIND_ERROR_PUZZLES.find((item) => item.id === ${JSON.stringify(id)});
  mountFindError(box, { puzzle: window.puzzle, onSolved: (mark) => window.solved.push(mark) });
  await document.fonts.ready;
})()`;

const IDS = `(async () => (await import("/js/core/find-error.js")).FIND_ERROR_PUZZLES.map(({ id }) => id))()`;
const pageWidth = "document.documentElement.scrollWidth";

/** Clica no centro de um elemento com um toque de verdade, para contar com o que estiver por cima. */
async function tap({ page, evaluate }, selector) {
  const box = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    element.scrollIntoView({ block: "center" });
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x: x + width / 2, y: y + height / 2 };
  })()`);
  await page("Input.dispatchMouseEvent", { type: "mousePressed", ...box, button: "left", clickCount: 1 });
  await page("Input.dispatchMouseEvent", { type: "mouseReleased", ...box, button: "left", clickCount: 1 });
  await sleep(50);
}

/** Espera até 5 s que `expression` seja verdadeira: sob carga, um toque demora a chegar à página. */
async function settled({ evaluate }, expression) {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await evaluate(expression)) return true;
    await sleep(50);
  }
  return false;
}

async function pressEnter({ page }) {
  const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" };
  await page("Input.dispatchKeyEvent", { type: "keyDown", ...key });
  await page("Input.dispatchKeyEvent", { type: "keyUp", ...key });
  await sleep(50);
}

const focused = `(() => {
  const element = document.activeElement;
  return element?.dataset?.reason ?? element?.getAttribute("aria-label") ?? element?.className ?? "";
})()`;

async function byTouch(client) {
  const { evaluate, page } = client;
  await evaluate(mount("ex-err-negation-gained"));
  await sleep(100);

  const targets = await evaluate(`[...document.querySelectorAll(".fitch__pick")].map((button) => {
    const { width, height } = button.getBoundingClientRect();
    return Math.min(width, height);
  })`);
  check(targets.length === 6 && targets.every((size) => size >= 44), `botões de linha pequenos: ${targets}`);
  await writeScreenshot(page, "1-apontar");

  // A linha toda aceita o toque, e não só o número.
  await tap(client, '[data-line="2"] .fitch__formula');
  check(await settled(client, `document.querySelector('[data-line="2"]').dataset.state === "ok"`), "a linha certa não ficou assinalada");
  check(await evaluate(`document.querySelector('[data-line="2"] .fitch__pick').disabled`), "a linha recusada continua ativa");
  check((await evaluate(`document.querySelector(".find-error__live").textContent`)).includes("2"), "a recusa não foi anunciada");
  await writeScreenshot(page, "2-linha-certa");

  await tap(client, '[data-line="6"] .fitch__why');
  check(await settled(client, `document.querySelector('[data-line="6"]').dataset.state === "error"`), "a linha errada não ficou assinalada");
  check(await evaluate(`document.querySelectorAll("[data-reason]").length === 4`), "faltam explicações");
  check(await evaluate(`document.activeElement === document.querySelector("[data-reason]")`), "o foco não passou para as explicações");
  await writeScreenshot(page, "3-explicar");

  await tap(client, `[data-reason="closedSubproofLine"]`);
  check(await settled(client, `document.querySelector('[data-reason="closedSubproofLine"]').disabled`), "a explicação recusada continua ativa");
  check(await evaluate(`window.solved.length === 0`), "uma explicação errada resolveu o desafio");

  await tap(client, `[data-reason="negationIntroResult"]`);
  check(await settled(client, `window.solved.join() === "solved"`), "o desafio não ficou resolvido");
  check(await evaluate(`document.activeElement.classList.contains("find-error__done")`), "o foco não passou para o resultado");
  check(await evaluate(`document.querySelectorAll(".find-error__done .fitch__line").length === 7`), "falta a prova correta");
  check(await evaluate(`${pageWidth} <= ${WIDTH}`), "o resultado alargou a página");
  await writeScreenshot(page, "4-resolvido");
}

async function byKeyboard(client) {
  const { evaluate } = client;
  await evaluate(mount("ex-err-backwards-implication"));
  await sleep(100);

  await evaluate(`document.querySelector('[data-line="1"] .fitch__pick').focus()`);
  await pressEnter(client);
  check(await evaluate(`document.querySelector('[data-line="1"]').dataset.state === "ok"`), "Enter não escolheu a linha");
  const next = await evaluate(focused);
  check(next.includes("2"), `depois de recusar, o foco devia ir para a linha 2, e está em «${next}»`);

  await evaluate(`document.querySelector('[data-line="3"] .fitch__pick').focus()`);
  await pressEnter(client);
  check(await evaluate(`document.activeElement === document.querySelector("[data-reason]")`), "o teclado não chegou às explicações");

  await evaluate(`document.querySelector('[data-reason="' + window.puzzle.answer + '"]').focus()`);
  await pressEnter(client);
  check(await evaluate(`window.solved.join() === "solved"`), "o teclado não acabou o desafio");
  check((await evaluate(`document.querySelector(".find-error__view").textContent`)).includes("nem sequer é válido"), "falta o aviso do sequente inválido");
}

async function everyPuzzle({ evaluate }) {
  for (const id of await evaluate(IDS)) {
    await evaluate(mount(id));
    await sleep(30);
    const width = await evaluate(`(() => {
      const scroller = document.querySelector(".fitch");
      return { page: ${pageWidth}, right: scroller.getBoundingClientRect().right };
    })()`);
    check(width.page <= WIDTH && width.right <= WIDTH, `${id} sai dos ${WIDTH}px: ${JSON.stringify(width)}`);
  }
}

async function english({ evaluate, page }, origin) {
  await page("Page.navigate", { url: `${origin}/en/exercises` });
  await sleep(1000);
  await evaluate(mount("ex-err-de-morgan-split"));
  await sleep(100);
  const text = await evaluate(`document.querySelector(".find-error__view").textContent`);
  check(text.includes("Allowed rules: ") && text.includes("RAA"), "o desafio não mudou de idioma");
}

async function scenario(client, origin) {
  await client.page("Page.navigate", { url: `${origin}/exercicios` });
  await sleep(1000);
  await byTouch(client);
  await byKeyboard(client);
  await everyPuzzle(client);
  await english(client, origin);
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
  await scenario(client, origin);
  client.close();
} catch (error) {
  problems.push(error.stack ?? String(error));
} finally {
  chrome.kill("SIGKILL");
  server.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
for (const problem of problems) console.error(`- ${problem}`);
if (problems.length === 0) console.log("OK encontra o passo errado");
process.exit(problems.length > 0 ? 1 : 0);
