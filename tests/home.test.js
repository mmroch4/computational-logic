// A página inicial e a prova que se escreve sozinha. No Chrome: scripts/check-home.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_DEMO, homeDemo } from "../js/core/home-demo.js";
import { checkSequent } from "../js/core/semantics.js";
import { ruleSet } from "../js/core/rules.js";
import { verifyProof } from "../js/core/verify.js";
import pt from "../js/ui/locales/pt.js";
import en from "../js/ui/locales/en.js";
import { COURSE_SEQUENTS } from "./fixtures/course-sequents.js";
import { fingerprint } from "./helpers/fingerprint.js";

const read = (file) => readFileSync(file, "utf8");

test("a prova da demonstração passa no verificador só com as regras base", () => {
  const { goal, proof } = homeDemo();
  assert.equal(checkSequent(goal).valid, true);
  assert.equal(verifyProof(proof, goal, ruleSet("base")).ok, true);
});

test("o sequente da demonstração não vem dos materiais da cadeira", () => {
  const course = new Map(COURSE_SEQUENTS.map((text) => [fingerprint(text), text]));
  assert.equal(course.get(fingerprint(HOME_DEMO.sequent)), undefined);
});

test("a demonstração começa nas premissas e escreve cada linha por ordem", () => {
  const { frames, proof } = homeDemo();
  assert.equal(frames[0].kind, "start");
  assert.equal(frames[0].shown, 2);
  frames.forEach(({ shown, view }, index) => {
    assert.ok(shown >= (frames[index - 1]?.shown ?? 0), `fotograma ${index}`);
    assert.equal(view.lines.length, proof.lines.length, `fotograma ${index}`);
  });
  assert.equal(frames.at(-1).shown, proof.lines.length);
});

test("só a linha a ser escrita fica por acabar, e nunca há erros", () => {
  for (const { kind, states, shown } of homeDemo().frames) {
    assert.equal(states.length, shown);
    const expected = states.map((_, index) => (kind === "writing" && index === shown - 1 ? "pending" : "ok"));
    assert.deepEqual(states, expected);
  }
});

test("as linhas por escrever ficam marcadas e a atual destaca-se", () => {
  const { frames, proof } = homeDemo();
  const { marks, line } = frames[3];
  assert.equal(marks.get(line), "current");
  for (let future = line + 1; future <= proof.lines.length; future += 1) assert.equal(marks.get(future), "future");
  assert.equal(frames[0].marks.has(frames[0].line), false);
});

test("só o último fotograma é a prova completa", () => {
  const { frames } = homeDemo();
  assert.deepEqual(frames.map(({ complete }) => complete), frames.map((_, index) => index === frames.length - 1));
  assert.equal(frames.at(-1).kind, "complete");
});

test("cada tipo de fotograma tem legenda nos dois idiomas", () => {
  for (const { kind } of homeDemo().frames) {
    assert.ok(pt.home.demo[kind], kind);
    assert.ok(en.home.demo[kind], kind);
  }
});

test("a página inicial liga às 4 páginas e já não tem estado vazio", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /empty-state/);
  for (const path of ["/provar", "/passo-a-passo", "/aprender", "/exercicios"]) {
    assert.ok(html.includes(`<a class="home-link" href="${path}">`), path);
  }
  assert.match(html, /data-home-demo/);
  assert.equal(pt.home.empty, undefined);
  assert.equal(en.home.empty, undefined);
});

test("a versão EN liga às páginas EN", () => {
  const html = read("en/index.html");
  for (const path of ["/en/prove", "/en/step-by-step", "/en/learn", "/en/exercises"]) {
    assert.ok(html.includes(`<a class="home-link" href="${path}">`), path);
  }
  for (const key of ["lead", "proveText", "stepText", "learnText", "exercisesText", "aboutText"]) {
    assert.ok(html.includes(en.home[key]), key);
  }
});

test("a página inicial não pede imagens: a demonstração é HTML", () => {
  const html = read("index.html").split("<body")[1];
  assert.doesNotMatch(html, /<img|<video|<picture/);
});

test("a demonstração anima no Chrome a 390px", { skip: !existsSync(process.env.CHROME_BIN || "/usr/bin/google-chrome") }, () => {
  const run = spawnSync("node", ["scripts/check-home.mjs"], { encoding: "utf8", timeout: 120000 });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
});
