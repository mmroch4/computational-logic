// O Worker a sério, num worker_thread e no Chrome: um sequente difícil não prende a página.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { createProof } from "../../js/core/proof.js";
import { ruleSet } from "../../js/core/rules.js";
import { parseSequent } from "../../js/core/sequent.js";
import { verifyProof } from "../../js/core/verify.js";
import { createSolverWorker } from "../../js/ui/solver-worker.js";
import { HARD_MAX_STEPS, HARD_SEQUENT } from "./fixtures.js";
import { startNodeThread } from "./node-thread.js";

const goalOf = (text) => parseSequent(text).sequent;
const hard = goalOf(HARD_SEQUENT);
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";

/** Corre `work` enquanto mede a maior paragem do ciclo de eventos, em ms. */
async function largestPause(work) {
  let last = performance.now();
  let largest = 0;
  const beat = setInterval(() => {
    const now = performance.now();
    largest = Math.max(largest, now - last);
    last = now;
  }, 5);
  try {
    return { value: await work(), pause: largest };
  } finally {
    clearInterval(beat);
  }
}

test("resolve um sequente fácil e uma dica, e reutiliza o Worker", async () => {
  const worker = createSolverWorker({ start: startNodeThread });
  const goal = goalOf("p -> q, p |- q");
  const rules = ruleSet("completo");
  const solved = await worker.solve(goal, { rules }).promise;
  assert.ok(solved.provable);
  assert.ok(verifyProof(solved.proof, goal, rules).ok);
  const hinted = await worker.hint(createProof([]).proof, goal, { rules }).promise;
  assert.equal(hinted.status, "step");
  worker.dispose();
});

test("cancelar para uma procura sem fim, sem prender a página, e o Worker seguinte funciona", async () => {
  const worker = createSolverWorker({ start: startNodeThread });
  const { value: outcome, pause } = await largestPause(async () => {
    const { promise, cancel } = worker.solve(hard, { maxSteps: HARD_MAX_STEPS });
    setTimeout(cancel, 400);
    return promise;
  });
  assert.equal(outcome.error.code, "cancelled");
  assert.ok(pause < 200, `a página parou ${pause} ms`);
  const easy = await worker.solve(goalOf("p |- p"), {}).promise;
  assert.ok(easy.provable);
  worker.dispose();
});

test("uma procura sem fim acaba no tempo limite e o Worker é terminado", async () => {
  const threads = [];
  const start = () => {
    const thread = startNodeThread();
    threads.push(thread);
    return thread;
  };
  const worker = createSolverWorker({ timeoutMs: 300, start });
  const startedAt = performance.now();
  const outcome = await worker.solve(hard, { maxSteps: HARD_MAX_STEPS }).promise;
  assert.equal(outcome.error.code, "timeout");
  assert.ok(performance.now() - startedAt < 2000);
  assert.equal(await threads[0].terminated, 1, "o worker_thread não foi parado");
});

test("no Chrome, com a CSP do site, o trabalho não prende a página e o cancelamento funciona", {
  skip: existsSync(CHROME) ? false : "Chrome não encontrado",
  timeout: 60000,
}, async () => {
  const { stdout } = await promisify(execFile)("node", ["scripts/check-worker.mjs"]);
  const report = JSON.parse(stdout);
  assert.equal(report.easy, true);
  assert.equal(report.hard, "stepLimit");
  assert.equal(report.cancelled, "cancelled");
  assert.equal(report.timeout, "timeout");
  assert.equal(report.afterCancel, true);
  assert.ok(report.hardMs > 500, `o sequente difícil só demorou ${report.hardMs} ms`);
  assert.ok(report.pauseMs < 250, `a página parou ${report.pauseMs} ms`);
});
