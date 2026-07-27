const test = require("node:test");
const assert = require("node:assert/strict");

const ReadingOverrideController = require("../src/app/reading-override-controller.js");

function harness() {
  let editor = true;
  let store = null;
  let confirmAll = true;
  const statuses = [];
  const changes = [];
  let allRestored = 0;
  const errors = [];
  const controller = ReadingOverrideController.create({
    getStore: () => store,
    isEditor: () => editor,
    getDate: () => "2026-08-02",
    confirmAll: () => confirmAll,
    onStatus: (text, kind) => statuses.push({ text, kind }),
    onOverrideChanged: (slot, value) => changes.push({ slot, value }),
    onAllRestored: () => { allRestored += 1; },
    logger: { error: error => errors.push(error) },
  });
  return {
    controller,
    statuses,
    changes,
    errors,
    get allRestored() { return allRestored; },
    setEditor(value) { editor = value; },
    setStore(value) { store = value; },
    setConfirmAll(value) { confirmAll = value; },
  };
}

test("saving the computed reading clears its stored override", async () => {
  const state = harness();
  const calls = [];
  state.setStore({
    async clearReadingOverride(date, slot) {
      calls.push({ date, slot });
    },
  });

  assert.equal(await state.controller.save({
    slot: "first",
    citation: "Isaiah 55:1-3",
    isDefault: true,
    requiresConfirmation: false,
  }, false), true);

  assert.deepEqual(calls, [{ date: "2026-08-02", slot: "first" }]);
  assert.deepEqual(state.changes, [{ slot: "first", value: null }]);
  assert.deepEqual(state.statuses, [
    { text: "Saving…", kind: "" },
    { text: "Saved", kind: "saved" },
  ]);
});

test("saving an approved option writes a canonical override snapshot", async () => {
  const state = harness();
  const calls = [];
  state.setStore({
    async saveReadingOverride(date, slot, payload) {
      calls.push({ date, slot, payload });
    },
  });
  const selection = {
    slot: "gospel",
    citation: "John 6:1-15",
    book: "John",
    segments: [{ chapter: 6, startVerse: 1, endVerse: 15 }],
    origin: "ordo-option",
    translation: "World English Bible",
    textVersion: "embedded-2026-07",
    requiresConfirmation: false,
  };

  assert.equal(await state.controller.save(selection, false), true);

  const payload = {
    citation: "John 6:1-15",
    book: "John",
    segments: [{ chapter: 6, startVerse: 1, endVerse: 15 }],
    origin: "ordo-option",
    translation: "World English Bible",
    textVersion: "embedded-2026-07",
    checkedAgainstOrdo: true,
  };
  assert.deepEqual(calls, [{ date: "2026-08-02", slot: "gospel", payload }]);
  assert.deepEqual(state.changes, [{ slot: "gospel", value: payload }]);
});

test("a non-standard passage cannot be saved until explicitly confirmed", async () => {
  const state = harness();
  let calls = 0;
  state.setStore({
    async saveReadingOverride() {
      calls += 1;
    },
  });
  const selection = {
    slot: "first",
    citation: "Acts 4:32-35",
    book: "Acts",
    segments: [],
    origin: "lectionary-catalog",
    translation: "World English Bible",
    textVersion: "embedded-2026-07",
    requiresConfirmation: true,
  };

  assert.equal(await state.controller.save(selection, false), false);
  assert.equal(calls, 0);
  assert.equal(await state.controller.save(selection, true), true);
  assert.equal(calls, 1);
  assert.equal(state.changes[0].value.checkedAgainstOrdo, true);
});

test("restoring one reading clears only that slot", async () => {
  const state = harness();
  const calls = [];
  state.setStore({
    async clearReadingOverride(date, slot) {
      calls.push({ date, slot });
    },
  });

  assert.equal(await state.controller.restore("psalm"), true);

  assert.deepEqual(calls, [{ date: "2026-08-02", slot: "psalm" }]);
  assert.deepEqual(state.changes, [{ slot: "psalm", value: null }]);
});

test("restoring all readings requires confirmation", async () => {
  const state = harness();
  const calls = [];
  state.setStore({
    async clearReadingOverride(date, slot) {
      calls.push({ date, slot });
    },
  });
  state.setConfirmAll(false);
  assert.equal(await state.controller.restoreAll(), false);
  assert.deepEqual(calls, []);

  state.setConfirmAll(true);
  assert.equal(await state.controller.restoreAll(), true);
  assert.deepEqual(calls, [{ date: "2026-08-02", slot: null }]);
  assert.equal(state.allRestored, 1);
});

test("authorization and database failures cannot report success", async () => {
  const state = harness();
  state.setEditor(false);
  assert.equal(await state.controller.restore("first"), false);
  assert.deepEqual(state.statuses, []);

  state.setEditor(true);
  state.setStore({
    async clearReadingOverride() {
      throw new Error("database unavailable");
    },
  });
  assert.equal(await state.controller.restore("first"), false);
  assert.deepEqual(state.statuses, [
    { text: "Saving…", kind: "" },
    { text: "Save failed", kind: "error" },
  ]);
  assert.equal(state.errors.length, 1);
});
