const test = require("node:test");
const assert = require("node:assert/strict");

const storeModule = require("../src/services/plan-store.js");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

const planData = {
  emptyPlan() {
    return { songs: {}, readingOverrides: {}, celebrationOverride: null };
  },
};

const songCatalog = {
  search(songs, query) {
    const needle = query.toLowerCase();
    return songs.filter(song => song.title.toLowerCase().includes(needle));
  },
  validateDraft(draft) {
    if (!draft.title?.trim()) return { valid: false, error: "Song title required" };
    return {
      valid: true,
      value: {
        title: draft.title.trim(),
        youtubeUrl: draft.youtubeUrl || "",
        authors: draft.authors || "",
        copyrightOwner: draft.copyrightOwner || "",
        copyrightYear: draft.copyrightYear || "",
        source: draft.source || "",
        lyrics: draft.lyrics || "",
        suggestionParts: draft.suggestionParts || [],
      },
    };
  },
};

function createStore(storage = memoryStorage()) {
  return storeModule.localStore({
    storage,
    planData,
    songCatalog,
    randomUUID: () => "song-1",
    logger: { warn() {} },
  });
}

test("local plan subscriptions tolerate corrupted cached records", () => {
  const store = createStore(memoryStorage({
    "st-james-plan-v2-2026-08-02": "{bad plan",
    "st-james-song-catalog-v1": "{bad songs",
  }));
  const values = [];

  store.subscribePlan("2026-08-02", (plan, status) => values.push({ plan, status }));

  assert.deepEqual(values, [{
    plan: { songs: {}, readingOverrides: {}, celebrationOverride: null },
    status: { offline: true },
  }]);
});

test("local plan mutations enforce editor access and never publish lyrics", async () => {
  const store = createStore();
  const plans = [];
  const authStates = [];
  store.subscribePlan("2026-08-02", plan => plans.push(plan));
  store.subscribeAuth(state => authStates.push(state));

  await assert.rejects(
    store.createAndAssignSong("2026-08-02", "entrance", { title: "Gather Us In" }),
    /Sign in before editing/,
  );

  await store.signIn();
  await assert.rejects(
    store.assignSong("2026-08-02", "entrance", "missing"),
    /Song not found/,
  );
  const created = await store.createAndAssignSong("2026-08-02", "entrance", {
    title: "  Gather Us In  ",
    authors: "Marty Haugen",
    lyrics: "Here in this place",
    suggestionParts: ["entrance"],
  });
  assert.equal(created.id, "song-1");
  assert.equal((await store.getSong("song-1")).lyrics, "Here in this place");
  assert.deepEqual(plans.at(-1).songs.entrance, {
    id: "song-1",
    title: "Gather Us In",
    youtubeUrl: "",
    authors: "Marty Haugen",
    copyrightOwner: "",
    copyrightYear: "",
    source: "",
    suggestionParts: ["entrance"],
  });
  assert.equal(Object.hasOwn(plans.at(-1).songs.entrance, "lyrics"), false);

  await store.saveReadingOverride("2026-08-02", "first", {
    citation: "Isaiah 1:1",
    text: "A reading",
  });
  assert.equal(plans.at(-1).readingOverrides.first.citation, "Isaiah 1:1");

  await store.saveCelebrationOverride("2026-08-02", {
    key: "saint-example",
    title: "Example solemnity",
  });
  assert.deepEqual(plans.at(-1).readingOverrides, {});
  assert.equal(plans.at(-1).celebrationOverride.key, "saint-example");

  await store.signOut();
  await assert.rejects(store.clearSong("2026-08-02", "entrance"), /Sign in before editing/);
  assert.deepEqual(authStates.map(state => state.isEditor), [false, true, false]);
});
