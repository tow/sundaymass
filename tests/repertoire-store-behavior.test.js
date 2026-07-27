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
    suggestionParts: ["entrance"],
  });
  assert.equal((await store.browseSongs())[0].id, "song-1");

  await store.signOut();
  await assert.rejects(store.getSong("song-1"), /Editor access required/);
  assert.deepEqual(authStates.map(state => state.isEditor), [false, true, false]);
});
