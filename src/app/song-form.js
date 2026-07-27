// Canonical mapping between song editor controls and song draft values.
(function (global) {
  "use strict";

  function create(elements) {
    const suggestionInputs = () => [
      ...elements.suggestionParts.querySelectorAll('input[type="checkbox"]'),
    ];

    function read() {
      return {
        title: elements.title.value,
        youtubeUrl: elements.youtubeUrl.value,
        authors: elements.authors.value,
        copyrightOwner: elements.copyrightOwner.value,
        copyrightYear: elements.copyrightYear.value,
        source: elements.source.value,
        lyrics: elements.lyrics.value,
        suggestionParts: suggestionInputs()
          .filter(input => input.checked)
          .map(input => input.value),
      };
    }

    function write(song, {
      fallbackTitle = "",
      defaultSuggestionParts = [],
    } = {}) {
      const value = song || {};
      elements.title.value = song ? value.title || "" : fallbackTitle;
      elements.youtubeUrl.value = value.youtubeUrl || "";
      elements.authors.value = value.authors || "";
      elements.copyrightOwner.value = value.copyrightOwner || "";
      elements.copyrightYear.value = value.copyrightYear || "";
      elements.source.value = value.source || "";
      elements.lyrics.value = value.lyrics || "";
      const selected = new Set(song
        ? value.suggestionParts || []
        : defaultSuggestionParts);
      suggestionInputs().forEach(input => {
        input.checked = selected.has(input.value);
      });
    }

    return Object.freeze({ read, write });
  }

  const api = Object.freeze({ create });
  global.SongForm = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
