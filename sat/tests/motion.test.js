// js/ui/motion.js com elementos falsos: as etapas encadeiam-se, a velocidade encolhe-as, o cancelar
// corre os `after` e o movimento reduzido não anima. No browser, ver o check-page.sh com REDUCED_MOTION=1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { durationOf, motionReady, sequence, together } from "../js/ui/motion.js";

const TOKENS = { "--dur-fast": "120ms", "--dur-base": "200ms", "--dur-slow": "0.32s" };

function setup({ reduced = false, tokens = TOKENS } = {}) {
  globalThis.matchMedia = () => ({ matches: reduced });
  globalThis.document = { documentElement: {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => tokens[name] ?? "", opacity: "1" });
}

/** Um elemento que regista as animações; `finish()` acaba-as como faria o browser. */
function fakeElement({ drawn = true } = {}) {
  const calls = [];
  return {
    calls,
    style: {},
    isConnected: true,
    getClientRects: () => (drawn ? [{}] : []),
    animate(keyframes, options) {
      const animation = {
        cancelled: false,
        cancel() { this.cancelled = true; },
        finish() { this.onfinish?.(); },
        pause() {},
        effect: { getComputedTiming: () => ({ duration: options.duration }) },
      };
      calls.push({ keyframes, options, animation });
      return animation;
    },
    finish() { calls.forEach(({ animation }) => animation.finish()); },
  };
}

await motionReady;

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test("durationOf lê os tokens em ms ou s", () => {
  setup();
  assert.equal(durationOf("fast"), 120);
  assert.equal(durationOf("slow"), 320);
  assert.equal(durationOf("nada"), 0);
  assert.equal(durationOf(undefined), 0);
});

test("as etapas encadeiam-se e a velocidade encolhe-as", () => {
  setup();
  const a = fakeElement();
  const b = fakeElement();
  const run = sequence([
    { tweens: [{ targets: [a], from: { opacity: "0" }, dur: "base" }] },
    { tweens: [{ targets: [b], from: { opacity: "0" }, dur: "fast" }] },
  ], { speed: 2 });
  assert.equal(run.duration, 160);
  assert.equal(a.calls[0].options.delay, 0);
  assert.equal(a.calls[0].options.duration, 100);
  assert.equal(b.calls[0].options.delay, 100);
  assert.equal(b.calls[0].options.duration, 60);
  assert.deepEqual(b.calls[0].keyframes.opacity, ["0", "1"], "a chegada é o estado do CSS");
  assert.equal(b.calls[0].options.fill, "both", "fica no valor de partida até chegar a sua vez");
  run.cancel();
});

test("o stagger atrasa os elementos da etapa, e um elemento por desenhar não gasta tempo", () => {
  setup();
  const a = fakeElement();
  const b = fakeElement();
  const hidden = fakeElement({ drawn: false });
  const run = sequence([
    { tweens: [{ targets: [a, b], from: { opacity: "0" }, dur: "base", stagger: "fast" }] },
    { tweens: [{ targets: [hidden], from: { opacity: "0" }, dur: "slow" }] },
  ]);
  assert.equal(b.calls[0].options.delay, 120);
  assert.equal(run.duration, 320);
  assert.equal(hidden.calls.length, 0);
  run.cancel();
});

test("os `after` correm no fim de cada etapa, o inline sai e a promessa resolve", async () => {
  setup();
  const a = fakeElement();
  const log = [];
  const run = sequence([{ tweens: [{ targets: [a], from: { opacity: "0" }, dur: "base" }], after: () => log.push("a") }]);
  await flush();
  assert.deepEqual(log, []);
  a.finish();
  await run.finished;
  assert.deepEqual(log, ["a"]);
  assert.equal(a.style.opacity, "");
});

test("cancelar larga as animações, corre os `after` que faltam, por ordem, e resolve", async () => {
  setup();
  const a = fakeElement();
  const b = fakeElement();
  const log = [];
  const run = sequence([
    { tweens: [{ targets: [a], from: { opacity: "0" }, dur: "base" }], after: () => log.push("a") },
    { tweens: [{ targets: [b], from: { opacity: "0" }, dur: "base" }], after: () => log.push("b") },
  ]);
  run.cancel();
  run.cancel();
  await run.finished;
  assert.deepEqual(log, ["a", "b"]);
  assert.ok(a.calls[0].animation.cancelled && b.calls[0].animation.cancelled);
});

test("com movimento reduzido não anima, não corre os `after` e a promessa já vem resolvida", async () => {
  setup({ reduced: true });
  const a = fakeElement();
  const log = [];
  const run = sequence([{ tweens: [{ targets: [a], from: { opacity: "0" }, dur: "base" }], after: () => log.push("a") }]);
  await run.finished;
  run.cancel();
  assert.equal(run.duration, 0);
  assert.equal(a.calls.length, 0);
  assert.deepEqual(log, []);
});

test("sem nada desenhado, os `after` correm logo: o estado final não depende de se ver", async () => {
  setup();
  const log = [];
  const run = sequence([{ tweens: [{ targets: [fakeElement({ drawn: false })], from: { opacity: "0" }, dur: "base" }], after: () => log.push("a") }]);
  await run.finished;
  assert.equal(run.duration, 0);
  assert.deepEqual(log, ["a"]);
});

test("together: acaba quando todas acabam, dura a mais longa e cancela todas", async () => {
  setup();
  const a = fakeElement();
  const b = fakeElement();
  const run = together(
    sequence([{ tweens: [{ targets: [a], from: { opacity: "0" }, dur: "fast" }] }]),
    sequence([{ tweens: [{ targets: [b], from: { opacity: "0" }, dur: "slow" }] }]),
  );
  assert.equal(run.duration, 320);
  run.cancel();
  await run.finished;
  assert.ok(a.calls[0].animation.cancelled && b.calls[0].animation.cancelled);
});
