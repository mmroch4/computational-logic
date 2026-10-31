// Vista de Fitch no Chrome a 390px: 4 níveis de subdedução sem a página ganhar scroll horizontal.
// Uso: node scripts/check-fitch.mjs   (arranca o próprio servidor, numa porta livre)
// A vista só entra numa página com o editor: até lá, é montada à mão na /provar, com o CSS do site.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES, CASES_GOAL, NESTED, NESTED_GOAL, STATES, STATES_GOAL, WIDE, WIDE_GOAL } from "../tests/fixtures/fitch-proofs.js";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/fitch");
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

/** Monta as três provas no fim do <main> da /provar. */
const mountAll = (fixtures) => `(async () => {
  const { parseProof } = await import("/js/core/proof-text.js");
  const { parseSequent } = await import("/js/core/sequent.js");
  const { RULES, ruleSet } = await import("/js/core/rules.js");
  const { verifyProof } = await import("/js/core/verify.js");
  const { lineStates, mountFitchView } = await import("/js/ui/fitch-view.js");
  const main = document.querySelector("main");
  main.replaceChildren();
  for (const { id, text, goal } of ${JSON.stringify(fixtures)}) {
    const { proof } = parseProof(text);
    const result = verifyProof(proof, parseSequent(goal).sequent, ruleSet("completo"), RULES);
    const container = document.createElement("div");
    container.id = id;
    container.style.marginBottom = "16px";
    main.append(container);
    mountFitchView(container, { proof, states: lineStates(proof, result) });
  }
  await document.fonts.ready;
})()`;

async function scenario({ evaluate, page }, origin) {
  await page("Page.navigate", { url: `${origin}/provar` });
  await sleep(1000);
  await evaluate(mountAll([
    { id: "nested", text: NESTED, goal: NESTED_GOAL },
    { id: "wide", text: WIDE, goal: WIDE_GOAL },
    { id: "cases", text: CASES, goal: CASES_GOAL },
    { id: "states", text: STATES, goal: STATES_GOAL },
  ]));
  await sleep(300);

  const measures = await evaluate(`(() => {
    const scroller = document.querySelector("#nested .fitch");
    const box = scroller.getBoundingClientRect();
    const row = scroller.querySelector('[data-line="6"]');
    const rowHeight = row.getBoundingClientRect().height;
    return {
      pageWidth: document.documentElement.scrollWidth,
      left: box.left,
      right: box.right,
      clientWidth: scroller.clientWidth,
      scrollWidth: scroller.scrollWidth,
      deepBars: row.querySelectorAll(".fitch__bar").length,
      barHeights: [...row.querySelectorAll(".fitch__bar")].map((bar) => bar.getBoundingClientRect().height),
      rowHeight,
      deepFormulaRight: row.querySelector(".fitch__formula").getBoundingClientRect().right,
      fontSize: parseFloat(getComputedStyle(row.querySelector(".fitch__formula")).fontSize),
      justification: [...scroller.querySelectorAll(".fitch__why")].map((cell) => cell.getBoundingClientRect().left),
    };
  })()`);

  check(measures.pageWidth <= WIDTH, `a página tem ${measures.pageWidth}px de largura, mais do que ${WIDTH}`);
  check(measures.left >= 0 && measures.right <= WIDTH, `a vista sai do ecrã: ${measures.left} a ${measures.right}`);
  check(measures.deepBars === 5, `a linha de nível 4 tem ${measures.deepBars} barras, e devia ter 5`);
  check(measures.barHeights.every((height) => height === measures.rowHeight), "as barras não ocupam a linha toda, e ficam cortadas");
  check(measures.fontSize >= 14, `fórmula com ${measures.fontSize}px`);
  check(measures.scrollWidth <= measures.clientWidth, "uma prova de 4 níveis com fórmulas curtas devia caber sem scroll");
  check(new Set(measures.justification).size === 1, "as justificações não estão alinhadas");
  check(measures.deepFormulaRight <= measures.right, "a fórmula da linha de nível 4 não cabe à vista");

  await writeScreenshot(page, "4-niveis");

  // Depois de deslocar, a fórmula longa chega ao fim, e o número continua à vista.
  const scrolled = await evaluate(`(() => {
    const scroller = document.querySelector("#wide .fitch");
    scroller.scrollLeft = scroller.scrollWidth;
    const row = scroller.querySelector('[data-line="10"]');
    return {
      pageWidth: document.documentElement.scrollWidth,
      pageScroll: window.scrollX,
      scrollLeft: scroller.scrollLeft,
      gutterLeft: row.querySelector(".fitch__gutter").getBoundingClientRect().left,
      left: scroller.getBoundingClientRect().left,
      whyRight: row.querySelector(".fitch__why").getBoundingClientRect().right,
      right: scroller.getBoundingClientRect().right,
    };
  })()`);
  check(scrolled.scrollLeft > 0, "a prova larga devia ter scroll próprio");
  check(scrolled.pageWidth <= WIDTH, `a prova larga alargou a página para ${scrolled.pageWidth}px`);
  check(scrolled.pageScroll === 0, "deslocar a prova deslocou a página");
  check(Math.abs(scrolled.gutterLeft - scrolled.left) <= 1, "o número não fica preso à esquerda");
  check(scrolled.whyRight <= scrolled.right + 1, "a justificação não fica acessível depois de deslocar");
  await writeScreenshot(page, "deslocada");

  const focusable = await evaluate(`document.querySelector("#wide .fitch").tabIndex`);
  check(focusable === 0, "a vista não se foca com o teclado");

  await evaluate(`document.querySelector("#cases").scrollIntoView()`);
  await sleep(100);
  await writeScreenshot(page, "casos-e-estados");
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
if (problems.length === 0) console.log("OK vista de Fitch");
process.exit(problems.length > 0 ? 1 : 0);
