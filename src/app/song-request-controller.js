// Lets a signed-in choir member suggest a song for one Mass slot.
(function (global) {
  "use strict";

  function create({
    elements,
    parts,
    songRequests,
    getStore,
    canSuggest,
    isOnline,
    getDate,
    formatDate,
    openModal,
    onStatus,
    logger,
  }) {
    let targetPart = null;
    let selectedSong = null;
    let searchGeneration = 0;

    function partLabel(key) {
      return parts.find(part => part.key === key)?.label || key;
    }

    function syncNewSongFields() {
      const hasSelection = Boolean(selectedSong);
      elements.title.disabled = hasSelection;
      elements.youtube.disabled = hasSelection;
    }

    function renderResults(songs) {
      const document = elements.results.ownerDocument || global.document;
      elements.results.replaceChildren(...songs.slice(0, 30).map(song => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "song-request-result";
        button.setAttribute(
          "aria-pressed",
          selectedSong?.id === song.id ? "true" : "false",
        );
        const title = document.createElement("strong");
        title.textContent = song.title;
        button.append(title);
        if (song.authors) {
          const authors = document.createElement("small");
          authors.textContent = song.authors;
          button.append(authors);
        }
        button.addEventListener("click", () => {
          selectedSong = selectedSong?.id === song.id
            ? null
            : { id: song.id, title: song.title };
          renderResults(songs);
          syncNewSongFields();
        });
        return button;
      }));
    }

    async function runSearch() {
      const query = elements.search.value.trim();
      const generation = ++searchGeneration;
      if (!query) {
        elements.results.replaceChildren();
        return;
      }
      try {
        const songs = await getStore().searchPublicSongs(query);
        if (generation !== searchGeneration) return;
        renderResults(songs);
      } catch (error) {
        if (generation !== searchGeneration) return;
        logger.warn("Song request search failed", error);
      }
    }

    function open(part) {
      if (!canSuggest()) return;
      targetPart = part;
      selectedSong = null;
      searchGeneration += 1;
      elements.form.reset();
      elements.results.replaceChildren();
      elements.error.textContent = "";
      syncNewSongFields();
      elements.context.textContent =
        `For the ${partLabel(part)} on ${formatDate(getDate())}. `
        + "The music planners will see your suggestion.";
      openModal(elements.dialog);
    }

    async function submit(event) {
      event?.preventDefault?.();
      elements.error.textContent = "";
      if (!isOnline()) {
        elements.error.textContent = "Suggesting a song requires an internet connection.";
        return;
      }
      const validation = songRequests.validateDraft({
        songId: selectedSong?.id || "",
        title: elements.title.value,
        youtubeUrl: elements.youtube.value,
        note: elements.note.value,
        sunday: getDate(),
        part: targetPart,
      });
      if (!validation.valid) {
        elements.error.textContent = validation.error;
        return;
      }
      elements.submit.disabled = true;
      try {
        await getStore().createSongRequest(validation.value);
        elements.dialog.close();
        onStatus("Suggestion sent", "saved");
      } catch (error) {
        logger.error("Could not send song suggestion", error);
        elements.error.textContent = "Could not send the suggestion. Please try again.";
      } finally {
        elements.submit.disabled = false;
      }
    }

    function close() {
      if (elements.dialog.open) elements.dialog.close();
    }

    function start() {
      elements.musicList.addEventListener("click", event => {
        const button = event.target?.closest?.('[data-song-action="request"]');
        if (button) open(button.dataset.part);
      });
      elements.search.addEventListener("input", runSearch);
      elements.form.addEventListener("submit", submit);
      elements.close.addEventListener("click", close);
      elements.cancel.addEventListener("click", close);
    }

    return Object.freeze({ start, open, close });
  }

  const api = Object.freeze({ create });
  global.SongRequestController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
