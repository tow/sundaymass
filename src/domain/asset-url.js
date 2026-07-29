// Resolves build-versioned assets from a GitHub Pages project subdirectory.
(function (global) {
  "use strict";

  function url(path, documentValue = global.document) {
    const normalized = String(path || "").replace(/^\.\//, "");
    const version = global.MASS_PLANNER_ASSET_VERSIONS?.[normalized] || "";
    const suffix = version ? `?v=${encodeURIComponent(version)}` : "";
    if (!documentValue) return `../../${normalized}${suffix}`;
    return new URL(`./${normalized}${suffix}`, documentValue.baseURI).href;
  }

  const api = Object.freeze({ url });
  global.AppAssets = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
