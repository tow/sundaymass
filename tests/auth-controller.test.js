const test = require("node:test");
const assert = require("node:assert/strict");

const AuthController = require("../src/app/auth-controller.js");

function target(properties = {}) {
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

function harness(overrides = {}) {
  const button = target();
  const dialog = target({
    closeCalls: 0,
    close() { this.closeCalls += 1; },
  });
  const form = target();
  const cancelButton = target();
  const emailInput = { value: "  editor@example.org  ", focusCalls: 0, focus() { this.focusCalls += 1; } };
  const passwordInput = { value: "secret" };
  const submitButton = { disabled: false, textContent: "Sign in" };
  const errorElement = { textContent: "old error" };
  const calls = [];
  const store = {
    async signIn(email, password) { calls.push(["signIn", email, password]); },
    async signOut() { calls.push(["signOut"]); },
  };
  const opened = [];
  const unavailable = [];
  const actionFailures = [];
  let signedIn = false;
  let currentStore = store;
  const controller = AuthController.create({
    button,
    dialog,
    form,
    cancelButton,
    emailInput,
    passwordInput,
    submitButton,
    errorElement,
    getStore: () => currentStore,
    isSignedIn: () => signedIn,
    openDialog: value => opened.push(value),
    scheduleFocus: callback => callback(),
    onUnavailable: () => unavailable.push(true),
    onActionFailure: error => actionFailures.push(error),
    logger: { error() {} },
    ...overrides,
  });
  controller.start();
  return {
    controller,
    button,
    dialog,
    form,
    cancelButton,
    emailInput,
    passwordInput,
    submitButton,
    errorElement,
    calls,
    opened,
    unavailable,
    actionFailures,
    setSignedIn(value) { signedIn = value; },
    setStore(value) { currentStore = value; },
  };
}

test("the auth action opens and focuses sign-in when signed out", async () => {
  const context = harness();
  await context.button.listeners.get("click")();

  assert.deepEqual(context.opened, [context.dialog]);
  assert.equal(context.emailInput.focusCalls, 1);
  assert.equal(context.errorElement.textContent, "");
});

test("the auth action signs out directly when signed in", async () => {
  const context = harness();
  context.setSignedIn(true);
  await context.button.listeners.get("click")();

  assert.deepEqual(context.calls, [["signOut"]]);
  assert.deepEqual(context.opened, []);
});

test("sign-in trims email, protects the submit action, and clears the password", async () => {
  const context = harness();
  await context.form.listeners.get("submit")({ preventDefault() {} });

  assert.deepEqual(context.calls, [["signIn", "editor@example.org", "secret"]]);
  assert.equal(context.passwordInput.value, "");
  assert.equal(context.dialog.closeCalls, 1);
  assert.equal(context.submitButton.disabled, false);
  assert.equal(context.submitButton.textContent, "Sign in");
});

test("sign-in errors stay in the dialog and auth-action errors reach the page", async () => {
  const failure = new Error("no");
  const context = harness({
    getStore: () => ({
      async signIn() { throw failure; },
      async signOut() { throw failure; },
    }),
  });
  await context.form.listeners.get("submit")({ preventDefault() {} });
  assert.equal(context.errorElement.textContent, "Sign-in failed. Check the email and password.");
  assert.equal(context.submitButton.disabled, false);

  context.setSignedIn(true);
  await context.button.listeners.get("click")();
  assert.deepEqual(context.actionFailures, [failure]);
});

test("missing stores report unavailability and listener cleanup is complete", async () => {
  const context = harness();
  context.setStore(null);
  await context.button.listeners.get("click")();
  assert.equal(context.unavailable.length, 1);

  context.controller.stop();
  assert.equal(context.button.listeners.size, 0);
  assert.equal(context.dialog.listeners.size, 0);
  assert.equal(context.form.listeners.size, 0);
  assert.equal(context.cancelButton.listeners.size, 0);
});
