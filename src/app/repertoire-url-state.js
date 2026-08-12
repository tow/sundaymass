// Serialises public repertoire filters into a shareable browser URL.
(function (global) {
  "use strict";

  const scopes = new Set(["repertoire", "library", "review"]);
  const maxQueryLength = 200;

  function normalize(state = {}) {
    return {
      scope: scopes.has(state.scope) ? state.scope : "repertoire",
      query: String(state.query || "").trim().slice(0, maxQueryLength),
    };
  }

  function read(location) {
    try {
      const url = new URL(location.href);
      return normalize({
        scope: url.searchParams.get("scope"),
        query: url.searchParams.get("q"),
      });
    } catch {
      return normalize();
    }
  }

  function write(window, state, { replace = false } = {}) {
    const value = normalize(state);
    const url = new URL(window.location.href);
    url.searchParams.set("scope", value.scope);
    if (value.query) url.searchParams.set("q", value.query);
    else url.searchParams.delete("q");
    url.hash = "";
    const relativeUrl = `${url.pathname}${url.search}`;
    const currentUrl = new URL(window.location.href);
    const currentRelativeUrl = `${currentUrl.pathname}${currentUrl.search}`;
    if (relativeUrl === currentRelativeUrl && !currentUrl.hash) return false;
    const method = replace ? "replaceState" : "pushState";
    window.history[method](null, "", relativeUrl);
    return true;
  }

  const api = Object.freeze({ read, write });
  global.RepertoireUrlState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
