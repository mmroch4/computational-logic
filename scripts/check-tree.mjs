// Árvore de Gentzen no Chrome a 390px, com toques a sério (CDP), em PT e em EN.
// Uso: node scripts/check-tree.mjs   (arranca o próprio servidor, numa porta livre)
// Sem prova não há painel; prova por acabar dá o aviso; a prova acabada dá a árvore, que se desloca
// sozinha, sem a página, e uma fórmula selecionada destaca a linha, nos dois modos do editor.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/tree");
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

const TEXTS = {
  pt: { unfinished: "estiver completa", caption: "Linha 2", title: "Árvore de Gentzen", rule: "RA", hypothesis: "hipótese" },
  en: { unfinished: "is complete", caption: "Line 2", title: "Gentzen tree", rule: "RAA", hypothesis: "hypothesis" },
};

async function writeScreenshot(page, name) {
  const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  mkdirSync(SCREENS, { recursive: true });
  writeFileSync(join(SCREENS, `${name}.png`), Buffer.from(data, "base64"));
}

/** Uma árvore larga: cada linha do ∧I tem uma subárvore com fórmulas compridas. */
const WIDE_SEQUENT = "(alpha ∧ beta) ∧ gamma ⊢ ((gamma ∧ beta) ∧ alpha) ∧ ((alpha ∧ gamma) ∧ beta)";

async function scenario({ page, evaluate, tap }, origin, path, lang) {
  const tag = (what) => `${lang}: ${what}`;
  const text = TEXTS[lang];
  const panel = () => evaluate(`document.getElementById("proof-tree").textContent`);

  const open = async (sequent) => {
    await page("Page.navigate", { url: `${origin}${path}` });
    await waitFor(() => evaluate(`document.querySelector("#sequent") !== null && document.getElementById("start-proof") !== null`));
    await sleep(100);
    expect(await evaluate(`document.getElementById("proof-tree").childElementCount`), 0, tag("sem prova não há painel"));
    await evaluate(`document.querySelector("#sequent").focus()`);
    await page("Input.insertText", { text: sequent });
    await tap("#start-proof");
    await waitFor(() => evaluate(`document.querySelector(".tree-panel__title") !== null`), tag("o painel"));
    expect(await evaluate(`document.querySelector(".tree-panel__section").open`), false, tag("a secção nasce fechada"));
    await tap(".tree-panel__toggle");
  };

  const solve = async () => {
    await tap('[data-assist="solve"]');
    await waitFor(() => evaluate(`document.querySelector('[data-assist="use"]') !== null`), tag("a solução"));
    await tap('[data-assist="use"]');
    await waitFor(() => evaluate(`document.querySelector(".gentzen") !== null`), tag("a árvore"));
  };

  const highlighted = () => evaluate(`[...document.querySelectorAll(".fitch--edit [data-highlight]")].map((row) => Number(row.dataset.line))`);

  // Prova por acabar, depois a árvore de ⊢ p ∨ ¬p, com RA.
  await open("⊢ p ∨ ¬p");
  expect((await panel()).includes(text.unfinished), true, tag("prova por acabar"));
  expect((await panel()).includes(text.title), true, tag("título"));
  await writeScreenshot(page, `${lang}-por-acabar`);
  await solve();
  expect(await evaluate(`[...document.querySelectorAll(".gt__rule")].some((rule) => rule.firstChild.textContent === ${JSON.stringify(text.rule)})`), true, tag("a sigla segue o idioma"));
  expect(await evaluate(`document.querySelector(".gentzen sup") !== null`), true, tag("números das hipóteses"));

  // Selecionar uma fórmula destaca a linha e diz qual é.
  const leaf = '.gt--leaf [data-tree-line="1"]';
  const box = await tap(leaf);
  expect(box.width >= 44 && box.height >= 44, true, tag(`zona de toque de ${box.width}×${box.height}`));
  expect(await highlighted(), [1], tag("destaque no modo de escrita"));
  const caption = await evaluate(`document.querySelector(".tree-panel__caption").textContent`);
  expect(caption.includes(text.hypothesis), true, tag(`legenda: ${caption}`));
  await writeScreenshot(page, `${lang}-selecionada`);

  // Trocar de modo redesenha as linhas sem perder o destaque.
  await tap('[data-mode="guided"]');
  expect(await highlighted(), [1], tag("destaque no modo guiado"));
  await tap('[data-mode="write"]');

  // Mudar a prova tira a árvore e o destaque.
  await tap('[data-action="undo"]');
  await waitFor(async () => (await panel()).includes(text.unfinished), tag("desfazer tira a árvore"));
  expect(await highlighted(), [], tag("sem árvore não há destaque"));

  // A árvore larga desloca-se sozinha.
  await open(WIDE_SEQUENT);
  await solve();
  const sizes = await evaluate(`(() => {
    const scroller = document.querySelector(".gentzen");
    scroller.scrollLeft = 80;
    return {
      inner: scroller.scrollWidth,
      outer: scroller.clientWidth,
      left: scroller.scrollLeft,
      page: document.documentElement.scrollWidth,
    };
  })()`);
  expect(sizes.inner > sizes.outer, true, tag(`a árvore larga tem scroll: ${JSON.stringify(sizes)}`));
  expect(sizes.left, 80, tag("o bloco desloca-se"));
  expect(sizes.page <= WIDTH, true, tag(`largura da página ${sizes.page}`));
  await writeScreenshot(page, `${lang}-larga`);
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
if (problems.length === 0) console.log("OK árvore");
process.exit(problems.length > 0 ? 1 : 0);
