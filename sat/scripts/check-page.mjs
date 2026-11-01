// Verificação visual de uma página com o Chrome headless, via DevTools Protocol (sem dependências).
// Uso: node scripts/check-page.mjs <url> <pasta-saída>
// Tira screenshots a 1280x900 e 390x844 e sai com código 1 se houver exceções, console.error,
// pedidos falhados (>= 400), transbordo horizontal ou problemas da auditoria de acessibilidade
// (scripts/a11y-audit.mjs: SVG sem texto alternativo, controlos sem nome, ids repetidos…).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { a11yAudit } from "./a11y-audit.mjs";
import { motionAudit } from "./motion-audit.mjs";
import { fontUsage } from "./font-usage.mjs";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
// Idioma do browser (ex.: CHROME_LANG=pt-PT); por omissão o Chrome headless anuncia en-US.
const LANG = process.env.CHROME_LANG || "";
// FULL_PAGE=1: a screenshot apanha a página toda (aumenta a altura do ecrã até ao fim do conteúdo).
const FULL_PAGE = process.env.FULL_PAGE === "1";
// EVAL="…": JS corrido na página depois de carregar (antes da screenshot), para estados interativos.
const EVAL = process.env.EVAL || "";
// CLICK="seletor": antes do EVAL, clica no elemento com o rato a sério (eventos de input do CDP, não
// el.click()), para testar o que só um clique real faz, como o :focus-visible não aparecer.
const CLICK = process.env.CLICK || "";
// PDF=1: também imprime a página para PDF (o Chrome dispara o beforeprint/afterprint, como no Ctrl+P).
const PDF = process.env.PDF === "1";
// REDUCED_MOTION=1: emula prefers-reduced-motion: reduce e falha se houver transições ou animações.
const REDUCED_MOTION = process.env.REDUCED_MOTION === "1";
// BLOCK_STORAGE=1: o localStorage lança SecurityError (como num browser com cookies bloqueados),
// antes de qualquer script da página; a página tem de funcionar na mesma e sem erros na consola.
const BLOCK_STORAGE = process.env.BLOCK_STORAGE === "1";
// EXPECT_404="texto": os 404 de URLs com esse texto são de propósito (ex.: abrir a página 404 num iframe).
const EXPECT_404 = process.env.EXPECT_404 || "";
const expected404 = (url = "") => EXPECT_404 !== "" && url.includes(EXPECT_404);
// MEASURE=1: escreve o peso transferido por tipo de recurso (HTML, CSS, JS, fontes, imagens) e as
// fontes usadas/descarregadas (scripts/font-usage.mjs), para o M8.5b. Não falha por isso.
const MEASURE = process.env.MEASURE === "1";
const VIEWPORTS = [
  { name: "1280", width: 1280, height: 900, mobile: false },
  { name: "390", width: 390, height: 844, mobile: true },
];

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("Uso: node scripts/check-page.mjs <url> <pasta-saída>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

// Nome base dos ficheiros a partir do caminho e da query: "/resolver?f=p" → "resolver_f-p"
function slugFor(pageUrl) {
  const u = new URL(pageUrl);
  let base = u.pathname.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "") || "index";
  if (u.search) base += "_" + u.search.slice(1);
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), "dpsat-chrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  // O Chrome escreve "DevTools listening on ws://..." no stderr.
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("Chrome não arrancou a tempo")), 15000);
    chrome.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    chrome.on("exit", () => reject(new Error("Chrome terminou antes de arrancar")));
  });
  const cleanup = () => { chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); };
  return { wsUrl, cleanup };
}

// Cliente CDP mínimo: send(método, params, sessionId) e listeners de eventos.
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const opened = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return { opened, send, on: (fn) => listeners.push(fn), close: () => ws.close() };
}

async function checkViewport(cdp, vp, errors) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const tag = `[${vp.name}px]`;
  let loaded = null;
  const onLoad = new Promise((r) => { loaded = r; });
  // MEASURE: bytes transferidos (com compressão e cabeçalhos) por pedido, agrupados por tipo.
  const requestType = new Map();
  const bytesByType = {};

  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = p.exceptionDetails;
      errors.push(`${tag} Uncaught: ${d.exception?.description || d.text} (${d.url || ""}:${d.lineNumber})`);
    } else if (msg.method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "assert")) {
      errors.push(`${tag} console.${p.type}: ${p.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    } else if (msg.method === "Log.entryAdded" && p.entry.level === "error") {
      if (!expected404(p.entry.url)) errors.push(`${tag} ${p.entry.text} ${p.entry.url || ""}`.trim());
    } else if (msg.method === "Network.responseReceived") {
      requestType.set(p.requestId, p.type);
      if (p.response.status >= 400 && !expected404(p.response.url)) errors.push(`${tag} HTTP ${p.response.status}: ${p.response.url}`);
    } else if (msg.method === "Network.loadingFinished") {
      const type = requestType.get(p.requestId) ?? "Other";
      bytesByType[type] = (bytesByType[type] ?? 0) + p.encodedDataLength;
    } else if (msg.method === "Network.loadingFailed" && !p.canceled) {
      errors.push(`${tag} Falha de rede: ${p.errorText}`);
    } else if (msg.method === "Page.loadEventFired") {
      loaded();
    }
  });

  for (const domain of ["Runtime", "Log", "Network", "Page"]) await cdp.send(`${domain}.enable`, {}, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
  }, sessionId);
  if (REDUCED_MOTION) {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    }, sessionId);
  }
  if (LANG) {
    // O --lang é ignorado no headless; sobrepõe-se navigator.language(s) antes de qualquer script da página.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `Object.defineProperty(navigator, "language", { get: () => ${JSON.stringify(LANG)} });
               Object.defineProperty(navigator, "languages", { get: () => [${JSON.stringify(LANG)}] });`,
    }, sessionId);
  }
  if (BLOCK_STORAGE) {
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `Object.defineProperty(window, "localStorage", {
                 get() { throw new DOMException("localStorage bloqueado", "SecurityError"); },
               });`,
    }, sessionId);
  }
  await cdp.send("Page.navigate", { url }, sessionId);
  await Promise.race([onLoad, sleep(10000)]);
  await sleep(400); // dá tempo aos módulos e às fontes para assentar

  // Transbordo horizontal: a página não pode ser mais larga do que o ecrã.
  const { result } = await cdp.send("Runtime.evaluate", {
    expression: "document.documentElement.scrollWidth", returnByValue: true,
  }, sessionId);
  // Compara com a largura do ecrã (sem <meta viewport> o mobile usa 980px e isso também é um erro).
  if (result.value > vp.width) errors.push(`${tag} Transbordo horizontal: ${result.value}px > ${vp.width}px`);

  if (CLICK) {
    const { result: box } = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(CLICK)});
        if (!el) return null;
        el.scrollIntoView({ block: "center", behavior: "instant" });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`, returnByValue: true,
    }, sessionId);
    if (!box.value) {
      errors.push(`${tag} CLICK: não há ${CLICK}`);
    } else {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await cdp.send("Input.dispatchMouseEvent", {
          type, x: box.value.x, y: box.value.y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1,
        }, sessionId);
      }
      await sleep(200);
    }
  }

  if (EVAL) {
    // Estados interativos: corre JS na página (ex.: clicar num botão) e espera que assente.
    // O clipboard precisa de permissão explícita no headless.
    await cdp.send("Browser.setPermission", {
      permission: { name: "clipboard-write" }, setting: "granted", origin: new URL(url).origin,
    }).catch(() => {});
    const { exceptionDetails } = await cdp.send("Runtime.evaluate", {
      expression: `(async () => { ${EVAL}\n})()`, awaitPromise: true, userGesture: true,
    }, sessionId);
    if (exceptionDetails) errors.push(`${tag} EVAL falhou: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    await sleep(400);
  }

  // As screenshots e as auditorias não apanham animações a meio. As que o EVAL pausou ficam como estão.
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      for (let i = 0; i < 60 && document.getAnimations().some((a) => a.playState === "running"); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
    })()`, awaitPromise: true,
  }, sessionId);

  // Acessibilidade: corre depois do EVAL, para apanhar também o estado interativo fotografado.
  const { result: audit } = await cdp.send("Runtime.evaluate", {
    expression: `(${a11yAudit.toString()})()`, returnByValue: true,
  }, sessionId);
  for (const problem of audit.value ?? []) errors.push(`${tag} a11y: ${problem}`);
  if (REDUCED_MOTION) {
    const { result: motion } = await cdp.send("Runtime.evaluate", {
      expression: `(${motionAudit.toString()})()`, returnByValue: true,
    }, sessionId);
    for (const problem of motion.value ?? []) errors.push(`${tag} movimento: ${problem}`);
  }

  if (MEASURE) {
    const { result: fonts } = await cdp.send("Runtime.evaluate", {
      expression: `document.fonts.ready.then(() => (${fontUsage.toString()})())`,
      awaitPromise: true, returnByValue: true,
    }, sessionId);
    const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
    const total = Object.values(bytesByType).reduce((a, b) => a + b, 0);
    const parts = Object.entries(bytesByType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${kb(n)}`);
    console.log(`${tag} peso: ${kb(total)} (${parts.join(", ")})`);
    console.log(`${tag} fontes usadas: ${fonts.value.used.join(" · ")}`);
    console.log(`${tag} fontes descarregadas: ${fonts.value.loaded.join(" · ")}`);
  }

  if (FULL_PAGE) {
    const { result: height } = await cdp.send("Runtime.evaluate", {
      expression: "document.documentElement.scrollHeight", returnByValue: true,
    }, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width, height: Math.max(vp.height, height.value), deviceScaleFactor: 1, mobile: vp.mobile,
    }, sessionId);
    await sleep(200);
  }

  if (PDF) {
    const pdf = await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true }, sessionId);
    const pdfFile = join(outDir, `${slugFor(url)}-${vp.name}.pdf`);
    writeFileSync(pdfFile, Buffer.from(pdf.data, "base64"));
    console.log(`pdf: ${pdfFile}`);
  }

  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  const file = join(outDir, `${slugFor(url)}-${vp.name}.png`);
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  await cdp.send("Target.closeTarget", { targetId });
  return file;
}

const { wsUrl, cleanup } = await launchChrome();
const errors = [];
let exitCode = 0;
try {
  const cdp = connect(wsUrl);
  await cdp.opened;
  for (const vp of VIEWPORTS) console.log(`screenshot: ${await checkViewport(cdp, vp, errors)}`);
  cdp.close();
} catch (err) {
  errors.push(`Erro do verificador: ${err.message}`);
} finally {
  cleanup();
}

if (errors.length) {
  console.error(`FALHOU ${url}`);
  for (const e of errors) console.error(`  - ${e}`);
  exitCode = 1;
} else {
  console.log(`OK ${url}`);
}
process.exit(exitCode);
