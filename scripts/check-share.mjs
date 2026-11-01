// Partilha no Chrome a 390px, com toques a sério (CDP), sob a CSP do site.
// Uso: node scripts/check-share.mjs   (arranca o próprio servidor, numa porta livre)
// Em PT e em EN: o link com a prova exata noutra sessão limpa, a prova a meio, voltar sem link, links
// inválidos, regra hostil no link, histórico, LaTeX, descarregar e imprimir.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCREENS = join(ROOT, "tmp/screens/share");
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

/** Tudo o que se vê da prova: a fórmula e a justificação de cada linha, e o estado. */
const DUMP = `[...document.querySelectorAll("#proof-editor [data-line]")].map((row) => [
  row.dataset.line,
  row.dataset.state,
  row.querySelector('[data-field="formula"]')?.value ?? row.querySelector(".fitch__formula").textContent,
  row.querySelector('[data-field="justification"]')?.value ?? row.querySelector(".fitch__why, .fitch-edit__kind").textContent,
])`;

const b64 = (entries) => Buffer.from(JSON.stringify(entries)).toString("base64url");

async function scenario({ page, evaluate, tap }, origin, path, lang) {
  const tag = (what) => `${lang}: ${what}`;
  const pt = lang === "pt";
  const share = async (item) => {
    await tap("#proof-share summary");
    return tap(item);
  };
  const go = async (url, ready) => {
    await page("Page.navigate", { url });
    await waitFor(() => evaluate(`document.getElementById("sequent") !== null && document.documentElement.dataset.ready !== "x"`), tag(`«${url}»`));
    if (ready) await waitFor(() => evaluate(ready), tag(`«${url}»: ${ready}`));
  };
  // Espera pela escrita pendente no endereço, que voltaria a guardar a prova ao sair da página.
  const forget = async () => {
    await sleep(400);
    await evaluate("localStorage.clear()");
  };
  const open = async (sequent) => {
    await evaluate(`document.getElementById("sequent").focus()`);
    await page("Input.insertText", { text: sequent });
    await tap("#start-proof");
    await waitFor(() => evaluate(`document.querySelector("[data-share='copy-link']") !== null`), tag("os botões de partilha"));
  };
  const fill = async (line, field, value) => {
    await evaluate(`document.getElementById("proof-${field}-${line}").focus()`);
    await page("Input.insertText", { text: value });
  };
  const hasProof = `location.search.includes("p=1.")`;

  await page("Page.navigate", { url: `${origin}${path}` });
  await waitFor(() => evaluate(`document.getElementById("sequent") !== null`));
  await forget();
  await go(`${origin}${path}`);
  expect(await evaluate(`document.getElementById("proof-share").childElementCount`), 0, tag("sem prova não há botões"));
  expect(await evaluate(`document.getElementById("share-error").childElementCount`), 0, tag("sem link não há erro"));

  // Prova acabada, com subdedução: copia o link e abre-o sem nada guardado no browser.
  await open("p → q, q → r ⊢ p → r");
  await tap('[data-assist="solve"]');
  await waitFor(() => evaluate(`document.querySelector('[data-assist="use"]') !== null`), tag("a solução"));
  await tap('[data-assist="use"]');
  await waitFor(() => evaluate(hasProof), tag("a prova no endereço"));
  const before = await evaluate(DUMP);
  expect(before.every((row) => row[1] === "ok"), true, tag("a prova está certa antes de partilhar"));
  expect(before.some((row) => /–/.test(row[3])), true, tag("a prova tem subdedução"));
  await evaluate(`(() => {
    window.copied = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copied.push(text); } } });
  })()`);
  const heights = [await share('[data-share="copy-link"]')];
  await waitFor(() => evaluate(`document.querySelector(".proof-share__status .msg-ok") !== null`), tag("«link copiado»"));
  const url = (await evaluate("window.copied"))[0];
  expect(url, await evaluate("location.href"), tag("o link copiado é o do endereço"));
  await writeScreenshot(page, `${lang}-partilha`);
  await forget();
  await go(url, `document.querySelector("#proof-editor [data-line]") !== null`);
  expect(await evaluate(DUMP), before, tag("o link repõe a prova exata"));
  expect(await evaluate(`document.querySelector(".proof-editor__status .msg-ok") !== null`), true, tag("o link repõe a prova acabada"));
  expect(await evaluate(`document.querySelector('[data-action="undo"]').disabled`), true, tag("não há nada para desfazer"));
  expect(await evaluate(`document.getElementById("sequent").value`), "p → q, q → r ⊢ p → r", tag("o sequente fica no campo"));
  expect(await evaluate(`document.getElementById("proof-empty").hidden`), true, tag("sem estado vazio"));
  expect(await evaluate(`document.getElementById("proof-tree").childElementCount > 0`), true, tag("a árvore acompanha"));

  // As siglas seguem o idioma da página, no mesmo link.
  await go(`${origin}${pt ? "/en/prove" : "/provar"}?${url.split("?")[1]}`, `document.querySelector("#proof-editor [data-line]") !== null`);
  expect((await evaluate(DUMP)).every((row) => row[1] === "ok"), true, tag("o link abre no outro idioma"));

  // Prova a meio, com um erro: recarregar não a perde.
  await go(`${origin}${path}`);
  await forget();
  await go(`${origin}${path}`);
  await open("p ∧ q ⊢ q ∧ p");
  await fill(2, "formula", "q");
  await fill(2, "justification", "∧I, 1");
  await page("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await waitFor(() => evaluate(`document.getElementById("proof-formula-3") !== null`), tag("a linha nova"));
  await waitFor(() => evaluate(`location.search.includes("p=1.") && document.querySelector('[data-line="2"][data-state="error"]') !== null`), tag("o erro"));
  await sleep(400);
  const midway = await evaluate(DUMP);
  await page("Page.reload");
  await sleep(200);
  await waitFor(() => evaluate(`document.querySelector('[data-line="3"]') !== null`), tag("recarregar"));
  expect(await evaluate(DUMP), midway, tag("recarregar repõe a prova a meio"));

  // Sem link, volta a última prova.
  await go(`${origin}${path}`, `document.querySelector('[data-line="3"]') !== null`);
  expect(await evaluate(DUMP), midway, tag("voltar à página repõe a última prova"));

  // Texto que não se leu: o link funciona, mas avisa.
  await evaluate(`Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } })`);
  await fill(3, "formula", "p ∧");
  await share('[data-share="copy-link"]');
  await waitFor(() => evaluate(`document.querySelector(".proof-share__status .msg-warn") !== null`), tag("o aviso do texto por ler"));

  // Sem área de transferência, explica o que fazer.
  await evaluate(`Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("recusado"); } } })`);
  await share('[data-share="copy-latex"]');
  await waitFor(() => evaluate(`document.querySelector(".proof-share__status .msg-warn")?.textContent.includes(".tex")`), tag("a falha ao copiar"));

  // Links inválidos: erro claro, sem prova aberta, com o sequente no campo.
  const invalid = [
    ["?s=p+%26", "p &"],
    [`?s=p%7C-q&p=1.${b64([[0, "p ∧", ""]])}`, "p|-q"],
    ["?s=p%7C-q&p=1.@@@", "p|-q"],
    ["?s=p%7C-q&p=9.e30", "p|-q"],
    ["?p=1.e30", ""],
  ];
  for (const [query, field] of invalid) {
    await forget();
    await go(`${origin}${path}${query}`, `document.getElementById("share-error").childElementCount > 0`);
    expect(await evaluate(`document.querySelector("#share-error .msg-error") !== null`), true, tag(`${query}: mensagem`));
    expect(await evaluate(`document.getElementById("proof-editor").childElementCount`), 0, tag(`${query}: sem prova`));
    expect(await evaluate(`document.getElementById("sequent").value`), field, tag(`${query}: campo`));
    expect(await evaluate(`localStorage.getItem("nd:v1:prove")`), null, tag(`${query}: não fica guardado`));
    expect(await evaluate("location.search"), query, tag(`${query}: o endereço fica como estava`));
  }
  await writeScreenshot(page, `${lang}-link-invalido`);
  await open("p ⊢ p");
  expect(await evaluate(`document.getElementById("share-error").childElementCount`), 0, tag("começar uma prova tira o erro"));

  // Um nome de regra num link é texto, nunca HTML.
  await go(`${origin}${path}?s=p%7C-p&p=1.${b64([[0, "p", "<img/src=x/onerror=window.pwned=1>"]])}`, `document.querySelector('[data-line="2"]') !== null`);
  await sleep(100);
  expect(await evaluate(`document.querySelector("#proof-editor img") === null && window.pwned === undefined`), true, tag("regra hostil"));
  expect(await evaluate(`document.querySelector('[data-line="2"]').dataset.state`), "error", tag("regra hostil dá erro de linha"));

  // Histórico: o último sequente aparece primeiro, abre-se e limpa-se.
  await forget();
  await go(`${origin}${path}`);
  await open("r ⊢ r");
  await evaluate(`document.getElementById("sequent").value = ""`);
  await tap("#examples-menu summary");
  await waitFor(() => evaluate(`document.querySelector("[data-sequent]") !== null`), tag("o histórico"));
  expect(await evaluate(`document.querySelector("[data-sequent]").dataset.sequent`), "r ⊢ r", tag("o histórico tem o sequente"));
  await writeScreenshot(page, `${lang}-historico`);
  await tap("[data-sequent]");
  expect(await evaluate(`document.getElementById("sequent").value`), "r ⊢ r", tag("escolher do histórico"));
  await tap("#examples-menu summary");
  await waitFor(() => evaluate(`document.querySelector("[data-clear-history]") !== null`), tag("limpar"));
  await tap("[data-clear-history]");
  await waitFor(() => evaluate(`document.querySelector("[data-sequent]") === null`), tag("o histórico limpo"));
  expect(await evaluate(`localStorage.getItem("nd:v1:history")`), null, tag("o histórico sai do browser"));

  // LaTeX: copiar e descarregar.
  await evaluate(`(() => {
    window.copied = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copied.push(text); } } });
    window.blobs = [];
    const real = URL.createObjectURL;
    URL.createObjectURL = (blob) => { window.blobs.push(blob); return real.call(URL, blob); };
  })()`);
  heights.push(await share('[data-share="copy-latex"]'));
  await waitFor(() => evaluate(`window.copied.length === 1`), tag("copiar o LaTeX"));
  expect((await evaluate("window.copied[0]")).includes(pt ? "{portuguese}{babel}".replace("{portuguese}", "[portuguese]") : "[english]{babel}"), true, tag("o LaTeX segue o idioma"));
  heights.push(await share('[data-share="download-tex"]'));
  await waitFor(() => evaluate(`window.blobs.length === 1`), tag("descarregar o .tex"));
  expect(await evaluate("window.blobs[0].text()"), await evaluate("window.copied[0]"), tag("o .tex é o mesmo documento"));

  // Impressão: a folha só com a prova, criada para o Ctrl+P.
  await fill(2, "formula", "r");
  await fill(2, "justification", "R, 1");
  await evaluate(`dispatchEvent(new Event("beforeprint"))`);
  await page("Emulation.setEmulatedMedia", { media: "print" });
  expect(await evaluate(`document.querySelectorAll(".print-sheet").length`), 1, tag("uma só folha"));
  expect(await evaluate(`getComputedStyle(document.querySelector(".print-sheet")).display`), "block", tag("a folha aparece"));
  expect(await evaluate(`getComputedStyle(document.querySelector("main")).display`), "none", tag("o resto sai"));
  expect(await evaluate(`getComputedStyle(document.querySelector(".print-sheet .fitch")).overflowX`), "visible", tag("sem scroll na folha"));
  const { data } = await page("Page.printToPDF", { printBackground: false });
  mkdirSync(SCREENS, { recursive: true });
  writeFileSync(join(SCREENS, `${lang}-prova.pdf`), Buffer.from(data, "base64"));
  await page("Emulation.setEmulatedMedia", { media: "" });
  await evaluate(`dispatchEvent(new Event("afterprint"))`);
  expect(await evaluate(`document.querySelector(".print-sheet") === null`), true, tag("a folha sai depois de imprimir"));

  expect(Math.min(...heights) >= 44, true, tag(`zonas de toque com ${Math.min(...heights)}px`));
  expect((await evaluate("document.documentElement.scrollWidth")) <= WIDTH, true, tag("largura da página"));
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
if (problems.length === 0) console.log("OK partilha");
process.exit(problems.length > 0 ? 1 : 0);
