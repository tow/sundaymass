const test = require("node:test");
const assert = require("node:assert/strict");

const ModalController = require("../src/app/modal-controller.js");

function harness() {
  const styles = new Map();
  const classes = new Set();
  const listeners = new Map();
  const frames = [];
  const scrollCalls = [];
  let openDialog = null;
  const document = {
    body: {
      style: {
        setProperty(name, value) { styles.set(name, value); },
        removeProperty(name) { styles.delete(name); },
      },
    },
    documentElement: {
      classList: {
        add(value) { classes.add(value); },
        remove(value) { classes.delete(value); },
      },
    },
    addEventListener(type, listener, capture) {
      listeners.set(type, { listener, capture });
    },
    removeEventListener(type, listener, capture) {
      const registered = listeners.get(type);
      if (registered?.listener === listener && registered.capture === capture) {
        listeners.delete(type);
      }
    },
    querySelector(selector) {
      assert.equal(selector, "dialog[open]");
      return openDialog;
    },
  };
  const window = {
    scrollY: 420,
    scrollTo(x, y) { scrollCalls.push([x, y]); },
    requestAnimationFrame(callback) { frames.push(callback); },
  };
  const controller = ModalController.create({ window, document });
  return {
    controller,
    styles,
    classes,
    listeners,
    frames,
    scrollCalls,
    setOpenDialog(value) { openDialog = value; },
  };
}

test("opening a modal fixes the page at its current scroll position", () => {
  const context = harness();
  let shown = 0;
  context.controller.open({ showModal() { shown += 1; } });

  assert.equal(shown, 1);
  assert.equal(context.styles.get("--modal-page-top"), "-420px");
  assert.equal(context.classes.has("modal-open"), true);
});

test("nested modal opens retain the original page position", () => {
  const context = harness();
  context.controller.open({ showModal() {} });
  context.controller.open({ showModal() {} });

  assert.equal(context.styles.get("--modal-page-top"), "-420px");
});

test("the close listener restores scroll only after every dialog is closed", () => {
  const context = harness();
  context.controller.start();
  assert.equal(context.listeners.get("close").capture, true);

  context.controller.open({ showModal() {} });
  context.setOpenDialog({});
  context.listeners.get("close").listener();
  context.frames.shift()();
  assert.equal(context.classes.has("modal-open"), true);
  assert.deepEqual(context.scrollCalls, []);

  context.setOpenDialog(null);
  context.listeners.get("close").listener();
  context.frames.shift()();
  assert.equal(context.classes.has("modal-open"), false);
  assert.equal(context.styles.has("--modal-page-top"), false);
  assert.deepEqual(context.scrollCalls, [[0, 420]]);
});

test("start and stop manage one capturing close listener", () => {
  const context = harness();
  context.controller.start();
  context.controller.start();
  assert.equal(context.listeners.size, 1);

  context.controller.stop();
  assert.equal(context.listeners.size, 0);
});
