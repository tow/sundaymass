// Canonical ordered Mass music parts shared by the UI, suggestions and print view.
(function (global) {
  "use strict";

  const parts = [
    { key: "entrance", label: "Entrance", note: "" },
    { key: "kyrie", label: "Kyrie", note: "" },
    { key: "gloria", label: "Gloria", note: "(omitted in Advent & Lent)" },
    { key: "psalm", label: "Psalm", note: "" },
    { key: "acclamation", label: "Gospel Acclamation", note: "(Lenten acclamation in Lent)" },
    { key: "offertory", label: "Offertory", note: "" },
    { key: "sanctus", label: "Sanctus", note: "" },
    { key: "memorial", label: "Memorial Acclamation", note: "" },
    { key: "amen", label: "Great Amen", note: "" },
    { key: "lordPrayer", label: "Lord's Prayer", note: "(if sung)" },
    { key: "agnus", label: "Agnus Dei", note: "" },
    { key: "communion", label: "Communion 1", note: "" },
    { key: "communion2", label: "Communion 2", note: "" },
    { key: "recessional", label: "Recessional", note: "" },
  ].map(part => Object.freeze(part));
  const frozenParts = Object.freeze(parts);
  const partsByKey = new Map(frozenParts.map(part => [part.key, part]));
  const suggestionKeys = new Set(
    frozenParts.map(part => part.key === "communion2" ? "communion" : part.key),
  );

  function byKey(key) {
    return partsByKey.get(key) || null;
  }

  function suggestionPartFor(part) {
    if (part === "communion2") return "communion";
    return suggestionKeys.has(part) ? part : "";
  }

  const api = Object.freeze({ parts: frozenParts, byKey, suggestionPartFor });
  global.MassMusicParts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
