// Persistence adapter: Supabase in production, local storage during local development.
const SUPABASE_MODULE_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const planData = () => window.PlanMusicData;
const songCatalog = () => window.SongCatalog;

function emptyPlan() {
  return planData().emptyPlan();
}

function localStore() {
  const listeners = new Map();
  let editor = false;
  const planKey = date => "st-james-plan-v2-" + date;
  const songsKey = "st-james-song-catalog-v1";

  const readSongs = () => {
    try {
      const value = JSON.parse(localStorage.getItem(songsKey));
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.warn("Could not read local songs", error);
      return [];
    }
  };
  const writeSongs = songs => localStorage.setItem(songsKey, JSON.stringify(songs));
  const readPlanRecord = date => {
    try {
      const value = JSON.parse(localStorage.getItem(planKey(date)));
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
        : emptyPlan();
    } catch (error) {
      console.warn("Could not read local plan", error);
      return emptyPlan();
    }
  };
  const writePlanRecord = (date, plan) => localStorage.setItem(planKey(date), JSON.stringify(plan));
  const read = date => {
    const record = readPlanRecord(date);
    const songsById = Object.fromEntries(readSongs().map(song => [song.id, song]));
    const publicSong = song => ({
      id: song.id,
      title: song.title,
      youtubeUrl: song.youtubeUrl,
      authors: song.authors,
      copyrightOwner: song.copyrightOwner,
      copyrightYear: song.copyrightYear,
      source: song.source,
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
  const emit = date => {
    const callback = listeners.get(date);
    if (callback) callback(read(date), { offline: true });
  };
  const newId = () => globalThis.crypto?.randomUUID?.()
    || "local-" + Date.now() + "-" + Math.random().toString(36).slice(2);

  return {
    subscribePlan(date, onValue) {
      listeners.set(date, onValue);
      onValue(read(date), { offline: true });
      return () => listeners.delete(date);
    },
    subscribeAuth(onValue) {
      const notify = () => onValue({
        user: editor ? { displayName: "Local editor" } : null,
        isEditor: editor,
      });
      this._notifyAuth = notify;
      notify();
      return () => {};
    },
    async searchSongs(query) {
      requireEditor();
      return songCatalog().search(readSongs(), query);
    },
    async suggestSongs() {
      requireEditor();
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
      const plan = readPlanRecord(date);
      plan.songs[part] = songId;
      writePlanRecord(date, plan);
      emit(date);
    },
    async createAndAssignSong(date, part, draft) {
      requireEditor();
      const validation = songCatalog().validateDraft(draft);
      if (!validation.valid) throw new Error(validation.error);
      const song = { id: newId(), ...validation.value };
      writeSongs([...readSongs(), song]);
      const plan = readPlanRecord(date);
      plan.songs[part] = song.id;
      writePlanRecord(date, plan);
      emit(date);
      return song;
    },
    async updateSong(songId, draft) {
      requireEditor();
      const validation = songCatalog().validateDraft(draft);
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
      emit(date);
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
      this._notifyAuth();
    },
    async signOut() {
      editor = false;
      this._notifyAuth();
    },
  };
}

function unavailableStore() {
  const unavailable = async () => {
    throw new Error("Supabase has not been configured");
  };
  return {
    subscribePlan(date, onValue, onError) {
      onValue(emptyPlan(), { offline: false });
      if (onError) onError(new Error("Supabase has not been configured"));
      return () => {};
    },
    subscribeAuth(onValue) {
      onValue({ user: null, isEditor: false });
      return () => {};
    },
    searchSongs: unavailable,
    suggestSongs: unavailable,
    syncSongEmbedding: unavailable,
    getSong: unavailable,
    assignSong: unavailable,
    createAndAssignSong: unavailable,
    updateSong: unavailable,
    clearSong: unavailable,
    saveReadingOverride: unavailable,
    clearReadingOverride: unavailable,
    saveCelebrationOverride: unavailable,
    clearCelebrationOverride: unavailable,
    signIn: unavailable,
    async signOut() {},
  };
}

async function supabaseStore(config) {
  const { createClient } = await import(SUPABASE_MODULE_URL);
  const supabase = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  const cacheKey = date => "st-james-plan-cache-v2-" + date;
  const cacheRead = date => {
    try {
      const raw = localStorage.getItem(cacheKey(date));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const cacheWrite = (date, plan) => localStorage.setItem(cacheKey(date), JSON.stringify(plan));
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
            youtube_url,
            authors,
            copyright_owner,
            copyright_year,
            source
          )
        )
      `)
      .eq("sunday", date)
      .maybeSingle();
    if (error) throw error;
    return planData().planFromRow(data);
  };
  const rpcDraft = draft => {
    const value = songCatalog().validateDraft(draft);
    if (!value.valid) throw new Error(value.error);
    return {
      value: value.value,
      params: {
        p_title: value.value.title,
        p_youtube_url: value.value.youtubeUrl,
        p_authors: value.value.authors,
        p_copyright_owner: value.value.copyrightOwner,
        p_copyright_year: value.value.copyrightYear,
        p_source: value.value.source,
        p_lyrics: value.value.lyrics || null,
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
      const cached = cacheRead(date);
      if (cached) onValue(cached, { offline: true });

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
          cacheWrite(date, plan);
          onValue(plan, { offline: false });
        } catch (error) {
          if (active && onError) onError(error);
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
        .channel("mass-plan-" + date + "-" + Math.random().toString(36).slice(2))
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
      const resolveEditor = async session => {
        const user = session?.user || null;
        let isEditor = false;
        if (user) {
          const { data, error } = await supabase
            .from("editors")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (error) console.warn("Could not verify editor access", error);
          isEditor = Boolean(data);
        }
        if (active) onValue({ user, isEditor });
      };

      supabase.auth.getSession().then(({ data }) => resolveEditor(data.session));
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        setTimeout(() => resolveEditor(session), 0);
      });
      return () => {
        active = false;
        authListener.subscription.unsubscribe();
      };
    },
    async searchSongs(query) {
      const { data, error } = await supabase
        .from("songs")
        .select(`
          id,
          title,
          youtube_url,
          authors,
          copyright_owner,
          copyright_year,
          source,
          song_lyrics (lyrics)
        `)
        .order("title");
      if (error) throw error;
      return songCatalog().search((data || []).map(planData().songFromRow), query);
    },
    async suggestSongs(citations) {
      const result = await invokeSemantic({ action: "suggest", citations });
      return (result.songs || []).map(planData().songFromRow);
    },
    async syncSongEmbedding(songId) {
      return invokeSemantic({ action: "sync-songs", songIds: [songId] });
    },
    async getSong(songId) {
      const { data, error } = await supabase
        .from("songs")
        .select(`
          id,
          title,
          youtube_url,
          authors,
          copyright_owner,
          copyright_year,
          source,
          song_lyrics (lyrics)
        `)
        .eq("id", songId)
        .single();
      if (error) throw error;
      return planData().songFromRow(data);
    },
    async assignSong(date, part, songId) {
      const { error } = await supabase.rpc("assign_plan_song", {
        p_sunday: date,
        p_part: part,
        p_song_id: songId,
      });
      if (error) throw error;
    },
    async createAndAssignSong(date, part, draft) {
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
      const song = rpcDraft(draft);
      const { error } = await supabase.rpc("update_song", {
        p_song_id: songId,
        ...song.params,
      });
      if (error) throw error;
      return { id: songId, ...song.value };
    },
    async clearSong(date, part) {
      const { error } = await supabase.rpc("clear_plan_song", {
        p_sunday: date,
        p_part: part,
      });
      if (error) throw error;
    },
    async saveReadingOverride(date, slot, readingOverride) {
      const { error } = await supabase.rpc("save_reading_override", {
        p_sunday: date,
        p_slot: slot,
        p_override: readingOverride,
      });
      if (error) throw error;
    },
    async clearReadingOverride(date, slot) {
      const { error } = await supabase.rpc("clear_reading_override", {
        p_sunday: date,
        p_slot: slot || null,
      });
      if (error) throw error;
    },
    async saveCelebrationOverride(date, celebrationOverride) {
      const { error } = await supabase.rpc("save_celebration_override", {
        p_sunday: date,
        p_override: celebrationOverride,
      });
      if (error) throw error;
    },
    async clearCelebrationOverride(date) {
      const { error } = await supabase.rpc("clear_celebration_override", {
        p_sunday: date,
      });
      if (error) throw error;
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };
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
      store = unavailableStore();
    }
  } else {
    store = local ? localStore() : unavailableStore();
  }
  window.massPlanApp.connect(store);
}

start();
