// O corpo do Worker, arrancado por `solver-worker.js`. Uma exceção aqui chega lá como evento `error`.

import { runSolverTask } from "../core/solver-task.js";

self.onmessage = ({ data: { id, task } }) => {
  self.postMessage({ id, result: runSolverTask(task) });
};
