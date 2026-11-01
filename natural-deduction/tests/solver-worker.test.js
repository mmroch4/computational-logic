// O cliente do Worker com um Worker falso, e os dados que têm de atravessar o `postMessage`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countermodel, refutes, respects } from "../js/core/countermodel.js";
import { hint } from "../js/core/hints.js";
import { createProof } from "../js/core/proof.js";
import { ruleSet, RULES } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { runSolverTask } from "../js/core/solver-task.js";
import { activeRules, loadUserRules } from "../js/core/user-rules.js";
import { verifyProof } from "../js/core/verify.js";
import { t, setLang } from "../js/ui/i18n.js";
import { createSolverWorker, WORKER_ERROR_CODES } from "../js/ui/solver-worker.js";
import { importsOf } from "../scripts/modulepreload.mjs";

const goalOf = (text) => parseSequent(text).sequent;
const goal = goalOf("p |- p");

/** Worker falso: guarda o que recebe e responde quando o teste quiser. */
function fakeThreads() {
  const threads = [];
  const start = () => {
    const thread = {
      posted: [],
      terminated: 0,
      postMessage(message) {
        this.posted.push(message);
      },
      terminate() {
        this.terminated += 1;
      },
      reply(index, result) {
        this.onmessage({ data: { id: this.posted[index].id, result } });
      },
    };
    threads.push(thread);
    return thread;
  };
  return { threads, start };
}

test("devolve o resultado da tarefa e reutiliza o Worker", async () => {
  const { threads, start } = fakeThreads();
  const worker = createSolverWorker({ start });
  const first = worker.solve(goal, { maxSteps: 5 });
  assert.deepEqual(threads[0].posted[0].task, { type: "solve", goal, options: { maxSteps: 5 } });
  threads[0].reply(0, { ok: true });
  assert.deepEqual(await first.promise, { ok: true });

  const proof = createProof([]).proof;
  const second = worker.hint(proof, goal, {});
  assert.deepEqual(threads[0].posted[1].task, { type: "hint", proof, goal, options: {} });
  threads[0].reply(1, { status: "done" });
  assert.deepEqual(await second.promise, { status: "done" });
  assert.equal(threads.length, 1);
  assert.equal(threads[0].terminated, 0);
});

test("o Worker só arranca com a primeira tarefa", () => {
  const { threads, start } = fakeThreads();
  createSolverWorker({ start });
  assert.equal(threads.length, 0);
});

test("cancelar termina o Worker, ignora respostas atrasadas, e a tarefa seguinte arranca outro", async () => {
  const { threads, start } = fakeThreads();
  const worker = createSolverWorker({ start });
  const { promise, cancel } = worker.solve(goal);
  cancel();
  assert.deepEqual(await promise, { ok: false, error: { code: "cancelled", params: {} } });
  assert.equal(threads[0].terminated, 1);

  const next = worker.solve(goal);
  threads[0].reply(0, { stale: true });
  threads[1].reply(0, { ok: true });
  assert.deepEqual(await next.promise, { ok: true });
});

test("cancelar uma tarefa acabada não mexe no Worker nem na tarefa seguinte", async () => {
  const { threads, start } = fakeThreads();
  const worker = createSolverWorker({ start });
  const first = worker.solve(goal);
  threads[0].reply(0, { ok: true });
  await first.promise;
  const second = worker.solve(goal);
  first.cancel();
  assert.equal(threads[0].terminated, 0);
  threads[0].reply(1, { second: true });
  assert.deepEqual(await second.promise, { second: true });
});

test("uma tarefa nova cancela a que está a correr", async () => {
  const { threads, start } = fakeThreads();
  const worker = createSolverWorker({ start });
  const first = worker.solve(goal);
  const second = worker.hint(createProof([]).proof, goal);
  assert.equal((await first.promise).error.code, "cancelled");
  assert.equal(threads[0].terminated, 1);
  threads[1].reply(0, { status: "done" });
  assert.deepEqual(await second.promise, { status: "done" });
});

test("o tempo limite termina o Worker e diz os segundos", async () => {
  const { threads, start } = fakeThreads();
  const worker = createSolverWorker({ timeoutMs: 10, start });
  const outcome = await worker.solve(goal).promise;
  assert.deepEqual(outcome, { ok: false, error: { code: "timeout", params: { seconds: 1 } } });
  assert.equal(threads[0].terminated, 1);
});

test("numa dica, a falha vem como `unknown`, o estado que a D5 já trata", async () => {
  const { start } = fakeThreads();
  const worker = createSolverWorker({ start });
  const { promise, cancel } = worker.hint(createProof([]).proof, goal);
  cancel();
  assert.deepEqual(await promise, { status: "unknown", error: { code: "cancelled", params: {} } });
});

test("uma exceção no Worker dá `workerFailed` e o seguinte arranca de novo", async () => {
  const { threads, start } = fakeThreads();
  const worker = createSolverWorker({ start });
  const { promise } = worker.solve(goal);
  threads[0].onerror(new Error("rebentou"));
  assert.equal((await promise).error.code, "workerFailed");
  assert.equal(threads[0].terminated, 1);
  worker.solve(goal);
  assert.equal(threads.length, 2);
});

test("sem Worker, a tarefa falha sem correr na página", async () => {
  // O Node não tem o `Worker` global: este é o arranque verdadeiro.
  const outcome = await createSolverWorker().solve(goal).promise;
  assert.equal(outcome.error.code, "workerFailed");
  const failing = createSolverWorker({ start: () => { throw new Error("CSP"); } });
  assert.equal((await failing.hint(createProof([]).proof, goal).promise).status, "unknown");
});

test("dispose cancela o que corre e pode ser chamado sem nada a correr", async () => {
  const { threads, start } = fakeThreads();
  const worker = createSolverWorker({ start });
  worker.dispose();
  const { promise } = worker.solve(goal);
  worker.dispose();
  assert.equal((await promise).error.code, "cancelled");
  assert.equal(threads[0].terminated, 1);
});

test("todos os códigos têm texto nos dois idiomas, e o tempo limite não diz que não há prova", () => {
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    for (const code of WORKER_ERROR_CODES) {
      assert.notEqual(t(`solver.errors.${code}`), `solver.errors.${code}`);
    }
  }
  setLang("pt", { silent: true });
  assert.match(t("solver.errors.timeout", { seconds: 15 }), /15 s.*não quer dizer que não haja prova/);
});

test("o cliente não carrega o solver na página", () => {
  assert.deepEqual(importsOf(readFileSync("js/ui/solver-worker.js", "utf8")), []);
});

test("runSolverTask corre as duas tarefas e recusa as outras", () => {
  const rules = ruleSet("completo");
  assert.ok(runSolverTask({ type: "solve", goal, options: { rules } }).provable);
  assert.equal(runSolverTask({ type: "hint", goal, proof: createProof([]).proof, options: { rules } }).status, "step");
  assert.throws(() => runSolverTask({ type: "outra" }), /Tarefa desconhecida/);
});

// Regras congeladas, `Map`s e testemunhas: o que partir aqui partiria no `postMessage`.
test("regras do utilizador atravessam o postMessage e continuam a funcionar", () => {
  const { rules: mine } = loadUserRules([{ name: "Troca", premises: ["φ ∧ ψ"], conclusion: "ψ ∧ φ" }]);
  assert.equal(mine.length, 1);
  const { rules, known } = structuredClone(activeRules({ rules: "completo" }, mine));
  const target = goalOf("p & q |- q & p");
  const task = { type: "solve", goal: target, options: { rules } };
  const solved = structuredClone(runSolverTask(structuredClone(task)));
  assert.ok(solved.provable);
  assert.ok(verifyProof(solved.proof, target, rules, known).ok);
});

test("contraexemplos e testemunhas atravessam o postMessage", () => {
  const invalid = structuredClone(solve(goalOf("p |- q")));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.counterexample instanceof Map);

  const rules = ruleSet({ set: "base", exclude: ["¬E"] });
  const target = goalOf("~~p |- p");
  const { witness } = structuredClone(solve(target, { rules }));
  assert.ok(refutes(witness, target));
  assert.ok(rules.every((rule) => respects(witness, rule)));
  assert.ok(countermodel(target, rules));
});

test("uma dica atravessa o postMessage igual", () => {
  const target = goalOf("p -> q, p |- q");
  const result = hint(createProof([]).proof, target, { rules: RULES });
  assert.deepEqual(structuredClone(result), result);
});
