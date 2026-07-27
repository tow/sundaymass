const test = require("node:test");
const assert = require("node:assert/strict");

const RepertoireUrlState = require("../src/app/repertoire-url-state.js");

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

test("repertoire state reads a valid collection and bounded search query", () => {
  assert.deepEqual(
    RepertoireUrlState.read({
      href: "https://example.test/repertoire.html?scope=library&q=city+of+god",
    }),
    { scope: "library", query: "city of god" },
  );
  assert.deepEqual(
    RepertoireUrlState.read({
      href: "https://example.test/repertoire.html?scope=unknown&q=%20table%20",
    }),
    { scope: "repertoire", query: "table" },
  );
  assert.deepEqual(
    RepertoireUrlState.read({ href: "not a URL" }),
    { scope: "repertoire", query: "" },
  );
});

test("collection navigation pushes a shareable URL with the current query", () => {
  const target = browserWindow("https://example.test/repertoire.html?from=planner");

  RepertoireUrlState.write(target, {
    scope: "library",
    query: "city of god",
  });

  assert.deepEqual(target.calls, [{
    mode: "push",
    url: "/repertoire.html?from=planner&scope=library&q=city+of+god",
  }]);
});

test("search typing replaces history and removes an empty query", () => {
  const target = browserWindow(
    "https://example.test/repertoire.html?scope=library&q=old#songs",
  );

  RepertoireUrlState.write(
    target,
    { scope: "library", query: "" },
    { replace: true },
  );

  assert.deepEqual(target.calls, [{
    mode: "replace",
    url: "/repertoire.html?scope=library",
  }]);
});
