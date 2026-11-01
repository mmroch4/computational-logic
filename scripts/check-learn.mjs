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
import { quizQuestions } from "../js/core/quiz.js";
import { LAB_GUIDED } from "../tests/fixtures/lab-guided.js";

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

// O quiz é a última figura a montar: a altura das outras empurra as secções seguintes.
const figuresReady = `document.querySelector(".quiz__option") !== null && document.querySelectorAll(".lesson-rule").length === 12 &&document.querySelectorAll(".lesson-derived").length === 7 && document.querySelectorAll(".lesson-lab .fitch--edit").length === 3 && document.querySelector("[data-lesson-counter] .lesson-figure") !== null && document.querySelector(".lesson-check__option") !== null && document.querySelector(".lesson-toc__link") !== null`;

/** Leva o quiz até ao fim com toques: a primeira resposta errada e as outras certas. Depois repete-o. */
async function quiz({ page, evaluate, tap }, lang, tag) {
  const questions = quizQuestions();
  const box = "[data-lesson-quiz]";
  const summary = `document.querySelector("${box} .quiz__summary")`;
  const keyed = `(() => {
    const first = document.querySelector("${box} [data-option]");
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    return document.activeElement === document.querySelectorAll("${box} [data-option]")[1];
  })()`;
  expect(await evaluate(keyed), true, tag("as setas mexem o foco"));
  expect(await evaluate(`document.querySelector("${box} .quiz__feedback") === null`), true, tag("as setas não respondem"));
  for (const [index, question] of questions.entries()) {
    const wrong = question.options.find(({ id }) => id !== question.answer).id;
    await tap(`${box} [data-option="${index === 0 ? wrong : question.answer}"]`);
    await waitFor(() => evaluate(`document.querySelector("${box} .quiz__feedback") !== null`), tag(`a explicação da pergunta ${index + 1}`));
    expect(await evaluate(`document.querySelector("${box} .quiz__feedback").classList.contains("${index === 0 ? "msg-warn" : "msg-ok"}")`), true, tag(`o veredito da pergunta ${index + 1}`));
    expect(await evaluate(`document.documentElement.scrollWidth <= 390`), true, tag(`sem scroll lateral na pergunta ${index + 1}`));
    if (index === 0) {
      await sleep(400);
      await writeScreenshot(page, `${lang}-quiz-errada`);
    }
    await tap(`${box} [data-next]`);
  }
  await waitFor(() => evaluate(`${summary} !== null`), tag("o resumo do quiz"));
  expect(await evaluate(`${summary}.querySelector(".quiz__metric-value").textContent`), "7/8", tag("o resultado"));
  expect(await evaluate(`${summary}.querySelectorAll(".quiz__review-item--wrong").length`), 1, tag("uma resposta a rever"));
  expect(await evaluate(`JSON.parse(localStorage.getItem("nd:v1:progress"))["learn-quiz"].best`), 7, tag("o melhor resultado guardado"));
  expect(await evaluate(`document.documentElement.scrollWidth <= 390`), true, tag("sem scroll lateral no resumo"));
  await evaluate(`document.querySelector("${box}").scrollIntoView({ behavior: "instant" })`);
  await sleep(300);
  await writeScreenshot(page, `${lang}-quiz-resumo`);
  await tap(`${box} [data-restart]`);
  expect(await evaluate(`document.querySelectorAll("${box} [data-option]:not(:disabled)").length > 0`), true, tag("repetir volta ao início"));
  expect(await evaluate(`document.querySelector("${box} .quiz__score").textContent.startsWith("0")`), true, tag("repetir limpa as respostas"));
}

/** Resolve os 3 laboratórios a 390px, com toques, e experimenta as ações e o outro modo. */
async function labs({ page, evaluate, tap }, tag) {
  const solved = (lab) => evaluate(`document.querySelector('[data-lesson-lab="${lab}"] .proof-editor__status .msg-ok') !== null`);
  for (const [lab, steps] of Object.entries(LAB_GUIDED)) {
    const root = `[data-lesson-lab="${lab}"]`;
    expect(await solved(lab), false, tag(`${lab} começa por resolver`));
    for (const { pick = [], rule } of steps) {
      for (const line of pick) await tap(`${root} [data-pick="${line}"]`);
      await tap(`${root} [data-rule="${rule}"]`);
    }
    await waitFor(() => solved(lab), tag(`${lab} resolvido`));
    expect(await evaluate(`document.querySelector(${JSON.stringify(root)}).getBoundingClientRect().right <= 390`), true, tag(`${lab} dentro do ecrã`));
    await evaluate(`document.querySelector(${JSON.stringify(root)}).scrollIntoView({ behavior: "instant" })`);
    await sleep(200);
    await writeScreenshot(page, `${tag("").slice(0, 2)}-${lab}`);
    await tap(`${root} [data-role="restart"]`);
    await waitFor(async () => !(await solved(lab)), tag(`${lab} recomeça`));
    await tap(`${root} [data-role="solution"]`);
    await waitFor(() => solved(lab), tag(`${lab} mostra a solução`));
  }

  // No modo de escrita: campos com ids próprios, e escrever chega ao verificador.
  const root = '[data-lesson-lab="labCases"]';
  await tap(`${root} [data-role="restart"]`);
  await tap(`${root} [data-mode="write"]`);
  await waitFor(() => evaluate(`document.getElementById("labCases-formula-3") !== null`), tag("os campos do laboratório"));
  const ids = await evaluate(`[...document.querySelectorAll("[id]")].map((el) => el.id)`);
  expect(ids.length, new Set(ids).size, tag("sem ids repetidos"));
  await tap("#labCases-formula-3");
  await page("Input.insertText", { text: "a" });
  await tap("#labCases-justification-3");
  await page("Input.insertText", { text: "FI" });
  await waitFor(() => evaluate(`document.querySelector('${root} [data-line="3"]').dataset.state !== "pending"`), tag("o verificador responde à escrita"));
  expect(await evaluate(`document.documentElement.scrollWidth <= 390`), true, tag("sem scroll lateral nos laboratórios"));
}

/** A prova animada: à mão muda a nota, e reproduzir avança sozinho até se pausar. */
async function walkthrough({ evaluate, tap }, tag) {
  const root = '[data-lesson-walkthrough="strategyCases"]';
  const counter = () => evaluate(`document.querySelector('${root} .lesson-proof__counter').textContent`);
  const note = () => evaluate(`document.querySelector('${root} .lesson-proof__note').textContent`);
  const firstNote = await note();
  expect(await evaluate(`document.querySelector('${root} .lesson-rule__sequent').textContent.includes("⊢")`), true, tag("a prova animada mostra o sequente"));
  await tap(`${root} [data-role="next"]`);
  expect((await note()) !== firstNote, true, tag("a nota muda com a linha"));
  const before = await counter();
  await tap(`${root} [data-role="play"]`);
  expect((await counter()) !== before, true, tag("reproduzir revela logo uma linha"));
  const playing = await counter();
  await waitFor(async () => (await counter()) !== playing, tag("a linha seguinte, sozinha"));
  const label = await evaluate(`document.querySelector('${root} [data-role="play"]').textContent`);
  await tap(`${root} [data-role="play"]`);
  expect((await evaluate(`document.querySelector('${root} [data-role="play"]').textContent`)) !== label, true, tag("o botão volta a reproduzir"));
  const paused = await counter();
  await sleep(4000);
  expect(await counter(), paused, tag("pausado, não avança"));
}

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

  await walkthrough({ evaluate, tap }, tag);
  await evaluate(`document.querySelector('[data-lesson-walkthrough="strategyBackward"]').scrollIntoView({ behavior: "instant" })`);
  await sleep(300);
  await writeScreenshot(page, `${lang}-estrategia`);
  await labs({ page, evaluate, tap }, tag);
  await evaluate(`document.querySelector('[data-lesson-counter]').scrollIntoView({ behavior: "instant" })`);
  await sleep(300);
  await writeScreenshot(page, `${lang}-contraexemplo`);
  await quiz({ page, evaluate, tap }, lang, tag);
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
