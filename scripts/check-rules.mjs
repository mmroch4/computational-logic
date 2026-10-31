// Regras do utilizador no Chrome a 390px, com toques a sério (CDP), sob a CSP do site.
// Uso: node scripts/check-rules.mjs   (arranca o próprio servidor, numa porta livre)
// Em PT e em EN, de ponta a ponta: criar, recusar com contraexemplo, usar a escrever e no modo guiado,
// partilhar, reabrir noutra sessão limpa, apagar, e links com regras inválidas ou em conflito.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/rules");
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

async function writeScreenshot(page, name) {
  const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  mkdirSync(SCREENS, { recursive: true });
  writeFileSync(join(SCREENS, `${name}.png`), Buffer.from(data, "base64"));
}

const STATES = `[...document.querySelectorAll("#proof-editor [data-line]")].map((row) => row.dataset.state)`;
const RULE_NAMES = `[...document.querySelectorAll("[data-delete-rule]")].map((button) => button.dataset.deleteRule)`;
const SAVED_NAMES = `JSON.parse(localStorage.getItem("nd:v1:rules") ?? "[]").map(({ name }) => name)`;
const SWAP = { name: "Troca", premises: ["φ ∧ ψ"], conclusion: "ψ ∧ φ" };
const b64 = (data) => Buffer.from(JSON.stringify(data)).toString("base64url");

async function scenario({ page, evaluate, tap }, origin, path, lang) {
  const tag = (what) => `${lang}: ${what}`;
  const go = async (url, ready) => {
    await page("Page.navigate", { url });
    await sleep(100);
    await waitFor(() => evaluate(`document.getElementById("sequent") !== null && document.querySelector(".rules-panel") !== null`), tag(`«${url}»`));
    if (ready) await waitFor(() => evaluate(ready), tag(`«${url}»: ${ready}`));
  };
  const forget = async () => {
    await sleep(400);
    await evaluate("localStorage.clear()");
  };
  const write = async (id, text) => {
    await evaluate(`document.getElementById(${JSON.stringify(id)}).focus()`);
    await page("Input.insertText", { text });
  };
  const openSequent = async (sequent) => {
    await evaluate(`(() => {
      const field = document.getElementById("sequent");
      field.focus();
      field.select();
    })()`);
    await page("Input.insertText", { text: sequent });
    await tap("#start-proof");
    await waitFor(() => evaluate(`document.getElementById("proof-formula-${sequent.includes("⊢ ") ? 2 : 1}") !== null`), tag("a prova"));
  };
  const openPanel = () => evaluate(`document.querySelector(".rules-panel").open = true`);
  const heights = [];

  await go(`${origin}${path}`);
  await forget();
  await go(`${origin}${path}`);
  expect(await evaluate(`document.querySelector(".rules-panel").open`), false, tag("o painel começa fechado"));
  expect(await evaluate(`document.querySelector(".rules-panel__toggle").textContent.includes("0")`), true, tag("zero regras"));
  heights.push(await tap(".rules-panel__toggle"));
  expect(await evaluate(`document.querySelector(".rules-panel").open`), true, tag("o painel abre ao toque"));

  // Uma regra que não é sólida: mostra o contraexemplo e não se guarda.
  await write("rule-name", "Falsa");
  heights.push(await tap('[data-add-premise="formula"]'));
  await write("rule-premise-0", "φ ∨ ψ");
  await write("rule-conclusion", "φ");
  await waitFor(() => evaluate(`document.querySelector(".rules-form__result .msg-error") !== null`), tag("a recusa"));
  expect(await evaluate(`document.querySelector(".rules-form__result .assist__valuation").textContent.includes("φ")`), true, tag("o contraexemplo fala de φ"));
  await writeScreenshot(page, `${lang}-contraexemplo`);
  heights.push(await tap(".rules-form__save"));
  expect(await evaluate(RULE_NAMES), [], tag("regra não sólida não se guarda"));
  heights.push(await tap('[data-remove-premise="0"]'));

  // Erro de sintaxe no campo certo, sem texto cru na página.
  await write("rule-conclusion", " ∧");
  await tap(".rules-form__save");
  await waitFor(() => evaluate(`document.getElementById("rule-conclusion").getAttribute("aria-invalid") === "true"`), tag("o erro no campo"));

  // Criar: com as teclas de símbolos e com pré-visualização.
  await evaluate(`(() => {
    const field = document.getElementById("rule-conclusion");
    field.focus();
    field.select();
  })()`);
  await page("Input.insertText", { text: "ψ" });
  heights.push(await tap('[data-schema-key="and"]'));
  heights.push(await tap('[data-schema-key="phi"]'));
  expect(await evaluate(`document.getElementById("rule-conclusion").value`), "ψ ∧ φ", tag("as teclas escrevem no campo"));
  await evaluate(`(() => {
    const field = document.getElementById("rule-name");
    field.focus();
    field.select();
  })()`);
  await page("Input.insertText", { text: "Troca" });
  await tap('[data-add-premise="formula"]');
  await write("rule-premise-0", "φ ∧ ψ");
  await waitFor(() => evaluate(`document.querySelector(".rules-form__result .msg-ok") !== null`), tag("a regra sólida"));
  expect(await evaluate(`document.querySelector(".rules-form__preview").textContent.replace(/\\s/g, "")`), "φ∧ψψ∧φTroca", tag("a pré-visualização"));
  await writeScreenshot(page, `${lang}-pre-visualizacao`);
  await tap(".rules-form__save");
  await waitFor(() => evaluate(`document.querySelector("[data-delete-rule]") !== null`), tag("a regra na lista"));
  expect(await evaluate(SAVED_NAMES), ["Troca"], tag("a regra fica guardada"));
  expect(await evaluate(`document.getElementById("rule-name").value`), "", tag("o formulário limpa"));

  // Uma premissa que é uma subdedução.
  await write("rule-name", "Contra");
  await tap('[data-add-premise="subproof"]');
  await write("rule-premise-0-hypothesis", "φ");
  await write("rule-premise-0-conclusion", "ψ");
  await tap('[data-add-premise="formula"]');
  await write("rule-premise-1", "¬ψ");
  await write("rule-conclusion", "¬φ");
  await waitFor(() => evaluate(`document.querySelector(".rules-form__result .msg-ok") !== null`), tag("a subdedução sólida"));
  expect(await evaluate(`document.querySelector(".rules-form__preview").textContent.includes("[φ] … ψ")`), true, tag("a subdedução na pré-visualização"));
  await writeScreenshot(page, `${lang}-subdeducao`);
  await tap(".rules-form__save");
  await waitFor(() => evaluate(`document.querySelectorAll("[data-delete-rule]").length === 2`), tag("a segunda regra"));
  expect((await evaluate(`document.documentElement.scrollWidth`)) <= WIDTH, true, tag("largura do painel"));

  // Modo de escrita.
  await openSequent("p ∧ q ⊢ q ∧ p");
  await write("proof-formula-2", "q ∧ p");
  await write("proof-justification-2", "Troca, 1");
  await waitFor(() => evaluate(`document.querySelector(".proof-editor__status .msg-ok b") !== null`), tag("a marca de regras próprias"));
  expect(await evaluate(STATES), ["ok", "ok"], tag("a regra serve a escrever"));
  await waitFor(() => evaluate(`location.search.includes("r=1.")`), tag("a regra no endereço"));
  const url = await evaluate("location.href");
  await writeScreenshot(page, `${lang}-escrita`);

  // A dica e a árvore continuam a funcionar com a regra.
  expect(await evaluate(`document.querySelector("#proof-tree .gt__rule")?.textContent`), "Troca", tag("a regra na árvore"));

  // Modo guiado.
  await openSequent("a ∧ b ⊢ b ∧ a");
  await tap('[data-mode="guided"]');
  await waitFor(() => evaluate(`document.querySelector('[data-rule="Troca"]') !== null`), tag("a regra nos botões"));
  await tap('[data-pick="1"]');
  await tap('[data-rule="Troca"]');
  await waitFor(() => evaluate(`document.querySelector(".proof-editor__status .msg-ok b") !== null`), tag("a regra no modo guiado"));
  expect(await evaluate(STATES), ["ok", "ok"], tag("a regra serve no modo guiado"));
  await sleep(400);

  // Reabrir o link noutra sessão limpa.
  await forget();
  await go(url, `document.querySelector("#proof-editor [data-line]") !== null`);
  expect(await evaluate(STATES), ["ok", "ok"], tag("o link repõe a prova"));
  expect(await evaluate(RULE_NAMES), ["Troca"], tag("o link só traz a regra citada"));
  expect(await evaluate(SAVED_NAMES), ["Troca"], tag("a regra do link fica guardada"));
  expect(await evaluate(`document.querySelector("#share-error .msg-info")?.textContent.includes("Troca")`), true, tag("o aviso das regras do link"));
  expect(await evaluate(`document.querySelector(".rules-panel").open`), true, tag("o painel abre com regras novas"));
  await writeScreenshot(page, `${lang}-link`);

  // Recarregar sem link: a regra e a prova ficam.
  await go(`${origin}${path}`, `document.querySelector("#proof-editor [data-line]") !== null`);
  expect(await evaluate(STATES), ["ok", "ok"], tag("voltar sem link"));
  expect(await evaluate(`document.querySelector("#share-error").childElementCount`), 0, tag("voltar sem link não avisa"));

  // Apagar: a linha deixa de valer e a regra sai do link.
  await openPanel();
  await tap('[data-delete-rule="Troca"]');
  await waitFor(() => evaluate(`document.querySelector('[data-line="2"]').dataset.state === "error"`), tag("a linha sem regra"));
  await waitFor(() => evaluate(`!location.search.includes("r=1.")`), tag("a regra fora do endereço"));
  expect(await evaluate(SAVED_NAMES), [], tag("a regra sai do browser"));

  // Uma regra não sólida num link não entra, por muito que a prova a cite.
  const fake = [[0, "q", "Falsa, 1"]];
  await forget();
  const unsound = `?s=p%7C-q&p=1.${b64(fake)}&r=1.${b64([{ name: "Falsa", premises: ["φ"], conclusion: "ψ" }])}`;
  await go(`${origin}${path}${unsound}`, `document.querySelector('[data-line="2"]') !== null`);
  expect(await evaluate(STATES), ["ok", "error"], tag("regra não sólida no link"));
  expect(await evaluate(`document.querySelector("#share-error .msg-warn")?.textContent.includes("Falsa")`), true, tag("o aviso da regra recusada"));
  expect(await evaluate(SAVED_NAMES), [], tag("regra recusada não se guarda"));

  // Dados das regras estragados: o link não abre.
  await forget();
  await go(`${origin}${path}?s=p%7C-p&p=1.${b64([[0, "p", "R, 1"]])}&r=1.@@@`, `document.querySelector("#share-error .msg-error") !== null`);
  expect(await evaluate(`document.getElementById("proof-editor").childElementCount`), 0, tag("regras estragadas: sem prova"));

  // Um nome hostil é recusado, e nunca vira HTML.
  await forget();
  const hostile = `?s=p%7C-p&p=1.${b64([[0, "p", "R, 1"]])}&r=1.${b64([{ name: "<img src=x onerror=window.pwned=1>", premises: [], conclusion: "φ → φ" }])}`;
  await go(`${origin}${path}${hostile}`, `document.querySelector("#share-error .msg-warn") !== null`);
  expect(await evaluate(`document.querySelector("main img") === null && window.pwned === undefined`), true, tag("nome hostil"));

  // Conflito: vale a do link nesta sessão, e a guardada não se perde.
  await forget();
  await evaluate(`localStorage.setItem("nd:v1:rules", ${JSON.stringify(JSON.stringify([{ name: "Troca", premises: ["φ"], conclusion: "φ ∨ ψ" }]))})`);
  const proof = [[0, "q ∧ p", "Troca, 1"]];
  await go(`${origin}${path}?s=${encodeURIComponent("p ∧ q |- q ∧ p")}&p=1.${b64(proof)}&r=1.${b64([SWAP])}`, `document.querySelector('[data-line="2"]') !== null`);
  expect(await evaluate(STATES), ["ok", "ok"], tag("em conflito, vale a regra do link"));
  expect(await evaluate(`document.querySelector(".rules-panel__tag") !== null`), true, tag("a regra só desta sessão"));
  expect(await evaluate(`JSON.parse(localStorage.getItem("nd:v1:rules"))[0].conclusion`), "φ ∨ ψ", tag("a regra guardada fica"));

  // Regras guardadas estragadas não impedem as outras.
  await forget();
  await evaluate(`localStorage.setItem("nd:v1:rules", ${JSON.stringify(JSON.stringify([{ name: "Falsa", premises: [], conclusion: "φ" }, SWAP]))})`);
  await go(`${origin}${path}`);
  expect(await evaluate(RULE_NAMES), ["Troca"], tag("a regra válida carrega"));
  expect(await evaluate(`document.querySelector(".rules-panel__rejected .msg-warn") !== null`), true, tag("o aviso da regra guardada"));

  expect(Math.min(...heights) >= 44, true, tag(`zonas de toque com ${Math.min(...heights)}px`));
  expect((await evaluate("document.documentElement.scrollWidth")) <= WIDTH, true, tag("largura da página"));
  await forget();
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
if (problems.length === 0) console.log("OK regras do utilizador");
process.exit(problems.length > 0 ? 1 : 0);
