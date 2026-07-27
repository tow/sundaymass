// Shared browser bootstrap for the pinned, locally built Supabase client.
(function (global) {
  "use strict";

  function defaultModuleUrl() {
    if (typeof document === "undefined") return "../../vendor/supabase.js";
    return new URL("./vendor/supabase.js", document.baseURI).href;
  }

  async function create(config, {
    moduleUrl = defaultModuleUrl(),
    importModule = specifier => import(specifier),
  } = {}) {
    if (!config?.url || !config?.publishableKey) {
      throw new Error("Supabase URL and publishable key are required");
    }
    const { createClient } = await importModule(moduleUrl);
    if (typeof createClient !== "function") {
      throw new Error("The local Supabase bundle does not export createClient");
    }
    return createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  const api = Object.freeze({ create });
  global.MassPlannerSupabaseClient = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
