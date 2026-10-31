// O css/app.css é gerado e commitado (a Vercel não compila nada), por isso tem de estar sempre em dia
// com o css/src/app.css e com as classes usadas nas páginas e no JS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(join(root, file), "utf8");
const bin = join(root, "node_modules/.bin/tailwindcss");

// As mesmas opções do `npm run build:css`, só com outra saída.
function buildArgs(output) {
  const args = JSON.parse(read("package.json")).scripts["build:css"].split(" ").slice(1);
  args[args.indexOf("-o") + 1] = output;
  return args;
}

// O Tailwind 4.3.3 não é determinista: de vez em quando, com os mesmos ficheiros, junta de outra forma
// umas regras do Basecoat que o site não usa. Por isso uma diferença só conta se se repetir: um
// css/app.css mesmo desatualizado nunca é igual, por muitas vezes que se compile.
const ATTEMPTS = 4;

// Sem node_modules não há compilador: o teste é saltado.
test("css/app.css está em dia com o que o build gera", { skip: !existsSync(bin) && "tailwindcss não instalado" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "nd-css-"));
  try {
    const output = join(dir, "app.css");
    const committed = read("css/app.css");
    let same = false;
    for (let attempt = 0; attempt < ATTEMPTS && !same; attempt++) {
      const run = spawnSync(bin, buildArgs(output), { cwd: root, encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
      same = readFileSync(output, "utf8") === committed;
    }
    assert.ok(same, "css/app.css desatualizado: corre npm run build:css");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
