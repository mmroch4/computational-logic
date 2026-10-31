// A camada de UI veio da ferramenta SAT: nada do que era específico dela pode ficar em js/ nem no DESIGN.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = /\bSAT\b|\bDLL\b|\bDPLL\b|dpsat|Davis|ev-sat/;

const filesIn = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)]
  );

test("js/ e DESIGN.md não falam de SAT, DLL nem dpsat", () => {
  for (const file of [...filesIn("js"), "DESIGN.md"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), FORBIDDEN, file);
  }
});
