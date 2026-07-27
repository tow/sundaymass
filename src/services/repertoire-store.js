const SUPABASE_MODULE_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const mapSong = row => ({
  id: row.id,
  title: row.title || "",
  youtubeUrl: row.youtube_url || "",
  authors: row.authors || "",
  copyrightOwner: row.copyright_owner || "",
  copyrightYear: row.copyright_year || "",
  source: row.source || "",
  suggestionParts: Array.isArray(row.suggestion_parts) ? row.suggestion_parts : [],
  lyrics: Array.isArray(row.song_lyrics)
    ? row.song_lyrics[0]?.lyrics || ""
    : row.song_lyrics?.lyrics || "",
});
const draftParams = draft => {
  const result = window.SongCatalog.validateDraft(draft);
  if (!result.valid) throw new Error(result.error);
  return {
    value: result.value,
    params: {
      p_title: result.value.title,
      p_youtube_url: result.value.youtubeUrl,
      p_authors: result.value.authors,
      p_copyright_owner: result.value.copyrightOwner,
      p_copyright_year: result.value.copyrightYear,
      p_source: result.value.source,
      p_lyrics: result.value.lyrics || null,
      p_suggestion_parts: result.value.suggestionParts,
    },
  };
};

function localStore() {
  const key = "st-james-song-catalog-v1";
  let editor = false;
  const read = () => JSON.parse(localStorage.getItem(key) || "[]");
  const write = songs => localStorage.setItem(key, JSON.stringify(songs));
  return {
    async browseSongs() { return read(); },
    async getSong(songId) {
      if (!editor) throw new Error("Editor access required");
      return read().find(song => song.id === songId);
    },
    async createSong(draft) {
      if (!editor) throw new Error("Editor access required");
      const value = draftParams(draft).value;
      const song = { id: crypto.randomUUID(), ...value };
      write([...read(), song]);
      return song;
    },
    async updateSong(songId, draft) {
      if (!editor) throw new Error("Editor access required");
      const value = draftParams(draft).value;
      write(read().map(song => song.id === songId ? { id: songId, ...value } : song));
      return { id: songId, ...value };
    },
    subscribeAuth(callback) {
      this._auth = callback;
      callback({ user: editor ? { email: "Local editor" } : null, isEditor: editor });
      return () => {};
    },
    async signIn() { editor = true; this._auth({ user: { email: "Local editor" }, isEditor: true }); },
    async signOut() { editor = false; this._auth({ user: null, isEditor: false }); },
    async semanticStatus() {
      return { songs: read().length, embeddedSongs: 0, embeddedReadings: 0, staleSongIds: [] };
    },
    async syncSongs() { return {}; },
    async syncReadings() { return {}; },
  };
}

async function supabaseStore(config) {
  const { createClient } = await import(SUPABASE_MODULE_URL);
  const supabase = createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, detectSessionInUrl: true },
  });
  const invoke = async body => {
    const { data, error } = await supabase.functions.invoke("semantic-songs", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };
  return {
    async browseSongs() {
      const { data, error } = await supabase
        .from("songs")
        .select("id,title,youtube_url,authors,copyright_owner,copyright_year,source,suggestion_parts")
        .order("title");
      if (error) throw error;
      return (data || []).map(mapSong);
    },
    async getSong(songId) {
      const { data, error } = await supabase
        .from("songs")
        .select("id,title,youtube_url,authors,copyright_owner,copyright_year,source,suggestion_parts,song_lyrics(lyrics)")
        .eq("id", songId)
        .single();
      if (error) throw error;
      return mapSong(data);
    },
    async createSong(draft) {
      const song = draftParams(draft);
      const { data, error } = await supabase.rpc("create_song", song.params);
      if (error) throw error;
      return { id: data, ...song.value };
    },
    async updateSong(songId, draft) {
      const song = draftParams(draft);
      const { error } = await supabase.rpc("update_song", { p_song_id: songId, ...song.params });
      if (error) throw error;
      return { id: songId, ...song.value };
    },
    subscribeAuth(callback) {
      let active = true;
      const resolve = async session => {
        const user = session?.user || null;
        let isEditor = false;
        if (user) {
          const { data } = await supabase.from("editors").select("user_id").maybeSingle();
          isEditor = Boolean(data);
        }
        if (active) callback({ user, isEditor });
      };
      supabase.auth.getSession().then(({ data }) => resolve(data.session));
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => resolve(session), 0);
      });
      return () => { active = false; listener.subscription.unsubscribe(); };
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    semanticStatus: () => invoke({ action: "status" }),
    syncSongs: songIds => invoke({ action: "sync-songs", songIds }),
    syncReadings: readings => invoke({ action: "sync-readings", readings }),
  };
}

async function start() {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
  const store = window.MASS_PLANNER_SUPABASE_CONFIG
    ? await supabaseStore(window.MASS_PLANNER_SUPABASE_CONFIG)
    : localStore();
  window.repertoireApp.connect(store);
}

start().catch(error => window.repertoireApp.fail(error));
