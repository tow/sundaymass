const SUPABASE_MODULE_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

function emptyPlan() {
  return {};
}

function localStore() {
  const listeners = new Map();
  let editor = false;
  const storageKey = date => "st-james-plan-" + date;
  const read = date => {
    try {
      return JSON.parse(localStorage.getItem(storageKey(date))) || emptyPlan();
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
      plan[key] = {
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
      return JSON.parse(localStorage.getItem(cacheKey(date))) || emptyPlan();
    } catch {
      return emptyPlan();
    }
  };
  const cacheWrite = (date, choices) => {
    localStorage.setItem(cacheKey(date), JSON.stringify(choices || emptyPlan()));
  };

  return {
    subscribePlan(date, onValue, onError) {
      const cached = cacheRead(date);
      if (Object.keys(cached).length) onValue(cached, { offline: true });

      let active = true;
      supabase
        .from("plans")
        .select("choices")
        .eq("sunday", date)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            onError(error);
            return;
          }
          const choices = data?.choices || emptyPlan();
          cacheWrite(date, choices);
          onValue(choices, { offline: false });
        });

      const channel = supabase
        .channel("mass-plan-" + date + "-" + Math.random().toString(36).slice(2))
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "plans", filter: "sunday=eq." + date },
          payload => {
            if (!active) return;
            const choices = payload.new?.choices || emptyPlan();
            cacheWrite(date, choices);
            onValue(choices, { offline: false });
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
