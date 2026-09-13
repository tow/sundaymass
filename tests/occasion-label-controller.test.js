const test = require("node:test");
const assert = require("node:assert/strict");

const OccasionLabelController = require("../src/app/occasion-label-controller.js");

function fakeNode() {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    value: "",
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    dispatch(type, event = {}) {
      return listeners.get(type)?.(event);
    },
  };
}

function fixture({ editor = true, online = true, label = "", date = "2026-10-30", save } = {}) {
  const elements = Object.fromEntries(
    ["launch", "launchButton", "dialog", "form", "context", "input", "error", "save", "clear", "close", "cancel"]
      .map(key => [key, fakeNode()]),
  );
  elements.dialog.open = false;
  elements.dialog.close = function close() {
    this.open = false;
  };
  const state = { date, label, saved: [], statuses: [], errors: [], calls: [] };
  const controller = OccasionLabelController.create({
    elements,
    getStore: () => ({
      async saveOccasionLabel(planDate, value) {
        state.calls.push([planDate, value]);
        if (save) await save(state);
      },
    }),
    isEditor: () => editor,
    isOnline: () => online,
    getDate: () => state.date,
    getLabel: () => state.label,
    formatDate: value => `Long ${value}`,
    openModal: dialog => {
      dialog.open = true;
    },
    onSaved: value => {
      state.label = value;
      state.saved.push(value);
    },
    onStatus: (text, kind) => state.statuses.push([text, kind]),
    logger: { error: (...values) => state.errors.push(values) },
  });
  controller.start();
  return { controller, elements, state };
}

test("only an editor sees the naming action, worded for whether the Mass has a name", () => {
  const unnamed = fixture();
  unnamed.controller.render();
  assert.equal(unnamed.elements.launch.hidden, false);
  assert.equal(unnamed.elements.launchButton.textContent, "Name this Mass");

  const named = fixture({ label: "Filipino Mass" });
  named.controller.render();
  assert.equal(named.elements.launchButton.textContent, "Rename this Mass");

  const visitor = fixture({ editor: false });
  visitor.controller.render();
  assert.equal(visitor.elements.launch.hidden, true);
  visitor.elements.launchButton.dispatch("click");
  assert.equal(visitor.elements.dialog.open, false);
});

test("an editor names the Mass for the date the dialog was opened on", async () => {
  const { elements, state } = fixture();
  elements.launchButton.dispatch("click");
  assert.equal(elements.dialog.open, true);
  assert.equal(elements.clear.hidden, true);
  assert.match(elements.context.textContent, /Long 2026-10-30/);

  elements.input.value = "  Filipino Mass ";
  await elements.form.dispatch("submit", { preventDefault() {} });

  assert.deepEqual(state.calls, [["2026-10-30", "Filipino Mass"]]);
  assert.deepEqual(state.saved, ["Filipino Mass"]);
  assert.deepEqual(state.statuses, [["Name saved", "saved"]]);
  assert.equal(elements.dialog.open, false);
});

test("removing a name saves an empty name", async () => {
  const { elements, state } = fixture({ label: "Filipino Mass" });
  elements.launchButton.dispatch("click");
  assert.equal(elements.clear.hidden, false);
  assert.equal(elements.input.value, "Filipino Mass");
  await elements.clear.dispatch("click");
  assert.deepEqual(state.calls, [["2026-10-30", ""]]);
  assert.deepEqual(state.statuses, [["Name removed", "saved"]]);
});

test("a save that lands after moving to another date does not rename the new one", async () => {
  const { elements, state } = fixture({
    save: async value => {
      value.date = "2026-11-01";
    },
  });
  elements.launchButton.dispatch("click");
  elements.input.value = "Filipino Mass";
  await elements.form.dispatch("submit", { preventDefault() {} });
  assert.deepEqual(state.calls, [["2026-10-30", "Filipino Mass"]]);
  assert.deepEqual(state.saved, []);
  assert.deepEqual(state.statuses, [["Saved for the previously selected date", "saved"]]);
});

test("offline, too long, and failed saves explain themselves in the dialog", async () => {
  const offline = fixture({ online: false });
  offline.elements.launchButton.dispatch("click");
  offline.elements.input.value = "Filipino Mass";
  await offline.elements.form.dispatch("submit", {});
  assert.match(offline.elements.error.textContent, /internet connection/);
  assert.deepEqual(offline.state.calls, []);

  const long = fixture();
  long.elements.launchButton.dispatch("click");
  long.elements.input.value = "x".repeat(81);
  await long.elements.form.dispatch("submit", {});
  assert.match(long.elements.error.textContent, /80 characters or fewer/);
  assert.deepEqual(long.state.calls, []);

  const failing = fixture({
    save: async () => {
      throw new Error("Editor access required");
    },
  });
  failing.elements.launchButton.dispatch("click");
  failing.elements.input.value = "Filipino Mass";
  await failing.elements.form.dispatch("submit", {});
  assert.equal(failing.elements.error.textContent, "Editor access required");
  assert.equal(failing.elements.dialog.open, true);
  assert.equal(failing.elements.save.disabled, false);
  assert.equal(failing.state.errors.length, 1);
});
