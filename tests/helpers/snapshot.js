// Snapshots em ficheiro, em tests/__snapshots__/. Atualizam-se com UPDATE_SNAPSHOTS=1 npm test.
// Um snapshot em falta é um erro, para um teste nunca passar por ter criado o próprio valor esperado.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FOLDER = fileURLToPath(new URL("../__snapshots__/", import.meta.url));

export function assertSnapshot(name, actual) {
  const file = join(FOLDER, name);
  if (process.env.UPDATE_SNAPSHOTS === "1") {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  assert.ok(existsSync(file), `Falta o snapshot ${name}: corre UPDATE_SNAPSHOTS=1 npm test`);
  assert.equal(actual, readFileSync(file, "utf8"), `Snapshot diferente: ${name}`);
}
