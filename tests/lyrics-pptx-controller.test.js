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
  importModule = null,
  logged = [],
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
    ...(importModule
      ? { importModule }
      : { loadPptx: async () => FakePptx }),
    logger: { error: (...values) => logged.push(values) },
  });
  controller.start();
  return { button, controller, fetched, logged, status, writes };
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

// The export bundles are deliberately not precached by the service worker, so fetching
// one needs the network even when `navigator.onLine` reports a connection. A failed
// module fetch told the editor "Could not build the PowerPoint" and filed a Sentry
// fault; it is a connectivity condition, and it says so.
test("a vendor bundle that cannot be fetched reports connectivity, not a fault", async () => {
  const failure = new TypeError(
    "Failed to fetch dynamically imported module: "
    + "https://tow.github.io/sundaymass/vendor/pptxgenjs.js?v=29194f6ff252",
  );
  const { button, logged, status, writes } = setup({
    importModule: async () => { throw failure; },
  });
  await button.click();

  assert.equal(writes.length, 0);
  assert.equal(status.textContent, "Export unavailable — check your connection and try again.");
  assert.equal(status.dataset.state, "error");
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1].expected, true);
  assert.equal(logged[0][1].cause, failure);
});

test("a broken vendor bundle stays a fault", async () => {
  const failure = new SyntaxError("Unexpected token '<'");
  const { button, logged, status } = setup({
    importModule: async () => { throw failure; },
  });
  await button.click();

  assert.equal(status.dataset.state, "error");
  assert.equal(logged[0][1], failure);
  assert.notEqual(logged[0][1].expected, true);
});
