const test = require("node:test");
const assert = require("node:assert/strict");

const CelebrationController = require("../src/app/celebration-controller.js");

const sunday = {
  d: "2026-07-26",
  n: "17th Sunday in Ordinary Time",
};

const james = {
  id: "james",
  name: "Saint James the Apostle",
  sourceDate: "2026-07-25",
  rank: "Feast",
  season: "Ordinary Time",
  cycle: "A",
  lectionary: "605",
  source: "",
  readings: {
    first: "2 Corinthians 4:7-15",
    psalm: "Psalm 126:1-6",
    second: "Ephesians 4:1-7, 11-13",
    gospel: "Matthew 20:20-28",
  },
};

function harness() {
  let editor = true;
  let date = sunday.d;
  let store = null;
  let confirmRestore = true;
  const states = [];
  const statuses = [];
  const saved = [];
  let restored = 0;
  const errors = [];
  const pickerView = {
    search({ candidates, query, selectedId }) {
      const visible = query
        ? candidates.filter(candidate => candidate.name.toLowerCase().includes(query.toLowerCase()))
        : candidates;
      return {
        heading: query ? "Matching celebrations" : "Nearby celebrations",
        candidates: visible,
        html: visible.map(candidate =>
          `<button data-id="${candidate.id}" data-selected="${candidate.id === selectedId}"></button>`,
        ).join(""),
      };
    },
    renderPreview(candidate) {
      return candidate
        ? { hidden: false, useDisabled: false, html: `<h3>${candidate.name}</h3>` }
        : { hidden: true, useDisabled: true, html: "" };
    },
  };
  const controller = CelebrationController.create({
    getStore: () => store,
    isEditor: () => editor,
    getDate: () => date,
    getCurrentSunday: () => sunday,
    getCandidates: () => [james],
    pickerView,
    confirmRestore: () => confirmRestore,
    onChange: state => states.push(state),
    onStatus: (text, kind) => statuses.push({ text, kind }),
    onSaved: payload => saved.push(payload),
    onRestored: () => { restored += 1; },
    logger: { error: error => errors.push(error) },
  });
  return {
    controller,
    states,
    statuses,
    saved,
    errors,
    get restored() { return restored; },
    setEditor(value) { editor = value; },
    setDate(value) { date = value; },
    setStore(value) { store = value; },
    setConfirmRestore(value) { confirmRestore = value; },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("opening and searching own the visible celebration selection", () => {
  const state = harness();
  state.setStore({});

  assert.equal(state.controller.open(), true);
  assert.equal(state.controller.state().open, true);
  assert.equal(state.controller.state().results.heading, "Nearby celebrations");
  assert.equal(state.controller.select(0).id, "james");
  assert.equal(state.controller.state().preview.hidden, false);

  state.controller.search("missing");
  assert.equal(state.controller.state().selectedCelebration, null);
  assert.deepEqual(state.controller.state().results.candidates, []);
  assert.equal(state.controller.state().preview.hidden, true);
});

test("opening is editor-only and requires a connected store", () => {
  const state = harness();
  state.setEditor(false);
  assert.equal(state.controller.open(), false);
  assert.equal(state.states.length, 0);

  state.setEditor(true);
  assert.equal(state.controller.open(), false);
  assert.equal(state.states.length, 0);
});

test("changing an alternative reading does not mutate the lectionary candidate", () => {
  const state = harness();
  state.setStore({});
  state.controller.open();
  state.controller.select(0);

  state.controller.setReading("psalm", "Psalm 116:10-11");

  assert.equal(state.controller.state().selectedCelebration.readings.psalm, "Psalm 116:10-11");
  assert.equal(james.readings.psalm, "Psalm 126:1-6");
});

test("saving writes a resolved snapshot and clears individual reading overrides", async () => {
  const state = harness();
  const calls = [];
  state.setStore({
    async saveCelebrationOverride(date, payload) {
      calls.push({ date, payload });
    },
  });
  state.controller.open();
  state.controller.select(0);

  assert.equal(await state.controller.save(), true);

  const expectedPayload = {
    id: "james",
    name: "Saint James the Apostle",
    sourceDate: "2026-07-25",
    rank: "Feast",
    season: "Ordinary Time",
    cycle: "A",
    lectionary: "605",
    source: "Standard lectionary",
    readings: james.readings,
    checkedAgainstOrdo: true,
  };
  assert.deepEqual(calls, [{ date: sunday.d, payload: expectedPayload }]);
  assert.deepEqual(state.saved, [expectedPayload]);
  assert.deepEqual(state.statuses, [
    { text: "Saving…", kind: "" },
    { text: "Saved", kind: "saved" },
  ]);
  assert.equal(state.controller.state().open, false);
});

test("save failures restore the action and report an error", async () => {
  const state = harness();
  state.setStore({
    async saveCelebrationOverride() {
      throw new Error("database unavailable");
    },
  });
  state.controller.open();
  state.controller.select(0);

  assert.equal(await state.controller.save(), false);

  assert.equal(state.controller.state().saving, false);
  assert.equal(state.controller.state().open, true);
  assert.deepEqual(state.statuses.slice(-1), [{ text: "Save failed", kind: "error" }]);
  assert.equal(state.errors.length, 1);
});

test("restoring requires confirmation and clears celebration plus readings", async () => {
  const state = harness();
  const dates = [];
  state.setStore({
    async clearCelebrationOverride(date) {
      dates.push(date);
    },
  });
  state.setConfirmRestore(false);
  assert.equal(await state.controller.restore(), false);
  assert.deepEqual(dates, []);

  state.setConfirmRestore(true);
  assert.equal(await state.controller.restore(), true);
  assert.deepEqual(dates, [sunday.d]);
  assert.equal(state.restored, 1);
  assert.deepEqual(state.statuses.slice(-2), [
    { text: "Saving…", kind: "" },
    { text: "Saved", kind: "saved" },
  ]);
});

test("a late celebration save cannot replace the newly selected Sunday", async () => {
  const state = harness();
  const pending = deferred();
  const dates = [];
  state.setStore({
    async saveCelebrationOverride(date) {
      dates.push(date);
      return pending.promise;
    },
  });
  state.controller.open();
  state.controller.select(0);

  const operation = state.controller.save();
  state.setDate("2026-08-02");
  pending.resolve();
  assert.equal(await operation, true);

  assert.deepEqual(dates, [sunday.d]);
  assert.deepEqual(state.saved, []);
  assert.equal(state.controller.state().open, false);
  assert.deepEqual(state.statuses.at(-1), {
    text: "Saved for previous Sunday",
    kind: "saved",
  });
});
