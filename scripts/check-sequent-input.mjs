// Campo de sequente no Chrome a 390px, com toques a sério (eventos de input do CDP).
// Uso: node scripts/check-sequent-input.mjs   (arranca o próprio servidor, numa porta livre)
// O teclado virtual simula-se: a janela fica com 844px e a zona visível com 504px, como num telemóvel.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/sequent-input");
const FIELD = "#sequent";
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
  await page("Page.addScriptToEvaluateOnNewDocument", { source: 'try { localStorage.removeItem("nd:v1:prove"); } catch {}' });
  await page("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page("Emulation.setTouchEmulationEnabled", { enabled: true });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const tap = async (selector) => {
    const box = await evaluate(`(() => {
      const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [box] });
    await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(120);
  };
  const type = (text) => page("Input.insertText", { text });
  return { page, evaluate, tap, type, close: () => socket.close() };
}

const problems = [];
const expect = (actual, wanted, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    problems.push(`${what}: ${JSON.stringify(actual)}, esperava ${JSON.stringify(wanted)}`);
  }
};

async function scenario({ evaluate, tap, type, page }, origin) {
  await page("Page.navigate", { url: `${origin}/provar` });
  // Os testes correm em paralelo: com carga, uma espera fixa chega antes de a página estar montada.
  for (let tries = 0; tries < 400 && !(await evaluate(`document.querySelector("${FIELD}") !== null`).catch(() => false)); tries += 1) {
    await sleep(50);
  }
  await sleep(100);

  const screenshot = async (name) => {
    const { data } = await page("Page.captureScreenshot", { format: "png" });
    mkdirSync(SCREENS, { recursive: true });
    writeFileSync(join(SCREENS, `${name}.png`), Buffer.from(data, "base64"));
  };

  const value = () => evaluate(`document.querySelector("${FIELD}").value`);
  const focused = () => evaluate(`document.activeElement?.id`);
  const errorText = () => evaluate(`(() => {
    const error = document.querySelector(".field-error");
    return error.hidden ? null : error.textContent;
  })()`);

  // Tocar nas teclas não tira o foco do campo: é isso que mantém o teclado aberto.
  await tap(FIELD);
  expect(await focused(), "sequent", "tocar no campo dá-lhe o foco");
  await type("p");
  for (const key of ["and", "not", "turnstile"]) {
    await tap(`[data-symbol="${key}"]`);
    expect(await focused(), "sequent", `a tecla ${key} mantém o foco`);
  }
  await type("q");
  expect(await value(), "p ∧ ¬ ⊢ q", "as teclas escrevem no cursor");

  // O erro espera por uma pausa, aparece com a coluna, e o sítio fica marcado.
  expect(await errorText(), null, "o erro novo espera por uma pausa");
  await sleep(900);
  expect(await errorText(), "Coluna 5: Falta uma fórmula junto de «¬».", "erro com a coluna");
  expect(await evaluate(`document.querySelector(".field-mirror mark").textContent`), "¬", "erro marcado");
  expect(await evaluate(`document.querySelector("${FIELD}").getAttribute("aria-invalid")`), "true", "aria-invalid");
  await screenshot("erro");

  // Com o erro à vista, corrigir tira-o logo.
  await evaluate(`(() => {
    const field = document.querySelector("${FIELD}");
    field.setSelectionRange(5, 5);
  })()`);
  await type("r");
  expect(await value(), "p ∧ ¬r ⊢ q", "o texto foi corrigido");
  expect(await errorText(), null, "o erro sai logo");
  expect(await evaluate(`document.querySelector(".preview").textContent`), "p ∧ ¬r ⊢ q", "leitura formatada");

  // Conversão, nas duas direções.
  await tap(".sequent-input__convert");
  expect(await value(), "p & ~r |- q", "passar a ASCII");
  await tap(".sequent-input__convert");
  expect(await value(), "p ∧ ¬r ⊢ q", "voltar a símbolos");

  // Enter não abre linha nova.
  await tap(FIELD);
  await page("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await page("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  expect(await value(), "p ∧ ¬r ⊢ q", "Enter não muda o texto");

  // Teclado virtual: a zona visível encolhe, e o campo e as teclas têm de ficar nela.
  await evaluate(`scrollTo(0, 0)`);
  await tap(FIELD);
  await evaluate(`(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 504 });
    visualViewport.dispatchEvent(new Event("resize"));
  })()`);
  await sleep(100);
  const layout = await evaluate(`(() => {
    const header = document.querySelector(".hdr").getBoundingClientRect();
    const field = document.querySelector("${FIELD}").getBoundingClientRect();
    const keys = document.querySelector(".keys").getBoundingClientRect();
    const smallest = Math.min(...[...document.querySelectorAll(".keys button")].flatMap((key) => {
      const box = key.getBoundingClientRect();
      return [box.width, box.height];
    }));
    return { top: field.top - header.bottom, bottom: keys.bottom, smallest };
  })()`);
  if (layout.top < 0) problems.push(`o cabeçalho tapa o campo (${layout.top}px)`);
  if (layout.bottom > 504) problems.push(`as teclas ficam atrás do teclado virtual (acabam em ${layout.bottom}px)`);
  if (layout.smallest < 44) problems.push(`tecla com ${layout.smallest}px, e o mínimo é 44`);
  await screenshot("teclado");

  // Um exemplo pela folha: entra no campo.
  await evaluate(`Object.defineProperty(visualViewport, "height", { configurable: true, value: 844 })`);
  await evaluate(`scrollTo(0, 0)`);
  await tap("#examples-menu summary");
  await sleep(300);
  await tap('.sheet [data-example="cases"], [data-example="cases"]');
  await sleep(300);
  expect(await value(), "a ∨ b, a → c, b → c ⊢ c", "escolher um exemplo");
}

const server = spawn("node", [join(ROOT, "scripts/serve.mjs"), "0"], { stdio: ["ignore", "pipe", "ignore"] });
const profile = mkdtempSync(join(tmpdir(), "nd-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", `--user-data-dir=${profile}`,
  "--remote-debugging-port=0", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let failed = false;
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
failed = problems.length > 0;
if (!failed) console.log("OK campo de sequente");
process.exit(failed ? 1 : 0);
