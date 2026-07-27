const test = require("node:test");
const assert = require("node:assert/strict");

const DateUrlState = require("../src/app/date-url-state.js");

function browserWindow(href) {
  const calls = [];
  return {
    location: { href },
    history: {
      pushState(_state, _title, url) {
        calls.push({ mode: "push", url });
      },
      replaceState(_state, _title, url) {
        calls.push({ mode: "replace", url });
      },
    },
    calls,
  };
}

test("the selected Sunday is read only from a valid date parameter", () => {
  assert.equal(
    DateUrlState.read({ href: "https://example.test/planner?date=2026-08-02" }),
    "2026-08-02",
  );
  assert.equal(
    DateUrlState.read({ href: "https://example.test/planner?date=2-Aug-2026" }),
    "",
  );
  assert.equal(DateUrlState.read({ href: "https://example.test/planner" }), "");
});

test("writing a Sunday preserves unrelated parameters and clears stale anchors", () => {
  const target = browserWindow(
    "https://example.test/planner?choir=evening#reading-gospel",
  );

  DateUrlState.write(target, "2026-08-09");

  assert.deepEqual(target.calls, [{
    mode: "push",
    url: "/planner?choir=evening&date=2026-08-09",
  }]);
});

test("canonicalising an initial selection replaces rather than adds history", () => {
  const target = browserWindow("https://example.test/planner?date=2026-08-03");

  DateUrlState.write(target, "2026-08-02", { replace: true });

  assert.deepEqual(target.calls, [{
    mode: "replace",
    url: "/planner?date=2026-08-02",
  }]);
});
