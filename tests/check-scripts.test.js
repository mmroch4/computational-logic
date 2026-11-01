// As verificações de browser têm de cobrir todas as rotas e não podem ter ficado com as da ferramenta SAT.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROUTES, LANGS } from "../js/core/routes.js";

const ROUTE_LISTS = [
  "scripts/check-all.sh",
  "scripts/check-keyboard.mjs",
  "scripts/check-edge.sh",
  "scripts/lighthouse.sh",
  "scripts/smoke-deploy.sh",
];
const SCRIPTS = [
  ...ROUTE_LISTS,
  "scripts/check-page.sh",
  "scripts/check-page.mjs",
  "scripts/check-exercises.sh",
  "scripts/check-step.sh",
  "scripts/check-keyboard.sh",
  "scripts/prove-states.mjs",
  "scripts/a11y-audit.mjs",
  "scripts/motion-audit.mjs",
  "scripts/font-usage.mjs",
];
const paths = Object.values(ROUTES).flatMap((route) => LANGS.map((lang) => route[lang]));

test("cada verificação passa por todas as rotas", () => {
  for (const file of ROUTE_LISTS) {
    const source = readFileSync(file, "utf8");
    for (const path of paths) {
      // A rota como palavra inteira, sem apanhar prefixos ("/en" dentro de "/en/learn").
      const bounded = new RegExp(`(^|[\\s"':(])${path.replaceAll("/", "\\/")}(?=[\\s"');]|$)`, "m");
      assert.match(source, bounded, `${file} não verifica ${path}`);
    }
  }
});

test("os scripts não ficaram com rotas nem nomes da ferramenta SAT", () => {
  for (const file of SCRIPTS) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /resolver|\/solver|dpsat|Davis|\bDLL\b/, file);
  }
});

// Corre o check-page.sh a sério, com um servidor e um check-page.mjs falsos ao lado dele. O falso falha
// nas primeiras `fails` execuções com `message`; devolve o resultado do script e o número de execuções.
function runCheckPage({ fails, message }) {
  const root = mkdtempSync(join(tmpdir(), "check-page-"));
  try {
    mkdirSync(join(root, "scripts"));
    copyFileSync("scripts/check-page.sh", join(root, "scripts/check-page.sh"));
    chmodSync(join(root, "scripts/check-page.sh"), 0o755);
    writeFileSync(join(root, "scripts/serve.mjs"), `import { createServer } from "node:http";
      createServer((_, res) => res.end("ok")).listen(Number(process.argv[2]), "127.0.0.1");`);
    const runs = join(root, "runs");
    writeFileSync(join(root, "scripts/check-page.mjs"), `import { appendFileSync, existsSync, readFileSync } from "node:fs";
      appendFileSync(${JSON.stringify(runs)}, "x");
      if (readFileSync(${JSON.stringify(runs)}, "utf8").length > ${fails}) { console.log("OK"); process.exit(0); }
      console.error("FALHOU ${message}");
      process.exit(1);`);
    const result = spawnSync(join(root, "scripts/check-page.sh"), ["/", join(root, "out")], {
      encoding: "utf8",
      env: { ...process.env, PORT: "8797" },
    });
    return { status: result.status, output: result.stdout, runs: existsSync(runs) ? readFileSync(runs, "utf8").length : 0 };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const TRANSIENT = "net::ERR_CERT_VERIFIER_CHANGED";

test("o check-page repete uma vez a falha transitória das fontes", () => {
  const { status, output, runs } = runCheckPage({ fails: 1, message: TRANSIENT });
  assert.deepEqual([status, runs], [0, 2]);
  assert.match(output, /OK/);
  assert.doesNotMatch(output, /FALHOU/);
});

test("o check-page falha se a falha transitória se repetir", () => {
  const { status, output, runs } = runCheckPage({ fails: 2, message: TRANSIENT });
  assert.deepEqual([status, runs], [1, 2]);
  assert.match(output, /ERR_CERT_VERIFIER_CHANGED/);
});

test("o check-page não repete nenhum outro erro", () => {
  const { status, output, runs } = runCheckPage({ fails: 1, message: "Erro na consola" });
  assert.deepEqual([status, runs], [1, 1]);
  assert.match(output, /Erro na consola/);
});

test("o check-page corre uma só vez quando passa", () => {
  const { status, output, runs } = runCheckPage({ fails: 0, message: "" });
  assert.deepEqual([status, runs], [0, 1]);
  assert.match(output, /OK/);
});

test("os scripts de shell são executáveis", () => {
  for (const file of SCRIPTS.filter((name) => name.endsWith(".sh"))) {
    assert.ok(statSync(file).mode & 0o100, `${file} não é executável`);
  }
});
