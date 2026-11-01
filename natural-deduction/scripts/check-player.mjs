// Player do Passo a passo no Chrome a 390px, com teclas e toques a sério (CDP), em PT e em EN.
// Uso: node scripts/check-player.mjs   (arranca o próprio servidor, numa porta livre)
// Avançar e recuar por botões e por teclas, abrir um passo por link, trocar de vista, reproduzir até ao
// fim e os links que não dão prova. O endereço tem de acompanhar sempre o que se vê.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/player");
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
  await page("Runtime.enable");
  await page("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 844, deviceScaleFactor: 2, mobile: true });
  await page("Emulation.setTouchEmulationEnabled", { enabled: true });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const tap = async (selector) => {
    const box = await evaluate(`(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      target.scrollIntoView({ block: "nearest", behavior: "instant" });
      const box = target.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] });
    await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(80);
  };
  const press = async (key, code = key, text = undefined) => {
    await page("Input.dispatchKeyEvent", { type: "keyDown", key, code, text });
    await page("Input.dispatchKeyEvent", { type: "keyUp", key, code });
  };
  return { page, evaluate, tap, press, close: () => socket.close() };
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

const SEQUENT = "s=p+-%3E+q,+~q+%7C-+~p";
const TEXTS = {
  pt: { counter: (i, n) => `Passo ${i} de ${n}`, title: "Hipótese", invalid: "não é válido", bad: "não se lê" },
  en: { counter: (i, n) => `Step ${i} of ${n}`, title: "Hypothesis", invalid: "not valid", bad: "read" },
};

async function scenario({ page, evaluate, tap, press }, origin, path, lang) {
  const tag = (what) => `${lang}: ${what}`;
  const text = TEXTS[lang];
  const open = async (query) => {
    await page("Page.navigate", { url: `${origin}${path}${query}` });
    await waitFor(() => evaluate(`document.querySelector(".tl-range") !== null`), tag(`o player em ${query}`));
  };
  const lines = () => evaluate(`document.querySelectorAll(".step-player__fitch [data-line]").length`);
  const state = () => evaluate(`({
    value: Number(document.querySelector(".tl-range").value),
    max: Number(document.querySelector(".tl-range").max),
    counter: document.querySelector(".tl-counter").textContent,
    search: decodeURIComponent(location.search),
    title: document.querySelector(".step-card__title").textContent,
  })`);

  // Abrir um passo por link.
  await open(`?${SEQUENT}&step=2`);
  const opened = await state();
  expect(opened.value, 2, tag("o link abre no passo 2"));
  expect(await lines(), 4, tag("no passo 2 há 2 premissas e 2 linhas"));
  expect(opened.counter, text.counter(2, opened.max), tag("contador"));
  expect(await evaluate(`document.querySelector('[data-step-mark="current"]').dataset.line`), "4", tag("linha atual"));
  expect(await evaluate(`document.documentElement.scrollWidth <= ${WIDTH}`), true, tag("sem scroll lateral"));
  await writeScreenshot(page, `${lang}-passo-2`);

  // Avançar e recuar com os botões.
  await tap('[data-role="next"]');
  expect((await state()).value, 3, tag("o botão avança"));
  expect(await lines(), 5, tag("avançar acrescenta a linha"));
  expect((await state()).search.includes("step=3"), true, tag("o endereço segue o avanço"));
  await tap('[data-role="prev"]');
  await tap('[data-role="prev"]');
  expect((await state()).value, 1, tag("o botão recua"));
  expect(await lines(), 3, tag("recuar tira a linha"));
  expect((await state()).search.includes("step=1"), true, tag("o endereço segue o recuo"));

  // As teclas, com o foco fora dos controlos.
  await evaluate(`document.activeElement?.blur()`);
  await press("ArrowRight");
  expect((await state()).value, 2, tag("→ avança"));
  await press("ArrowLeft");
  expect((await state()).value, 1, tag("← recua"));
  await press("End");
  const end = await state();
  expect(end.value, end.max, tag("End vai ao fim"));
  await evaluate(`document.querySelector(".fitch")?.blur()`);
  await press("ArrowRight");
  expect((await state()).value, end.max, tag("no fim, → fica"));
  await press("Home");
  expect((await state()).value, 0, tag("Home vai ao início"));
  expect((await state()).search.includes("step"), false, tag("o passo 0 não vai no link"));
  await press("ArrowLeft");
  expect((await state()).value, 0, tag("no início, ← fica"));

  // A vista.
  await open(`?${SEQUENT}&step=4&view=tree`);
  expect((await state()).value, 4, tag("o link abre o passo 4 na árvore"));
  expect(await evaluate(`document.querySelector(".gentzen") !== null && document.querySelector(".step-player__fitch").hidden`), true, tag("o link abre a árvore"));
  expect(await evaluate(`document.querySelector('[data-view="tree"]').getAttribute("aria-pressed")`), "true", tag("o seletor marca a árvore"));
  await writeScreenshot(page, `${lang}-arvore`);

  // Uma fórmula da árvore leva ao passo que a escreveu; a premissa fica.
  const hypothesis = await evaluate(`Number(document.querySelector('[data-tree-line="3"]').dataset.treeLine)`);
  expect(hypothesis, 3, tag("a hipótese está na árvore"));
  await tap('[data-tree-line="3"]');
  expect((await state()).value, 1, tag("a fórmula leva ao passo"));
  expect((await state()).title, text.title, tag("título do passo"));
  await tap('[data-view="fitch"]');
  expect((await state()).search.includes("view"), false, tag("a vista Fitch não vai no link"));
  expect(await lines(), 3, tag("a Fitch mostra o mesmo passo"));

  // O play vai até ao fim e para. A 2× não demora a suite.
  await open(`?${SEQUENT}`);
  await evaluate(`document.querySelector('[data-speed="2"]').click()`);
  await tap('[data-role="play"]');
  expect(await evaluate(`document.querySelector('[data-role="play"]').getAttribute("aria-pressed")`), "true", tag("play a tocar"));
  await waitFor(async () => {
    const now = await state();
    return now.value === now.max;
  }, tag("o play até ao fim"), 30000);
  await waitFor(() => evaluate(`document.querySelector('[data-role="play"]').getAttribute("aria-pressed") === "false"`), tag("o play parar"));
  expect(await evaluate(`document.querySelector(".step-card .msg-ok") !== null`), true, tag("o fim diz que acabou"));
  await writeScreenshot(page, `${lang}-fim`);

  // Um passo a mais vai ao último, e esse fica no endereço.
  await open(`?${SEQUENT}&step=999`);
  const clamped = await state();
  expect(clamped.value, clamped.max, tag("step=999 vai ao último"));
  expect(clamped.search.includes(`step=${clamped.max}`), true, tag("o endereço fica com o passo real"));

  // Links que não dão prova mantêm o endereço.
  await page("Page.navigate", { url: `${origin}${path}?s=p+%7C-+q&step=2` });
  await waitFor(() => evaluate(`document.querySelector("#step-message .msg-warn") !== null`), tag("o aviso de sequente inválido"));
  expect((await evaluate(`document.getElementById("step-message").textContent`)).includes(text.invalid), true, tag("sequente inválido"));
  expect(await evaluate(`document.getElementById("step-player").hidden`), true, tag("sem prova não há player"));
  expect(await evaluate(`location.search`), "?s=p+%7C-+q&step=2", tag("o endereço fica"));

  await page("Page.navigate", { url: `${origin}${path}?s=p+%7C-+(` });
  await waitFor(() => evaluate(`document.querySelector("#step-message .msg-error") !== null`), tag("o erro de link"));

  // Sem link e sem nada guardado; o que fica guardado é coberto pelo check-step.sh.
  await evaluate(`localStorage.removeItem("nd:v1:step")`);
  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(`document.querySelector(".hdr") !== null && document.querySelector("#sequent") !== null`), tag("a página sem link"));
  expect(await evaluate(`document.getElementById("step-empty").hidden`), false, tag("sem link fica o estado vazio"));
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
  await scenario(client, origin, "/passo-a-passo", "pt");
  await scenario(client, origin, "/en/step-by-step", "en");
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
if (problems.length === 0) console.log("OK player");
process.exit(problems.length > 0 ? 1 : 0);
