// Modo de escrita no Chrome a 390px, só com teclas a sério (eventos de input do CDP).
// Uso: node scripts/check-editor.mjs   (arranca o próprio servidor, numa porta livre)
// Faz a prova de tests/fixtures/keyboard-proof.js sem tocar no rato, com a página em PT e em EN, e
// confirma desfazer, erro por linha, foco e que a página não ganha scroll horizontal.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { KEYBOARD_GOAL, KEYBOARD_LINES, KEYBOARD_STEPS } from "../tests/fixtures/keyboard-proof.js";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/editor");
const WIDTH = 390;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera até `condition()` ser verdade: os testes correm em paralelo, e uma espera fixa falha com carga. */
async function waitFor(condition, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (!(await condition().catch(() => false))) {
    if (Date.now() > deadline) throw new Error("a página não ficou pronta a tempo");
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
const expect = (actual, wanted, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    problems.push(`${what}: ${JSON.stringify(actual)}, esperava ${JSON.stringify(wanted)}`);
  }
};

const KEY_CODES = {
  Enter: { code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Backspace: { code: "Backspace", windowsVirtualKeyCode: 8 },
  z: { code: "KeyZ", windowsVirtualKeyCode: 90 },
  y: { code: "KeyY", windowsVirtualKeyCode: 89 },
};

async function scenario({ page, evaluate }, origin, path, lang) {
  const tag = (what) => `${lang}: ${what}`;

  /** Modificadores do CDP: Alt 1, Ctrl 2, Meta 4, Shift 8. */
  const press = async ({ key, ctrl = false, shift = false }) => {
    const { text, ...codes } = KEY_CODES[key];
    const modifiers = (ctrl ? 2 : 0) + (shift ? 8 : 0);
    const plain = text && !ctrl && !shift;
    await page("Input.dispatchKeyEvent", { type: plain ? "keyDown" : "rawKeyDown", key, modifiers, ...codes, ...(plain ? { text } : {}) });
    await page("Input.dispatchKeyEvent", { type: "keyUp", key, modifiers, ...codes });
    await sleep(15);
  };
  const type = async (text) => {
    for (const char of text) await page("Input.insertText", { text: char });
    await sleep(15);
  };
  const field = () => evaluate(`document.activeElement?.id ?? ""`);
  const lineCount = () => evaluate(`document.querySelectorAll("#proof-editor .fitch__line").length`);
  const states = () => evaluate(`[...document.querySelectorAll("#proof-editor .fitch__line")].map((row) => row.dataset.state)`);
  const valueOf = (id) => evaluate(`document.getElementById(${JSON.stringify(id)})?.value`);
  const errorOf = (line) => evaluate(`(() => {
    const box = document.getElementById("proof-error-${line}");
    return box.hidden ? null : box.textContent;
  })()`);

  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(`document.querySelector("#sequent") !== null && document.getElementById("start-proof") !== null`));
  await sleep(100);
  await evaluate(`document.querySelector("#sequent").focus()`);
  await type(KEYBOARD_GOAL);
  await press({ key: "Enter" });
  await sleep(50);
  expect(await field(), "proof-formula-2", tag("Enter no sequente leva o foco à primeira linha livre"));
  expect(await evaluate(`document.getElementById("proof-empty").hidden`), true, tag("o estado vazio sai"));

  for (const step of KEYBOARD_STEPS) {
    if (typeof step === "string") await type(step);
    else await press(step);
  }
  await sleep(50);
  expect(await lineCount(), KEYBOARD_LINES, tag("todas as linhas da prova"));
  expect(await states(), Array(KEYBOARD_LINES).fill("ok"), tag("todas as linhas certas"));
  expect(await evaluate(`document.querySelector(".proof-editor__status .msg-ok") !== null`), true, tag("a prova fica completa"));
  expect(await valueOf("proof-justification-5"), "→E, 2, 4", tag("ASCII passa a símbolos ao sair do campo"));
  await writeScreenshot(page, `${lang}-completa`);

  const measures = await evaluate(`(() => {
    const row = document.querySelector('.fitch-edit__line[data-line="5"]');
    const input = row.querySelector("input");
    return {
      pageWidth: document.documentElement.scrollWidth,
      inputRight: input.getBoundingClientRect().right,
      fontSize: parseFloat(getComputedStyle(input).fontSize),
      inputHeight: input.getBoundingClientRect().height,
      bars: row.querySelectorAll(".fitch__bar").length,
    };
  })()`);
  expect(measures.pageWidth <= WIDTH, true, tag(`largura da página ${measures.pageWidth}`));
  expect(measures.inputRight <= WIDTH, true, tag("o campo cabe no ecrã"));
  expect(measures.fontSize >= 16, true, tag("campo com 16px, sem zoom no iOS"));
  expect(measures.inputHeight >= 44, true, tag("campo com 44px de altura"));
  expect(measures.bars, 4, tag("barras da linha 5"));

  // Um erro na linha do cursor espera por uma pausa, numa só frase, e desfazer tira-o.
  await evaluate(`document.getElementById("proof-justification-10").focus()`);
  await sleep(30);
  await type("9");
  await sleep(30);
  expect(await errorOf(10), null, tag("o erro novo espera por uma pausa"));
  await sleep(800);
  const error = await errorOf(10);
  expect(typeof error === "string" && error.length > 0, true, tag("o erro aparece na própria linha"));
  expect(await states().then((list) => list[9]), "error", tag("a linha fica com erro"));
  await writeScreenshot(page, `${lang}-erro`);

  await press({ key: "z", ctrl: true });
  await sleep(50);
  expect(await errorOf(10), null, tag("desfazer tira o erro"));
  expect(await field(), "proof-justification-10", tag("desfazer mantém o foco na linha"));
  await press({ key: "y", ctrl: true });
  await sleep(50);
  expect((await valueOf("proof-justification-10")).endsWith("9"), true, tag("refazer repõe o texto"));
  await press({ key: "z", ctrl: true });
  await sleep(50);

  // O Tab segue pelos campos, pela ordem das linhas.
  await evaluate(`document.getElementById("proof-formula-9").focus()`);
  await page("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await page("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await sleep(30);
  expect(await field(), "proof-justification-9", tag("o Tab passa à justificação"));

  // Apagar a linha 10 com a tecla de atalho; desfazer repõe-na.
  await evaluate(`document.getElementById("proof-formula-10").focus()`);
  await sleep(30);
  await press({ key: "Backspace", ctrl: true, shift: true });
  await sleep(50);
  expect(await lineCount(), KEYBOARD_LINES - 1, tag("o atalho apaga a linha"));
  expect(await evaluate(`document.activeElement?.closest("[data-line]")?.dataset.line`), "9", tag("o foco sobe"));
  await press({ key: "z", ctrl: true });
  await sleep(50);
  expect(await lineCount(), KEYBOARD_LINES, tag("desfazer repõe a linha"));
}

async function writeScreenshot(page, name) {
  const { data } = await page("Page.captureScreenshot", { format: "png" });
  mkdirSync(SCREENS, { recursive: true });
  writeFileSync(join(SCREENS, `${name}.png`), Buffer.from(data, "base64"));
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
  await scenario(client, origin, "/provar", "pt");
  await scenario(client, origin, "/en/prove", "en");
  client.close();
} catch (error) {
  problems.push(error.stack ?? String(error));
} finally {
  chrome.kill("SIGKILL");
  server.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
for (const problem of problems) console.error(`- ${problem}`);
if (problems.length === 0) console.log("OK modo de escrita");
process.exit(problems.length > 0 ? 1 : 0);
