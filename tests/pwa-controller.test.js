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
    serviceWorker: {
      register(url) {
        registrations.push(url);
        return Promise.resolve();
      },
    },
  };

  assert.equal(
    PwaController.registerServiceWorker({
      window,
      navigator,
      location: { protocol: "https:" },
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
    }),
    false,
  );
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
