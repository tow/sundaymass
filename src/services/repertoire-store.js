const mapSong = row => {
  const youtubeVideoId = /^[A-Za-z0-9_-]{11}$/.test(row.youtube_video_id || "")
    ? row.youtube_video_id
    : "";
  return {
    id: row.id,
    title: row.title || "",
    youtubeVideoId,
    youtubeUrl: youtubeVideoId
      ? "https:" + "//www.youtube.com/watch?v=" + youtubeVideoId
      : "",
    authors: row.authors || "",
    copyrightOwner: row.copyright_owner || "",
    copyrightYear: row.copyright_year || "",
    source: row.source || "",
    responsorialBook: row.responsorial_book || "",
    responsorialNumber: Number.isInteger(row.responsorial_number)
      ? row.responsorial_number
      : null,
    responsorialCitations: Array.isArray(row.responsorial_citations)
      ? row.responsorial_citations
      : [],
    inRepertoire: row.in_repertoire !== false,
    suggestionParts: Array.isArray(row.suggestion_parts) ? row.suggestion_parts : [],
    lyrics: Array.isArray(row.song_lyrics)
      ? row.song_lyrics[0]?.lyrics || ""
      : row.song_lyrics?.lyrics || "",
  };
};
const draftParams = (draft, songCatalog = globalThis.window?.SongCatalog) => {
  const result = songCatalog.validateDraft(draft);
  if (!result.valid) throw new Error(result.error);
  return {
    value: result.value,
    params: {
      p_title: result.value.title,
      p_youtube_video_id: result.value.youtubeVideoId,
      p_authors: result.value.authors,
      p_copyright_owner: result.value.copyrightOwner,
      p_copyright_year: result.value.copyrightYear,
      p_source: result.value.source,
      p_responsorial_book: result.value.responsorialBook,
      p_responsorial_number: result.value.responsorialNumber,
      p_responsorial_citations: result.value.responsorialCitations,
      p_lyrics: result.value.lyrics || null,
      p_suggestion_parts: result.value.suggestionParts,
      p_in_repertoire: result.value.inRepertoire !== false,
    },
  };
};

function localStore({
  storage = globalThis.localStorage,
  songCatalog = globalThis.window?.SongCatalog,
  randomUUID = () => globalThis.crypto.randomUUID(),
} = {}) {
  const key = "st-james-song-catalog-v1";
  let editor = false;
  let notifyAuth = () => {};
  const read = () => {
    try {
      const songs = JSON.parse(storage.getItem(key) || "[]");
      return Array.isArray(songs) ? songs : [];
    } catch {
      return [];
    }
  };
  const write = songs => storage.setItem(key, JSON.stringify(songs));
  return {
    async browseSongs() { return read(); },
    async getSong(songId) {
      if (!editor) throw new Error("Editor access required");
      return read().find(song => song.id === songId);
    },
    async createSong(draft) {
      if (!editor) throw new Error("Editor access required");
      const value = draftParams(draft, songCatalog).value;
      const song = { id: randomUUID(), ...value };
      write([...read(), song]);
      return song;
    },
    async updateSong(songId, draft) {
      if (!editor) throw new Error("Editor access required");
      const value = draftParams(draft, songCatalog).value;
      const songs = read();
      if (!songs.some(song => song.id === songId)) throw new Error("Song not found");
      write(songs.map(song => song.id === songId ? { id: songId, ...value } : song));
      return { id: songId, ...value };
    },
    subscribeAuth(callback) {
      notifyAuth = () => callback({
        user: editor ? { email: "Local editor" } : null,
        isEditor: editor,
      });
      notifyAuth();
      return () => {};
    },
    async signIn() { editor = true; notifyAuth(); },
    async signOut() { editor = false; notifyAuth(); },
    async semanticStatus() {
      return { songs: read().length, embeddedSongs: 0, embeddedReadings: 0, staleSongIds: [] };
    },
    async syncSongs() { return {}; },
    async syncReadings() { return {}; },
  };
}

function createSupabaseStore(
  supabase,
  { songCatalog = globalThis.window?.SongCatalog } = {},
) {
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
        .select("id,title,youtube_video_id,authors,copyright_owner,copyright_year,source,responsorial_book,responsorial_number,responsorial_citations,in_repertoire,suggestion_parts")
        .order("title");
      if (error) throw error;
      return (data || []).map(mapSong);
    },
    async getSong(songId) {
      const { data, error } = await supabase
        .from("songs")
        .select("id,title,youtube_video_id,authors,copyright_owner,copyright_year,source,responsorial_book,responsorial_number,responsorial_citations,in_repertoire,suggestion_parts,song_lyrics(lyrics)")
        .eq("id", songId)
        .single();
      if (error) throw error;
      return mapSong(data);
    },
    async createSong(draft) {
      const song = draftParams(draft, songCatalog);
      const { data, error } = await supabase.rpc("create_song", song.params);
      if (error) throw error;
      return { id: data, ...song.value };
    },
    async updateSong(songId, draft) {
      const song = draftParams(draft, songCatalog);
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

async function supabaseStore(config) {
  const createClient = globalThis.MassPlannerSupabaseClient?.create;
  if (!createClient) throw new Error("Shared Supabase client bootstrap is unavailable");
  const supabase = await createClient(config);
  return createSupabaseStore(supabase);
}

async function start() {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
  const store = window.MASS_PLANNER_SUPABASE_CONFIG
    ? await supabaseStore(window.MASS_PLANNER_SUPABASE_CONFIG)
    : localStore();
  window.repertoireApp.connect(store);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mapSong, draftParams, localStore, createSupabaseStore };
}

if (typeof window !== "undefined" && window.repertoireApp) {
  start().catch(error => window.repertoireApp.fail(error));
}
