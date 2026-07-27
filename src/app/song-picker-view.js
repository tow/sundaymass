// Pure presentation rules for searchable and suggested song-picker results.
(function (global) {
  "use strict";

  function create({ escapeHtml, safeYoutubeUrl = () => "" }) {
    function normalizedTitle(song) {
      return String(song?.title || "").trim().toLocaleLowerCase();
    }

    function resultDescription(song, songs) {
      const items = [
        song.authors,
        song.copyrightYear,
        song.copyrightOwner,
        song.source,
      ].filter(Boolean);
      if (song.inRepertoire === false) items.push("Extended library");
      if (song.hasLyrics) items.push("Lyrics recorded");
      const title = normalizedTitle(song);
      const sameTitle = songs.filter(value => normalizedTitle(value) === title);
      if (sameTitle.length > 1) items.push(`Separate record ${song.id.slice(0, 8)}`);
      return items.join(" · ") || "No additional details";
    }

    function renderSearchResults({ songs, selectedSong }) {
      return Object.freeze({
        html: songs.map((song, index) => {
          const selected = selectedSong?.id === song.id;
          return `<button class="song-result${selected ? " selected" : ""}" type="button" `
            + `data-song-index="${index}" aria-pressed="${selected}">`
            + `<strong>${escapeHtml(song.title)}</strong>`
            + `<span>${escapeHtml(resultDescription(song, songs))}</span></button>`;
        }).join(""),
        hasResults: songs.length > 0,
        useDisabled: !selectedSong,
      });
    }

    function renderSuggestions({ songs, selectedSong, interactive = true }) {
      return Object.freeze({
        html: songs.map((song, index) => {
          const selected = selectedSong?.id === song.id;
          const listenUrl = interactive ? "" : safeYoutubeUrl(song.youtubeUrl);
          const listenLink = listenUrl
            ? ` <a class="song-suggestion-listen" href="${escapeHtml(listenUrl)}" target="_blank" rel="noopener">Listen ↗</a>`
            : "";
          const opening = interactive
            ? `<button class="song-suggestion${selected ? " selected" : ""}" type="button" data-song-suggestion-index="${index}">`
            : '<article class="song-suggestion song-suggestion-readonly">';
          return opening
            + `<strong>${escapeHtml(song.title)}${listenLink}</strong>`
            + `<span>${escapeHtml([
              song.authors || "Author not recorded",
              song.inRepertoire === false ? "Extended library" : "",
            ].filter(Boolean).join(" · "))}</span>`
            + (interactive ? "</button>" : "</article>");
        }).join(""),
        hasSuggestions: songs.length > 0,
      });
    }

    function currentSelection(song) {
      return Object.freeze({
        hidden: !song,
        name: song?.title || "",
        author: song?.authors || "Author not recorded",
      });
    }

    return Object.freeze({
      currentSelection,
      renderSearchResults,
      renderSuggestions,
    });
  }

  const api = Object.freeze({ create });
  global.SongPickerView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
