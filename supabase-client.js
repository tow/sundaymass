const SUPABASE_MODULE_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

function emptyPlan() {
  return { choices: {}, readingOverrides: {}, celebrationOverride: null };
}

function normalizePlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyPlan();
  if ("choices" in value || "readingOverrides" in value) {
    return {
      choices: value.choices && typeof value.choices === "object" ? value.choices : {},
      readingOverrides: value.readingOverrides && typeof value.readingOverrides === "object" ? value.readingOverrides : {},
      celebrationOverride: value.celebrationOverride && typeof value.celebrationOverride === "object" ? value.celebrationOverride : null,
    };
  }
  // Backwards compatibility with localStorage values created before reading overrides.
  return { choices: value, readingOverrides: {}, celebrationOverride: null };
}

function localStore() {
  const listeners = new Map();
  let editor = false;
  const storageKey = date => "st-james-plan-" + date;
  const read = date => {
    try {
      return normalizePlan(JSON.parse(localStorage.getItem(storageKey(date))));
    } catch (error) {
      console.warn("Could not read local plan", error);
      return emptyPlan();
    }
  };
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
      const notify = () => onValue({ user: editor ? { displayName: "Local editor" } : null, isEditor: editor });
      this._notifyAuth = notify;
      notify();
      return () => {};
    },
    async savePart(date, key, choice) {
      if (!editor) throw new Error("Sign in before editing");
      const plan = read(date);
      plan.choices[key] = {
        song: choice.song || "",
        youtubeUrl: choice.youtubeUrl || "",
        authors: choice.authors || "",
        copyrightOwner: choice.copyrightOwner || "",
        copyrightYear: choice.copyrightYear || "",
        source: choice.source || "",
      };
      localStorage.setItem(storageKey(date), JSON.stringify(plan));
      emit(date);
    },
    async saveReadingOverride(date, slot, readingOverride) {
      if (!editor) throw new Error("Sign in before editing");
      const plan = read(date);
      plan.readingOverrides[slot] = readingOverride;
      localStorage.setItem(storageKey(date), JSON.stringify(plan));
      emit(date);
    },
    async clearReadingOverride(date, slot) {
      if (!editor) throw new Error("Sign in before editing");
      const plan = read(date);
      if (slot) delete plan.readingOverrides[slot];
      else plan.readingOverrides = {};
      localStorage.setItem(storageKey(date), JSON.stringify(plan));
      emit(date);
    },
    async saveCelebrationOverride(date, celebrationOverride) {
      if (!editor) throw new Error("Sign in before editing");
      const plan = read(date);
      plan.celebrationOverride = celebrationOverride;
      plan.readingOverrides = {};
      localStorage.setItem(storageKey(date), JSON.stringify(plan));
      emit(date);
    },
    async clearCelebrationOverride(date) {
      if (!editor) throw new Error("Sign in before editing");
      const plan = read(date);
      plan.celebrationOverride = null;
      plan.readingOverrides = {};
      localStorage.setItem(storageKey(date), JSON.stringify(plan));
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
    async savePart() {
      throw new Error("Supabase has not been configured");
    },
    async saveReadingOverride() {
      throw new Error("Supabase has not been configured");
    },
    async clearReadingOverride() {
      throw new Error("Supabase has not been configured");
    },
    async saveCelebrationOverride() {
      throw new Error("Supabase has not been configured");
    },
    async clearCelebrationOverride() {
      throw new Error("Supabase has not been configured");
    },
    async signIn() {
      throw new Error("Supabase has not been configured");
    },
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
  const cacheKey = date => "st-james-plan-cache-" + date;
  const cacheRead = date => {
    try {
      const raw = localStorage.getItem(cacheKey(date));
      return raw ? normalizePlan(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  };
  const cacheWrite = (date, plan) => {
    localStorage.setItem(cacheKey(date), JSON.stringify(normalizePlan(plan)));
  };
  const planFromRow = row => {
    return {
      choices: row?.choices || {},
      readingOverrides: row?.reading_overrides || {},
      celebrationOverride: row?.celebration_override || null,
    };
  };

  return {
    subscribePlan(date, onValue, onError) {
      const cached = cacheRead(date);
      if (cached) onValue(cached, { offline: true });

      let active = true;
      supabase
        .from("plans")
        .select("choices, reading_overrides, celebration_override")
        .eq("sunday", date)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            onError(error);
            return;
          }
          const plan = planFromRow(data);
          cacheWrite(date, plan);
          onValue(plan, { offline: false });
        });

      const channel = supabase
        .channel("mass-plan-" + date + "-" + Math.random().toString(36).slice(2))
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "plans", filter: "sunday=eq." + date },
          payload => {
            if (!active) return;
            const plan = planFromRow(payload.new);
            cacheWrite(date, plan);
            onValue(plan, { offline: false });
          },
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
          isEditor = !!data;
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
    async savePart(date, key, choice) {
      const { error } = await supabase.rpc("save_music_choice", {
        p_sunday: date,
        p_part: key,
        p_song: choice.song || "",
        p_youtube_url: choice.youtubeUrl || "",
        p_authors: choice.authors || "",
        p_copyright_owner: choice.copyrightOwner || "",
        p_copyright_year: choice.copyrightYear || "",
        p_source: choice.source || "",
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
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
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
