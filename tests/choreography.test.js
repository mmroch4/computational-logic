import { test } from "node:test";
import assert from "node:assert/strict";
import { stepChoreography } from "../js/core/choreography.js";
import { clauseSetModel } from "../js/ui/clause-set-view.js";
import { getExample, EXAMPLES } from "../js/core/examples.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";

const traceOf = (input) => solveDLL(parse(input).clauses).trace;
const stages = (trace, index) => stepChoreography(trace, index).map((s) => s.stage);

test("dois ramos: ramificar não risca nada, e o F e o retrocesso têm as suas etapas", () => {
  const trace = traceOf(getExample("two-branches").input);
  const branch = trace.findIndex((e) => e.type === "branch");
  assert.deepEqual(stages(trace, branch), ["add", "value", "node"]);
  assert.deepEqual(stepChoreography(trace, branch).at(-1), { stage: "node", kind: "call" });
  assert.equal(stepChoreography(trace, branch)[0].clause, trace[branch].after.length - 1);
  const conflict = trace.findIndex((e) => e.type === "conflict");
  assert.deepEqual(stages(trace, conflict), ["empty", "deadEnd"]);
  assert.ok(trace[conflict].S[stepChoreography(trace, conflict)[0].clause].length === 0);
  assert.deepEqual(stages(trace, trace.findIndex((e) => e.type === "backtrack")), []);
});

test("cadeia de propagações: unitária → riscados → saem → valoração → nó", () => {
  const trace = traceOf(getExample("propagation-chain").input);
  const unit = trace.findIndex((e) => e.type === "unit" && e.shortened.length > 0);
  const e = trace[unit];
  const steps = stepChoreography(trace, unit);
  assert.deepEqual(steps.map((s) => s.stage), ["unit", "strike", "leave", "value", "node"]);
  assert.equal(steps[0].clause, e.clauseIndex);
  assert.deepEqual(steps[2].clauses, e.removed, "a própria unitária também sai");
  assert.ok(steps[2].clauses.includes(e.clauseIndex));
  assert.equal(steps[3].variable, e.literal.v);
  assert.deepEqual(steps[4], { stage: "node", kind: "unit" });
  // Os riscados são os do cartão, pela mesma ordem.
  const cards = clauseSetModel(trace, unit).cards;
  const expected = cards.flatMap((card, clause) => card.struck.map((literal) => ({ clause, literal })));
  assert.deepEqual(steps[1].literals, expected);
});

test("uma propagação sem cláusulas para encurtar salta os riscados", () => {
  const trace = traceOf("p, q r");
  assert.deepEqual(stages(trace, 1), ["unit", "leave", "value", "node"]);
});

test("as cláusulas repetidas depois de encurtar também saem", () => {
  const trace = traceOf("p, -p q, q");
  const e = trace[1];
  assert.deepEqual(e.merged, [2]);
  assert.deepEqual(stepChoreography(trace, 1).find((s) => s.stage === "leave").clauses, [0, 2]);
});

test("a ramificação com {l} já no conjunto não acrescenta cláusula", () => {
  const before = [[{ v: "p", neg: false }, { v: "q", neg: false }], [{ v: "p", neg: true }, { v: "q", neg: true }]];
  const literal = { v: "p", neg: false };
  const trace = [{ type: "branch", node: 1, parent: 0, literal, before, after: before.slice() }];
  assert.deepEqual(stages(trace, 0), ["value", "node"]);
});

test("satisfazível realça o caminho; início, resultado e passos fora do trace não têm etapas", () => {
  const trace = traceOf("p q");
  assert.deepEqual(stages(trace, trace.findIndex((e) => e.type === "sat")), ["path"]);
  assert.deepEqual(stages(trace, 0), []);
  assert.deepEqual(stages(trace, trace.length - 1), []);
  assert.deepEqual(stages(trace, trace.length + 5), []);
});

test("em todos os exemplos, as cláusulas que saem são as que faltam no conjunto seguinte", () => {
  for (const { input } of EXAMPLES) {
    const trace = traceOf(input);
    trace.forEach((e, index) => {
      if (e.type !== "unit") return;
      const leave = stepChoreography(trace, index).find((s) => s.stage === "leave");
      assert.equal(e.before.length - leave.clauses.length, e.after.length, input);
    });
  }
});
