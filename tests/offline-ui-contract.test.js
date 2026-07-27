const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const planner = fs.readFileSync(path.join(ROOT, "src/app/planner.js"), "utf8");
const session = fs.readFileSync(
  path.join(ROOT, "src/app/plan-session-controller.js"),
  "utf8",
);
const songMutations = fs.readFileSync(
  path.join(ROOT, "src/app/song-mutation-controller.js"),
  "utf8",
);

test("the planner never presents an offline edit as successfully saved", () => {
  assert.doesNotMatch(planner + session + songMutations, /Saved offline/);
  assert.match(session, /Offline — showing saved copy/);
  assert.match(session, /Offline — no saved plan/);
  assert.match(songMutations, /Offline — editing unavailable/);
});
