import * as assert from "node:assert/strict";
import { test } from "node:test";
import { compareTasksByMode } from "../src/taskSorting";
import type { BelkiTask } from "../src/types";

// Only the unavailable host class bases are stubbed. Grouping and sorting below
// execute the real compiled plugin methods, not a copied algorithm or fake UI.
const moduleLoader = require("node:module");
const originalLoad = moduleLoader._load;
let board: typeof import("../src/views/TaskBoardView");
try {
  moduleLoader._load = function (request: string, ...args: unknown[]) {
    if (request === "obsidian") {
      return { ItemView: class {}, Modal: class {}, Platform: { isMobile: false } };
    }
    return originalLoad.call(this, request, ...args);
  };
  board = require("../src/views/TaskBoardView");
} finally {
  moduleLoader._load = originalLoad;
}
const groupTasks = (board.TaskBoardView.prototype as unknown as {
  groupTasks(tasks: BelkiTask[]): Map<string, BelkiTask[]>;
}).groupTasks;
function task(id: string, label: string, priority: BelkiTask["priority"]): BelkiTask {
  return { id, title: id, completed: false, priority, labels: [label],
    attachments: [], extraProperties: [], order: 0 };
}

test("label sections stay in place when priorities swap", () => {
  const mine = task("mine", "with_me", "P1");
  const theirs = task("theirs", "with_others", "P4");
  const context = { settings: { groupBy: "label" } };
  const sorted = () => [mine, theirs].sort((a, b) => compareTasksByMode(a, b, "priority"));
  const before = [...groupTasks.call(context, sorted()).keys()];
  mine.priority = "P4";
  theirs.priority = "P1";
  const after = [...groupTasks.call(context, sorted()).keys()];
  assert.deepEqual(before, ["with_me", "with_others"]);
  assert.deepEqual(after, before);
});

// Characterize unchanged semantics around the regression: host UI is not simulated.
test("label grouping preserves incoming within-section order and task identity", () => {
  const first = task("first", "work", "P4");
  const second = task("second", "work", "P1");
  const groups = groupTasks.call({ settings: { groupBy: "label" } }, [first, second]);
  assert.deepEqual(groups.get("work"), [first, second]);
  assert.equal(groups.get("work")![0], first);
  assert.equal(first.priority, "P4");
});

test("unlabelled section stays last regardless of incoming order", () => {
  const unlabelled = { ...task("none", "", "P1"), labels: [] };
  const labelled = task("labelled", "z_work", "P4");
  const groups = groupTasks.call({ settings: { groupBy: "label" } }, [unlabelled, labelled]);
  assert.deepEqual([...groups.keys()], ["z_work", "No label"]);
  assert.deepEqual(groups.get("No label"), [unlabelled]);
});

test("multiple labels retain existing first-label-only grouping", () => {
  const item = { ...task("multi", "work", "P1"), labels: ["work", "other"] };
  const groups = groupTasks.call({ settings: { groupBy: "label" } }, [item]);
  assert.deepEqual([...groups.keys()], ["work"]);
  assert.deepEqual(item.labels, ["work", "other"]);
});

test("empty input produces no sections in each grouping mode", () => {
  for (const groupBy of ["label", "priority", "none"]) {
    assert.equal(groupTasks.call({ settings: { groupBy } }, []).size, 0);
  }
});

test("priority grouping preserves its existing priority order", () => {
  const low = task("low", "work", "P4");
  const high = task("high", "other", "P1");
  const groups = groupTasks.call({ settings: { groupBy: "priority" } }, [low, high]);
  assert.deepEqual([...groups.values()], [[high], [low]]);
});

test("date sort changes cannot reposition label sections", () => {
  const a = { ...task("a", "a_work", "P4"), due: "2026-10-09" };
  const z = { ...task("z", "z_work", "P4"), due: "2026-10-08" };
  const context = { settings: { groupBy: "label" } };
  const sorted = () => [a, z].sort((x, y) => compareTasksByMode(x, y, "due"));
  const before = [...groupTasks.call(context, sorted()).keys()];
  a.due = "2026-10-07";
  const after = [...groupTasks.call(context, sorted()).keys()];
  assert.deepEqual(before, ["a_work", "z_work"]);
  assert.deepEqual(after, before);
});
