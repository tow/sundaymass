// Loads only the reading texts needed by the selected Sunday and retains them in memory.
(function (global) {
  "use strict";

  function create({
    assets,
    values = {},
    fetchImpl = global.fetch?.bind(global),
    assetUrl = path => global.AppAssets?.url(path)
      || new URL(`./${path}`, global.document.baseURI).href,
    fullCatalogPath = "data/generated/readings_text.json",
  }) {
    const pending = new Map();

    function get(citation) {
      return values[citation] || "";
    }

    function has(citation) {
      return Boolean(!citation || Object.hasOwn(values, citation));
    }

    async function requestJson(path) {
      if (!fetchImpl) throw new Error("Reading text loading is unavailable");
      const response = await fetchImpl(assetUrl(path));
      if (!response.ok) throw new Error(`Reading text request returned ${response.status}`);
      return response.json();
    }

    async function load(citation) {
      if (!citation || has(citation)) return get(citation);
      const filename = assets[citation];
      if (!filename) throw new Error(`Reading text is unavailable for ${citation}`);
      if (!pending.has(citation)) {
        pending.set(citation, requestJson(`data/readings/${filename}`)
          .then(text => {
            if (typeof text !== "string") throw new Error("Reading text response was invalid");
            values[citation] = text;
            return text;
          })
          .finally(() => pending.delete(citation)));
      }
      return pending.get(citation);
    }

    async function loadMany(citations) {
      const unique = [...new Set((citations || []).filter(Boolean))];
      await Promise.all(unique.map(load));
      return Object.fromEntries(unique.map(citation => [citation, get(citation)]));
    }

    async function loadAll() {
      const catalogue = await requestJson(fullCatalogPath);
      if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) {
        throw new Error("Reading catalogue response was invalid");
      }
      Object.assign(values, catalogue);
      return values;
    }

    return Object.freeze({ get, has, load, loadAll, loadMany, values: () => values });
  }

  const api = Object.freeze({ create });
  global.ReadingTextStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
