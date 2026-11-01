// Teclas dos menus e dos segmented, como funções puras. No browser, ver o scripts/check-keyboard.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { menuKeyTarget } from "../js/ui/menu.js";
import { segTarget } from "../js/ui/segmented.js";

test("menuKeyTarget: ↓/↑ dão a volta, entram pelo primeiro/último, Home/End, outras teclas null", () => {
  assert.equal(menuKeyTarget(5, -1, "ArrowDown"), 0);
  assert.equal(menuKeyTarget(5, -1, "ArrowUp"), 4);
  assert.equal(menuKeyTarget(5, 2, "ArrowDown"), 3);
  assert.equal(menuKeyTarget(5, 4, "ArrowDown"), 0);
  assert.equal(menuKeyTarget(5, 0, "ArrowUp"), 4);
  assert.equal(menuKeyTarget(5, 3, "Home"), 0);
  assert.equal(menuKeyTarget(5, 1, "End"), 4);
  assert.equal(menuKeyTarget(5, 1, "Enter"), null);
  assert.equal(menuKeyTarget(0, -1, "ArrowDown"), null);
});

test("segTarget: ←/→ dão a volta nas pontas, outras teclas null", () => {
  assert.equal(segTarget(0, 3, "ArrowRight"), 1);
  assert.equal(segTarget(1, 3, "ArrowLeft"), 0);
  assert.equal(segTarget(2, 3, "ArrowRight"), 0);
  assert.equal(segTarget(0, 3, "ArrowLeft"), 2);
  assert.equal(segTarget(0, 3, "ArrowDown"), null);
  assert.equal(segTarget(0, 3, "Enter"), null);
});
