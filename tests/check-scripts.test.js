// As verificações de browser têm de cobrir todas as rotas e não podem ter ficado com as da ferramenta SAT.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
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

test("os scripts de shell são executáveis", () => {
  for (const file of SCRIPTS.filter((name) => name.endsWith(".sh"))) {
    assert.ok(statSync(file).mode & 0o100, `${file} não é executável`);
  }
});
