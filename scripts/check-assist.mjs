// Painel de ajuda no Chrome a 390px, com toques a sério (CDP) e o Worker verdadeiro, sob a CSP do site.
// Uso: node scripts/check-assist.mjs   (arranca o próprio servidor, numa porta livre)
// Em PT e em EN: estado vazio, 3 níveis de dica, ajuda desatualizada, solução de raiz e a partir da prova
// parcial, usar a solução, cancelar, prova acabada e contraexemplo.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/assist");
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
        target.scrollIntoView({ block: "center", behavior: "instant" });
        await frame();
        const now = target.getBoundingClientRect().top;
        stable = now === top ? stable + 1 : 0;
        top = now;
      }
      const box = target.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, height: box.height };
    })()`);
    await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] });
    await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(80);
    return box.height;
  };
  return { page, evaluate, tap, close: () => socket.close() };
}

const problems = [];
const expect = (actual, wanted, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    problems.push(`${what}: ${JSON.stringify(actual)}, esperava ${JSON.stringify(wanted)}`);
  }
};

const TEXTS = {
  pt: {
    empty: "Empancaste",
    target: "Objetivo de agora",
    levels: ["Estratégia", "Regra", "Passo exato"],
    scratch: "Encontrei esta prova",
    partial: "mantém as tuas linhas",
    restart: "começa de novo",
    cancelled: "Cancelaste",
    done: "já está completa",
    valuation: ["p = F", "q = V"],
    premise: "premissa",
  },
  en: {
    empty: "Stuck",
    target: "Current goal",
    levels: ["Strategy", "Rule", "Exact step"],
    scratch: "Here is a proof",
    partial: "keeps your lines",
    restart: "starts over",
    cancelled: "You cancelled",
    done: "already complete",
    valuation: ["p = F", "q = T"],
    premise: "premise",
  },
};

async function writeScreenshot(page, name) {
  const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  mkdirSync(SCREENS, { recursive: true });
  writeFileSync(join(SCREENS, `${name}.png`), Buffer.from(data, "base64"));
}

async function scenario({ page, evaluate, tap }, origin, path, lang) {
  const tag = (what) => `${lang}: ${what}`;
  const text = TEXTS[lang];
  const body = () => evaluate(`document.querySelector(".assist__body")?.textContent ?? ""`);
  const waitBody = (wanted) => waitFor(async () => (await body()).includes(wanted), tag(`«${wanted}»`));

  const open = async (sequent) => {
    await page("Page.navigate", { url: `${origin}${path}` });
    await waitFor(() => evaluate(`document.querySelector("#sequent") !== null && document.getElementById("start-proof") !== null`));
    await sleep(100);
    await evaluate(`document.querySelector("#sequent").focus()`);
    await page("Input.insertText", { text: sequent });
    await tap("#start-proof");
    await waitFor(() => evaluate(`document.querySelector('[data-assist="hint"]') !== null`), tag("o painel"));
  };

  const fill = async (line, field, value) => {
    await evaluate(`document.getElementById("proof-${field}-${line}").focus()`);
    await page("Input.insertText", { text: value });
  };

  const fits = async (what) => {
    const width = await evaluate("document.documentElement.scrollWidth");
    expect(width <= WIDTH, true, tag(`${what}: largura da página ${width}`));
  };

  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(`document.querySelector("#sequent") !== null`));
  expect(await evaluate(`document.getElementById("proof-assist").childElementCount`), 0, tag("sem prova não há painel"));

  // Estado vazio e os 3 níveis.
  await open("p ∧ q ⊢ q ∧ p");
  expect((await body()).includes(text.empty), true, tag("estado vazio"));
  await writeScreenshot(page, `${lang}-vazio`);
  const heights = [await tap('[data-assist="hint"]')];
  await waitBody(text.levels[0]);
  expect((await body()).includes(text.target), true, tag("a dica diz o objetivo"));
  heights.push(await tap('[data-assist="more"]'));
  await waitBody(text.levels[1]);
  expect((await body()).includes(text.levels[2]), false, tag("o nível 3 ainda não aparece"));
  await tap('[data-assist="more"]');
  await waitBody(text.levels[2]);
  expect(await evaluate(`document.querySelector('[data-assist="more"]') === null`), true, tag("sem mais níveis"));
  expect(await evaluate(`document.activeElement?.dataset.assist`), "hint", tag("o foco fica no painel"));
  await writeScreenshot(page, `${lang}-dica`);
  await fits("dica");

  // Mudar a prova tira a ajuda, porque já não vale.
  await fill(2, "formula", "q");
  await waitBody(text.empty);

  // Solução a partir da prova parcial.
  await fill(2, "justification", "∧E, 1");
  await tap('[data-assist="solve"]');
  await waitBody(text.partial);
  expect(await evaluate(`document.querySelectorAll(".assist__body .fitch__line").length >= 3`), true, tag("mostra a prova"));
  await writeScreenshot(page, `${lang}-solucao-parcial`);
  await fits("solução");
  heights.push(await tap('[data-assist="use"]'));
  await waitBody(text.empty);
  await waitFor(() => evaluate(`document.querySelector(".proof-editor__status .msg-ok") !== null`), tag("a prova completa"));
  await tap('[data-assist="hint"]');
  await waitBody(text.done);
  await writeScreenshot(page, `${lang}-acabada`);

  // Desfazer devolve o que estava escrito.
  await tap('[data-action="undo"]');
  await waitBody(text.empty);
  expect(await evaluate(`document.getElementById("proof-formula-2").value`), "q", tag("desfazer repõe a prova"));
  expect(await evaluate(`document.querySelectorAll(".fitch-edit__line").length`), 1, tag("desfazer tira as linhas da solução"));

  // Uma linha errada: começa de novo.
  await open("p ∧ q ⊢ q");
  await fill(2, "formula", "r");
  await fill(2, "justification", "∧E, 1");
  await tap('[data-assist="solve"]');
  await waitBody(text.restart);
  await writeScreenshot(page, `${lang}-solucao-de-novo`);

  // Solução de raiz, com a sigla do idioma, também no modo guiado.
  await open("⊢ p ∨ ¬p");
  await tap('[data-mode="guided"]');
  expect((await body()).includes(text.empty), true, tag("trocar de modo não mexe no painel"));
  await tap('[data-assist="solve"]');
  await waitBody(text.scratch);
  expect((await body()).includes(lang === "pt" ? "RA," : "RAA,"), true, tag("a sigla segue o idioma"));
  await tap('[data-assist="use"]');
  await waitFor(() => evaluate(`document.querySelector(".proof-editor__status .msg-ok") !== null`), tag("a solução no modo guiado"));

  // Cancelar antes de a resposta chegar.
  await open("p ∧ q ⊢ q ∧ p");
  await evaluate(`(() => {
    document.querySelector('[data-assist="solve"]').click();
    document.querySelector('[data-assist="cancel"]').click();
  })()`);
  await waitBody(text.cancelled);
  await writeScreenshot(page, `${lang}-cancelada`);
  await tap('[data-assist="solve"]');
  await waitBody(text.scratch);

  // Sequente inválido.
  await open("p ∨ q ⊢ p");
  await tap('[data-assist="hint"]');
  await waitFor(() => evaluate(`document.querySelector(".assist__valuation") !== null`), tag("o contraexemplo"));
  expect(await evaluate(`[...document.querySelectorAll(".assist__valuation li")].map((item) => item.textContent)`), text.valuation, tag("valoração"));
  await writeScreenshot(page, `${lang}-contraexemplo`);
  await fits("contraexemplo");
  expect(Math.min(...heights) >= 44, true, tag(`zonas de toque com ${Math.min(...heights)}px`));
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
problems.push(...consoleProblems);
for (const problem of problems) console.error(`- ${problem}`);
if (problems.length === 0) console.log("OK painel de ajuda");
process.exit(problems.length > 0 ? 1 : 0);
