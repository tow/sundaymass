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
  const titleElement = { textContent: "" };
  const descriptionElement = { textContent: "" };
  const emailField = { hidden: false };
  const emailInput = { value: "  editor@example.org  ", focusCalls: 0, focus() { this.focusCalls += 1; } };
  const passwordInput = { value: "secret", focusCalls: 0, focus() { this.focusCalls += 1; } };
  const modeButton = target({ textContent: "" });
  const submitButton = { disabled: false, textContent: "Sign in" };
  const errorElement = { textContent: "old error" };
  const calls = [];
  const store = {
    async signInChoir(password) { calls.push(["signInChoir", password]); },
    async signInEditor(email, password) { calls.push(["signInEditor", email, password]); },
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
    titleElement,
    descriptionElement,
    emailField,
    emailInput,
    passwordInput,
    modeButton,
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
    titleElement,
    descriptionElement,
    emailField,
    emailInput,
    passwordInput,
    modeButton,
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

test("the auth action opens the password-only choir sign-in by default", async () => {
  const context = harness();
  await context.button.listeners.get("click")();

  assert.deepEqual(context.opened, [context.dialog]);
  assert.equal(context.passwordInput.focusCalls, 1);
  assert.equal(context.emailField.hidden, true);
  assert.equal(context.emailInput.required, false);
  assert.equal(context.emailInput.disabled, true);
  assert.equal(context.titleElement.textContent, "Choir member sign in");
  assert.equal(context.errorElement.textContent, "");
});

test("the auth action signs out directly when signed in", async () => {
  const context = harness();
  context.setSignedIn(true);
  await context.button.listeners.get("click")();

  assert.deepEqual(context.calls, [["signOut"]]);
  assert.deepEqual(context.opened, []);
});

test("choir sign-in submits only the shared password", async () => {
  const context = harness();
  await context.form.listeners.get("submit")({ preventDefault() {} });

  assert.deepEqual(context.calls, [["signInChoir", "secret"]]);
  assert.equal(context.passwordInput.value, "");
  assert.equal(context.dialog.closeCalls, 1);
  assert.equal(context.submitButton.disabled, false);
  assert.equal(context.submitButton.textContent, "Sign in");
});

test("editor mode reveals email and submits the individual editor credentials", async () => {
  const context = harness();
  await context.modeButton.listeners.get("click")();
  assert.equal(context.emailField.hidden, false);
  assert.equal(context.emailInput.required, true);
  assert.equal(context.emailInput.disabled, false);
  assert.equal(context.emailInput.focusCalls, 1);
  assert.equal(context.titleElement.textContent, "Editor sign in");

  await context.form.listeners.get("submit")({ preventDefault() {} });
  assert.deepEqual(context.calls, [["signInEditor", "editor@example.org", "secret"]]);
});

test("sign-in errors stay in the dialog and auth-action errors reach the page", async () => {
  const failure = new Error("no");
  const context = harness({
    getStore: () => ({
      async signInChoir() { throw failure; },
      async signInEditor() { throw failure; },
      async signOut() { throw failure; },
    }),
  });
  await context.form.listeners.get("submit")({ preventDefault() {} });
  assert.equal(context.errorElement.textContent, "Sign-in failed. Check the choir password.");
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
  assert.equal(context.modeButton.listeners.size, 0);
});
