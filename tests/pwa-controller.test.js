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
function openPage({ activeElement = null, openDialog = false } = {}) {
  const updates = [];
  const reloads = [];
  const serviceWorker = emitter({
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
    location: { protocol: "https:", reload: () => reloads.push(true) },
    document,
    build: "eb20f98fb535",
  });
  return {
    document,
    updates,
    reloads,
    async load() { await window.listeners.get("load")(); },
    show() { document.visibilityState = "visible"; document.listeners.get("visibilitychange")(); },
    // Returns what the page answered the worker, if anything.
    announce(builds) {
      const answers = [];
      serviceWorker.listeners.get("message")({
        data: { type: "deployment", builds },
        ports: [{ postMessage: value => answers.push(value) }],
      });
      return answers;
    },
  };
}

test("returning to a page asks for the current service worker", async () => {
  const page = openPage();
  await page.load();
  page.show();
  assert.equal(page.updates.length, 1);
  assert.deepEqual(page.reloads, []);
});

test("a page answers every deployment and reloads only if its build was replaced", () => {
  const current = openPage();
  assert.deepEqual(current.announce(["eb20f98fb535", "53d05c81d5fd"]), ["updating"]);
  assert.deepEqual(current.reloads, []);

  const behind = openPage();
  assert.deepEqual(behind.announce(["b1742d6ff38f", "53d05c81d5fd"]), ["updating"]);
  assert.equal(behind.reloads.length, 1);
});

test("a page behind a deployment waits until nothing is being edited", () => {
  const page = openPage({ openDialog: true });
  page.announce(["b1742d6ff38f"]);
  assert.deepEqual(page.reloads, []);
  page.document.querySelector = () => null;
  page.document.activeElement = { tagName: "TEXTAREA" };
  page.show();
  assert.deepEqual(page.reloads, []);
  page.document.activeElement = { tagName: "BUTTON" };
  page.show();
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
