// Modo guiado no Chrome a 390px, só com toques a sério (eventos de toque do CDP).
// Uso: node scripts/check-guided.mjs   (arranca o próprio servidor, numa porta livre)
// Faz a prova de tests/fixtures/guided-proof.js sem escrever fórmulas, com a página em PT e em EN, e
// confirma o motivo de uma regra desativada, a escolha entre passos, desfazer e a largura da página.
// Faz ainda uma prova de 1.ª ordem, com a variável nova do ∃E mudada no campo do pedido.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDED_STEPS } from "../tests/fixtures/guided-proof.js";
import { KEYBOARD_GOAL, KEYBOARD_LINES } from "../tests/fixtures/keyboard-proof.js";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/guided");
const WIDTH = 390;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  await page("Page.addScriptToEvaluateOnNewDocument", { source: 'try { localStorage.removeItem("nd:v1:prove"); } catch {}' });
  await page("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 844, deviceScaleFactor: 2, mobile: true });
  await page("Emulation.setTouchEmulationEnabled", { enabled: true });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  /** Traz o alvo para o ecrã e toca-lhe no centro. Devolve a altura, para medir a zona de toque. */
  const tap = async (selector) => {
    const box = await evaluate(`(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      target.scrollIntoView({ block: "center", behavior: "instant" });
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

const ruleSelector = (id) => `[data-rule="${id}"]`;

const FIRST_ORDER_GOAL = "∃x P(x), ∀x(P(x) → Q(x)) ⊢ ∃x Q(x)";
const SETTLE_MS = 600;

async function scenario({ page, evaluate, tap }, origin, path, lang) {
  const tag = (what) => `${lang}: ${what}`;
  const lineCount = () => evaluate(`document.querySelectorAll("#proof-editor .fitch__line").length`);
  const states = () => evaluate(`[...document.querySelectorAll("#proof-editor .fitch__line")].map((row) => row.dataset.state)`);

  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(`document.querySelector("#sequent") !== null && document.getElementById("start-proof") !== null`));
  await sleep(100);
  await evaluate(`document.querySelector("#sequent").focus()`);
  await page("Input.insertText", { text: KEYBOARD_GOAL });
  await tap("#start-proof");
  await waitFor(() => evaluate(`document.querySelector('[data-mode="guided"]') !== null`));
  await tap('[data-mode="guided"]');
  expect(await evaluate(`document.querySelectorAll("#proof-editor input").length`), 0, tag("no modo guiado não há campos"));

  const smallest = [];
  smallest.push(await tap(ruleSelector("∧I")));
  const reason = await evaluate(`document.querySelector(".guided__reason").textContent`);
  expect(reason.length > 0, true, tag("uma regra desativada diz porquê"));
  expect(await lineCount(), 2, tag("uma regra desativada não mexe na prova"));
  await writeScreenshot(page, `${lang}-motivo`);

  for (const { select, rule } of GUIDED_STEPS) {
    for (const line of select) {
      smallest.push(await tap(`[data-pick="${line}"]`));
      expect(await evaluate(`document.querySelector('[data-pick="${line}"]').getAttribute("aria-pressed")`), "true", tag(`a linha ${line} fica selecionada`));
    }
    if (select.length > 0) await writeScreenshot(page, `${lang}-selecao`);
    smallest.push(await tap(ruleSelector(rule)));
  }
  expect(await lineCount(), KEYBOARD_LINES, tag("todas as linhas da prova"));
  expect(await states(), Array(KEYBOARD_LINES).fill("ok"), tag("todas as linhas certas"));
  expect(await evaluate(`document.querySelector(".proof-editor__status .msg-ok") !== null`), true, tag("a prova fica completa"));
  await writeScreenshot(page, `${lang}-completa`);

  const measures = await evaluate(`({
    pageWidth: document.documentElement.scrollWidth,
    ruleHeight: Math.min(...[...document.querySelectorAll(".guided__rule")].map((rule) => rule.getBoundingClientRect().height)),
    lineHeight: Math.min(...[...document.querySelectorAll(".fitch-pick")].map((line) => line.getBoundingClientRect().height)),
  })`);
  expect(measures.pageWidth <= WIDTH, true, tag(`largura da página ${measures.pageWidth}`));
  expect(measures.ruleHeight >= 44, true, tag(`regras com ${measures.ruleHeight}px`));
  expect(measures.lineHeight >= 44, true, tag(`linhas com ${measures.lineHeight}px`));
  expect(Math.min(...smallest) >= 44, true, tag("zonas de toque com 44px"));

  // Desfazer tira o último passo inteiro.
  await tap('[data-action="undo"]');
  expect(await evaluate(`document.querySelector('[data-pick="7"]').closest("li").dataset.role`), "current", tag("desfazer volta ao objetivo"));

  // A escrita continua a ser a mesma prova.
  await tap('[data-mode="write"]');
  expect(await evaluate(`document.getElementById("proof-justification-8").value`), "∨E, 1, 4–5, 6–7", tag("o modo de escrita mostra o passo gerado"));
  await tap('[data-mode="guided"]');

  // Regra com mais do que um passo: pergunta antes de mexer na prova.
  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(`document.querySelector("#sequent") !== null && document.getElementById("start-proof") !== null`));
  await sleep(100);
  await evaluate(`document.querySelector("#sequent").focus()`);
  await page("Input.insertText", { text: "p ∧ q ⊢ q" });
  await tap("#start-proof");
  await waitFor(() => evaluate(`document.querySelector('[data-mode="guided"]') !== null`));
  await tap('[data-mode="guided"]');
  await tap('[data-pick="1"]');
  await tap(ruleSelector("∧E"));
  expect(await lineCount(), 2, tag("objetivo fechado num só passo"));
  expect(await evaluate(`document.querySelector(".proof-editor__status .msg-ok") !== null`), true, tag("∧E fecha o objetivo"));

  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(`document.querySelector("#sequent") !== null && document.getElementById("start-proof") !== null`));
  await sleep(100);
  await evaluate(`document.querySelector("#sequent").focus()`);
  await page("Input.insertText", { text: "p ∧ q ⊢ q ∧ p" });
  await tap("#start-proof");
  await waitFor(() => evaluate(`document.querySelector('[data-mode="guided"]') !== null`));
  await tap('[data-mode="guided"]');
  await tap('[data-pick="1"]');
  await tap(ruleSelector("∧E"));
  expect(await evaluate(`document.querySelectorAll("[data-choice]").length`), 2, tag("∧E pede uma escolha"));
  expect(await lineCount(), 2, tag("a escolha ainda não mexeu na prova"));
  await writeScreenshot(page, `${lang}-escolha`);
  await tap('[data-choice="1"]');
  expect(await lineCount(), 3, tag("a escolha gera o passo"));

  await firstOrder({ page, evaluate, tap }, origin, path, tag, lineCount, states);
}

/**
 * Uma prova de 1.ª ordem só com toques: o ∃E sugere a variável v, que se muda para w no campo do pedido;
 * o ∃I e o ∀E escolhem o termo entre os da prova; o →E fecha o objetivo.
 */
async function firstOrder({ page, evaluate, tap }, origin, path, tag, lineCount, states) {
  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(`document.querySelector("#sequent") !== null && document.getElementById("start-proof") !== null`));
  await sleep(100);
  await evaluate(`document.querySelector("#sequent").focus()`);
  await page("Input.insertText", { text: FIRST_ORDER_GOAL });
  await tap("#start-proof");
  await waitFor(() => evaluate(`document.querySelector('[data-mode="guided"]') !== null`));
  await tap('[data-mode="guided"]');

  await tap('[data-pick="1"]');
  await tap(ruleSelector("∃E"));
  expect(await lineCount(), 3, tag("1.ª ordem: o ∃E ainda não mexeu na prova"));
  expect(await evaluate(`document.querySelector("[data-ask] input")?.value`), "v", tag("1.ª ordem: o ∃E sugere a variável v"));
  const askHeight = await evaluate(`document.querySelector("[data-ask] input").getBoundingClientRect().height`);
  expect(askHeight >= 44, true, tag(`1.ª ordem: o campo da variável tem ${askHeight}px`));
  await writeScreenshot(page, `${tag("").slice(0, 2)}-variavel`);

  // Um nome que já existe é recusado, e o pedido continua aberto.
  await tap("[data-ask] input");
  await evaluate(`document.querySelector("[data-ask] input").select()`);
  await page("Input.insertText", { text: "x" });
  await tap('[data-ask] button[type="submit"]');
  expect(await lineCount(), 3, tag("1.ª ordem: uma variável que não é nova não mexe na prova"));
  expect((await evaluate(`document.querySelector(".guided__reason").textContent`)).includes("x"), true, tag("1.ª ordem: diz porque não serve"));

  await evaluate(`document.querySelector("[data-ask] input").select()`);
  await page("Input.insertText", { text: "w" });
  await tap('[data-ask] button[type="submit"]');
  expect(await lineCount(), 5, tag("1.ª ordem: o ∃E abre a caixa"));
  expect(await evaluate(`document.querySelector('[data-pick="3"]').textContent.includes("[w]")`), true, tag("1.ª ordem: a caixa tem a variável w"));

  // Depois de cada passo, o foco vai para o objetivo e a página desliza (scroll suave): espera-se que pare.
  await sleep(SETTLE_MS);
  await tap(ruleSelector("∃I"));
  expect(await evaluate(`document.querySelector("[data-ask] input")?.value`), "w", tag("1.ª ordem: o ∃I sugere o termo w"));
  await tap('[data-choice="0"]');
  expect(await lineCount(), 6, tag("1.ª ordem: o ∃I deixa Q(w) por provar"));
  await sleep(SETTLE_MS);

  await tap('[data-pick="2"]');
  await tap(ruleSelector("∀E"));
  await tap('[data-choice="0"]');
  expect(await lineCount(), 7, tag("1.ª ordem: o ∀E instancia com w"));
  await sleep(SETTLE_MS);

  await tap(ruleSelector("→E"));
  expect(await lineCount(), 7, tag("1.ª ordem: o →E fecha o objetivo"));
  expect(await states(), Array(7).fill("ok"), tag("1.ª ordem: todas as linhas certas"));
  expect(await evaluate(`document.querySelector(".proof-editor__status .msg-ok") !== null`), true, tag("1.ª ordem: a prova fica completa"));
  expect(await evaluate(`document.documentElement.scrollWidth`) <= WIDTH, true, tag("1.ª ordem: largura da página"));
  await writeScreenshot(page, `${tag("").slice(0, 2)}-primeira-ordem`);
}

async function writeScreenshot(page, name) {
  const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
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
if (problems.length === 0) console.log("OK modo guiado");
process.exit(problems.length > 0 ? 1 : 0);
