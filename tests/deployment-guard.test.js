const test = require("node:test");
const assert = require("node:assert/strict");

const DeploymentGuard = require("../src/services/deployment-guard.js");

const DEPLOYED = ["b1742d6ff38f", "53d05c81d5fd"];

// A page as the guard sees it from inside a vendor bundle it has just fetched.
function openPage({
  build = "eb20f98fb535",
  activeElement = null,
  openDialog = false,
  visibilityState = "visible",
  storage = new Map(),
} = {}) {
  const listeners = [];
  const reloads = [];
  const document = {
    visibilityState,
    activeElement,
    querySelector: selector => (selector === "dialog[open]" && openDialog ? {} : null),
    addEventListener(type, listener, capture = false) {
      listeners.push({ type, listener, capture });
    },
    removeEventListener(type, listener) {
      const index = listeners.findIndex(entry => entry.type === type && entry.listener === listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  const window = { MASS_PLANNER_BUILD: build };
  return {
    document,
    reloads,
    listeners,
    storage,
    run: builds => DeploymentGuard.reloadIfBehind({
      builds,
      window,
      document,
      location: { reload: () => reloads.push(true) },
      storage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    }),
    fire(type) {
      listeners.filter(entry => entry.type === type).forEach(entry => entry.listener());
    },
  };
}

test("a page on a deployed build stays put", () => {
  const page = openPage({ build: DEPLOYED[1] });
  assert.equal(page.run(DEPLOYED), "current");
  assert.deepEqual(page.reloads, []);
  assert.deepEqual(page.listeners, []);
});

test("a page behind the deployment reloads once it receives a fresh bundle", () => {
  const page = openPage();
  assert.equal(page.run(DEPLOYED), "reloading");
  assert.equal(page.reloads.length, 1);
});

test("a page that came back still old is not reloaded again for the same deployment", () => {
  const storage = new Map();
  const first = openPage({ storage });
  assert.equal(first.run(DEPLOYED), "reloading");

  const again = openPage({ storage });
  assert.equal(again.run(DEPLOYED), "reloaded");
  assert.deepEqual(again.reloads, []);

  const later = openPage({ storage });
  assert.equal(later.run(["0a12bb24b0cd"]), "reloading");
});

test("a page behind the deployment waits until nothing is being edited", () => {
  const page = openPage({ openDialog: true });
  assert.equal(page.run(DEPLOYED), "waiting");
  assert.deepEqual(page.reloads, []);

  page.document.querySelector = () => null;
  page.document.activeElement = { tagName: "TEXTAREA" };
  page.fire("close");
  assert.deepEqual(page.reloads, []);

  page.document.activeElement = { tagName: "BUTTON" };
  page.fire("visibilitychange");
  assert.equal(page.reloads.length, 1);
  assert.deepEqual(page.listeners, []);
});

test("a hidden page reloads when it is next shown", () => {
  const page = openPage({ visibilityState: "hidden" });
  assert.equal(page.run(DEPLOYED), "waiting");
  page.document.visibilityState = "visible";
  page.fire("visibilitychange");
  assert.equal(page.reloads.length, 1);
});

test("a dialog closing lets a waiting page reload", () => {
  const page = openPage({ openDialog: true });
  assert.equal(page.run(DEPLOYED), "waiting");
  assert.ok(page.listeners.some(entry => entry.type === "close" && entry.capture));
  page.document.querySelector = () => null;
  page.fire("close");
  assert.equal(page.reloads.length, 1);
});

test("anything that is not an application page is left alone", () => {
  assert.equal(
    DeploymentGuard.reloadIfBehind({ builds: DEPLOYED, window: {} }),
    "unknown",
  );
  const page = openPage();
  assert.equal(page.run(undefined), "unknown");
  assert.deepEqual(page.reloads, []);
});

test("storage that refuses does not stop the reload", () => {
  const page = openPage();
  const result = DeploymentGuard.reloadIfBehind({
    builds: DEPLOYED,
    window: { MASS_PLANNER_BUILD: "eb20f98fb535" },
    document: page.document,
    location: { reload: () => page.reloads.push(true) },
    storage: {
      getItem() { throw new Error("SecurityError"); },
      setItem() { throw new Error("SecurityError"); },
    },
  });
  assert.equal(result, "reloading");
  assert.equal(page.reloads.length, 1);
});
