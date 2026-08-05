// Pure validation for choir song requests: an existing song or free-text details.
(function (global) {
  "use strict";

  const massMusicParts = global.MassMusicParts
    || (typeof require === "function" ? require("./music-parts.js") : null);
  const songPresentation = global.SongPresentation
    || (typeof require === "function" ? require("./song-presentation.js") : null);

  const TITLE_LIMIT = 200;
  const NOTE_LIMIT = 2000;
  const PART_KEYS = new Set(massMusicParts.parts.map(part => part.key));

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function validateDraft(value) {
    const draft = value && typeof value === "object" ? value : {};
    const songId = text(draft.songId);
    const title = text(draft.title);
    const youtubeUrl = text(draft.youtubeUrl);
    const youtubeVideoId = songPresentation.youtubeVideoId(youtubeUrl);
    const normalized = {
      songId: songId || null,
      title: songId ? "" : title,
      youtubeVideoId: songId ? "" : youtubeVideoId,
      note: text(draft.note),
      sunday: text(draft.sunday) || null,
      part: text(draft.part) || null,
    };
    const invalid = error => ({ valid: false, error, value: normalized });
    if (!songId && !title) {
      return invalid("Choose a song from the list or enter a title.");
    }
    if (!songId && title.length > TITLE_LIMIT) {
      return invalid("Keep the title under 200 characters.");
    }
    if (!songId && youtubeUrl && !youtubeVideoId) {
      return invalid("Enter a valid YouTube video link.");
    }
    if (normalized.note.length > NOTE_LIMIT) {
      return invalid("Keep the note under 2000 characters.");
    }
    if (normalized.part && !PART_KEYS.has(normalized.part)) {
      return invalid("Invalid music part.");
    }
    return { valid: true, error: "", value: normalized };
  }

  const api = Object.freeze({ validateDraft });
  global.SongRequests = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
