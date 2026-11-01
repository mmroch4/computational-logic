import { test } from "node:test";
import assert from "node:assert/strict";
import { shareUrl } from "../js/ui/share-link.js";
import { renderResultCard } from "../js/ui/result-card.js";
import { encodeShare, decodeShare } from "../js/core/share.js";
import { parse } from "../js/core/parser.js";
import { solveDLL } from "../js/core/dll.js";
import { setLang } from "../js/ui/i18n.js";

const where = { origin: "https://dpsat.example", pathname: "/passo-a-passo" };

test("shareUrl: página atual + query, e o link volta a dar a mesma fórmula, passo e vista", () => {
  const { clauses } = parse("p1, -p1 -p2, p3 p2");
  const query = encodeShare(clauses, { params: { step: 4, view: "proof" } });
  const url = shareUrl(query, where);
  assert.equal(url, `https://dpsat.example/passo-a-passo?${query}`);
  const back = decodeShare(new URL(url).search);
  assert.deepEqual(parse(back.formula).clauses, clauses);
  assert.deepEqual(back.params, { step: "4", view: "proof" });
});

