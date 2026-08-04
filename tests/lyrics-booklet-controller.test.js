const test = require("node:test");
const assert = require("node:assert/strict");

const LyricsPresentation = require("../src/domain/lyrics-presentation.js");
const LyricsExportController = require("../src/app/lyrics-export-controller.js");
const LyricsBookletController = require("../src/app/lyrics-booklet-controller.js");

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
  details = {
    "song-a": {
      id: "song-a",
      title: "Song A",
      authors: "Author",
      lyrics: "Line one\nLine two",
    },
  },
} = {}) {
  const button = element();
  const status = element();
  const fetched = [];
  const built = [];
  const saved = [];
  function FakeJsPDF() {}
  const controller = LyricsBookletController.create({
    button,
    status,
    parts: [
      { key: "entrance", label: "Entrance" },
      { key: "communion", label: "Communion" },
    ],
    presentation: LyricsPresentation,
    exportController: LyricsExportController,
    booklet: {
      buildPdf(JsPDF, values) {
        built.push({ JsPDF, assignments: values.assignments.length });
        return { save(name) { saved.push(name); } };
      },
      fileName(date) {
        return `st-james-booklet-${date}.pdf`;
      },
    },
    loadJsPdf: async () => FakeJsPDF,
    getStore: () => ({
      async getSong(id) {
        fetched.push(id);
        return details[id];
      },
    }),
    getSongs: () => ({
      entrance: { id: "song-a", title: "Song A" },
      communion: { id: "song-a", title: "Song A" },
    }),
    getDate: () => "2026-08-02",
    getValues: () => ({ day: "18th Sunday", meta: "Sunday · Year A" }),
    canReadLyrics: () => editor,
    isOnline: () => online,
    logger: { error() {} },
  });
  controller.start();
  return { button, controller, fetched, built, saved, status, FakeJsPDF };
}

test("booklet export fetches each private song once and downloads the PDF", async () => {
  const { button, fetched, built, saved, status, FakeJsPDF } = setup();
  await button.click();

  assert.deepEqual(fetched, ["song-a"]);
  assert.deepEqual(built, [{ JsPDF: FakeJsPDF, assignments: 2 }]);
  assert.deepEqual(saved, ["st-james-booklet-2026-08-02.pdf"]);
  assert.match(status.textContent, /^Booklet downloaded\. Print double-sided/);
  assert.equal(status.dataset.state, "success");
  assert.equal(button.disabled, false);
});

test("booklet export blocks when selected lyrics are missing", async () => {
  const { button, built, status } = setup({
    details: { "song-a": { id: "song-a", title: "Song A", lyrics: "" } },
  });
  await button.click();

  assert.equal(built.length, 0);
  assert.equal(status.textContent, "Add lyrics for: Song A.");
  assert.equal(status.dataset.state, "error");
});

test("booklet action is hidden and rejected without choir access", async () => {
  const { button, controller, built, status } = setup({ editor: false });
  assert.equal(button.hidden, true);
  await controller.download();
  assert.equal(built.length, 0);
  assert.equal(status.textContent, "Choir member access required.");
});
