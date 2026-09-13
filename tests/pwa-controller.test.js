const test = require("node:test");
const assert = require("node:assert/strict");

const PwaController = require("../src/app/pwa-controller.js");

function emitter(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    listeners,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
}

test("service-worker registration waits for window load and skips local files", async () => {
  const registrations = [];
  const window = emitter();
  const navigator = {
    serviceWorker: emitter({
      register(url) {
        registrations.push(url);
        return Promise.resolve();
      },
    }),
  };

  assert.equal(
    PwaController.registerServiceWorker({
      window,
      navigator,
      location: { protocol: "https:" },
      document: emitter(),
    }),
    true,
  );
  assert.deepEqual(registrations, []);
  await window.listeners.get("load")();
  assert.deepEqual(registrations, ["./service-worker.js"]);

  assert.equal(
    PwaController.registerServiceWorker({
      window: emitter(),
      navigator,
      location: { protocol: "file:" },
      document: emitter(),
    }),
    false,
  );
});

// A page left open across a deployment keeps calling whatever the deployment removed.
function openPage({ deployed = "b1742d6ff38f", activeElement = null, openDialog = false } = {}) {
  const updates = [];
  const reloads = [];
  const fetches = [];
  const serviceWorker = emitter({
    controller: {},
    register: async () => ({ update: async () => { updates.push(true); } }),
  });
  const document = emitter({
    visibilityState: "visible",
    activeElement,
    querySelector: selector => (selector === "dialog[open]" && openDialog ? {} : null),
  });
  const window = emitter();
  PwaController.registerServiceWorker({
    window,
    navigator: { serviceWorker },
    location: { protocol: "https:", pathname: "/sundaymass/", reload: () => reloads.push(true) },
    document,
    build: "eb20f98fb535",
    fetch: async (url, options) => {
      fetches.push([url, options]);
      return { ok: true, text: async () => `<script>window.MASS_PLANNER_BUILD = "${deployed}";</script>` };
    },
  });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {
    document,
    updates,
    reloads,
    fetches,
    settle,
    async load() { await window.listeners.get("load")(); },
    async show() { document.visibilityState = "visible"; document.listeners.get("visibilitychange")(); await settle(); },
    async takeControl() { serviceWorker.listeners.get("controllerchange")(); await settle(); },
  };
}

test("returning to a page asks for the current service worker", async () => {
  const page = openPage();
  await page.load();
  await page.show();
  assert.equal(page.updates.length, 1);
  assert.deepEqual(page.reloads, []);
});

test("a page behind the deployed build reloads once a new worker takes control", async () => {
  const page = openPage({ deployed: "b1742d6ff38f" });
  await page.takeControl();
  assert.equal(page.fetches.length, 1);
  assert.match(page.fetches[0][0], /^\/sundaymass\/\?build-check=\d+$/);
  assert.deepEqual(page.fetches[0][1], { cache: "no-store" });
  assert.equal(page.reloads.length, 1);
});

test("a page already running the deployed build does not reload", async () => {
  const page = openPage({ deployed: "eb20f98fb535" });
  await page.takeControl();
  assert.equal(page.fetches.length, 1);
  assert.deepEqual(page.reloads, []);
});

test("an update waits until nothing is being edited", async () => {
  const page = openPage({ openDialog: true });
  await page.takeControl();
  assert.deepEqual(page.fetches, []);
  page.document.querySelector = () => null;
  page.document.activeElement = { tagName: "TEXTAREA" };
  await page.show();
  assert.deepEqual(page.fetches, []);
  page.document.activeElement = { tagName: "BUTTON" };
  await page.show();
  assert.equal(page.reloads.length, 1);
});

test("an install prompt is retained until the user chooses the install action", async () => {
  const window = emitter({
    matchMedia() { return { matches: false }; },
  });
  const button = emitter({ hidden: true });
  const navigator = { userAgent: "Android" };
  const controller = PwaController.createInstallController({
    window,
    navigator,
    button,
    showIosInstructions() {},
  });
  controller.start();

  let prevented = false;
  let prompted = false;
  const promptEvent = {
    preventDefault() { prevented = true; },
    prompt() { prompted = true; },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  };
  window.listeners.get("beforeinstallprompt")(promptEvent);
  assert.equal(prevented, true);
  assert.equal(button.hidden, false);

  await button.listeners.get("click")();
  assert.equal(prompted, true);
  assert.equal(button.hidden, true);
});

test("iOS shows its manual installation action only outside standalone mode", async () => {
  let instructions = 0;
  const window = emitter({
    matchMedia() { return { matches: false }; },
  });
  const button = emitter({ hidden: true });
  const controller = PwaController.createInstallController({
    window,
    navigator: { userAgent: "iPhone", standalone: false },
    button,
    showIosInstructions() { instructions += 1; },
  });
  controller.start();

  assert.equal(button.hidden, false);
  await button.listeners.get("click")();
  assert.equal(instructions, 1);

  const standaloneButton = emitter({ hidden: true });
  PwaController.createInstallController({
    window: emitter({ matchMedia() { return { matches: true }; } }),
    navigator: { userAgent: "iPhone" },
    button: standaloneButton,
    showIosInstructions() {},
  }).start();
  assert.equal(standaloneButton.hidden, true);
});

test("installation completion hides the action and stop removes listeners", () => {
  const window = emitter({
    matchMedia() { return { matches: false }; },
  });
  const button = emitter({ hidden: false });
  const controller = PwaController.createInstallController({
    window,
    navigator: { userAgent: "Android" },
    button,
    showIosInstructions() {},
  });
  controller.start();
  window.listeners.get("appinstalled")();
  assert.equal(button.hidden, true);

  controller.stop();
  assert.equal(window.listeners.size, 0);
  assert.equal(button.listeners.size, 0);
});
