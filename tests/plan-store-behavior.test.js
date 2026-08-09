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
        youtubeVideoId: draft.youtubeVideoId || "",
        authors: draft.authors || "",
        copyrightOwner: draft.copyrightOwner || "",
        copyrightYear: draft.copyrightYear || "",
        source: draft.source || "",
        responsorialBook: draft.responsorialBook || "",
        responsorialNumber: draft.responsorialNumber || null,
        responsorialCitations: draft.responsorialCitations || [],
        lyrics: draft.lyrics || "",
        inRepertoire: draft.inRepertoire !== false,
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

test("auth state gives editor membership precedence over choir membership", () => {
  assert.deepEqual(
    storeModule.authState({ id: "user-1" }, { isChoirMember: true, isEditor: true }),
    {
      user: { id: "user-1" },
      isChoirMember: false,
      isEditor: true,
      canReadLyrics: true,
      accessLevel: "editor",
    },
  );
});

test("Supabase choir sign-in supplies the configured identity behind the password-only UI", async () => {
  const credentials = [];
  const store = storeModule.createSupabaseStore({
    auth: {
      async signInWithPassword(value) {
        credentials.push(value);
        return { error: null };
      },
    },
  }, {
    storage: memoryStorage(),
    planData,
    songCatalog,
    choirEmail: "shared-choir@example.test",
  });

  await store.signInChoir("shared password");
  assert.deepEqual(credentials, [{
    email: "shared-choir@example.test",
    password: "shared password",
  }]);
});

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
    /Editor access required/,
  );

  await store.signInChoir();
  await assert.rejects(
    store.createAndAssignSong("2026-08-02", "entrance", { title: "Gather Us In" }),
    /Editor access required/,
  );
  await store.signInEditor();
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
    youtubeVideoId: "",
    youtubeUrl: "",
    authors: "Marty Haugen",
    copyrightOwner: "",
    copyrightYear: "",
    source: "",
    responsorialBook: "",
    responsorialNumber: null,
    responsorialCitations: [],
    suggestionParts: ["entrance"],
  });
  assert.equal(Object.hasOwn(plans.at(-1).songs.entrance, "lyrics"), false);
  assert.deepEqual((await store.getPlan("2026-08-02")).songs.entrance, {
    id: "song-1",
    title: "Gather Us In",
    youtubeVideoId: "",
    youtubeUrl: "",
    authors: "Marty Haugen",
    copyrightOwner: "",
    copyrightYear: "",
    source: "",
    responsorialBook: "",
    responsorialNumber: null,
    responsorialCitations: [],
    suggestionParts: ["entrance"],
  });

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
  await assert.rejects(store.getPlan("2026-08-02"), /Editor access required/);
  await assert.rejects(store.clearSong("2026-08-02", "entrance"), /Editor access required/);
  assert.deepEqual(authStates.map(state => state.accessLevel), ["public", "choir", "editor", "public"]);
});

test("local weekly lyrics keep canonical text and offer the newest earlier copy", async () => {
  const store = createStore();
  await store.signIn();
  const song = await store.createAndAssignSong("2026-07-19", "entrance", {
    title: "Reusable hymn",
    lyrics: "Canonical words",
  });
  await store.saveWeeklyLyrics("2026-07-19", "entrance", song.id, "Earlier edited words");
  await store.assignSong("2026-07-26", "entrance", song.id);

  assert.deepEqual(await store.getWeeklyLyricsContext(
    "2026-07-26",
    "entrance",
    song.id,
  ), {
    current: null,
    previous: {
      sunday: "2026-07-19",
      part: "entrance",
      songId: song.id,
      lyrics: "Earlier edited words",
    },
  });
  assert.equal((await store.getSong(song.id)).lyrics, "Canonical words");

  await store.saveWeeklyLyrics("2026-07-26", "entrance", song.id, "This week's words");
  assert.deepEqual(await store.getWeeklyLyricsParts("2026-07-26"), ["entrance"]);
  await store.clearWeeklyLyrics("2026-07-26", "entrance", song.id);
  assert.deepEqual(await store.getWeeklyLyricsParts("2026-07-26"), []);
});

test("local create-and-assign clears the replaced slot's weekly lyric copy", async () => {
  const store = createStore();
  await store.signIn();
  const original = await store.createAndAssignSong("2026-08-02", "entrance", {
    title: "Original song",
    lyrics: "Original canonical lyrics",
  });
  await store.saveWeeklyLyrics(
    "2026-08-02",
    "entrance",
    original.id,
    "Original weekly edit",
  );

  await store.createAndAssignSong("2026-08-02", "entrance", {
    title: "Replacement song",
    lyrics: "Replacement canonical lyrics",
  });

  assert.deepEqual(await store.getWeeklyLyricsParts("2026-08-02"), []);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function supabaseFixture(planResult) {
  const calls = {
    selects: [],
    rpcs: [],
    functionInvokes: [],
    removedChannels: [],
    channelCallbacks: [],
  };
  const channel = {
    on(_event, _filter, callback) {
      calls.channelCallbacks.push(callback);
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
        data: name === "create_and_assign_song"
          ? "song-2"
          : name === "suggest_songs_for_readings"
            ? [{ id: "suggested", title: "Suggested song" }]
            : null,
        error: null,
      });
    },
    functions: {
      invoke(name, options) {
        calls.functionInvokes.push({ name, options });
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

  assert.deepEqual(values, [{ plan: cachedPlan, status: { offline: true, cached: true } }]);
  assert.deepEqual(calls.removedChannels, [channel]);
  assert.doesNotMatch(calls.selects[0].columns, /song_lyrics/);
});

test("Supabase can load a previous plan without subscribing to it", async () => {
  const previousPlan = {
    songs: { entrance: { id: "previous", title: "Previous entrance" } },
    readingOverrides: {},
    celebrationOverride: null,
  };
  const { calls, supabase } = supabaseFixture(Promise.resolve({
    data: { mappedPlan: previousPlan },
    error: null,
  }));
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage(),
    planData,
    songCatalog,
  });

  assert.deepEqual(await store.getPlan("2026-07-26"), previousPlan);
  assert.equal(calls.selects[0].table, "plans");
  assert.doesNotMatch(calls.selects[0].columns, /song_lyrics/);
});

test("public suggestions use the bounded read-only RPC rather than the editor Edge Function", async () => {
  const { calls, supabase } = supabaseFixture(Promise.resolve({ data: null, error: null }));
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage(),
    planData,
    songCatalog,
  });

  assert.deepEqual(
    await store.suggestSongs(["Isaiah 55:1-3"], "communion"),
    [{ id: "suggested", title: "Suggested song" }],
  );
  assert.deepEqual(calls.rpcs, [{
    name: "suggest_songs_for_readings",
    params: {
      p_citations: ["Isaiah 55:1-3"],
      p_part: "communion",
      p_limit: 3,
    },
  }]);
  assert.deepEqual(calls.functionInvokes, []);
});

test("Psalm suggestions use the structured citation RPC instead of semantic search", async () => {
  const { calls, supabase } = supabaseFixture(Promise.resolve({ data: null, error: null }));
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage(),
    planData,
    songCatalog,
  });

  await store.suggestSongs(
    ["Wisdom 18:6-9", "Psalm 33:1, 12, 18-19, 20-22"],
    "psalm",
    "Psalm 33:1, 12, 18-19, 20-22",
  );

  assert.deepEqual(calls.rpcs, [{
    name: "suggest_psalms_for_reading",
    params: {
      p_citation: "Psalm 33:1, 12, 18-19, 20-22",
      p_limit: 3,
    },
  }]);
  assert.deepEqual(calls.functionInvokes, []);
});

function weeklyContextSupabase({ samePart, otherPart }) {
  return {
    from(table) {
      assert.equal(table, "plan_song_lyrics");
      const equals = new Map();
      const notEquals = new Map();
      const query = {
        select() { return query; },
        eq(column, value) {
          equals.set(column, value);
          return query;
        },
        neq(column, value) {
          notEquals.set(column, value);
          return query;
        },
        lt() { return query; },
        order() { return query; },
        limit() { return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          const data = equals.has("sunday")
            ? null
            : equals.has("part")
              ? samePart
              : notEquals.has("part")
                ? otherPart
                : null;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("Supabase weekly lyric reuse chooses the newest date and same-part ties", async () => {
  const samePart = {
    sunday: "2026-07-19",
    part: "entrance",
    song_id: "song-1",
    lyrics: "Entrance edit",
  };
  const sameDateOtherPart = {
    sunday: "2026-07-19",
    part: "offertory",
    song_id: "song-1",
    lyrics: "Offertory edit",
  };
  const tiedStore = storeModule.createSupabaseStore(
    weeklyContextSupabase({ samePart, otherPart: sameDateOtherPart }),
    { storage: memoryStorage(), planData, songCatalog },
  );
  assert.equal(
    (await tiedStore.getWeeklyLyricsContext(
      "2026-08-02",
      "entrance",
      "song-1",
    )).previous.lyrics,
    "Entrance edit",
  );

  const newerOtherPart = {
    ...sameDateOtherPart,
    sunday: "2026-07-26",
    lyrics: "Newer offertory edit",
  };
  const newerStore = storeModule.createSupabaseStore(
    weeklyContextSupabase({ samePart, otherPart: newerOtherPart }),
    { storage: memoryStorage(), planData, songCatalog },
  );
  assert.equal(
    (await newerStore.getWeeklyLyricsContext(
      "2026-08-02",
      "entrance",
      "song-1",
    )).previous.lyrics,
    "Newer offertory edit",
  );
});

test("Supabase auth ignores a stale editor lookup after a newer auth event", async () => {
  const sessionResult = deferred();
  const editorResult = deferred();
  const choirResult = deferred();
  let authCallback;
  const supabase = {
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle() {
          return table === "editors" ? editorResult.promise : choirResult.promise;
        },
      };
      return query;
    },
    auth: {
      getSession() { return sessionResult.promise; },
      onAuthStateChange(callback) {
        authCallback = callback;
        return {
          data: {
            subscription: { unsubscribe() {} },
          },
        };
      },
    },
  };
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage(),
    planData,
    songCatalog,
    defer: callback => callback(),
    logger: { warn() {} },
  });
  const states = [];
  const unsubscribe = store.subscribeAuth(state => states.push(state));

  sessionResult.resolve({
    data: { session: { user: { id: "old-user" } } },
    error: null,
  });
  await new Promise(resolve => setImmediate(resolve));
  authCallback("SIGNED_OUT", null);
  editorResult.resolve({ data: { user_id: "old-user" }, error: null });
  choirResult.resolve({ data: null, error: null });
  await new Promise(resolve => setImmediate(resolve));
  unsubscribe();

  assert.deepEqual(states, [storeModule.authState(null)]);
});

test("Supabase weekly reset includes the song identity", async () => {
  const { calls, supabase } = supabaseFixture(Promise.resolve({ data: null, error: null }));
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage(),
    planData,
    songCatalog,
  });

  await store.clearWeeklyLyrics("2026-08-02", "psalm", "psalm-song-id");

  assert.deepEqual(calls.rpcs, [{
    name: "clear_plan_song_lyrics",
    params: {
      p_sunday: "2026-08-02",
      p_part: "psalm",
      p_song_id: "psalm-song-id",
    },
  }]);
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
      p_youtube_video_id: "",
      p_authors: "Composer",
      p_copyright_owner: "",
      p_copyright_year: "",
      p_source: "",
      p_responsorial_book: "",
      p_responsorial_number: null,
      p_responsorial_citations: [],
      p_lyrics: null,
      p_suggestion_parts: [],
      p_in_repertoire: true,
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

test("Supabase network failures report whether an offline copy exists", async () => {
  const cachedPlan = {
    songs: {},
    readingOverrides: {},
    celebrationOverride: null,
  };
  const failure = {
    message: "TypeError: Failed to fetch",
    details: "TypeError: Failed to fetch",
  };
  const { supabase } = supabaseFixture(Promise.resolve({ data: null, error: failure }));
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage({
      "st-james-plan-cache-v2-2026-08-02": JSON.stringify(cachedPlan),
    }),
    planData,
    songCatalog,
    isOnline: () => true,
  });
  const failures = [];

  const unsubscribe = store.subscribePlan(
    "2026-08-02",
    () => {},
    (error, status) => failures.push({ error, status }),
  );
  await new Promise(resolve => setImmediate(resolve));
  unsubscribe();

  assert.deepEqual(failures, [{
    error: failure,
    status: { offline: true, cached: true },
  }]);
});

test("a successful live load becomes the cache available to later failures", async () => {
  const results = [
    {
      data: {
        mappedPlan: {
          songs: { entrance: { id: "live", title: "Live song" } },
          readingOverrides: {},
          celebrationOverride: null,
        },
      },
      error: null,
    },
    {
      data: null,
      error: { message: "TypeError: Failed to fetch" },
    },
  ];
  const planResult = {
    then(resolve, reject) {
      return Promise.resolve(results.shift()).then(resolve, reject);
    },
  };
  const { calls, supabase } = supabaseFixture(planResult);
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage(),
    planData,
    songCatalog,
  });
  const failures = [];
  const unsubscribe = store.subscribePlan(
    "2026-08-02",
    () => {},
    (error, status) => failures.push({ error, status }),
  );
  await new Promise(resolve => setImmediate(resolve));
  calls.channelCallbacks[0]();
  await new Promise(resolve => setImmediate(resolve));
  unsubscribe();

  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0].status, { offline: true, cached: true });
});

test("an unavailable shared store preserves the last cached public plan", async () => {
  const cachedPlan = {
    songs: { entrance: { id: "cached", title: "Cached song" } },
    readingOverrides: {},
    celebrationOverride: null,
  };
  const failure = new Error("Supabase startup failed");
  const store = storeModule.unavailableStore({
    storage: memoryStorage({
      "st-james-plan-cache-v2-2026-08-02": JSON.stringify(cachedPlan),
    }),
    planData,
    reason: failure,
  });
  const values = [];
  const errors = [];

  store.subscribePlan(
    "2026-08-02",
    (plan, status) => values.push({ plan, status }),
    error => errors.push(error),
  );

  assert.deepEqual(values, [{
    plan: cachedPlan,
    status: { offline: true, cached: true },
  }]);
  assert.deepEqual(errors, [failure]);
  await assert.rejects(
    store.assignSong("2026-08-02", "entrance", "song-1"),
    /Shared editing is unavailable/,
  );
});

test("local song requests need membership to create and an editor to resolve", async () => {
  let uuidCount = 0;
  const store = storeModule.localStore({
    storage: memoryStorage(),
    planData,
    songCatalog,
    randomUUID: () => `id-${++uuidCount}`,
    logger: { warn() {} },
  });

  await assert.rejects(
    store.createSongRequest({ title: "New Hymn" }),
    /Choir member access required/,
  );
  assert.deepEqual(await store.listSongRequests(), []);

  await store.signInChoir();
  await assert.rejects(
    store.createSongRequest({ songId: "missing" }),
    /Song not found/,
  );
  await store.createSongRequest({
    title: "New Hymn",
    youtubeVideoId: "AAAAAAAAAAA",
    note: "For the feast",
    sunday: "2026-08-09",
    part: "entrance",
  });
  const pending = await store.listSongRequests();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].title, "New Hymn");
  assert.equal(pending[0].status, "pending");
  await assert.rejects(
    store.resolveSongRequest(pending[0].id, "accepted"),
    /Editor access required/,
  );

  await store.signOut();
  assert.equal((await store.listSongRequests()).length, 1);

  await store.signInEditor();
  await assert.rejects(
    store.resolveSongRequest(pending[0].id, "bogus"),
    /Invalid request status/,
  );
  await store.resolveSongRequest(pending[0].id, "accepted");
  assert.deepEqual(await store.listSongRequests(), []);
  await assert.rejects(
    store.resolveSongRequest(pending[0].id, "declined"),
    /Request not found/,
  );
});

test("song request subscribers hear about creations and resolutions until they stop", async () => {
  let uuidCount = 0;
  const store = storeModule.localStore({
    storage: memoryStorage(),
    planData,
    songCatalog,
    randomUUID: () => `id-${++uuidCount}`,
    logger: { warn() {} },
  });
  let events = 0;
  const stop = store.subscribeSongRequests(() => { events += 1; });

  await store.signInChoir();
  await store.createSongRequest({ title: "New Hymn" });
  assert.equal(events, 1);

  const [request] = await store.listSongRequests();
  await store.signInEditor();
  await store.resolveSongRequest(request.id, "declined");
  assert.equal(events, 2);

  stop();
  await store.createSongRequest({ title: "Another Hymn" });
  assert.equal(events, 2);
});

test("local public song search works signed out and never returns lyrics", async () => {
  const store = createStore();
  await store.signInEditor();
  await store.createAndAssignSong("2026-08-02", "entrance", {
    title: "Gather Us In",
    lyrics: "Private lyric text",
  });
  await store.signOut();

  const results = await store.searchPublicSongs("gather");
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Gather Us In");
  assert.equal("lyrics" in results[0], false);
});

test("Supabase song requests call the bounded request RPCs", async () => {
  const rpcs = [];
  const store = storeModule.createSupabaseStore({
    rpc(name, params) {
      rpcs.push({ name, params });
      return Promise.resolve({
        data: name === "create_song_request" ? "request-1" : null,
        error: null,
      });
    },
    auth: {},
  }, {
    storage: memoryStorage(),
    planData,
    songCatalog,
    isOnline: () => true,
  });

  const id = await store.createSongRequest({
    songId: "",
    title: "New Hymn",
    youtubeVideoId: "AAAAAAAAAAA",
    note: "For the feast",
    sunday: "2026-08-09",
    part: "entrance",
  });
  assert.equal(id, "request-1");
  await store.resolveSongRequest("request-1", "declined");
  assert.deepEqual(rpcs, [
    {
      name: "create_song_request",
      params: {
        p_song_id: null,
        p_title: "New Hymn",
        p_youtube_video_id: "AAAAAAAAAAA",
        p_note: "For the feast",
        p_sunday: "2026-08-09",
        p_part: "entrance",
      },
    },
    {
      name: "resolve_song_request",
      params: { p_request_id: "request-1", p_status: "declined" },
    },
  ]);
});

test("Supabase editor mutations stop before making requests while offline", async () => {
  const { calls, supabase } = supabaseFixture(Promise.resolve({ data: null, error: null }));
  const store = storeModule.createSupabaseStore(supabase, {
    storage: memoryStorage(),
    planData,
    songCatalog,
    isOnline: () => false,
  });

  await assert.rejects(
    store.assignSong("2026-08-02", "entrance", "song-1"),
    /internet connection/,
  );
  await assert.rejects(store.searchSongs("Gather"), /internet connection/);
  assert.deepEqual(calls.rpcs, []);
  assert.deepEqual(calls.selects, []);
});
