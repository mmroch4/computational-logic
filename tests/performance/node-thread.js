// Corre o verdadeiro `solver-thread.js` num worker_thread, com o `self` de um Worker do browser.
import { parentPort, Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

/** Arranque para `createSolverWorker({ start })`, com a interface de um Worker do browser. */
export function startNodeThread() {
  const worker = new Worker(fileURLToPath(import.meta.url));
  const thread = {
    postMessage: (message) => worker.postMessage(message),
    terminate: () => {
      thread.terminated = worker.terminate();
    },
  };
  worker.on("message", (data) => thread.onmessage?.({ data }));
  worker.on("error", (error) => thread.onerror?.(error));
  return thread;
}

if (parentPort) {
  globalThis.self = { postMessage: (message) => parentPort.postMessage(message) };
  await import("../../js/ui/solver-thread.js");
  parentPort.on("message", (data) => globalThis.self.onmessage({ data }));
}
