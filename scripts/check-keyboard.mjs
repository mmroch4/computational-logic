// Navegação só com teclado, com teclas a sério (eventos de input do CDP).
// Uso: node scripts/check-keyboard.mjs [url-base]   (servidor a correr; por omissão http://127.0.0.1:$PORT)
// Em cada página, a 1280 e 390px, carrega no Tab até dar a volta e falha se o foco se perder, ficar
// fora do ecrã, não tiver indicador visível ou ficar preso. Depois abre os menus e as folhas com o
// teclado: o foco entra, não sai com o Tab e, com Esc, volta ao botão que os abriu.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || `http://127.0.0.1:${process.env.PORT || 8765}`;
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const PAGES = [
  "/", "/provar", "/passo-a-passo", "/aprender", "/exercicios", "/404",
  "/en", "/en/prove", "/en/step-by-step", "/en/learn", "/en/exercises",
];
// Botões que abrem um menu ou folha, por página (seletor do que recebe o foco e o Enter):
// { path, opener, mobileOnly? }. Quem criar um menu acrescenta-o aqui.
const MENUS = [
  { path: "/provar", opener: "#examples-menu summary" },
  { path: "/en/prove", opener: "#examples-menu summary" },
];
const VIEWPORTS = [{ width: 1280, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }];
const MAX_TABS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "nd-keyboard-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve) => {
    let buf = "";
    chrome.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
  });
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  };
  await new Promise((resolve) => { ws.onopen = resolve; });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return { send, stop: () => { chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

async function openPage(cdp, path, vp) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride", { ...vp, deviceScaleFactor: 1 }, sessionId);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await cdp.send("Page.navigate", { url: BASE + path }, sessionId);
  await sleep(900);
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const press = async (key, code, keyCode, modifiers = 0, text) => {
    const common = { key, code, windowsVirtualKeyCode: keyCode, modifiers };
    await cdp.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...common, text }, sessionId);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...common }, sessionId);
    await sleep(30);
  };
  return {
    evaluate,
    tab: (shift = false) => press("Tab", "Tab", 9, shift ? 8 : 0),
    enter: () => press("Enter", "Enter", 13, 0, "\r"),
    arrowRight: () => press("ArrowRight", "ArrowRight", 39),
    escape: () => press("Escape", "Escape", 27),
    close: () => cdp.send("Target.closeTarget", { targetId }),
  };
}

// Corre na página: descreve o elemento com foco e se o indicador se vê (contorno ou anel).
const FOCUS_STATE = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const label = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
    (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/).join(".") : "");
  const r = el.getBoundingClientRect();
  const focusVisible = el.matches(":focus-visible");
  const seen = (s) => (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
  // No campo de sequente, o indicador é o contorno da caixa à volta do textarea.
  const indicator = seen(getComputedStyle(el.closest(".field-box") ?? el));
  const clipped = el.closest("[data-sheet-open], .sheet") === null && (r.bottom <= 0 || r.top >= innerHeight);
  return { label, focusVisible, indicator, clipped, empty: r.width === 0 || r.height === 0 };
})()`;

async function walk(cdp, path, vp) {
  const page = await openPage(cdp, path, vp);
  const tag = `${path} @${vp.width}`;
  const seen = [];
  let steps = 0;
  for (; steps < MAX_TABS; steps++) {
    await page.tab();
    const state = await page.evaluate(FOCUS_STATE);
    if (!state) {
      if (seen.length) break; // saiu do documento: deu a volta
      continue;
    }
    if (seen.length && state.label === seen[0] && steps > 1) break;
    seen.push(state.label);
    if (state.empty) problems.push(`${tag}: foco num elemento sem tamanho: ${state.label}`);
    if (!state.focusVisible) problems.push(`${tag}: foco sem :focus-visible: ${state.label}`);
    if (!state.indicator) problems.push(`${tag}: foco sem indicador visível: ${state.label}`);
    if (state.clipped) problems.push(`${tag}: foco fora do ecrã: ${state.label}`);
  }
  if (steps >= MAX_TABS) problems.push(`${tag}: o Tab não deu a volta em ${MAX_TABS} passos`);
  if (seen.length < 3) problems.push(`${tag}: só ${seen.length} paragens de Tab`);
  console.log(`${tag}: ${seen.length} paragens de Tab`);
  await page.close();
}

async function menu(cdp, { path, opener, mobileOnly }, vp) {
  if (mobileOnly && !vp.mobile) return;
  const page = await openPage(cdp, path, vp);
  const tag = `${path.split("?")[0]} @${vp.width} ${opener}`;
  const found = await page.evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(opener)})].find((e) => e.checkVisibility());
    if (!el) return false;
    el.setAttribute("data-kb-opener", "");
    el.focus();
    return true;
  })()`);
  if (!found) {
    problems.push(`${tag}: botão não encontrado`);
    return page.close();
  }
  const isOpen = `(() => {
    const o = document.querySelector("[data-kb-opener]");
    return Boolean(o?.closest("details")?.open || document.querySelector("dialog[open]"));
  })()`;
  // Enter abre, o Tab anda lá dentro e o Esc fecha e devolve o foco.
  await page.enter();
  await sleep(150);
  if (!(await page.evaluate(isOpen))) problems.push(`${tag}: o Enter não abriu`);
  await page.tab();
  await page.escape();
  await sleep(150);
  if (await page.evaluate(isOpen)) problems.push(`${tag}: o Esc não fechou`);
  const focused = `document.activeElement?.closest("[data-kb-opener], summary") ?? null`;
  if (!(await page.evaluate(`Boolean(${focused})`))) {
    problems.push(`${tag}: o foco não voltou ao botão: ${await page.evaluate("document.activeElement?.tagName")}`);
  }

  // Na folha, o Tab não sai para a página (passar por <body> é o ciclo normal de um <dialog> modal);
  // num menu, sair com o Tab fecha-o.
  await page.evaluate(`document.querySelector("[data-kb-opener]").focus()`);
  await page.enter();
  await sleep(150);
  const escaped = `(() => {
    const a = document.activeElement;
    return a !== document.body && !a.closest("dialog[open], details[open]");
  })()`;
  for (let i = 0; i < 40; i++) {
    await page.tab();
    if (await page.evaluate(escaped)) break;
  }
  const left = await page.evaluate(escaped);
  if (vp.mobile && left) problems.push(`${tag}: o Tab saiu da folha`);
  if (!vp.mobile && left && (await page.evaluate(isOpen))) problems.push(`${tag}: o menu ficou aberto depois de o Tab sair`);
  await page.close();
}

// O que só faz sentido com teclas: o primeiro Tab dá no link de saltar para o conteúdo, e o Enter no
// seletor de idioma muda de página.
async function actions(cdp, vp) {
  const tag = `/provar @${vp.width}`;
  let page = await openPage(cdp, "/provar", vp);
  await page.tab();
  const first = await page.evaluate(`document.activeElement.className`);
  if (first !== "skip-link") problems.push(`${tag}: o primeiro Tab deu em «${first}» e não no link de saltar`);
  await page.close();

  page = await openPage(cdp, "/provar", vp);
  await page.evaluate(`document.querySelector('.hdr [data-lang="en"]').focus()`);
  await page.enter();
  await sleep(900);
  const path = await page.evaluate("location.pathname");
  if (path !== "/en/prove") problems.push(`${tag}: o Enter no seletor de idioma foi para ${path}`);
  await page.close();
}

const cdp = await launch();
try {
  for (const vp of VIEWPORTS) {
    for (const path of PAGES) await walk(cdp, path, vp);
    for (const entry of MENUS) await menu(cdp, entry, vp);
    await actions(cdp, vp);
  }
} finally {
  cdp.stop();
}
if (problems.length) {
  console.error(`check-keyboard: ${problems.length} problema(s)`);
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("check-keyboard: sem problemas");
process.exit(0);
