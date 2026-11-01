// Navegação só com teclado, com teclas a sério (eventos de input do CDP).
// Uso: node scripts/check-keyboard.mjs [url-base]   (servidor a correr; por omissão http://127.0.0.1:$PORT)
// Em cada página, a 1280 e 390px, carrega no Tab até dar a volta e falha se o foco se perder, ficar
// fora do ecrã, não tiver indicador visível ou ficar preso. Depois abre os menus e as folhas com o
// teclado: o foco entra, não sai com o Tab e, com Esc, volta ao botão que os abriu.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stateQuery } from "./prove-states.mjs";

const BASE = process.argv[2] || `http://127.0.0.1:${process.env.PORT || 8765}`;
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const PAGES = [
  "/", "/provar", "/passo-a-passo", "/aprender", "/exercicios", "/404",
  "/en", "/en/prove", "/en/step-by-step", "/en/learn", "/en/exercises",
];
const PLAYER_QUERY = "s=p+-%3E+q,+~q+%7C-+~p&step=2";
// Botões que abrem um menu ou folha, por página (seletor do que recebe o foco e o Enter):
// { path, opener, mobileOnly? }. Quem criar um menu acrescenta-o aqui.
const MENUS = [
  { path: "/provar", opener: "#examples-menu summary" },
  { path: "/en/prove", opener: "#examples-menu summary" },
  { path: `/provar?${stateQuery("mixed")}`, opener: "#proof-share summary" },
  { path: `/en/prove?${stateQuery("mixed")}`, opener: "#proof-share summary" },
  // Um sequente inválido deixa a escolha aberta, e um link manda sobre o que ficou guardado.
  { path: "/passo-a-passo?s=p+%7C-+q", opener: "#examples-menu summary" },
  { path: "/en/step-by-step?s=p+%7C-+q", opener: "#examples-menu summary" },
  { path: `/passo-a-passo?${PLAYER_QUERY}`, opener: ".tl details.dd > summary" },
  { path: `/en/step-by-step?${PLAYER_QUERY}`, opener: ".tl details.dd > summary" },
];
// O Passo a passo com uma prova aberta: a volta do Tab na página vazia não passa pelo player.
const PLAYER_WALKS = ["/passo-a-passo", "/en/step-by-step"].flatMap((path) => [
  { path: `${path}?${PLAYER_QUERY}`, tag: `${path} player` },
  { path: `${path}?${PLAYER_QUERY}&view=tree`, tag: `${path} player árvore` },
]);
// A Provar com uma prova aberta, nos dois modos: a volta do Tab na página vazia não passa pelo editor.
const PROVE_WALKS = ["/provar", "/en/prove"].flatMap((path) => [
  { path: `${path}?${stateQuery("mixed")}`, tag: `${path} prova` },
  { path: `${path}?${stateQuery("mixed")}`, tag: `${path} guiado`, guided: true },
  { path: `${path}?${stateQuery("complete")}`, tag: `${path} árvore` },
]);
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
    press,
    // O texto como o verá um leitor de ecrã: os nomes calculados pelo browser, sem o que está escondido.
    spokenNames: async () => {
      await cdp.send("Accessibility.enable", {}, sessionId);
      const { nodes } = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
      return nodes.filter((node) => !node.ignored).map((node) => node.name?.value ?? "");
    },
    type: (text) => cdp.send("Input.insertText", { text }, sessionId),
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
  // No slider, o indicador é o anel do botão de arrastar, que getComputedStyle não vê.
  const indicator = el.matches(".tl-range") || seen(getComputedStyle(el.closest(".field-box") ?? el));
  const clipped = el.closest("[data-sheet-open], .sheet") === null && (r.bottom <= 0 || r.top >= innerHeight);
  // Coberto pela barra do topo ou pela de baixo, que ficam presas ao ecrã.
  const bars = [...document.querySelectorAll(".hdr, .tabbar")].filter((bar) => bar.checkVisibility() && !bar.contains(el)).map((bar) => bar.getBoundingClientRect());
  const covered = !el.matches(".skip-link") && bars.some((bar) => r.top < bar.bottom && r.bottom > bar.top);
  return { label, focusVisible, indicator, clipped, covered, empty: r.width === 0 || r.height === 0 };
})()`;

async function walk(cdp, entry, vp) {
  const { path, tag: name = path, guided = false } = typeof entry === "string" ? { path: entry } : entry;
  const page = await openPage(cdp, path, vp);
  const tag = `${name} @${vp.width}`;
  if (guided) await page.evaluate(`document.querySelector("[data-mode=guided]").click(); document.activeElement.blur()`);
  const seen = [];
  let steps = 0;
  for (; steps < MAX_TABS; steps++) {
    await page.tab();
    const state = await page.evaluate(FOCUS_STATE);
    if (!state) {
      if (seen.length) break; // saiu do documento: deu a volta
      continue;
    }
    // O mesmo elemento e não a mesma classe: as linhas da prova são todas iguais.
    if (await page.evaluate(`document.activeElement.hasAttribute("data-kb-first")`)) break;
    if (seen.length === 0) await page.evaluate(`document.activeElement.setAttribute("data-kb-first", "")`);
    seen.push(state.label);
    if (state.empty) problems.push(`${tag}: foco num elemento sem tamanho: ${state.label}`);
    if (!state.focusVisible) problems.push(`${tag}: foco sem :focus-visible: ${state.label}`);
    if (!state.indicator) problems.push(`${tag}: foco sem indicador visível: ${state.label}`);
    if (state.clipped) problems.push(`${tag}: foco fora do ecrã: ${state.label}`);
    if (state.covered) problems.push(`${tag}: foco tapado por uma barra: ${state.label}`);
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

// A timeline anda com as setas no slider, e um segmented fica com as setas dele.
async function timelineKeys(cdp, vp) {
  const tag = `/passo-a-passo timeline @${vp.width}`;
  const page = await openPage(cdp, `/passo-a-passo?${PLAYER_QUERY}`, vp);
  const value = `document.querySelector(".tl-range").value`;
  await page.evaluate(`document.querySelector(".tl-range").focus()`);
  await page.arrowRight();
  if ((await page.evaluate(value)) !== "3") problems.push(`${tag}: a seta no slider não avançou (passo ${await page.evaluate(value)})`);
  await page.evaluate(`document.querySelector('[data-view="fitch"]').focus()`);
  await page.arrowRight();
  if ((await page.evaluate(value)) !== "3") problems.push(`${tag}: a seta no segmented mudou de passo`);
  const pressed = await page.evaluate(`document.querySelector('[data-view="tree"]').getAttribute("aria-pressed")`);
  if (pressed !== "true") problems.push(`${tag}: a seta no segmented não trocou de vista`);
  // Os atalhos só existem com teclado físico; não têm nada focável, e o Esc fecha-os.
  if (!vp.mobile) {
    const open = `document.querySelector(".step-menu--keys").open`;
    await page.press("?", "Slash", 191, 8, "?");
    if (!(await page.evaluate(open))) problems.push(`${tag}: o ? não abriu os atalhos`);
    await page.escape();
    await sleep(150);
    if (await page.evaluate(open)) problems.push(`${tag}: o Esc não fechou os atalhos`);
  }
  await page.close();
}

// Uma prova feita só com teclas: o estado de cada linha é anunciado na região viva, e o texto para o
// leitor de ecrã traz a fórmula em palavras.
async function writing(cdp, vp) {
  const tag = `/provar escrever @${vp.width}`;
  const page = await openPage(cdp, `/provar?${stateQuery("mixed")}`, vp);
  const live = `document.querySelector(".proof-editor__live").textContent`;
  await page.evaluate(`document.querySelector("#proof-formula-4").focus()`);
  await page.evaluate(`document.querySelector("#proof-formula-4").select()`);
  await page.type("q");
  await sleep(100);
  const fixed = await page.evaluate(live);
  if (!fixed.includes("Linha 4 certa")) problems.push(`${tag}: corrigir a linha 4 anunciou «${fixed}»`);
  await page.press("Backspace", "Backspace", 8);
  await page.type("s");
  await sleep(900);
  const broken = await page.evaluate(live);
  if (!broken.includes("Linha 4 com erro")) problems.push(`${tag}: estragar a linha 4 anunciou «${broken}»`);
  const names = await page.spokenNames();
  if (!names.includes("não q")) problems.push(`${tag}: a linha 2 não se lê em palavras`);
  if (!names.includes("p implica q")) problems.push(`${tag}: a linha 1 não se lê em palavras`);
  const reading = await page.evaluate(`document.querySelector("#proof-formula-3").getAttribute("aria-describedby")`);
  if (!reading.includes("proof-reading-3")) problems.push(`${tag}: o campo não aponta para a leitura da linha`);
  await page.close();
}

// No modo guiado, selecionar e aplicar uma regra só com teclas, sem o foco se perder quando o botão some.
async function guiding(cdp, vp) {
  const tag = `/provar guiado @${vp.width}`;
  const page = await openPage(cdp, `/provar?${stateQuery("complete")}`, vp);
  await page.evaluate(`document.querySelector("[data-mode=guided]").click()`);
  const heading = await page.evaluate(`document.querySelector(".guided__objective").textContent`);
  if (!heading.includes("completa")) problems.push(`${tag}: prova completa com o título «${heading}»`);
  await page.close();

  const open = await openPage(cdp, "/provar?s=p,q%20%7C-%20p%20%26%20q", vp);
  await open.evaluate(`document.querySelector("#start-proof")?.click()`);
  await sleep(100);
  await open.evaluate(`document.querySelector("[data-mode=guided]").click()`);
  await sleep(100);
  await open.evaluate(`document.querySelector("[data-rule='∧E']").focus()`);
  await open.enter();
  await sleep(100);
  const refused = await open.evaluate(`document.querySelector(".proof-editor__live").textContent`);
  if (!refused) problems.push(`${tag}: a recusa de uma regra não foi anunciada`);
  for (const line of [1, 2]) {
    await open.evaluate(`document.querySelector("[data-pick='${line}']").focus()`);
    await open.press(" ", "Space", 32, 0, " ");
    await sleep(60);
  }
  const pressed = await open.evaluate(`document.querySelector("[data-pick='2']").getAttribute("aria-pressed")`);
  if (pressed !== "true") problems.push(`${tag}: o Espaço não selecionou a linha`);
  await open.evaluate(`document.querySelector("[data-rule='∧I']").focus()`);
  await open.enter();
  await sleep(100);
  if (await open.evaluate(`document.querySelector("[data-choice]") !== null`)) {
    await open.evaluate(`document.querySelector("[data-choice]").focus()`);
    await open.enter();
    await sleep(100);
  }
  const lost = await open.evaluate(`document.activeElement === document.body`);
  if (lost) problems.push(`${tag}: o foco perdeu-se depois de aplicar a regra`);
  await open.press("z", "KeyZ", 90, 2);
  await sleep(100);
  await open.evaluate(`document.querySelector("[data-action=undo]").focus()`);
  await open.enter();
  await sleep(100);
  const stuck = await open.evaluate(`document.activeElement === document.body || document.activeElement.disabled`);
  if (stuck) problems.push(`${tag}: o foco ficou num botão desativado`);
  await open.close();
}

// Na árvore, um Tab chega à conclusão, as setas andam entre as fórmulas e o Tab seguinte sai dela.
async function treeKeys(cdp, vp) {
  const tag = `/provar árvore @${vp.width}`;
  const page = await openPage(cdp, `/provar?${stateQuery("complete")}`, vp);
  await page.evaluate(`document.querySelector(".tree-panel__section").open = true`);
  const stops = await page.evaluate(`document.querySelectorAll('[data-tree-line][tabindex="0"]').length`);
  if (stops !== 1) problems.push(`${tag}: ${stops} paragens de Tab nas fórmulas`);
  await page.evaluate(`document.querySelector('[data-tree-line][tabindex="0"]').focus()`);
  const line = `document.activeElement.dataset.treeLine`;
  const last = await page.evaluate(line);
  await page.press("ArrowLeft", "ArrowLeft", 37);
  const before = await page.evaluate(line);
  if (before === undefined || before === last) problems.push(`${tag}: a seta não mudou de fórmula`);
  const caption = await page.evaluate(`document.querySelector(".tree-panel__caption").textContent`);
  if (!caption.includes(`Linha ${before}`)) problems.push(`${tag}: a legenda não seguiu a seta: «${caption}»`);
  await page.press("Home", "Home", 36);
  await page.press("End", "End", 35);
  if ((await page.evaluate(line)) !== last) problems.push(`${tag}: o End não voltou à conclusão`);
  await page.tab();
  if (await page.evaluate(`document.activeElement.hasAttribute("data-tree-line")`)) problems.push(`${tag}: o Tab não saiu das fórmulas`);
  await page.close();
}

const cdp = await launch();
try {
  for (const vp of VIEWPORTS) {
    for (const path of PAGES) await walk(cdp, path, vp);
    for (const entry of PROVE_WALKS) await walk(cdp, entry, vp);
    for (const entry of PLAYER_WALKS) await walk(cdp, entry, vp);
    for (const entry of MENUS) await menu(cdp, entry, vp);
    await actions(cdp, vp);
    await timelineKeys(cdp, vp);
    await writing(cdp, vp);
    await guiding(cdp, vp);
    await treeKeys(cdp, vp);
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
