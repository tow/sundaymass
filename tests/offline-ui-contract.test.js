const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const planner = fs.readFileSync(path.join(ROOT, "src/app/planner.js"), "utf8");

test("the planner never presents an offline edit as successfully saved", () => {
  assert.doesNotMatch(planner, /Saved offline/);
  assert.match(planner, /Offline — showing saved copy/);
  assert.match(planner, /Offline — no saved plan/);
  assert.match(planner, /Offline — editing unavailable/);
});
