const test = require("node:test");
const assert = require("node:assert/strict");

const SongPickerController = require("../src/app/song-picker-controller.js");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function harness() {
  let editor = true;
  let store = null;
  const states = [];
  const warnings = [];
  const errors = [];
  const controller = SongPickerController.create({
    getStore: () => store,
    isEditor: () => editor,
    getPreviousDate: () => "2026-07-26",
    getReadingCitations: () => ["Isaiah 55:1-3", "John 6:24-35"],
    suggestionPartFor: part => part === "communion_2" ? "communion" : part,
    onChange: state => states.push(state),
    logger: {
      warn: (...values) => warnings.push(values),
      error: (...values) => errors.push(values),
    },
  });
  return {
    controller,
    states,
    warnings,
    errors,
    setEditor(value) { editor = value; },
    setStore(value) { store = value; },
  };
}

test("opening resets picker state and requests three position-filtered suggestions", async () => {
  const state = harness();
  const suggestionCalls = [];
  state.setStore({
    async suggestSongs(citations, part) {
      suggestionCalls.push({ citations, part });
      return [
        { id: "one", title: "One" },
        { id: "two", title: "Two" },
        { id: "three", title: "Three" },
        { id: "four", title: "Four" },
      ];
    },
  });

  assert.equal(await state.controller.open("communion_2"), true);

  assert.deepEqual(suggestionCalls, [{
    citations: ["Isaiah 55:1-3", "John 6:24-35"],
    part: "communion",
  }]);
  assert.deepEqual(state.controller.state(), {
    open: true,
    partKey: "communion_2",
    selectedSong: null,
    previousSong: null,
    previousStatus: "empty",
    searchResults: [],
    searchStatus: "idle",
    suggestions: [
      { id: "one", title: "One" },
      { id: "two", title: "Two" },
      { id: "three", title: "Three" },
    ],
    suggestionStatus: "ready",
  });
  assert.equal(state.states[0].suggestionStatus, "loading");
});

test("opening loads the matching part from the previous Sunday", async () => {
  const state = harness();
  const planCalls = [];
  const previousSong = { id: "last-week", title: "Last week's Communion" };
  state.setStore({
    async getPlan(date) {
      planCalls.push(date);
      return { songs: { communion2: previousSong } };
    },
    async suggestSongs() {
      return [];
    },
  });

  await state.controller.open("communion2");

  assert.deepEqual(planCalls, ["2026-07-26"]);
  assert.equal(state.states[0].previousStatus, "loading");
  assert.deepEqual(state.controller.state().previousSong, previousSong);
  assert.equal(state.controller.state().previousStatus, "ready");
});

test("opening is unavailable without editor access or a connected store", async () => {
  const state = harness();
  state.setEditor(false);
  assert.equal(await state.controller.open("entrance"), false);
  assert.equal(state.states.length, 0);

  state.setEditor(true);
  assert.equal(await state.controller.open("entrance"), false);
  assert.equal(state.states.length, 0);
});

test("only the latest catalogue search can replace results", async () => {
  const state = harness();
  const first = deferred();
  const second = deferred();
  state.setStore({
    suggestSongs: async () => [],
    searchSongs(query) {
      return query === "am" ? first.promise : second.promise;
    },
  });
  await state.controller.open("entrance");

  const firstSearch = state.controller.search("am");
  const secondSearch = state.controller.search("amen");
  second.resolve([{ id: "new", title: "Amen" }]);
  await secondSearch;
  first.resolve([{ id: "old", title: "Amazing Grace" }]);
  await firstSearch;

  assert.deepEqual(state.controller.state().searchResults, [
    { id: "new", title: "Amen" },
  ]);
  assert.equal(state.controller.state().searchStatus, "ready");
});

test("closing invalidates late searches, suggestions, and previous plans", async () => {
  const state = harness();
  const suggestions = deferred();
  const search = deferred();
  const previousPlan = deferred();
  state.setStore({
    getPlan: () => previousPlan.promise,
    suggestSongs: () => suggestions.promise,
    searchSongs: () => search.promise,
  });

  const opening = state.controller.open("offertory");
  const searching = state.controller.search("gift");
  state.controller.close();
  suggestions.resolve([{ id: "late-suggestion", title: "Late" }]);
  search.resolve([{ id: "late-search", title: "Late" }]);
  previousPlan.resolve({
    songs: { offertory: { id: "late-previous", title: "Late" } },
  });
  await Promise.all([opening, searching]);

  assert.deepEqual(state.controller.state(), {
    open: false,
    partKey: "offertory",
    selectedSong: null,
    previousSong: null,
    previousStatus: "idle",
    searchResults: [],
    searchStatus: "idle",
    suggestions: [],
    suggestionStatus: "idle",
  });
});

test("selection uses record identity from either visible collection", async () => {
  const state = harness();
  state.setStore({
    suggestSongs: async () => [{ id: "suggested", title: "Shared title" }],
    searchSongs: async () => [{ id: "searched", title: "Shared title" }],
  });
  await state.controller.open("entrance");

  assert.equal(state.controller.selectSuggestion(0).id, "suggested");
  assert.equal(state.controller.state().selectedSong.id, "suggested");
  await state.controller.search("Shared title");
  assert.equal(state.controller.state().selectedSong, null);
  assert.equal(state.controller.selectSearchResult(0).id, "searched");
  assert.equal(state.controller.selectSearchResult(99), null);
});

test("search and suggestion failures become explicit states without throwing", async () => {
  const state = harness();
  state.setStore({
    async suggestSongs() { throw new Error("suggestion failure"); },
    async searchSongs() { throw new Error("search failure"); },
  });

  await state.controller.open("entrance");
  await state.controller.search("song");

  assert.equal(state.controller.state().suggestionStatus, "error");
  assert.equal(state.controller.state().searchStatus, "error");
  assert.equal(state.warnings.length, 1);
  assert.equal(state.errors.length, 1);
});
