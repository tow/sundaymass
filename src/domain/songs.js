// Pure song validation and phase-one title search shared by the app and tests.
(function (global) {
  "use strict";

  const massMusicParts = global.MassMusicParts
    || (typeof require === "function" ? require("./music-parts.js") : null);
  const SUGGESTION_PARTS = [
    { key: "entrance", label: "Entrance" },
    { key: "kyrie", label: "Kyrie" },
    { key: "gloria", label: "Gloria" },
    { key: "psalm", label: "Responsorial Psalm" },
    { key: "acclamation", label: "Gospel Acclamation" },
    { key: "offertory", label: "Offertory" },
    { key: "sanctus", label: "Sanctus" },
    { key: "memorial", label: "Memorial Acclamation" },
    { key: "amen", label: "Great Amen" },
    { key: "lordPrayer", label: "Lord’s Prayer" },
    { key: "agnus", label: "Lamb of God" },
    { key: "communion", label: "Communion" },
    { key: "recessional", label: "Recessional" },
  ];
  const SUGGESTION_PART_KEYS = new Set(SUGGESTION_PARTS.map(part => part.key));

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function suggestionParts(value) {
    return [...new Set(Array.isArray(value) ? value : [])]
      .filter(part => typeof part === "string" && SUGGESTION_PART_KEYS.has(part));
  }

  function suggestionPartFor(part) {
    return massMusicParts.suggestionPartFor(part);
  }

  function normalizeDraft(value) {
    const draft = value && typeof value === "object" ? value : {};
    return {
      title: text(draft.title),
      youtubeUrl: text(draft.youtubeUrl),
      authors: text(draft.authors),
      copyrightOwner: text(draft.copyrightOwner),
      copyrightYear: text(draft.copyrightYear),
      source: text(draft.source),
      lyrics: text(draft.lyrics),
      inRepertoire: draft.inRepertoire !== false,
      suggestionParts: suggestionParts(draft.suggestionParts),
    };
  }

  function validateDraft(value) {
    const normalized = normalizeDraft(value);
    if (!normalized.title) {
      return { valid: false, error: "Enter a song title.", value: normalized };
    }
    return { valid: true, error: "", value: normalized };
  }

  function hasLyrics(value) {
    return Boolean(text(value && value.lyrics));
  }

  function search(songs, query) {
    const needle = text(query).toLocaleLowerCase();
    return (Array.isArray(songs) ? songs : [])
      .filter(song => !needle || text(song && song.title).toLocaleLowerCase().includes(needle))
      .slice()
      .sort((a, b) => text(a && a.title).localeCompare(text(b && b.title))
        || text(a && a.authors).localeCompare(text(b && b.authors))
        || text(a && a.id).localeCompare(text(b && b.id)));
  }

  function creationActionLabel(query) {
    const title = text(query);
    return title
      ? `Create a new song titled “${title}”`
      : "Add a new song";
  }

  global.SongCatalog = {
    SUGGESTION_PARTS,
    suggestionPartFor,
    normalizeDraft,
    validateDraft,
    hasLyrics,
    search,
    creationActionLabel,
  };
})(typeof window === "undefined" ? globalThis : window);
