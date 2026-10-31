// Corre o solver e as dicas num Worker, para a página continuar a responder.
// Contrato:
//   const worker = createSolverWorker({ timeoutMs })
//   worker.solve(goal, { rules, maxSteps })             → { promise, cancel }
//   worker.hint(proof, goal, { rules, known, maxSteps }) → { promise, cancel }
//   worker.complete(proof, goal, { rules, known, maxSteps }) → { promise, cancel }
//   worker.dispose()                                   cancela o que corre e liberta o Worker
//
// A `promise` nunca rejeita. Dá o resultado de `solve` ou de `hint` ou, se a tarefa não acabar, a falha
// no formato deles: `{ ok: false, error }` no solve e `{ status: "unknown", error }` na dica e no complete. O código é
// de `WORKER_ERROR_CODES`, com texto em `solver.errors.*`, e nenhum diz nada sobre haver prova.
//
// Corre uma tarefa de cada vez: pedir outra cancela a anterior, porque só a última interessa à página.
// O solver é síncrono e não pode ser interrompido por dentro, por isso cancelar e esgotar o tempo
// terminam o Worker, e a tarefa seguinte arranca outro. Sem Worker, a tarefa falha com `workerFailed`
// e não corre na página, que ficaria bloqueada.
// Este módulo não importa o `core`: o solver só é descarregado quando o Worker arranca.

/** Tempo limite de uma tarefa, a contar com o arranque do Worker. O pior caso conhecido demora 8 s. */
export const SOLVER_TIMEOUT_MS = 15000;

/** Por que uma tarefa pode não acabar. */
export const WORKER_ERROR_CODES = [
  "timeout", // { seconds }
  "cancelled",
  "workerFailed", // o Worker não arrancou ou rebentou
];

const startThread = () => new Worker(new URL("./solver-thread.js", import.meta.url), { type: "module" });

const solveFailure = (error) => ({ ok: false, error });
const hintFailure = (error) => ({ status: "unknown", error });

export function createSolverWorker({ timeoutMs = SOLVER_TIMEOUT_MS, start = startThread } = {}) {
  let thread = null;
  let running = null;
  let nextId = 1;

  function finish(outcome) {
    const { resolve, timer } = running;
    clearTimeout(timer);
    running = null;
    resolve(outcome);
  }

  function stopThread() {
    thread?.terminate();
    thread = null;
  }

  function abort(code, params = {}) {
    stopThread();
    if (running) finish(running.toFailure({ code, params }));
  }

  function ensureThread() {
    if (thread) return thread;
    thread = start();
    thread.onmessage = ({ data }) => {
      if (running?.id === data.id) finish(data.result);
    };
    thread.onerror = () => abort("workerFailed");
    thread.onmessageerror = () => abort("workerFailed");
    return thread;
  }

  function run(task, toFailure) {
    if (running) abort("cancelled");
    const id = nextId;
    nextId += 1;
    const promise = new Promise((resolve) => {
      running = { id, resolve, toFailure, timer: null };
    });
    try {
      ensureThread().postMessage({ id, task });
      const seconds = Math.ceil(timeoutMs / 1000);
      running.timer = setTimeout(() => abort("timeout", { seconds }), timeoutMs);
    } catch {
      abort("workerFailed");
    }
    const cancel = () => {
      if (running?.id === id) abort("cancelled");
    };
    return { promise, cancel };
  }

  return {
    solve: (goal, options) => run({ type: "solve", goal, options }, solveFailure),
    hint: (proof, goal, options) => run({ type: "hint", proof, goal, options }, hintFailure),
    complete: (proof, goal, options) => run({ type: "complete", proof, goal, options }, hintFailure),
    dispose() {
      abort("cancelled");
    },
  };
}
