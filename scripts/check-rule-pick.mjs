// Escolher a regra de uma linha no modo de escrita, no Chrome, com toques a sério (CDP), a 390px e a 1280px.
// Uso: node scripts/check-rule-pick.mjs   (arranca o próprio servidor, numa porta livre)
// O toque no campo abre a lista, a regra pede as linhas, e a justificação escreve-se sozinha.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/rule-pick");
const WIDTH = 390;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition, what = "a página", timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (!(await condition().catch(() => false))) {
    if (Date.now() > deadline) throw new Error(`${what} não ficou pronta a tempo`);
    await sleep(50);
  }
}

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

const consoleProblems = [];

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
    if (message.method === "Runtime.exceptionThrown") {
      consoleProblems.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
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
  await page("Page.addScriptToEvaluateOnNewDocument", { source: 'try { localStorage.removeItem("nd:v1:prove"); } catch {}' });
  await page("Runtime.enable");
  await page("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 844, deviceScaleFactor: 2, mobile: true });
  await page("Emulation.setTouchEmulationEnabled", { enabled: true });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const tap = async (selector) => {
    // Dar foco a um campo desloca a página depois de um frame: mede-se só com a posição estável.
    const box = await evaluate(`(async () => {
      const target = document.querySelector(${JSON.stringify(selector)});
      const frame = () => new Promise(requestAnimationFrame);
      let top = null;
      for (let stable = 0; stable < 3;) {
        target.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        await frame();
        const now = target.getBoundingClientRect().top;
        stable = now === top ? stable + 1 : 0;
        top = now;
      }
      const box = target.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height };
    })()`);
    await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] });
    await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(80);
    return box;
  };
  return { page, evaluate, tap, close: () => socket.close() };
}

const problems = [];
const expect = (actual, wanted, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    problems.push(`${what}: ${JSON.stringify(actual)}, esperava ${JSON.stringify(wanted)}`);
  }
};

async function writeScreenshot(page, name) {
  const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  mkdirSync(SCREENS, { recursive: true });
  writeFileSync(join(SCREENS, `${name}.png`), Buffer.from(data, "base64"));
}

/** Uma árvore larga: cada linha do ∧I tem uma subárvore com fórmulas compridas. */
const WIDE_SEQUENT = "(alpha ∧ beta) ∧ gamma ⊢ ((gamma ∧ beta) ∧ alpha) ∧ ((alpha ∧ gamma) ∧ beta)";

async function scenario({ page, evaluate, tap }, origin, path, lang, width) {
  const tag = (what) => `${lang} @${width}: ${what}`;
  await page("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(`document.querySelector("#sequent") !== null && document.getElementById("start-proof") !== null`));
  await sleep(100);
  await evaluate(`document.querySelector("#sequent").focus()`);
  await page("Input.insertText", { text: "a, b ⊢ a ∧ b" });
  await tap("#start-proof");
  await waitFor(() => evaluate(`document.querySelector('[data-field="justification"]') !== null`), tag("o editor"));

  const field = '.fitch-edit__line [data-field="justification"]';
  const value = () => evaluate(`[...document.querySelectorAll(${JSON.stringify(field)})].at(-1).value`);
  const last = await evaluate(`[...document.querySelectorAll(".fitch-edit__line")].at(-1).dataset.line`);
  await tap(`.fitch-edit__line[data-line="${last}"] [data-field="justification"]`);
  await waitFor(() => evaluate(`document.querySelector("[data-pick-rule]") !== null`), tag("a lista de regras"));
  const shot = await evaluate(`document.querySelector('[data-pick-rule="∧I"]').getBoundingClientRect().height`);
  expect(shot >= 44, true, tag(`zona de toque de ${shot}`));
  await writeScreenshot(page, `${lang}-${width}-lista`);
  await tap('[data-pick-rule="∧I"]');
  await waitFor(() => evaluate(`document.querySelector("[data-pick-cite]") !== null`), tag("o pedido"));
  await writeScreenshot(page, `${lang}-${width}-pedido`);
  // A primeira linha por toque nela, a segunda pelo botão do painel.
  await tap('.fitch__line[data-line="1"]');
  await waitFor(() => evaluate(`document.querySelectorAll("[data-pick-cite]").length === 1`), tag("o segundo pedido"));
  expect(await evaluate(`document.querySelector("[data-picking] [data-cited]")?.dataset.line`), "1", tag("linha citada"));
  await tap("[data-pick-cite]");
  await waitFor(() => evaluate(`document.querySelector(".rule-pick") === null`), tag("o fim do pedido"));
  expect((await value()).endsWith(", 1, 2"), true, tag(`justificação: ${await value()}`));
  expect(await evaluate(`[...document.querySelectorAll(".fitch-edit__line")].at(-1).dataset.state`), "ok", tag("linha certa"));
  expect(await evaluate(`document.querySelector("[data-picking]") === null`), true, tag("sem linhas marcadas"));
  await writeScreenshot(page, `${lang}-${width}-feita`);

  // Esc cancela e deixa a linha como estava.
  await tap(`.fitch-edit__line[data-line="${last}"] [data-field="justification"]`);
  await waitFor(() => evaluate(`document.querySelector("[data-pick-rule]") !== null`), tag("a lista outra vez"));
  await tap('[data-pick-rule="R"]');
  await tap("[data-pick-cancel]");
  expect(await evaluate(`document.querySelector(".rule-pick") === null`), true, tag("cancelar fecha"));

  await tap("#proof-share summary");
  await writeScreenshot(page, `${lang}-${width}-partilha`);
  await page("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(100);
  await tap('[data-mode="guided"]');
  await writeScreenshot(page, `${lang}-${width}-guiado`);
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
  await scenario(client, origin, "/provar", "pt", 390);
  await scenario(client, origin, "/provar", "pt", 1280);
  await scenario(client, origin, "/en/prove", "en", 390);
  client.close();
} catch (error) {
  problems.push(error.stack ?? String(error));
} finally {
  chrome.kill("SIGKILL");
  server.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
problems.push(...consoleProblems);
for (const problem of problems) console.error(`- ${problem}`);
if (problems.length === 0) console.log("OK escolha de regras");
process.exit(problems.length > 0 ? 1 : 0);
