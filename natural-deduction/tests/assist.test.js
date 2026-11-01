// O painel de ajuda: a solução a partir de uma prova parcial, cada estado em PT e em EN e os pedidos ao
// Worker. No Chrome, com toques a 390px: scripts/check-assist.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { IDLE, canRevealMore, errorKey, panelFromResult, revealMore, searching } from "../js/core/assist.js";
import { completeProof } from "../js/core/complete.js";
import { createEditor, editorStatus, loadProof, undo } from "../js/core/editor.js";
import { hint } from "../js/core/hints.js";
import { closeSubproof, createProof, insertLine } from "../js/core/proof.js";
import { parseProof } from "../js/core/proof-text.js";
import { RULES, ruleSet } from "../js/core/rules.js";
import { parseSequent } from "../js/core/sequent.js";
import { solve } from "../js/core/solver.js";
import { runSolverTask } from "../js/core/solver-task.js";
import { verifyProof } from "../js/core/verify.js";
import { assistBodyHtml, createAssist } from "../js/ui/assist-panel.js";
import { setLang } from "../js/ui/i18n.js";

const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const options = { rules: ruleSet("completo"), known: RULES };

const goalOf = (text) => parseSequent(text).sequent;
const proofOf = (text) => {
  const read = parseProof(text);
  assert.ok(read.ok, JSON.stringify(read.error));
  return read.proof;
};
const lineTexts = ({ lines }) => lines.map(({ formula }) => formula);
const assertVerified = (proof, goal) => assert.ok(verifyProof(proof, goal, options.rules, options.known).ok);

/** Corre `check` com o HTML de `panel` em cada idioma. */
function inBoth(panel, check) {
  for (const lang of ["pt", "en"]) {
    setLang(lang, { silent: true });
    try {
      check(assistBodyHtml(panel), lang);
    } finally {
      setLang("pt", { silent: true });
    }
  }
}

const assertNoKeys = (html) => assert.doesNotMatch(html, /(assist|solver|hints|verify|semantics)\.[a-zA-Z]|\{[a-z]+\}|undefined|null/);

test("sem nada escrito, a solução é a prova do solver", () => {
  const goal = goalOf("p → q, q → r ⊢ p → r");
  const { proof } = createEditor(goal);
  const result = completeProof(proof, goal, options);
  assert.equal(result.status, "solved");
  assert.equal(result.start, "scratch");
  assert.deepEqual(result.proof, solve(goal, options).proof);
  assertVerified(result.proof, goal);
});

test("a solução continua a prova parcial, sem mexer no que está escrito", () => {
  const goal = goalOf("p ∨ q ⊢ q ∨ p");
  const partial = proofOf(`
    1 | p ∨ q  premissa
    2 |   p    hipótese
    3 |   q ∨ p  ∨I, 2`);
  const result = completeProof(partial, goal, options);
  assert.equal(result.start, "partial");
  assert.deepEqual(result.proof.lines.slice(0, 3).map((line) => line.formula), lineTexts(partial));
  assert.ok(result.proof.lines.length > 3);
  assertVerified(result.proof, goal);
});

test("a solução parte de qualquer início de uma prova gerada e mantém-no", () => {
  const sequents = [
    "p ∨ q ⊢ q ∨ p",
    "p → q, q → r ⊢ p → r",
    "¬q, p → q ⊢ ¬p",
    "⊢ p ∨ ¬p",
    "p ∧ (q ∨ r) ⊢ (p ∧ q) ∨ (p ∧ r)",
    "¬(p ∧ q) ⊢ ¬p ∨ ¬q",
  ];
  for (const text of sequents) {
    const goal = goalOf(text);
    const whole = solve(goal, options).proof;
    const premises = goal.premises.length;
    for (let keep = premises + 1; keep < whole.lines.length; keep += 1) {
      const start = { lines: whole.lines.slice(0, keep) };
      const result = completeProof(start, goal, options);
      const where = `${text}, ${keep} linhas`;
      assert.equal(result.status, "solved", where);
      assertVerified(result.proof, goal);
      assert.equal(result.start, "partial", where);
      assert.deepEqual(lineTexts(result.proof).slice(0, keep), lineTexts(start), where);
    }
  }
});

test("a solução aproveita a linha por preencher do editor", () => {
  const goal = goalOf("⊢ p → p");
  const opened = closeSubproof(proofOf("1 |   p  hipótese"), 1).proof;
  const result = completeProof(opened, goal, options);
  assert.equal(result.start, "partial");
  assert.equal(result.proof.lines.length, 2);
  assertVerified(result.proof, goal);
});

test("com uma linha errada, a solução começa de novo e diz porquê", () => {
  const goal = goalOf("p ∧ q ⊢ q");
  const broken = proofOf(`
    1 | p ∧ q  premissa
    2 | r      ∧E, 1
    3 | q      ∧E, 1`);
  const result = completeProof(broken, goal, options);
  assert.equal(result.start, "restart");
  assert.equal(result.reason.key, "verify.errors.formulaMismatch");
  assertVerified(result.proof, goal);
});

test("com uma subdedução que não leva a lado nenhum, a solução começa de novo e diz porquê", () => {
  const goal = goalOf("p ⊢ p ∧ p");
  const stray = proofOf(`
    1 | p  premissa
    2 |   q  hipótese`);
  const result = completeProof(stray, goal, options);
  assert.equal(result.start, "restart");
  assert.equal(result.reason.key, "hints.deadEnd.offTrack");
  assertVerified(result.proof, goal);
});

test("a solução respeita o conjunto de regras em todos os caminhos", () => {
  const rules = ruleSet("base");
  const goal = goalOf("p → q, ¬q ⊢ ¬p");
  const partial = insertLine(createEditor(goal).proof, 3, { kind: "hypothesis", depth: 1, formula: goal.conclusion.args[0] });
  assert.ok(partial.ok);
  const result = completeProof(partial.proof, goal, { rules, known: RULES });
  assert.equal(result.status, "solved");
  assert.ok(verifyProof(result.proof, goal, rules, RULES).ok);
  assert.ok(result.proof.lines.every(({ rule }) => rule !== "MT"));
});

test("sequente inválido, prova acabada, sem prova e erro não dão solução", () => {
  assert.equal(completeProof(createProof([]).proof, goalOf("p ⊢ q"), options).status, "invalid");

  const goal = goalOf("p ∧ q ⊢ p");
  const finished = solve(goal, options).proof;
  assert.equal(completeProof(finished, goal, options).status, "done");

  const rules = ruleSet({ set: "base", exclude: ["¬E"] });
  assert.equal(completeProof(createProof([]).proof, goalOf("¬¬p ⊢ p"), { rules, known: RULES }).status, "noProof");

  const many = goalOf("a ∧ b ∧ c ∧ d ∧ e ∧ f ∧ g ∧ h ∧ i ∧ j ∧ k ∧ l ∧ m ⊢ a");
  const failed = completeProof(createProof([]).proof, many, options);
  assert.equal(failed.status, "unknown");
  assert.equal(failed.error.code, "tooManyVariables");
});

test("p ⊢ p no editor: a linha vazia ainda não é o fim, e a solução cabe nele", () => {
  const goal = goalOf("p ⊢ p");
  const editor = createEditor(goal);
  assert.equal(hint(editor.proof, goal, options).step.rule, "R");
  const { proof } = completeProof(editor.proof, goal, options);
  assert.equal(proof.lines.at(-1).rule, "R");
  const loaded = loadProof(editor, proof);
  assert.ok(editorStatus(loaded, options).complete);
  assert.equal(hint(proof, goal, options).status, "done");
});

test("usar a solução enche o editor com a justificação no idioma, e pode desfazer-se", () => {
  const goal = goalOf("⊢ p ∨ ¬p");
  const editor = createEditor(goal);
  const { proof } = completeProof(editor.proof, goal, options);
  const loaded = loadProof(editor, proof, { RA: "RAA" });
  assert.ok(editorStatus(loaded, options).complete);
  assert.equal(loaded.cursor.line, proof.lines.length);
  assert.deepEqual(loaded.drafts.map(({ formulaError, justificationError }) => [formulaError, justificationError]).flat().filter(Boolean), []);
  assert.ok(loaded.drafts.some(({ justification }) => justification.startsWith("RAA")));
  assert.equal(undo(loaded).proof, editor.proof);
});

test("o Worker corre a tarefa da solução e os dados atravessam o postMessage", () => {
  const goal = goalOf("p ∧ q ⊢ q ∧ p");
  const task = structuredClone({ type: "complete", proof: createEditor(goal).proof, goal, options });
  const result = structuredClone(runSolverTask(task));
  assert.equal(result.status, "solved");
  assertVerified(result.proof, goal);
});

test("estado vazio", () => {
  inBoth(IDLE, (html, lang) => {
    assert.match(html, lang === "pt" ? /Empancaste/ : /Stuck/);
    assertNoKeys(html);
  });
});

test("à procura, em cada tarefa, com botão de cancelar", () => {
  for (const task of ["hint", "solve"]) {
    inBoth(searching(task), (html, lang) => {
      assert.match(html, lang === "pt" ? /A procurar/ : /Looking for/);
      assert.match(html, lang === "pt" ? />Cancelar</ : />Cancel</);
      assert.match(html, /data-assist="cancel"/);
    });
  }
});

test("dica: os 3 níveis aparecem um a um, com a sigla do idioma", () => {
  const goal = goalOf("⊢ p ∨ ¬p");
  const first = hint(createEditor(goal).proof, goal, options);
  let panel = panelFromResult(first, goal);
  assert.equal(panel.revealed, 1);
  inBoth(panel, (html, lang) => {
    assert.equal(html.match(/assist__level"/g).length, 1);
    assert.match(html, lang === "pt" ? /Objetivo de agora: p ∨ ¬p/ : /Current goal: p ∨ ¬p/);
    assert.match(html, lang === "pt" ? /Estratégia/ : /Strategy/);
    assert.match(html, /data-assist="more"/);
    assertNoKeys(html);
  });

  panel = revealMore(panel);
  inBoth(panel, (html, lang) => {
    assert.equal(html.match(/assist__level"/g).length, 2);
    assert.match(html, lang === "pt" ? /vais fechá-la com RA\./ : /close it with RAA\./);
    assertNoKeys(html);
  });

  panel = revealMore(panel);
  assert.equal(canRevealMore(panel), false);
  assert.equal(revealMore(panel), panel);
  inBoth(panel, (html, lang) => {
    assert.equal(html.match(/assist__level"/g).length, 3);
    assert.match(html, lang === "pt" ? /Na linha 1, assume ¬\(p ∨ ¬p\)\./ : /On line 1, assume ¬\(p ∨ ¬p\)\./);
    assert.doesNotMatch(html, /data-assist="more"/);
    assertNoKeys(html);
  });
});

test("dica sobre uma linha errada e sobre uma subdedução sem saída", () => {
  const wrong = goalOf("p ∧ q ⊢ q");
  const fix = panelFromResult(hint(proofOf(`
    1 | p ∧ q  premissa
    2 | r      ∧E, 1`), wrong, options), wrong);
  inBoth(revealMore(revealMore(fix)), (html, lang) => {
    assert.doesNotMatch(html, /assist__target/);
    assert.match(html, lang === "pt" ? /revê a linha 2/ : /review line 2/);
    assert.match(html, lang === "pt" ? /Corrige a linha 2/ : /Fix line 2/);
    assertNoKeys(html);
  });

  const goal = goalOf("p ⊢ p ∧ p");
  const dead = panelFromResult(hint(proofOf(`
    1 | p  premissa
    2 |   q  hipótese`), goal, options), goal);
  inBoth(revealMore(revealMore(dead)), (html, lang) => {
    assert.match(html, lang === "pt" ? /não parece ajudar/ : /does not seem to help/);
    assert.match(html, lang === "pt" ? /Apaga a subdedução/ : /Delete the subproof/);
    assertNoKeys(html);
  });
});

test("solução: cada origem tem o seu texto, a prova e o botão de a usar", () => {
  const goal = goalOf("p ∧ q ⊢ q");
  const { proof } = solve(goal, options);
  const texts = {
    scratch: { pt: /Encontrei esta prova/, en: /Here is a proof/ },
    partial: { pt: /mantém as tuas linhas/, en: /keeps your lines/ },
    restart: { pt: /começa de novo/, en: /starts over/ },
  };
  for (const [start, wanted] of Object.entries(texts)) {
    const reason = start === "restart" ? { key: "hints.fixLine.look", params: { line: 2 } } : null;
    const panel = panelFromResult({ status: "solved", proof, start, reason }, goal);
    inBoth(panel, (html, lang) => {
      assert.match(html, wanted[lang]);
      assert.match(html, /class="fitch"/);
      assert.match(html, /data-assist="use"/);
      assert.equal(/msg-warn/.test(html), start === "restart");
      assert.equal(/linha 2|line 2/.test(html), start === "restart");
      assertNoKeys(html);
    });
  }
});

test("solução: as siglas e as citações seguem o idioma", () => {
  const goal = goalOf("⊢ p ∨ ¬p");
  const panel = panelFromResult(completeProof(createEditor(goal).proof, goal, options), goal);
  inBoth(panel, (html, lang) => {
    assert.match(html, lang === "pt" ? />RA, / : />RAA, /);
    assert.match(html, lang === "pt" ? /hipótese/ : /hypothesis/);
  });
});

test("contraexemplo: V/F em PT, T/F em EN", () => {
  const goal = goalOf("p ∨ q ⊢ p");
  const panel = panelFromResult(hint(createProof([]).proof, goal, options), goal);
  assert.equal(panel.view, "invalid");
  inBoth(panel, (html, lang) => {
    assert.match(html, /msg-warn/);
    assert.match(html, lang === "pt" ? /<li>p = F<\/li><li>q = V<\/li>/ : /<li>p = F<\/li><li>q = T<\/li>/);
    assert.match(html, lang === "pt" ? /as premissas são verdadeiras/ : /the premises are true/);
    assert.doesNotMatch(html, /assist__note/);
    assertNoKeys(html);
  });
});

test("contraexemplo: o sufixo numérico aparece em subscrito", () => {
  const goal = goalOf("p1 ⊢ p2");
  const panel = panelFromResult(hint(createProof([]).proof, goal, options), goal);
  inBoth(panel, (html) => {
    assert.match(html, /p₁ = /);
    assert.match(html, /p₂ = /);
  });
});

test("contraexemplo: variáveis livres, sem premissas e sem valoração", () => {
  const free = goalOf("p ⊢ q ∨ (r → r)");
  assert.equal(panelFromResult({ status: "invalid", counterexample: new Map() }, free).view, "invalid");

  const partial = panelFromResult({ status: "invalid", counterexample: new Map([["q", false]]) }, goalOf("p ⊢ q"));
  assert.equal(partial.freeVariables, true);
  inBoth(partial, (html, lang) => {
    assert.match(html, lang === "pt" ? /outras variáveis podem ter qualquer valor/ : /other variables can take any value/);
  });

  const noPremises = goalOf("⊢ p");
  inBoth(panelFromResult(hint(createProof([]).proof, noPremises, options), noPremises), (html, lang) => {
    assert.match(html, lang === "pt" ? /a conclusão é falsa/ : /the conclusion is false/);
    assert.doesNotMatch(html, lang === "pt" ? /premissas são verdadeiras/ : /premises are true/);
  });

  const falsum = goalOf("⊢ F");
  inBoth(panelFromResult(hint(createProof([]).proof, falsum, options), falsum), (html, lang) => {
    assert.match(html, lang === "pt" ? /Qualquer valoração/ : /Any valuation/);
    assert.doesNotMatch(html, /<ul/);
  });
});

test("prova acabada, sem prova e procura cancelada", () => {
  const goal = goalOf("p ⊢ p");
  inBoth(panelFromResult({ status: "done" }, goal), (html, lang) => {
    assert.match(html, /msg-ok/);
    assert.match(html, lang === "pt" ? /já está completa/ : /already complete/);
  });
  inBoth(panelFromResult({ status: "noProof", witness: {} }, goal), (html, lang) => {
    assert.match(html, lang === "pt" ? /não tem prova com estas regras/ : /no proof with these rules/);
  });
  const cancelled = panelFromResult({ status: "unknown", error: { code: "cancelled", params: {} } }, goal);
  assert.equal(cancelled.view, "cancelled");
  inBoth(cancelled, (html, lang) => assert.match(html, lang === "pt" ? /Cancelaste/ : /You cancelled/));
});

test("uma procura que não acaba nunca diz que não há prova", () => {
  const goal = goalOf("p ⊢ p");
  const errors = [
    { code: "timeout", params: { seconds: 15 } },
    { code: "stepLimit", params: { max: 20000 } },
    { code: "searchExhausted", params: {} },
  ];
  for (const error of errors) {
    inBoth(panelFromResult({ status: "unknown", error }, goal), (html, lang) => {
      assert.match(html, /msg-warn/);
      assert.match(html, lang === "pt" ? /Isto não quer dizer que não haja prova/ : /This does not mean there is no proof/);
      assertNoKeys(html);
    });
  }
  const crash = { status: "unknown", error: { code: "workerFailed", params: {} } };
  inBoth(panelFromResult(crash, goal), (html) => assert.match(html, /msg-error/));
  const tooMany = { status: "unknown", error: { code: "tooManyVariables", params: { count: 13, max: 12 } } };
  assert.equal(errorKey(tooMany.error), "semantics.errors.tooManyVariables");
  inBoth(panelFromResult(tooMany, goal), (html) => {
    assert.match(html, /13/);
    assertNoKeys(html);
  });
});

/** Worker falso: cada pedido fica à espera de `answer`. */
function fakeWorker() {
  const jobs = [];
  const job = (type, proof) => {
    let settle;
    const promise = new Promise((resolve) => { settle = resolve; });
    const entry = {
      type,
      proof,
      cancelled: 0,
      promise,
      answer: settle,
      cancel() {
        entry.cancelled += 1;
        settle({ status: "unknown", error: { code: "cancelled", params: {} } });
      },
    };
    jobs.push(entry);
    return entry;
  };
  return { jobs, hint: (proof) => job("hint", proof), complete: (proof) => job("complete", proof) };
}

function harness(text = "p ∧ q ⊢ q") {
  const goal = goalOf(text);
  const worker = fakeWorker();
  const used = [];
  const views = [];
  const source = {
    proof: createEditor(goal).proof,
    getProof() { return this.proof; },
    getGoal: () => goal,
    getRules: () => options,
    useProof: (proof) => used.push(proof),
  };
  const assist = createAssist({ source, worker, onChange: ({ view }) => views.push(view) });
  return { goal, worker, used, views, source, assist };
}

const settled = () => new Promise((resolve) => { setImmediate(resolve); });

test("pedir uma dica mostra a procura e depois o resultado; pedir outra vez revela o nível seguinte", async () => {
  const { goal, worker, views, assist } = harness();
  assist.askHint();
  assert.deepEqual(views, ["searching"]);
  worker.jobs[0].answer(hint(createEditor(goal).proof, goal, options));
  await settled();
  assert.equal(assist.getPanel().view, "hint");
  assist.askHint();
  assert.equal(assist.getPanel().revealed, 2);
  assist.more();
  assert.equal(assist.getPanel().revealed, 3);
  assert.equal(worker.jobs.length, 1);
});

test("cancelar uma solução diz que foi cancelada, e a seguinte funciona", async () => {
  const { goal, worker, assist } = harness();
  assist.askSolution();
  assert.equal(assist.getPanel().task, "solve");
  assist.cancel();
  await settled();
  assert.equal(worker.jobs[0].cancelled, 1);
  assert.equal(assist.getPanel().view, "cancelled");
  assist.askSolution();
  worker.jobs[1].answer(completeProof(createEditor(goal).proof, goal, options));
  await settled();
  assert.equal(assist.getPanel().view, "solution");
});

test("um pedido substituído é ignorado em silêncio", async () => {
  const { worker, views, assist } = harness();
  assist.askHint();
  assist.askSolution();
  await settled();
  assert.equal(worker.jobs[0].cancelled, 1);
  assert.deepEqual(views, ["searching", "searching"]);
  assert.equal(assist.getPanel().task, "solve");
});

test("mudar a prova volta ao estado vazio e deita fora a resposta atrasada", async () => {
  const { goal, worker, assist } = harness();
  assist.askHint();
  assist.reset();
  assert.equal(assist.getPanel(), IDLE);
  worker.jobs[0].answer(hint(createEditor(goal).proof, goal, options));
  await settled();
  assert.equal(assist.getPanel(), IDLE);
  assert.equal(worker.jobs[0].cancelled, 1);
});

test("usar a solução passa a prova ao editor", async () => {
  const { goal, worker, used, assist } = harness();
  assist.use();
  assert.deepEqual(used, []);
  assist.askSolution();
  const result = completeProof(createEditor(goal).proof, goal, options);
  worker.jobs[0].answer(result);
  await settled();
  assist.use();
  assert.deepEqual(used, [result.proof]);
});

test("no Chrome, cada estado aparece em PT e EN a 390px", { skip: !existsSync(CHROME) }, () => {
  const run = spawnSync("node", ["scripts/check-assist.mjs"], { encoding: "utf8", timeout: 120000 });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});
