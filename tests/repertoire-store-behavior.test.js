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
        authors: draft.authors || "",
        copyrightOwner: draft.copyrightOwner || "",
        copyrightYear: draft.copyrightYear || "",
        source: draft.source || "",
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

  await store.signIn();
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
    authors: "Frank Andersen",
    copyrightOwner: "",
    copyrightYear: "",
    source: "",
    lyrics: "",
    inRepertoire: true,
    suggestionParts: ["entrance"],
  });
  assert.equal((await store.browseSongs())[0].id, "song-1");

  await store.signOut();
  await assert.rejects(store.getSong("song-1"), /Editor access required/);
  assert.deepEqual(authStates.map(state => state.isEditor), [false, true, false]);
});

function supabaseFixture() {
  const calls = { selects: [], rpcs: [] };
  const publicRow = {
    id: "song-1",
    title: "Table of Plenty",
    youtube_url: "https://youtu.be/example",
    authors: "Dan Schutte",
    copyright_owner: "OCP",
    copyright_year: "1992",
    source: "",
    in_repertoire: false,
    suggestion_parts: ["entrance"],
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

test("Supabase repertoire projections keep public browsing separate from editor lyrics", async () => {
  const { calls, supabase } = supabaseFixture();
  const store = storeModule.createSupabaseStore(supabase, { songCatalog });

  const [publicSong] = await store.browseSongs();
  const privateSong = await store.getSong("song-1");

  assert.equal(publicSong.lyrics, "");
  assert.equal(publicSong.inRepertoire, false);
  assert.equal(privateSong.lyrics, "Come to the feast");
  assert.doesNotMatch(calls.selects[0].columns, /song_lyrics/);
  assert.match(calls.selects[1].columns, /song_lyrics/);
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
      p_youtube_url: "",
      p_authors: "Composer",
      p_copyright_owner: "",
      p_copyright_year: "",
      p_source: "",
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
