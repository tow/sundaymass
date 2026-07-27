const test = require("node:test");
const assert = require("node:assert/strict");

const SongMutationController = require("../src/app/song-mutation-controller.js");

const tick = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  let editor = true;
  let online = true;
  let store = null;
  const statuses = [];
  const assigned = [];
  const cleared = [];
  const updated = [];
  const errors = [];
  const warnings = [];
  const controller = SongMutationController.create({
    getStore: () => store,
    isEditor: () => editor,
    isOnline: () => online,
    getDate: () => "2026-08-02",
    onStatus: (text, kind) => statuses.push({ text, kind }),
    onAssigned: (part, song) => assigned.push({ part, song }),
    onCleared: part => cleared.push(part),
    onUpdated: song => updated.push(song),
    logger: {
      error: error => errors.push(error),
      warn: (...values) => warnings.push(values),
    },
  });
  return {
    controller,
    statuses,
    assigned,
    cleared,
    updated,
    errors,
    warnings,
    setEditor(value) { editor = value; },
    setOnline(value) { online = value; },
    setStore(value) { store = value; },
  };
}

test("offline and unauthorized mutations stop before reaching the store", async () => {
  const state = harness();
  let calls = 0;
  state.setStore({
    async assignSong() { calls += 1; },
  });
  state.setOnline(false);

  await assert.rejects(
    state.controller.assign("entrance", { id: "song-1", title: "Song" }),
    /internet connection/,
  );
  assert.equal(calls, 0);
  assert.deepEqual(state.statuses, [{
    text: "Offline — editing unavailable",
    kind: "error",
  }]);

  state.setOnline(true);
  state.setEditor(false);
  await assert.rejects(
    state.controller.assign("entrance", { id: "song-1", title: "Song" }),
    /Editor access required/,
  );
  assert.equal(calls, 0);
});

test("assigning and clearing update only the requested Mass part", async () => {
  const state = harness();
  const calls = [];
  state.setStore({
    async assignSong(date, part, songId) {
      calls.push({ action: "assign", date, part, songId });
    },
    async clearSong(date, part) {
      calls.push({ action: "clear", date, part });
    },
  });
  const song = { id: "song-1", title: "Table of Plenty" };

  assert.equal(await state.controller.assign("communion1", song), song);
  assert.equal(await state.controller.clear("communion1"), true);

  assert.deepEqual(calls, [
    {
      action: "assign",
      date: "2026-08-02",
      part: "communion1",
      songId: "song-1",
    },
    {
      action: "clear",
      date: "2026-08-02",
      part: "communion1",
    },
  ]);
  assert.deepEqual(state.assigned, [{ part: "communion1", song }]);
  assert.deepEqual(state.cleared, ["communion1"]);
});

test("loading song details has distinct success and failure status", async () => {
  const state = harness();
  state.setStore({
    async getSong(id) {
      if (id === "missing") throw new Error("missing");
      return { id, title: "Song", lyrics: "Private editor detail" };
    },
  });

  const song = await state.controller.load("song-1");
  assert.equal(song.lyrics, "Private editor detail");
  assert.deepEqual(state.statuses, [
    { text: "Loading song…", kind: "" },
    { text: "Up to date", kind: "saved" },
  ]);

  await assert.rejects(state.controller.load("missing"), /missing/);
  assert.deepEqual(state.statuses.slice(-1), [{
    text: "Could not load song",
    kind: "error",
  }]);
});

test("updating a song replaces every live use and schedules one embedding sync", async () => {
  const state = harness();
  const syncIds = [];
  state.setStore({
    async updateSong(id, draft) {
      return { id, ...draft };
    },
    async syncSongEmbedding(id) {
      syncIds.push(id);
    },
  });

  const updated = await state.controller.save({
    existingSong: { id: "song-1", title: "Old" },
    part: "entrance",
    draft: { title: "Updated" },
  });
  await tick();

  assert.deepEqual(updated, { id: "song-1", title: "Updated" });
  assert.deepEqual(state.updated, [updated]);
  assert.deepEqual(state.assigned, []);
  assert.deepEqual(syncIds, ["song-1"]);
});

test("creating a song atomically assigns it and indexing failure does not undo the save", async () => {
  const state = harness();
  state.setStore({
    async createAndAssignSong(date, part, draft) {
      assert.equal(date, "2026-08-02");
      assert.equal(part, "offertory");
      return { id: "song-new", ...draft };
    },
    async syncSongEmbedding() {
      throw new Error("index unavailable");
    },
  });

  const created = await state.controller.save({
    existingSong: null,
    part: "offertory",
    draft: { title: "New Song" },
  });
  await tick();

  assert.equal(created.id, "song-new");
  assert.deepEqual(state.assigned, [{ part: "offertory", song: created }]);
  assert.equal(state.warnings.length, 1);
  assert.deepEqual(state.statuses.slice(-1), [{ text: "Saved", kind: "saved" }]);
});

test("database failures report failure and do not change local song state", async () => {
  const state = harness();
  state.setStore({
    async clearSong() {
      throw new Error("database unavailable");
    },
  });

  await assert.rejects(state.controller.clear("entrance"), /database unavailable/);

  assert.deepEqual(state.cleared, []);
  assert.deepEqual(state.statuses.slice(-1), [{ text: "Save failed", kind: "error" }]);
  assert.equal(state.errors.length, 1);
});
