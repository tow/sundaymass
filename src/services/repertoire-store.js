const failures = globalThis.window?.Failures
  || (typeof require === "function" ? require("../domain/failures.js") : null);
const expected = failures.expected;

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
    suggestionProposedParts: Array.isArray(row.suggestion_proposed_parts)
      ? row.suggestion_proposed_parts
      : [],
    suggestionProposalConfidence: row.suggestion_proposal_confidence || "",
    suggestionProposalReason: row.suggestion_proposal_reason || "",
    suggestionReviewStatus: row.suggestion_review_status || "reviewed",
    lyrics: Array.isArray(row.song_lyrics)
      ? row.song_lyrics[0]?.lyrics || ""
      : row.song_lyrics?.lyrics || "",
  };
};
const draftParams = (draft, songCatalog = globalThis.window?.SongCatalog) => {
  const result = songCatalog.validateDraft(draft);
  if (!result.valid) throw expected(result.error);
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

// PostgREST reports failures as plain { message, details, hint, code } objects
// (only .throwOnError() yields PostgrestError instances). Promote them to real
// Errors so `instanceof Error` holds and the code survives into error tracking.
function storeError(error) {
  if (error instanceof Error) return error;
  const failure = new Error(error?.message || "Request failed");
  failure.name = "PostgrestError";
  ["code", "details", "hint", "status"].forEach(key => {
    const value = error?.[key];
    if (value !== undefined && value !== null && value !== "") failure[key] = value;
  });
  return failure;
}

// A wrong email or password is the user mistaking their password, not a defect,
// and the sign-in dialog already says so. Recognising Supabase's error shape is
// src/domain/failures.js's job; this is only the boundary that applies it.
function authError(error) {
  // Classify the value Supabase handed us before storeError rebrands a non-Error as a
  // PostgrestError, which would erase the name the classifier reads.
  const rejected = failures.isRejectedCredentials(error);
  const failure = storeError(error);
  return rejected ? failures.markExpected(failure) : failure;
}

const authState = (user, { isChoirMember = false, isEditor = false } = {}) => {
  const accessLevel = isEditor ? "editor" : isChoirMember ? "choir" : "public";
  return Object.freeze({
    user: user || null,
    isChoirMember: accessLevel === "choir",
    isEditor: accessLevel === "editor",
    canReadLyrics: accessLevel === "choir" || accessLevel === "editor",
    accessLevel,
  });
};

function localStore({
  storage = globalThis.localStorage,
  songCatalog = globalThis.window?.SongCatalog,
  randomUUID = () => globalThis.crypto.randomUUID(),
} = {}) {
  const key = "st-james-song-catalog-v1";
  let accessLevel = "public";
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
      if (accessLevel === "public") throw expected("Choir member access required");
      return read().find(song => song.id === songId);
    },
    async createSong(draft) {
      if (accessLevel !== "editor") throw expected("Editor access required");
      const value = draftParams(draft, songCatalog).value;
      const song = { id: randomUUID(), ...value };
      write([...read(), song]);
      return song;
    },
    async updateSong(songId, draft) {
      if (accessLevel !== "editor") throw expected("Editor access required");
      const value = draftParams(draft, songCatalog).value;
      const songs = read();
      if (!songs.some(song => song.id === songId)) throw expected("Song not found");
      write(songs.map(song => song.id === songId ? { id: songId, ...value } : song));
      return { id: songId, ...value };
    },
    async reviewSongSuggestionParts(songId, suggestionParts) {
      if (accessLevel !== "editor") throw expected("Editor access required");
      const songs = read();
      const song = songs.find(value => value.id === songId);
      if (!song) throw expected("Song not found");
      const reviewed = {
        ...song,
        suggestionParts: suggestionParts || [],
        suggestionProposedParts: [],
        suggestionProposalConfidence: "",
        suggestionProposalReason: "",
        suggestionReviewStatus: "reviewed",
      };
      write(songs.map(value => value.id === songId ? reviewed : value));
      return reviewed;
    },
    subscribeAuth(callback) {
      notifyAuth = () => callback(authState(
        accessLevel === "public" ? null : { email: `Local ${accessLevel}` },
        {
          isChoirMember: accessLevel === "choir",
          isEditor: accessLevel === "editor",
        },
      ));
      notifyAuth();
      return () => {};
    },
    async signInChoir() { accessLevel = "choir"; notifyAuth(); },
    async signInEditor() { accessLevel = "editor"; notifyAuth(); },
    async signIn() { accessLevel = "editor"; notifyAuth(); },
    async signOut() { accessLevel = "public"; notifyAuth(); },
    async semanticStatus() {
      return { songs: read().length, embeddedSongs: 0, embeddedReadings: 0, staleSongIds: [] };
    },
    async syncSongs() { return {}; },
    async syncReadings() { return {}; },
  };
}

function createSupabaseStore(
  supabase,
  {
    songCatalog = globalThis.window?.SongCatalog,
    defer = setTimeout,
    logger = globalThis.AppLogger || console,
    choirEmail = "",
  } = {},
) {
  const invoke = async body => {
    const { data, error } = await supabase.functions.invoke("semantic-songs", { body });
    if (error) throw storeError(error);
    if (data?.error) throw new Error(data.error);
    return data;
  };
  return {
    async browseSongs() {
      const { data, error } = await supabase
        .from("songs")
        .select("id,title,youtube_video_id,authors,copyright_owner,copyright_year,source,responsorial_book,responsorial_number,responsorial_citations,in_repertoire,suggestion_parts,suggestion_proposed_parts,suggestion_proposal_confidence,suggestion_proposal_reason,suggestion_review_status")
        .order("title");
      if (error) throw storeError(error);
      return (data || []).map(mapSong);
    },
    async getSong(songId) {
      const { data, error } = await supabase
        .from("songs")
        .select("id,title,youtube_video_id,authors,copyright_owner,copyright_year,source,responsorial_book,responsorial_number,responsorial_citations,in_repertoire,suggestion_parts,suggestion_proposed_parts,suggestion_proposal_confidence,suggestion_proposal_reason,suggestion_review_status,song_lyrics(lyrics)")
        .eq("id", songId)
        .single();
      if (error) throw storeError(error);
      return mapSong(data);
    },
    async createSong(draft) {
      const song = draftParams(draft, songCatalog);
      const { data, error } = await supabase.rpc("create_song", song.params);
      if (error) throw storeError(error);
      return { id: data, ...song.value };
    },
    async updateSong(songId, draft) {
      const song = draftParams(draft, songCatalog);
      const { error } = await supabase.rpc("update_song", { p_song_id: songId, ...song.params });
      if (error) throw storeError(error);
      return { id: songId, ...song.value };
    },
    async reviewSongSuggestionParts(songId, suggestionParts) {
      const { error } = await supabase.rpc("review_song_suggestion_parts", {
        p_song_id: songId,
        p_suggestion_parts: suggestionParts || [],
      });
      if (error) throw storeError(error);
    },
    subscribeAuth(callback) {
      let active = true;
      let generation = 0;
      const resolve = async (session, requestGeneration) => {
        const user = session?.user || null;
        let isEditor = false;
        let isChoirMember = false;
        if (user) {
          const membership = table => supabase
            .from(table)
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();
          const [editorResult, choirResult] = await Promise.all([
            membership("editors"),
            membership("choir_members"),
          ]);
          if (editorResult.error && active && requestGeneration === generation) {
            logger.warn("Could not verify editor access", storeError(editorResult.error));
          }
          if (choirResult.error && active && requestGeneration === generation) {
            logger.warn("Could not verify choir access", storeError(choirResult.error));
          }
          isEditor = Boolean(editorResult.data);
          isChoirMember = !isEditor && Boolean(choirResult.data);
        }
        if (active && requestGeneration === generation) {
          callback(authState(user, { isChoirMember, isEditor }));
        }
      };
      const initialGeneration = ++generation;
      supabase.auth.getSession()
        .then(({ data, error }) => {
          if (error && active && initialGeneration === generation) {
            logger.warn("Could not read authentication session", error);
          }
          return resolve(data?.session, initialGeneration);
        })
        .catch(error => {
          if (active && initialGeneration === generation) {
            logger.warn("Could not read authentication session", error);
            callback(authState(null));
          }
        });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        const requestGeneration = ++generation;
        defer(() => resolve(session, requestGeneration), 0);
      });
      return () => { active = false; listener.subscription.unsubscribe(); };
    },
    async signInChoir(password) {
      if (!choirEmail) throw new Error("Choir sign-in is not configured");
      const { error } = await supabase.auth.signInWithPassword({
        email: choirEmail,
        password,
      });
      if (error) throw authError(error);
    },
    async signInEditor(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw authError(error);
    },
    async signIn(email, password) {
      return this.signInEditor(email, password);
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw storeError(error);
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
  return createSupabaseStore(supabase, { choirEmail: config.choirEmail || "" });
}

async function start() {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
  const store = window.MASS_PLANNER_SUPABASE_CONFIG
    ? await supabaseStore(window.MASS_PLANNER_SUPABASE_CONFIG)
    : localStore();
  window.repertoireApp.connect(store);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { authState, mapSong, draftParams, localStore, createSupabaseStore };
}

if (typeof window !== "undefined" && window.repertoireApp) {
  start().catch(error => window.repertoireApp.fail(error));
}
