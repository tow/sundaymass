// Pure song validation and phase-one title search shared by the app and tests.
(function (global) {
  "use strict";

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
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
    normalizeDraft,
    validateDraft,
    hasLyrics,
    search,
    creationActionLabel,
  };
})(typeof window === "undefined" ? globalThis : window);
