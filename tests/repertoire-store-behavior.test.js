const test = require("node:test");
const assert = require("node:assert/strict");

const storeModule = require("../src/services/repertoire-store.js");

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

const songCatalog = {
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

test("local repertoire storage is injectable and tolerates corrupted cached data", async () => {
  const store = storeModule.localStore({
    storage: memoryStorage({ "st-james-song-catalog-v1": "{not json" }),
    songCatalog,
    randomUUID: () => "song-1",
  });

  assert.deepEqual(await store.browseSongs(), []);
});

test("local repertoire mutations require an editor and retain canonical songs", async () => {
  const storage = memoryStorage();
  const store = storeModule.localStore({
    storage,
    songCatalog,
    randomUUID: () => "song-1",
  });
  const authStates = [];
  store.subscribeAuth(state => authStates.push(state));

  await assert.rejects(
    store.createSong({ title: "Creator Alme Poderoso" }),
    /Editor access required/,
  );

  await store.signInChoir();
  await assert.rejects(
    store.createSong({ title: "Creator Alme Poderoso" }),
    /Editor access required/,
  );
  await store.signInEditor();
  await assert.rejects(
    store.updateSong("missing", { title: "Missing song" }),
    /Song not found/,
  );
  assert.deepEqual(await store.createSong({
    title: "  Creator Alme Poderoso  ",
    authors: "Frank Andersen",
    suggestionParts: ["entrance"],
  }), {
    id: "song-1",
    title: "Creator Alme Poderoso",
    youtubeUrl: "",
    youtubeVideoId: "",
    authors: "Frank Andersen",
    copyrightOwner: "",
    copyrightYear: "",
    source: "",
    responsorialBook: "",
    responsorialNumber: null,
    responsorialCitations: [],
    lyrics: "",
    inRepertoire: true,
    suggestionParts: ["entrance"],
  });
  assert.equal((await store.browseSongs())[0].id, "song-1");

  await store.signOut();
  await assert.rejects(store.getSong("song-1"), /Choir member access required/);
  await store.signInChoir();
  assert.equal((await store.getSong("song-1")).id, "song-1");
  assert.deepEqual(
    authStates.map(state => state.accessLevel),
    ["public", "choir", "editor", "public", "choir"],
  );
});

function supabaseFixture() {
  const calls = { selects: [], rpcs: [] };
  const publicRow = {
    id: "song-1",
    title: "Table of Plenty",
    youtube_video_id: "AAAAAAAAAAA",
    authors: "Dan Schutte",
    copyright_owner: "OCP",
    copyright_year: "1992",
    source: "",
    in_repertoire: false,
    suggestion_parts: ["entrance"],
    suggestion_proposed_parts: ["offertory"],
    suggestion_proposal_confidence: "medium",
    suggestion_proposal_reason: "Needs a human review.",
    suggestion_review_status: "needs-review",
  };
  const privateRow = {
    ...publicRow,
    song_lyrics: { lyrics: "Come to the feast" },
  };
  const supabase = {
    from(table) {
      const query = {
        select(columns) {
          calls.selects.push({ table, columns });
          return query;
        },
        order() {
          return Promise.resolve({ data: [publicRow], error: null });
        },
        eq() {
          return query;
        },
        single() {
          return Promise.resolve({ data: privateRow, error: null });
        },
      };
      return query;
    },
    rpc(name, params) {
      calls.rpcs.push({ name, params });
      return Promise.resolve({ data: name === "create_song" ? "song-2" : null, error: null });
    },
    functions: {
      invoke() {
        return Promise.resolve({ data: {}, error: null });
      },
    },
    auth: {},
  };
  return { calls, supabase };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("Supabase repertoire projections keep public browsing separate from editor lyrics", async () => {
  const { calls, supabase } = supabaseFixture();
  const store = storeModule.createSupabaseStore(supabase, { songCatalog });

  const [publicSong] = await store.browseSongs();
  const privateSong = await store.getSong("song-1");

  assert.equal(publicSong.lyrics, "");
  assert.equal(publicSong.inRepertoire, false);
  assert.deepEqual(publicSong.suggestionProposedParts, ["offertory"]);
  assert.equal(publicSong.suggestionProposalConfidence, "medium");
  assert.equal(publicSong.suggestionReviewStatus, "needs-review");
  assert.equal(privateSong.lyrics, "Come to the feast");
  assert.doesNotMatch(calls.selects[0].columns, /song_lyrics/);
  assert.match(calls.selects[1].columns, /song_lyrics/);
});

test("Supabase category review records an explicit human decision", async () => {
  const { calls, supabase } = supabaseFixture();
  const store = storeModule.createSupabaseStore(supabase, { songCatalog });

  await store.reviewSongSuggestionParts("song-1", ["offertory", "communion"]);

  assert.deepEqual(calls.rpcs[0], {
    name: "review_song_suggestion_parts",
    params: {
      p_song_id: "song-1",
      p_suggestion_parts: ["offertory", "communion"],
    },
  });
});

test("Supabase repertoire mutations send validated canonical RPC parameters", async () => {
  const { calls, supabase } = supabaseFixture();
  const store = storeModule.createSupabaseStore(supabase, { songCatalog });

  const created = await store.createSong({
    title: "  New Song  ",
    authors: "Composer",
    inRepertoire: false,
    suggestionParts: [],
  });

  assert.equal(created.id, "song-2");
  assert.deepEqual(calls.rpcs[0], {
    name: "create_song",
    params: {
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
      p_in_repertoire: false,
      p_suggestion_parts: [],
    },
  });
});

test("Supabase repertoire mutation failures reach the caller", async () => {
  const { supabase } = supabaseFixture();
  supabase.rpc = async () => ({ data: null, error: new Error("Editor access required") });
  const store = storeModule.createSupabaseStore(supabase, { songCatalog });

  await assert.rejects(
    store.createSong({ title: "New Song" }),
    /Editor access required/,
  );
});

test("repertoire auth ignores a stale editor lookup after sign-out", async () => {
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
    functions: { invoke: async () => ({ data: {}, error: null }) },
  };
  const store = storeModule.createSupabaseStore(supabase, {
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
