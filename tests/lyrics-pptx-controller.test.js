const test = require("node:test");
const assert = require("node:assert/strict");

const LyricsExportController = require("../src/app/lyrics-export-controller.js");
const LyricsPptxController = require("../src/app/lyrics-pptx-controller.js");
const LyricsPresentation = require("../src/domain/lyrics-presentation.js");

function element() {
  const listeners = new Map();
  return {
    textContent: "",
    dataset: {},
    hidden: false,
    disabled: false,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    click() { return listeners.get("click")?.(); },
  };
}

function setup({
  editor = true,
  online = true,
  songs = {
    entrance: { id: "song-a", title: "Song A" },
    communion: { id: "song-a", title: "Song A" },
  },
  details = {
    "song-a": { id: "song-a", title: "Song A", lyrics: "Line one\nLine two" },
  },
} = {}) {
  const button = element();
  const status = element();
  const fetched = [];
  const writes = [];
  const store = {
    async getSong(id) {
      fetched.push(id);
      return details[id];
    },
  };
  class FakePptx {}
  const presentation = {
    ...LyricsPresentation,
    buildDeck(PptxGenJS, values) {
      assert.equal(PptxGenJS, FakePptx);
      return {
        async writeFile(options) {
          writes.push({ options, values });
        },
      };
    },
  };
  const controller = LyricsPptxController.create({
    button,
    status,
    document: { baseURI: "https://example.test/sundaymass/" },
    parts: [
      { key: "entrance", label: "Entrance" },
      { key: "communion", label: "Communion" },
    ],
    presentation,
    exportController: LyricsExportController,
    getStore: () => store,
    getSongs: () => songs,
    getDate: () => "2026-08-02",
    getValues: () => ({ day: "18th Sunday", meta: "Sunday · Year A" }),
    canReadLyrics: () => editor,
    isOnline: () => online,
    loadPptx: async () => FakePptx,
    logger: { error() {} },
  });
  controller.start();
  return { button, controller, fetched, status, writes };
}

test("authorized lyric export fetches each private song once and preserves repeated assignments", async () => {
  const { button, fetched, status, writes } = setup();
  await button.click();

  assert.deepEqual(fetched, ["song-a"]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].values.assignments.length, 2);
  assert.equal(writes[0].options.fileName, "st-james-lyrics-2026-08-02.pptx");
  assert.equal(status.textContent, "PowerPoint downloaded.");
  assert.equal(status.dataset.state, "success");
  assert.equal(button.disabled, false);
});

test("missing lyrics block the deck and identify only the affected song", async () => {
  const { button, status, writes } = setup({
    details: { "song-a": { id: "song-a", title: "Song A", lyrics: "" } },
  });
  await button.click();

  assert.equal(writes.length, 0);
  assert.equal(status.textContent, "Add lyrics for: Song A.");
  assert.equal(status.dataset.state, "error");
});

test("the export action is hidden and rejected without choir access", async () => {
  const { button, controller, status, writes } = setup({ editor: false });
  assert.equal(button.hidden, true);
  await controller.download();
  assert.equal(writes.length, 0);
  assert.equal(status.textContent, "Choir member access required.");
});
