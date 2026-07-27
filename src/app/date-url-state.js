// Keeps the selected Sunday in the browser URL without owning calendar rules.
(function (global) {
  "use strict";

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function read(location) {
    try {
      const value = new URL(location.href).searchParams.get("date") || "";
      return ISO_DATE.test(value) ? value : "";
    } catch {
      return "";
    }
  }

  function write(window, date, { replace = false } = {}) {
    if (!ISO_DATE.test(date || "")) return false;
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    url.hash = "";
    const relativeUrl = `${url.pathname}${url.search}`;
    const method = replace ? "replaceState" : "pushState";
    window.history[method](null, "", relativeUrl);
    return true;
  }

  const api = Object.freeze({ read, write });
  global.DateUrlState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
