const test = require("node:test");
const assert = require("node:assert/strict");

const WeeklyLyrics = require("../src/domain/weekly-lyrics.js");
const WeeklyLyricsController = require("../src/app/weekly-lyrics-controller.js");

function target(properties = {}) {
  const listeners = new Map();
  return {
    hidden: false,
    textContent: "",
    ...properties,
    listeners,
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(store) {
  let sunday = "2026-08-02";
  let songs = {
    entrance: { id: "entrance-song", title: "Entrance song" },
    communion: { id: "communion-song", title: "Communion song" },
  };
  const opened = [];
  const statuses = [];
  const summaries = [];
  const elements = {
    musicList: target(),
    dialog: target({
      open: false,
      close() { this.open = false; },
    }),
    form: target(),
    eyebrow: target(),
    title: target(),
    context: target(),
    close: target(),
    cancel: target(),
    save: target({ disabled: false }),
    reset: target({ disabled: false }),
    error: target(),
    customNotice: target(),
    previous: target(),
    previousButton: target(),
    previousMeta: target(),
    textEditor: target(),
    textarea: target({ value: "", focus() {} }),
    psalmEditor: target(),
    psalmSections: target({
      innerHTML: "",
      querySelector() { return null; },
    }),
    psalmFallback: target(),
  };
  const controller = WeeklyLyricsController.create({
    elements,
    parts: [
      { key: "entrance", label: "Entrance" },
      { key: "communion", label: "Communion" },
    ],
    weeklyLyrics: WeeklyLyrics,
    getStore: () => store,
    getSongs: () => songs,
    getDate: () => sunday,
    isEditor: () => true,
    isOnline: () => true,
    openModal(dialog) {
      dialog.open = true;
      opened.push(elements.title.textContent);
    },
    onStatus: (message, kind) => statuses.push({ message, kind }),
    onSummaryChanged: parts => summaries.push([...parts]),
    formatDate: value => value,
    schedule: callback => callback(),
    logger: { error() {}, warn() {} },
  });
  controller.start();
  return {
    controller,
    elements,
    opened,
    statuses,
    summaries,
    setSunday(value) { sunday = value; },
    setSongs(value) { songs = value; },
  };
}

test("only the latest overlapping weekly-editor open can commit controller state", async () => {
  const entrance = deferred();
  const communion = deferred();
  const saves = [];
  const contextCalls = [];
  const state = harness({
    getSong(id) {
      return id === "entrance-song" ? entrance.promise : communion.promise;
    },
    async getWeeklyLyricsContext(sunday, part, songId) {
      contextCalls.push({ sunday, part, songId });
      return { current: null, previous: null };
    },
    async saveWeeklyLyrics(...args) { saves.push(args); },
    async getWeeklyLyricsParts() { return []; },
  });

  const first = state.controller.open("entrance");
  const second = state.controller.open("communion");
  communion.resolve({
    id: "communion-song",
    title: "Communion song",
    lyrics: "Communion canonical lyrics",
  });
  await second;
  entrance.resolve({
    id: "entrance-song",
    title: "Entrance song",
    lyrics: "Entrance canonical lyrics",
  });
  await first;

  assert.deepEqual(state.opened, ["Communion song"]);
  assert.equal(state.elements.title.textContent, "Communion song");
  assert.deepEqual(contextCalls.map(call => call.part).sort(), ["communion", "entrance"]);

  state.elements.textarea.value = "Communion weekly edit";
  await state.elements.form.listeners.get("submit")({ preventDefault() {} });
  assert.deepEqual(saves, [[
    "2026-08-02",
    "communion",
    "communion-song",
    "Communion weekly edit",
  ]]);
});

test("weekly reset is scoped to the Sunday and song captured when the editor opened", async () => {
  const clears = [];
  const state = harness({
    async getSong(id) {
      return { id, title: "Entrance song", lyrics: "Canonical lyrics" };
    },
    async getWeeklyLyricsContext() {
      return {
        current: { lyrics: "Edited lyrics" },
        previous: null,
      };
    },
    async clearWeeklyLyrics(...args) { clears.push(args); },
    async getWeeklyLyricsParts() { return ["entrance"]; },
  });

  await state.controller.open("entrance");
  await state.elements.reset.listeners.get("click")();
  assert.deepEqual(clears, [[
    "2026-08-02",
    "entrance",
    "entrance-song",
  ]]);

  await state.controller.open("entrance");
  state.setSunday("2026-08-09");
  await state.elements.reset.listeners.get("click")();
  assert.equal(clears.length, 1);
  assert.match(state.elements.error.textContent, /selected Sunday changed/i);
});
