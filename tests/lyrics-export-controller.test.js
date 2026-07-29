const test = require("node:test");
const assert = require("node:assert/strict");

const LyricsExportController = require("../src/app/lyrics-export-controller.js");

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
  store = { async getSong(id) { return { id, title: id, lyrics: "A lyric" }; } },
  build = async ({ setStatus }) => setStatus("Done.", "success"),
} = {}) {
  const button = element();
  const status = element();
  const builds = [];
  const controller = LyricsExportController.create({
    button,
    status,
    parts: [
      { key: "entrance", label: "Entrance" },
      { key: "communion", label: "Communion" },
    ],
    presentation: {
      selectedAssignments(parts, songs, detailsById, weeklyByPart) {
        return parts.flatMap(part => {
          const selected = songs[part.key];
          if (!selected?.id) return [];
          const detail = detailsById.get(selected.id) || selected;
          return [{
            partKey: part.key,
            partLabel: part.label,
            songId: selected.id,
            ...detail,
            lyrics: weeklyByPart?.[part.key]?.lyrics || detail.lyrics,
          }];
        });
      },
      missingLyrics(assignments) {
        return assignments.filter(assignment => !assignment.lyrics);
      },
    },
    getStore: () => store,
    getSongs: () => ({
      entrance: { id: "song-a", title: "Song A" },
      communion: { id: "song-a", title: "Song A" },
    }),
    getDate: () => "2026-08-02",
    getValues: () => ({ day: "18th Sunday", meta: "Sunday · Year A" }),
    isEditor: () => editor,
    isOnline: () => online,
    preparingMessage: "Preparing…",
    errorMessage: "Could not build. Try again.",
    errorLogLabel: "Could not build",
    logger: { error() {} },
    async build(args) {
      builds.push(args);
      await build(args);
    },
  });
  controller.start();
  return { button, builds, controller, status };
}

test("run fetches each unique song once and hands assignments to build", async () => {
  const fetched = [];
  const { builds, button, status } = setup({
    store: {
      async getSong(id) {
        fetched.push(id);
        return { id, title: id, lyrics: "A lyric" };
      },
    },
  });
  await button.click();

  assert.deepEqual(fetched, ["song-a"]);
  assert.equal(builds.length, 1);
  assert.equal(builds[0].assignments.length, 2);
  assert.equal(builds[0].date, "2026-08-02");
  assert.deepEqual(builds[0].values, { day: "18th Sunday", meta: "Sunday · Year A" });
  assert.equal(status.textContent, "Done.");
  assert.equal(status.dataset.state, "success");
  assert.equal(button.disabled, false);
});

test("run uses the selected Sunday's edited lyrics without changing canonical lyrics", async () => {
  const { builds, button } = setup({
    store: {
      async getSong(id) {
        return { id, title: "Psalm", lyrics: "Canonical response\n\nVerse 1" };
      },
      async getWeeklyLyrics(date) {
        assert.equal(date, "2026-08-02");
        return {
          entrance: {
            songId: "song-a",
            lyrics: "Edited response",
          },
        };
      },
    },
  });

  await button.click();

  assert.equal(builds[0].assignments[0].lyrics, "Edited response");
  assert.equal(builds[0].assignments[1].lyrics, "Canonical response\n\nVerse 1");
});

test("missing lyrics block the build and identify only the affected song", async () => {
  const { builds, button, status } = setup({
    store: { async getSong(id) { return { id, title: "Song A", lyrics: "" }; } },
  });
  await button.click();

  assert.equal(builds.length, 0);
  assert.equal(status.textContent, "Add lyrics for: Song A.");
  assert.equal(status.dataset.state, "error");
});

test("the action is hidden and rejected without editor access", async () => {
  const { builds, button, controller, status } = setup({ editor: false });
  assert.equal(button.hidden, true);
  await controller.run();
  assert.equal(builds.length, 0);
  assert.equal(status.textContent, "Editor access required.");
});

test("the action is rejected while offline", async () => {
  const { builds, button, status } = setup({ online: false });
  await button.click();
  assert.equal(builds.length, 0);
  assert.equal(status.textContent, "Connect to the internet to fetch private lyrics.");
});

test("the action waits for the store to connect", async () => {
  const builds = [];
  const button = element();
  const status = element();
  const controller = LyricsExportController.create({
    button,
    status,
    parts: [{ key: "entrance", label: "Entrance" }],
    presentation: {
      selectedAssignments: () => [{ partLabel: "Entrance", title: "Song A", lyrics: "A lyric" }],
      missingLyrics: () => [],
    },
    getStore: () => null,
    getSongs: () => ({ entrance: { id: "song-a" } }),
    getDate: () => "2026-08-02",
    getValues: () => ({ day: "18th Sunday", meta: "" }),
    isEditor: () => true,
    isOnline: () => true,
    preparingMessage: "Preparing…",
    errorMessage: "Could not build. Try again.",
    errorLogLabel: "Could not build",
    logger: { error() {} },
    async build(args) { builds.push(args); },
  });
  controller.start();
  await button.click();

  assert.equal(builds.length, 0);
  assert.equal(status.textContent, "Still connecting. Try again in a moment.");
  assert.equal(status.dataset.state, "error");
});

test("the action requires at least one selected song", async () => {
  const builds = [];
  const button = element();
  const status = element();
  const controller = LyricsExportController.create({
    button,
    status,
    parts: [{ key: "entrance", label: "Entrance" }],
    presentation: {
      selectedAssignments: () => [],
      missingLyrics: () => [],
    },
    getStore: () => ({ async getSong() { return {}; } }),
    getSongs: () => ({}),
    getDate: () => "2026-08-02",
    getValues: () => ({ day: "18th Sunday", meta: "" }),
    isEditor: () => true,
    isOnline: () => true,
    preparingMessage: "Preparing…",
    errorMessage: "Could not build. Try again.",
    errorLogLabel: "Could not build",
    logger: { error() {} },
    async build(args) { builds.push(args); },
  });
  controller.start();
  await controller.run();

  assert.equal(builds.length, 0);
  assert.equal(status.textContent, "Choose at least one song first.");
  assert.equal(status.dataset.state, "error");
});

test("a run in progress ignores a second concurrent click", async () => {
  let releaseFirstBuild;
  let signalBuildStarted;
  const buildStarted = new Promise(resolve => { signalBuildStarted = resolve; });
  const started = [];
  const button = element();
  const status = element();
  const controller = LyricsExportController.create({
    button,
    status,
    parts: [{ key: "entrance", label: "Entrance" }],
    presentation: {
      selectedAssignments: () => [{ partLabel: "Entrance", title: "Song A", lyrics: "A lyric" }],
      missingLyrics: () => [],
    },
    getStore: () => ({ async getSong(id) { return { id, lyrics: "A lyric" }; } }),
    getSongs: () => ({ entrance: { id: "song-a" } }),
    getDate: () => "2026-08-02",
    getValues: () => ({ day: "18th Sunday", meta: "" }),
    isEditor: () => true,
    isOnline: () => true,
    preparingMessage: "Preparing…",
    errorMessage: "Could not build. Try again.",
    errorLogLabel: "Could not build",
    logger: { error() {} },
    async build() {
      started.push(Date.now());
      signalBuildStarted();
      await new Promise(resolve => { releaseFirstBuild = resolve; });
    },
  });
  controller.start();

  const first = button.click();
  assert.equal(button.disabled, true);
  const second = button.click();
  await buildStarted;

  releaseFirstBuild();
  await Promise.all([first, second]);

  assert.equal(started.length, 1);
  assert.equal(button.disabled, false);
});

test("stop unbinds the click listener", async () => {
  const { builds, button, controller } = setup();
  controller.stop();
  await button.click();
  assert.equal(builds.length, 0);
});

test("build errors are logged and surfaced as the configured error message", async () => {
  const errors = [];
  const button = element();
  const status = element();
  const controller = LyricsExportController.create({
    button,
    status,
    parts: [{ key: "entrance", label: "Entrance" }],
    presentation: {
      selectedAssignments: () => [{ partLabel: "Entrance", title: "Song A", lyrics: "A lyric" }],
      missingLyrics: () => [],
    },
    getStore: () => ({ async getSong(id) { return { id, lyrics: "A lyric" }; } }),
    getSongs: () => ({ entrance: { id: "song-a" } }),
    getDate: () => "2026-08-02",
    getValues: () => ({ day: "18th Sunday", meta: "" }),
    isEditor: () => true,
    isOnline: () => true,
    preparingMessage: "Preparing…",
    errorMessage: "Could not build. Try again.",
    errorLogLabel: "Could not build",
    logger: { error: (label, error) => errors.push({ label, error }) },
    async build() {
      throw new Error("boom");
    },
  });
  controller.start();
  await controller.run();

  assert.equal(status.textContent, "Could not build. Try again.");
  assert.equal(status.dataset.state, "error");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].label, "Could not build");
  assert.equal(errors[0].error.message, "boom");
});
