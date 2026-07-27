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
  planFromRow(row) {
    return row?.mappedPlan || this.emptyPlan();
  },
  songFromRow(row) {
    return row;
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

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function supabaseFixture(planResult) {
  const calls = { selects: [], rpcs: [], removedChannels: [] };
  const channel = {
    on() {
      return channel;
    },
    subscribe() {
      return channel;
    },
  };
  const supabase = {
    from(table) {
      const query = {
        select(columns) {
          calls.selects.push({ table, columns });
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle() {
          return planResult;
        },
      };
      return query;
    },
    channel() {
      return channel;
    },
    removeChannel(value) {
      calls.removedChannels.push(value);
    },
    rpc(name, params) {
      calls.rpcs.push({ name, params });
      return Promise.resolve({
        data: name === "create_and_assign_song" ? "song-2" : null,
        error: null,
      });
    },
    functions: {
      invoke() {
        return Promise.resolve({ data: {}, error: null });
      },
    },
    auth: {},
  };
  return { calls, channel, supabase };
}

test("Supabase plan subscription drops a late network result after unsubscribe", async () => {
  const pending = deferred();
  const cachedPlan = {
    songs: { entrance: { id: "cached", title: "Cached song" } },
    readingOverrides: {},
    celebrationOverride: null,
  };
  const storage = memoryStorage({
    "st-james-plan-cache-v2-2026-08-02": JSON.stringify(cachedPlan),
  });
  const { calls, channel, supabase } = supabaseFixture(pending.promise);
  const store = storeModule.createSupabaseStore(supabase, {
    storage,
    planData,
    songCatalog,
    random: () => 0.5,
  });
  const values = [];

  const unsubscribe = store.subscribePlan(
    "2026-08-02",
    (plan, status) => values.push({ plan, status }),
  );
  unsubscribe();
  pending.resolve({
    data: {
      mappedPlan: {
        songs: { entrance: { id: "live", title: "Live song" } },
        readingOverrides: {},
        celebrationOverride: null,
      },
    },
    error: null,
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(values, [{ plan: cachedPlan, status: { offline: true } }]);
  assert.deepEqual(calls.removedChannels, [channel]);
  assert.doesNotMatch(calls.selects[0].columns, /song_lyrics/);
});

test("Supabase plan song creation maps validated drafts to the atomic RPC", async () => {
  const { calls, supabase } = supabaseFixture(Promise.resolve({ data: null, error: null }));
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage(),
    planData,
    songCatalog,
  });

  const created = await store.createAndAssignSong("2026-08-02", "entrance", {
    title: "  New Song  ",
    authors: "Composer",
    suggestionParts: [],
  });

  assert.equal(created.id, "song-2");
  assert.deepEqual(calls.rpcs[0], {
    name: "create_and_assign_song",
    params: {
      p_sunday: "2026-08-02",
      p_part: "entrance",
      p_title: "New Song",
      p_youtube_url: "",
      p_authors: "Composer",
      p_copyright_owner: "",
      p_copyright_year: "",
      p_source: "",
      p_lyrics: null,
      p_suggestion_parts: [],
    },
  });
});

test("Supabase plan load failures reach the subscription error handler", async () => {
  const failure = new Error("Network unavailable");
  const { supabase } = supabaseFixture(Promise.resolve({ data: null, error: failure }));
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage(),
    planData,
    songCatalog,
  });
  const errors = [];

  const unsubscribe = store.subscribePlan(
    "2026-08-02",
    () => {},
    error => errors.push(error),
  );
  await new Promise(resolve => setImmediate(resolve));
  unsubscribe();

  assert.deepEqual(errors, [failure]);
});
