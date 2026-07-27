// Canonical ordered Mass music parts shared by the UI, suggestions and DOCX builders.
(function (global) {
  "use strict";

  const parts = [
    { key: "entrance", token: "ENTRANCE", label: "Entrance / Processional Hymn", note: "" },
    { key: "kyrie", token: "KYRIE", label: "Kyrie — Lord, Have Mercy", note: "" },
    { key: "gloria", token: "GLORIA", label: "Gloria — Glory to God", note: "(omitted in Advent & Lent)" },
    { key: "psalm", token: "PSALM_MUSIC", label: "Responsorial Psalm", note: "" },
    { key: "acclamation", token: "ACCLAMATION", label: "Gospel Acclamation — Alleluia", note: "(Lenten acclamation in Lent)" },
    { key: "offertory", token: "OFFERTORY", label: "Preparation of the Gifts / Offertory", note: "" },
    { key: "sanctus", token: "SANCTUS", label: "Sanctus — Holy, Holy, Holy", note: "" },
    { key: "memorial", token: "MEMORIAL", label: "Memorial Acclamation — Mystery of Faith", note: "" },
    { key: "amen", token: "AMEN", label: "Great Amen", note: "" },
    { key: "lordPrayer", token: "LORD_PRAYER", label: "The Lord's Prayer — Our Father", note: "(if sung)" },
    { key: "agnus", token: "AGNUS", label: "Agnus Dei — Lamb of God", note: "" },
    { key: "communion", token: "COMMUNION", label: "Communion Hymn 1", note: "" },
    { key: "communion2", token: "COMMUNION_2", label: "Communion Hymn 2", note: "" },
    { key: "recessional", token: "RECESSIONAL", label: "Recessional / Closing Hymn", note: "" },
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
