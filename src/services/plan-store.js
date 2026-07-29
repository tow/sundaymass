// Persistence adapter: Supabase in production, local storage during local development.
const planData = () => globalThis.window?.PlanMusicData;
const songCatalog = () => globalThis.window?.SongCatalog;
const sharedPlanCacheKey = date => "st-james-plan-cache-v2-" + date;

function readSharedPlanCache(storage, date) {
  try {
    const raw = storage?.getItem(sharedPlanCacheKey(date));
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function writeSharedPlanCache(storage, date, value) {
  storage?.setItem(sharedPlanCacheKey(date), JSON.stringify(value));
}

function isNetworkFailure(error) {
  return /failed to fetch|network(?:error| request)?|internet connection/i.test(
    [error?.message, error?.details].filter(Boolean).join(" "),
  );
}

function emptyPlan() {
  return planData().emptyPlan();
}

function localStore({
  storage = globalThis.localStorage,
  planData: planDataApi = planData(),
  songCatalog: songCatalogApi = songCatalog(),
  randomUUID = () => globalThis.crypto?.randomUUID?.()
    || "local-" + Date.now() + "-" + Math.random().toString(36).slice(2),
  logger = console,
} = {}) {
  const listeners = new Map();
  let editor = false;
  let notifyAuth = () => {};
  const planKey = date => "st-james-plan-v2-" + date;
  const songsKey = "st-james-song-catalog-v1";
  const weeklyLyricsKey = "st-james-weekly-lyrics-v1";

  const readSongs = () => {
    try {
      const value = JSON.parse(storage.getItem(songsKey));
      return Array.isArray(value) ? value : [];
    } catch (error) {
      logger.warn("Could not read local songs", error);
      return [];
    }
  };
  const writeSongs = songs => storage.setItem(songsKey, JSON.stringify(songs));
  const readPlanRecord = date => {
    try {
      const value = JSON.parse(storage.getItem(planKey(date)));
      return value && typeof value === "object" && !Array.isArray(value)
        ? {
            songs: value.songs && typeof value.songs === "object" ? value.songs : {},
            readingOverrides: value.readingOverrides && typeof value.readingOverrides === "object"
              ? value.readingOverrides
              : {},
            celebrationOverride: value.celebrationOverride
              && typeof value.celebrationOverride === "object"
              ? value.celebrationOverride
              : null,
          }
        : planDataApi.emptyPlan();
    } catch (error) {
      logger.warn("Could not read local plan", error);
      return planDataApi.emptyPlan();
    }
  };
  const writePlanRecord = (date, plan) => storage.setItem(planKey(date), JSON.stringify(plan));
  const read = date => {
    const record = readPlanRecord(date);
    const songsById = Object.fromEntries(readSongs().map(song => [song.id, song]));
    const publicSong = song => ({
      id: song.id,
      title: song.title,
      youtubeVideoId: song.youtubeVideoId || "",
      youtubeUrl: song.youtubeUrl,
      authors: song.authors,
      copyrightOwner: song.copyrightOwner,
      copyrightYear: song.copyrightYear,
      source: song.source,
      responsorialBook: song.responsorialBook || "",
      responsorialNumber: song.responsorialNumber || null,
      responsorialCitations: Array.isArray(song.responsorialCitations)
        ? song.responsorialCitations
        : [],
      suggestionParts: Array.isArray(song.suggestionParts) ? song.suggestionParts : [],
    });
    return {
      songs: Object.fromEntries(
        Object.entries(record.songs)
          .map(([part, id]) => [part, songsById[id] ? publicSong(songsById[id]) : null])
          .filter(([, song]) => Boolean(song)),
      ),
      readingOverrides: record.readingOverrides,
      celebrationOverride: record.celebrationOverride,
    };
  };
  const requireEditor = () => {
    if (!editor) throw new Error("Sign in before editing");
  };
  const readWeeklyLyrics = () => {
    try {
      const value = JSON.parse(storage.getItem(weeklyLyricsKey) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const writeWeeklyLyrics = value => storage.setItem(weeklyLyricsKey, JSON.stringify(value));
  const emit = date => {
    const callback = listeners.get(date);
    if (callback) callback(read(date), { offline: true });
  };
  return {
    subscribePlan(date, onValue) {
      listeners.set(date, onValue);
      onValue(read(date), { offline: true });
      return () => listeners.delete(date);
    },
    subscribeAuth(onValue) {
      notifyAuth = () => onValue({
        user: editor ? { displayName: "Local editor" } : null,
        isEditor: editor,
      });
      notifyAuth();
      return () => {};
    },
    async getPlan(date) {
      requireEditor();
      return read(date);
    },
    async searchSongs(query) {
      requireEditor();
      return songCatalogApi.search(readSongs(), query);
    },
    async suggestSongs(citations, part) {
      return [];
    },
    async syncSongEmbedding() {
      requireEditor();
    },
    async getSong(songId) {
      requireEditor();
      const song = readSongs().find(value => value.id === songId);
      if (!song) throw new Error("Song not found");
      return song;
    },
    async assignSong(date, part, songId) {
      requireEditor();
      if (!readSongs().some(song => song.id === songId)) throw new Error("Song not found");
      const plan = readPlanRecord(date);
      const previousSongId = plan.songs[part];
      plan.songs[part] = songId;
      writePlanRecord(date, plan);
      if (previousSongId && previousSongId !== songId) {
        writeWeeklyLyrics(readWeeklyLyrics()
          .filter(item => item.sunday !== date || item.part !== part));
      }
      emit(date);
    },
    async createAndAssignSong(date, part, draft) {
      requireEditor();
      const validation = songCatalogApi.validateDraft(draft);
      if (!validation.valid) throw new Error(validation.error);
      const song = { id: randomUUID(), ...validation.value };
      writeSongs([...readSongs(), song]);
      const plan = readPlanRecord(date);
      plan.songs[part] = song.id;
      writePlanRecord(date, plan);
      writeWeeklyLyrics(readWeeklyLyrics()
        .filter(item => item.sunday !== date || item.part !== part));
      emit(date);
      return song;
    },
    async updateSong(songId, draft) {
      requireEditor();
      const validation = songCatalogApi.validateDraft(draft);
      if (!validation.valid) throw new Error(validation.error);
      const songs = readSongs();
      const index = songs.findIndex(song => song.id === songId);
      if (index < 0) throw new Error("Song not found");
      songs[index] = { id: songId, ...validation.value };
      writeSongs(songs);
      listeners.forEach((callback, date) => callback(read(date), { offline: true }));
      return songs[index];
    },
    async clearSong(date, part) {
      requireEditor();
      const plan = readPlanRecord(date);
      delete plan.songs[part];
      writePlanRecord(date, plan);
      writeWeeklyLyrics(readWeeklyLyrics()
        .filter(item => item.sunday !== date || item.part !== part));
      emit(date);
    },
    async getWeeklyLyrics(date) {
      requireEditor();
      return Object.fromEntries(readWeeklyLyrics()
        .filter(item => item.sunday === date)
        .map(item => [item.part, item]));
    },
    async getWeeklyLyricsParts(date) {
      requireEditor();
      return readWeeklyLyrics()
        .filter(item => item.sunday === date)
        .map(item => item.part);
    },
    async getWeeklyLyricsContext(date, part, songId) {
      requireEditor();
      const rows = readWeeklyLyrics();
      const current = rows.find(item =>
        item.sunday === date && item.part === part && item.songId === songId) || null;
      const previous = rows
        .filter(item => item.songId === songId && item.sunday < date)
        .sort((a, b) => b.sunday.localeCompare(a.sunday)
          || Number(a.part !== part) - Number(b.part !== part))[0] || null;
      return { current, previous };
    },
    async saveWeeklyLyrics(date, part, songId, lyrics) {
      requireEditor();
      const plan = readPlanRecord(date);
      if (plan.songs[part] !== songId) {
        throw new Error("The song is not assigned to this Mass slot");
      }
      const rows = readWeeklyLyrics()
        .filter(item => item.sunday !== date || item.part !== part);
      rows.push({ sunday: date, part, songId, lyrics: String(lyrics || "").trim() });
      writeWeeklyLyrics(rows);
    },
    async clearWeeklyLyrics(date, part, songId) {
      requireEditor();
      writeWeeklyLyrics(readWeeklyLyrics()
        .filter(item =>
          item.sunday !== date || item.part !== part || item.songId !== songId));
    },
    async saveReadingOverride(date, slot, readingOverride) {
      requireEditor();
      const plan = readPlanRecord(date);
      plan.readingOverrides[slot] = readingOverride;
      writePlanRecord(date, plan);
      emit(date);
    },
    async clearReadingOverride(date, slot) {
      requireEditor();
      const plan = readPlanRecord(date);
      if (slot) delete plan.readingOverrides[slot];
      else plan.readingOverrides = {};
      writePlanRecord(date, plan);
      emit(date);
    },
    async saveCelebrationOverride(date, celebrationOverride) {
      requireEditor();
      const plan = readPlanRecord(date);
      plan.celebrationOverride = celebrationOverride;
      plan.readingOverrides = {};
      writePlanRecord(date, plan);
      emit(date);
    },
    async clearCelebrationOverride(date) {
      requireEditor();
      const plan = readPlanRecord(date);
      plan.celebrationOverride = null;
      plan.readingOverrides = {};
      writePlanRecord(date, plan);
      emit(date);
    },
    async signIn() {
      editor = true;
      notifyAuth();
    },
    async signOut() {
      editor = false;
      notifyAuth();
    },
  };
}

function unavailableStore({
  storage = globalThis.localStorage,
  planData: planDataApi = planData(),
  reason = new Error("Supabase has not been configured"),
} = {}) {
  const unavailable = async () => {
    throw new Error("Shared editing is unavailable");
  };
  return {
    subscribePlan(date, onValue, onError) {
      const cached = readSharedPlanCache(storage, date);
      onValue(cached || planDataApi.emptyPlan(), { offline: true, cached: Boolean(cached) });
      if (onError) onError(reason, { offline: true, cached: Boolean(cached) });
      return () => {};
    },
    subscribeAuth(onValue) {
      onValue({ user: null, isEditor: false });
      return () => {};
    },
    getPlan: unavailable,
    searchSongs: unavailable,
    suggestSongs: unavailable,
    syncSongEmbedding: unavailable,
    getSong: unavailable,
    assignSong: unavailable,
    createAndAssignSong: unavailable,
    updateSong: unavailable,
    clearSong: unavailable,
    getWeeklyLyrics: unavailable,
    getWeeklyLyricsParts: unavailable,
    getWeeklyLyricsContext: unavailable,
    saveWeeklyLyrics: unavailable,
    clearWeeklyLyrics: unavailable,
    saveReadingOverride: unavailable,
    clearReadingOverride: unavailable,
    saveCelebrationOverride: unavailable,
    clearCelebrationOverride: unavailable,
    signIn: unavailable,
    async signOut() {},
  };
}

function createSupabaseStore(
  supabase,
  {
    storage = globalThis.localStorage,
    planData: planDataApi = planData(),
    songCatalog: songCatalogApi = songCatalog(),
    random = Math.random,
    defer = setTimeout,
    logger = console,
    isOnline = () => globalThis.navigator?.onLine !== false,
  } = {},
) {
  const requireOnline = () => {
    if (!isOnline()) throw new Error("Editing requires an internet connection");
  };
  const loadPlan = async date => {
    const { data, error } = await supabase
      .from("plans")
      .select(`
        reading_overrides,
        celebration_override,
        plan_songs (
          part,
          song:songs (
            id,
            title,
            youtube_video_id,
            authors,
            copyright_owner,
            copyright_year,
            source,
            responsorial_book,
            responsorial_number,
            responsorial_citations,
            in_repertoire,
            suggestion_parts
          )
        )
      `)
      .eq("sunday", date)
      .maybeSingle();
    if (error) throw error;
    return planDataApi.planFromRow(data);
  };
  const rpcDraft = draft => {
    const value = songCatalogApi.validateDraft(draft);
    if (!value.valid) throw new Error(value.error);
    return {
      value: value.value,
      params: {
        p_title: value.value.title,
        p_youtube_video_id: value.value.youtubeVideoId,
        p_authors: value.value.authors,
        p_copyright_owner: value.value.copyrightOwner,
        p_copyright_year: value.value.copyrightYear,
        p_source: value.value.source,
        p_responsorial_book: value.value.responsorialBook,
        p_responsorial_number: value.value.responsorialNumber,
        p_responsorial_citations: value.value.responsorialCitations,
        p_lyrics: value.value.lyrics || null,
        p_suggestion_parts: value.value.suggestionParts,
        p_in_repertoire: value.value.inRepertoire !== false,
      },
    };
  };
  const invokeSemantic = async body => {
    const { data, error } = await supabase.functions.invoke("semantic-songs", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  return {
    subscribePlan(date, onValue, onError) {
      const cached = readSharedPlanCache(storage, date);
      let hasCachedPlan = Boolean(cached);
      if (cached) onValue(cached, { offline: true, cached: true });

      let active = true;
      let loading = false;
      let refreshPending = false;
      const refresh = async () => {
        if (!active) return;
        if (loading) {
          refreshPending = true;
          return;
        }
        loading = true;
        try {
          const plan = await loadPlan(date);
          if (!active) return;
          writeSharedPlanCache(storage, date, plan);
          hasCachedPlan = true;
          onValue(plan, { offline: false });
        } catch (error) {
          if (active && onError) {
            onError(error, {
              offline: !isOnline() || isNetworkFailure(error),
              cached: hasCachedPlan,
            });
          }
        } finally {
          loading = false;
          if (refreshPending) {
            refreshPending = false;
            refresh();
          }
        }
      };
      refresh();

      const channel = supabase
        .channel("mass-plan-" + date + "-" + random().toString(36).slice(2))
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "plans", filter: "sunday=eq." + date },
          refresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "plan_songs", filter: "sunday=eq." + date },
          refresh,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "songs" },
          refresh,
        )
        .subscribe();

      return () => {
        active = false;
        supabase.removeChannel(channel);
      };
    },
    subscribeAuth(onValue) {
      let active = true;
      let generation = 0;
      const resolveEditor = async (session, requestGeneration) => {
        const user = session?.user || null;
        let isEditor = false;
        if (user) {
          const { data, error } = await supabase
            .from("editors")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (error && active && requestGeneration === generation) {
            logger.warn("Could not verify editor access", error);
          }
          isEditor = Boolean(data);
        }
        if (active && requestGeneration === generation) onValue({ user, isEditor });
      };

      const initialGeneration = ++generation;
      supabase.auth.getSession()
        .then(({ data, error }) => {
          if (error && active && initialGeneration === generation) {
            logger.warn("Could not read authentication session", error);
          }
          return resolveEditor(data?.session, initialGeneration);
        })
        .catch(error => {
          if (active && initialGeneration === generation) {
            logger.warn("Could not read authentication session", error);
            onValue({ user: null, isEditor: false });
          }
        });
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        const requestGeneration = ++generation;
        defer(() => resolveEditor(session, requestGeneration), 0);
      });
      return () => {
        active = false;
        authListener.subscription.unsubscribe();
      };
    },
    async getPlan(date) {
      requireOnline();
      return loadPlan(date);
    },
    async searchSongs(query) {
      requireOnline();
      const { data, error } = await supabase
        .from("songs")
        .select(`
          id,
          title,
          youtube_video_id,
          authors,
          copyright_owner,
          copyright_year,
          source,
          responsorial_book,
          responsorial_number,
          responsorial_citations,
          in_repertoire,
          suggestion_parts,
          song_lyrics (lyrics)
        `)
        .order("title");
      if (error) throw error;
      return songCatalogApi.search((data || []).map(planDataApi.songFromRow), query);
    },
    async suggestSongs(citations, part, psalmCitation = "") {
      requireOnline();
      const { data, error } = part === "psalm"
        ? await supabase.rpc("suggest_psalms_for_reading", {
            p_citation: psalmCitation,
            p_limit: 3,
          })
        : await supabase.rpc("suggest_songs_for_readings", {
            p_citations: citations,
            p_part: part,
            p_limit: 3,
          });
      if (error) throw error;
      return (data || []).map(planDataApi.songFromRow);
    },
    async syncSongEmbedding(songId) {
      requireOnline();
      return invokeSemantic({ action: "sync-songs", songIds: [songId] });
    },
    async getSong(songId) {
      requireOnline();
      const { data, error } = await supabase
        .from("songs")
        .select(`
          id,
          title,
          youtube_video_id,
          authors,
          copyright_owner,
          copyright_year,
          source,
          responsorial_book,
          responsorial_number,
          responsorial_citations,
          in_repertoire,
          suggestion_parts,
          song_lyrics (lyrics)
        `)
        .eq("id", songId)
        .single();
      if (error) throw error;
      return planDataApi.songFromRow(data);
    },
    async assignSong(date, part, songId) {
      requireOnline();
      const { error } = await supabase.rpc("assign_plan_song", {
        p_sunday: date,
        p_part: part,
        p_song_id: songId,
      });
      if (error) throw error;
    },
    async createAndAssignSong(date, part, draft) {
      requireOnline();
      const song = rpcDraft(draft);
      const { data, error } = await supabase.rpc("create_and_assign_song", {
        p_sunday: date,
        p_part: part,
        ...song.params,
      });
      if (error) throw error;
      return { id: data, ...song.value };
    },
    async updateSong(songId, draft) {
      requireOnline();
      const song = rpcDraft(draft);
      const { error } = await supabase.rpc("update_song", {
        p_song_id: songId,
        ...song.params,
      });
      if (error) throw error;
      return { id: songId, ...song.value };
    },
    async clearSong(date, part) {
      requireOnline();
      const { error } = await supabase.rpc("clear_plan_song", {
        p_sunday: date,
        p_part: part,
      });
      if (error) throw error;
    },
    async getWeeklyLyrics(date) {
      requireOnline();
      const { data, error } = await supabase
        .from("plan_song_lyrics")
        .select("sunday,part,song_id,lyrics")
        .eq("sunday", date);
      if (error) throw error;
      return Object.fromEntries((data || []).map(row => [row.part, {
        sunday: row.sunday,
        part: row.part,
        songId: row.song_id,
        lyrics: row.lyrics,
      }]));
    },
    async getWeeklyLyricsParts(date) {
      const values = await this.getWeeklyLyrics(date);
      return Object.keys(values);
    },
    async getWeeklyLyricsContext(date, part, songId) {
      requireOnline();
      const currentQuery = supabase
        .from("plan_song_lyrics")
        .select("sunday,part,song_id,lyrics")
        .eq("sunday", date)
        .eq("part", part)
        .eq("song_id", songId)
        .maybeSingle();
      const previousSamePartQuery = supabase
        .from("plan_song_lyrics")
        .select("sunday,part,song_id,lyrics")
        .eq("song_id", songId)
        .eq("part", part)
        .lt("sunday", date)
        .order("sunday", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previousOtherPartQuery = supabase
        .from("plan_song_lyrics")
        .select("sunday,part,song_id,lyrics")
        .eq("song_id", songId)
        .neq("part", part)
        .lt("sunday", date)
        .order("sunday", { ascending: false })
        .order("part", { ascending: true })
        .limit(1)
        .maybeSingle();
      const [currentResult, samePartResult, otherPartResult] = await Promise.all([
        currentQuery,
        previousSamePartQuery,
        previousOtherPartQuery,
      ]);
      if (currentResult.error) throw currentResult.error;
      if (samePartResult.error) throw samePartResult.error;
      if (otherPartResult.error) throw otherPartResult.error;
      const map = row => row ? {
        sunday: row.sunday,
        part: row.part,
        songId: row.song_id,
        lyrics: row.lyrics,
      } : null;
      const previous = [samePartResult.data, otherPartResult.data]
        .filter(Boolean)
        .sort((a, b) => b.sunday.localeCompare(a.sunday)
          || Number(a.part !== part) - Number(b.part !== part))[0] || null;
      return { current: map(currentResult.data), previous: map(previous) };
    },
    async saveWeeklyLyrics(date, part, songId, lyrics) {
      requireOnline();
      const { error } = await supabase.rpc("save_plan_song_lyrics", {
        p_sunday: date,
        p_part: part,
        p_song_id: songId,
        p_lyrics: lyrics,
      });
      if (error) throw error;
    },
    async clearWeeklyLyrics(date, part, songId) {
      requireOnline();
      const { error } = await supabase.rpc("clear_plan_song_lyrics", {
        p_sunday: date,
        p_part: part,
        p_song_id: songId,
      });
      if (error) throw error;
    },
    async saveReadingOverride(date, slot, readingOverride) {
      requireOnline();
      const { error } = await supabase.rpc("save_reading_override", {
        p_sunday: date,
        p_slot: slot,
        p_override: readingOverride,
      });
      if (error) throw error;
    },
    async clearReadingOverride(date, slot) {
      requireOnline();
      const { error } = await supabase.rpc("clear_reading_override", {
        p_sunday: date,
        p_slot: slot || null,
      });
      if (error) throw error;
    },
    async saveCelebrationOverride(date, celebrationOverride) {
      requireOnline();
      const { error } = await supabase.rpc("save_celebration_override", {
        p_sunday: date,
        p_override: celebrationOverride,
      });
      if (error) throw error;
    },
    async clearCelebrationOverride(date) {
      requireOnline();
      const { error } = await supabase.rpc("clear_celebration_override", {
        p_sunday: date,
      });
      if (error) throw error;
    },
    async signIn(email, password) {
      requireOnline();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };
}

async function supabaseStore(config) {
  const createClient = globalThis.MassPlannerSupabaseClient?.create;
  if (!createClient) throw new Error("Shared Supabase client bootstrap is unavailable");
  const supabase = await createClient(config);
  return createSupabaseStore(supabase);
}

async function start() {
  const local = location.hostname === "localhost"
    || location.hostname === "127.0.0.1"
    || location.protocol === "file:";
  let store;
  if (window.MASS_PLANNER_SUPABASE_CONFIG) {
    try {
      store = await supabaseStore(window.MASS_PLANNER_SUPABASE_CONFIG);
    } catch (error) {
      console.error("Supabase startup failed", error);
      store = unavailableStore({ reason: error });
    }
  } else {
    store = local ? localStore() : unavailableStore();
  }
  window.massPlanApp.connect(store);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { emptyPlan, localStore, unavailableStore, createSupabaseStore };
}

if (typeof window !== "undefined" && window.massPlanApp) start();
