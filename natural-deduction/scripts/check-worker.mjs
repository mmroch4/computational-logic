// Corre o Worker no Chrome headless, na página Provar e com a CSP do vercel.json, enquanto mede a maior
// paragem da página. Escreve o relatório em JSON; os limites estão em tests/performance/worker.test.js.
// Uso: node scripts/check-worker.mjs   (arranca o próprio servidor, numa porta livre)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HARD_MAX_STEPS, HARD_SEQUENT } from "../tests/performance/fixtures.js";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Espera que `stream` escreva algo que apanhe `pattern` e devolve a captura. */
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

/** Cliente mínimo do DevTools Protocol, ligado a um separador. */
async function openPage(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  const loaded = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Page.loadEventFired") loaded.shift()?.();
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
  await send("Page.enable", {}, sessionId);
  return {
    async open(url) {
      const load = new Promise((resolve) => {
        loaded.push(resolve);
      });
      await send("Page.navigate", { url }, sessionId);
      await load;
    },
    evaluate: (expression) => send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId),
    close: () => socket.close(),
  };
}

// Corre na página.
const scenario = async (text, maxSteps) => {
  const { parseSequent } = await import("/js/core/sequent.js");
  const { createSolverWorker } = await import("/js/ui/solver-worker.js");
  const hard = parseSequent(text).sequent;
  const worker = createSolverWorker();

  const easy = await worker.solve(parseSequent("p -> q, p |- q").sequent, {}).promise;

  let last = performance.now();
  let pauseMs = 0;
  const beat = setInterval(() => {
    const now = performance.now();
    pauseMs = Math.max(pauseMs, now - last);
    last = now;
  }, 10);
  const startedAt = performance.now();
  const finished = await worker.solve(hard, {}).promise;
  const hardMs = Math.round(performance.now() - startedAt);

  const running = worker.solve(hard, { maxSteps });
  setTimeout(running.cancel, 300);
  const cancelled = await running.promise;
  clearInterval(beat);

  const afterCancel = await worker.solve(parseSequent("p |- p").sequent, {}).promise;
  worker.dispose();

  const hurried = createSolverWorker({ timeoutMs: 300 });
  const timedOut = await hurried.solve(hard, { maxSteps }).promise;

  return {
    easy: easy.provable === true,
    hard: finished.error?.code ?? "ok",
    hardMs,
    pauseMs: Math.round(pauseMs),
    cancelled: cancelled.error?.code,
    afterCancel: afterCancel.provable === true,
    timeout: timedOut.error?.code,
  };
};

const server = spawn("node", [join(ROOT, "scripts/serve.mjs"), "0"], { stdio: ["ignore", "pipe", "ignore"] });
const profile = mkdtempSync(join(tmpdir(), "nd-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`,
  "--remote-debugging-port=0", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let failed = false;
try {
  const [origin, wsUrl] = await Promise.all([
    firstMatch(server.stdout, /(http:\/\/localhost:\d+)\//, "O servidor"),
    firstMatch(chrome.stderr, /DevTools listening on (ws:\/\/\S+)/, "O Chrome"),
  ]);
  const page = await openPage(wsUrl);
  await page.open(`${origin}/provar`);
  const args = [HARD_SEQUENT, HARD_MAX_STEPS].map((value) => JSON.stringify(value)).join(", ");
  const { result, exceptionDetails } = await page.evaluate(`(${scenario})(${args})`);
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  page.close();
  console.log(JSON.stringify(result.value));
} catch (error) {
  console.error(error);
  failed = true;
} finally {
  chrome.kill("SIGKILL");
  server.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.exit(failed ? 1 : 0);
