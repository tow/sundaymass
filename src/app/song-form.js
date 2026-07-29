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
        responsorialBook: elements.responsorialBook?.value || "",
        responsorialNumber: elements.responsorialNumber?.value || "",
        responsorialCitations: elements.responsorialCitations?.value || "",
        lyrics: elements.lyrics.value,
        inRepertoire: elements.inRepertoire.checked,
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
      if (elements.responsorialBook) {
        elements.responsorialBook.value = value.responsorialBook || "";
        elements.responsorialNumber.value = value.responsorialNumber || "";
        elements.responsorialCitations.value = (value.responsorialCitations || []).join("\n");
      }
      elements.lyrics.value = value.lyrics || "";
      elements.inRepertoire.checked = song ? value.inRepertoire !== false : true;
      const selected = new Set(song
        ? value.suggestionParts || []
        : defaultSuggestionParts);
      suggestionInputs().forEach(input => {
        input.checked = selected.has(input.value);
      });
      renderResponsorialFields();
    }

    function renderResponsorialFields() {
      if (!elements.responsorialFields) return;
      const selected = suggestionInputs()
        .some(input => input.value === "psalm" && input.checked);
      elements.responsorialFields.hidden = !selected;
      if (elements.responsorialBook) {
        elements.responsorialBook.required = selected;
        elements.responsorialNumber.required = selected;
      }
    }

    suggestionInputs().forEach(input => {
      if (input.value === "psalm") input.addEventListener("change", renderResponsorialFields);
    });

    return Object.freeze({ read, renderResponsorialFields, write });
  }

  const api = Object.freeze({ create });
  global.SongForm = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
