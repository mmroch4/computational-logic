// Estrutura da lição no Chrome, em PT e em EN: índice, links diretos e figuras.
// Uso: node scripts/check-learn.mjs   (arranca o próprio servidor, numa porta livre)
// A 390px, com toques a sério (CDP): link direto, folha do índice, avançar na prova e responder à
// pergunta. A 1280px: índice lateral sempre visível e ligação a uma secção. Uma secção só conta como
// alcançada se o título ficar à vista, por baixo do que está preso no topo.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/learn");
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
  await page("Emulation.setTouchEmulationEnabled", { enabled: true });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const tap = async (selector) => {
    const box = await evaluate(`(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      target.scrollIntoView({ block: "center", behavior: "instant" });
      const box = target.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] });
    await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(80);
  };
  /** Como o `tap`, sem deslocar: o que está preso no topo já está à vista. */
  const tapInPlace = async (selector) => {
    const box = await evaluate(`(() => {
      const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] });
    await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(80);
  };
  const resize = (width, height, mobile) => page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile });
  return { page, evaluate, tap, tapInPlace, resize, close: () => socket.close() };
}

const problems = [];
const expect = (actual, wanted, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    problems.push(`${what}: ${JSON.stringify(actual)}, esperava ${JSON.stringify(wanted)}`);
  }
};

async function writeScreenshot(page, name) {
  const { data } = await page("Page.captureScreenshot", { format: "png" });
  mkdirSync(SCREENS, { recursive: true });
  writeFileSync(join(SCREENS, `${name}.png`), Buffer.from(data, "base64"));
}

const TEXTS = {
  pt: { negation: "Negação (¬) e F", meta: "Solidez e completude", counter: (n) => `Linha ${n} de 6` },
  en: { negation: "Negation (¬) and F", meta: "Soundness and completeness", counter: (n) => `Line ${n} of 6` },
};

/** O título da secção `id`, à vista, e por baixo de tudo o que está preso no topo. */
const titleVisible = (id) => `(() => {
  const title = document.getElementById(${JSON.stringify(`${id}-title`)}).getBoundingClientRect();
  const stuck = [...document.querySelectorAll(".hdr, .lesson-toc__summary")]
    .map((el) => el.getBoundingClientRect())
    .filter((box) => box.height > 0)
    .reduce((bottom, box) => Math.max(bottom, box.bottom), 0);
  return title.top >= stuck && title.bottom <= innerHeight * 0.6;
})()`;

// As figuras das derivadas são as últimas a montar: a sua altura empurra as secções seguintes.
const figuresReady = `document.querySelectorAll(".lesson-rule").length === 12 && document.querySelectorAll(".lesson-derived").length === 7 &&document.querySelector(".lesson-check__option") !== null && document.querySelector(".lesson-toc__link") !== null`;

async function mobile({ page, evaluate, tap, tapInPlace, resize }, origin, path, lang) {
  const tag = (what) => `${lang} 390px: ${what}`;
  const text = TEXTS[lang];
  await resize(390, 844, true);

  // Link direto a uma secção do meio, já com as figuras montadas por cima dela.
  await page("Page.navigate", { url: `${origin}${path}#negacao` });
  await waitFor(() => evaluate(figuresReady), tag("a lição"));
  await sleep(800); // um scroll a meio tem de acabar: o que conta é onde a página fica
  await waitFor(() => evaluate(titleVisible("negacao")), tag("o título da secção do link direto"));
  await waitFor(() => evaluate(`document.querySelector(".lesson-toc__position").textContent === "6/9"`), tag("a posição 6/9"));
  expect(await evaluate(`document.querySelector(".lesson-toc__current").textContent`), text.negation, tag("o índice diz a secção"));
  expect(await evaluate(`location.hash`), "#negacao", tag("o endereço mantém a secção"));
  expect(await evaluate(`document.documentElement.scrollWidth <= 390`), true, tag("sem scroll lateral"));
  await writeScreenshot(page, `${lang}-link-direto`);

  // A folha do índice tem as 9 secções, e escolher uma fecha-a e vai lá ter.
  await tapInPlace(".lesson-toc__summary");
  await waitFor(() => evaluate(`document.querySelector("dialog.sheet[open]") !== null`), tag("a folha do índice"));
  expect(await evaluate(`document.querySelectorAll("dialog.sheet [data-toc-index]").length`), 9, tag("9 ligações na folha"));
  await sleep(300);
  await writeScreenshot(page, `${lang}-folha`);
  await tapInPlace('dialog.sheet [href="#solidez"]');
  await waitFor(() => evaluate(`document.querySelector("dialog.sheet") === null`), tag("a folha a fechar"));
  await waitFor(() => evaluate(`location.hash === "#solidez" && document.querySelector(".lesson-toc__current").textContent === ${JSON.stringify(text.meta)}`), tag("a última secção"));

  // A prova revela-se linha a linha, sem os botões mudarem de sítio.
  const shown = () => evaluate(`document.querySelector(".lesson-proof").querySelectorAll('[data-line]:not([data-step-mark="future"])').length`);
  const counter = () => evaluate(`document.querySelector(".lesson-proof__counter").textContent`);
  await evaluate(`document.querySelector(".lesson-proof").scrollIntoView({ behavior: "instant" })`);
  expect(await shown(), 2, tag("começa nas premissas"));
  expect(await evaluate(`document.querySelector('.lesson-proof [data-role="prev"]').disabled`), true, tag("no início não se recua"));
  const nextTop = `document.querySelector('.lesson-proof [data-role="next"]').getBoundingClientRect().top + scrollY`;
  const before = await evaluate(nextTop);
  await tap('.lesson-proof [data-role="next"]');
  expect(await shown(), 3, tag("avançar revela uma linha"));
  expect(await counter(), text.counter(3), tag("o contador acompanha"));
  expect(Math.abs((await evaluate(nextTop)) - before) < 2, true, tag("o botão fica no mesmo sítio"));
  expect(await evaluate(`document.querySelector('.lesson-proof [data-step-mark="current"]').dataset.line`), "3", tag("a linha nova fica marcada"));
  await tap('.lesson-proof [data-role="prev"]');
  expect(await shown(), 2, tag("recuar esconde a linha"));
  for (let line = 3; line <= 6; line += 1) await tap('.lesson-proof [data-role="next"]');
  expect(await shown(), 6, tag("chega ao fim"));
  expect(await evaluate(`document.querySelector('.lesson-proof [data-role="next"]').disabled`), true, tag("no fim não se avança"));
  await writeScreenshot(page, `${lang}-prova`);

  // Cada resposta tem a sua explicação, e pode responder-se outra vez.
  await tap('[data-option="andI"]');
  expect(await evaluate(`document.querySelector(".lesson-check__feedback .msg-warn") !== null`), true, tag("resposta errada avisa"));
  await tap('[data-option="implE"]');
  expect(await evaluate(`document.querySelector(".lesson-check__feedback .msg-ok") !== null`), true, tag("resposta certa confirma"));
  expect(await evaluate(`document.querySelectorAll('.lesson-check [aria-pressed="true"]').length`), 1, tag("só uma opção escolhida"));
  await writeScreenshot(page, `${lang}-pergunta`);

  // Cada figura de regra tem um erro assinalado, e as provas não alargam a página.
  expect(await evaluate(`document.querySelectorAll('.lesson-rule [data-state="error"]').length`), 12, tag("uma linha errada por figura"));
  expect(await evaluate(`[...document.querySelectorAll(".lesson-rule")].every((figure) => figure.querySelector(".msg-warn") !== null)`), true, tag("cada erro explicado"));
  expect(await evaluate(`[...document.querySelectorAll(".lesson-interactive")].every((box) => box.getBoundingClientRect().right <= 390)`), true, tag("figuras dentro do ecrã"));
  expect(await evaluate(`document.documentElement.scrollWidth <= 390`), true, tag("sem scroll lateral com as regras"));
  await evaluate(`document.querySelector('[data-lesson-rule="implIntro"]').scrollIntoView({ behavior: "instant" })`);
  await sleep(300);
  await writeScreenshot(page, `${lang}-regra`);

  // Cada derivada mostra a prova de todas as formas, e nenhuma linha fica cortada a 390px.
  expect(await evaluate(`[...document.querySelectorAll(".lesson-derived")].map((figure) => figure.querySelectorAll(".lesson-proof__view").length)`), [1, 1, 1, 1, 4, 1, 2], tag("uma prova por forma"));
  expect(await evaluate(`[...document.querySelectorAll(".lesson-derived .lesson-proof__view")].every((view) => view.scrollWidth <= view.clientWidth + 1)`), true, tag("provas das derivadas sem corte"));
  await evaluate(`document.querySelector('[data-lesson-derived="deMorgan"]').scrollIntoView({ behavior: "instant" })`);
  await sleep(300);
  await writeScreenshot(page, `${lang}-derivada`);
}

async function desktop({ page, evaluate, resize }, origin, path, lang) {
  const tag = (what) => `${lang} 1280px: ${what}`;
  await resize(1280, 800, false);
  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(figuresReady), tag("a lição"));
  expect(await evaluate(`document.querySelectorAll(".lesson-toc__link").length`), 9, tag("9 ligações no índice"));
  expect(await evaluate(`document.querySelector(".lesson-toc__link").getBoundingClientRect().width > 100`), true, tag("índice visível"));
  expect(await evaluate(`document.querySelector(".lesson-toc__summary").getBoundingClientRect().height`), 0, tag("sem barra do índice"));
  await evaluate(`document.querySelector('.lesson-toc [href="#subdeducoes"]').click()`);
  await waitFor(() => evaluate(titleVisible("subdeducoes")), tag("o título da secção escolhida"));
  await waitFor(() => evaluate(`document.querySelector('.lesson-toc [aria-current="location"]')?.getAttribute("href") === "#subdeducoes"`), tag("a secção atual no índice"));
  expect(await evaluate(`location.hash`), "#subdeducoes", tag("o endereço diz a secção"));
  await writeScreenshot(page, `${lang}-indice`);
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
  for (const [path, lang] of [["/aprender", "pt"], ["/en/learn", "en"]]) {
    await mobile(client, origin, path, lang);
    await desktop(client, origin, path, lang);
  }
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
if (problems.length === 0) console.log("OK lição");
process.exit(problems.length > 0 ? 1 : 0);
