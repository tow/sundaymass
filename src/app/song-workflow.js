// Composes the song picker, canonical song editor, and Mass-slot mutations.
(function (global) {
  "use strict";

  function create({
    elements,
    parts,
    suggestionPartFor,
    pickerView,
    songForm,
    songCatalog,
    getStore,
    isEditor,
    isOnline,
    getDate,
    getPreviousDate,
    getReadingCitations,
    getPsalmCitation,
    readingLabelFor,
    getSongs,
    onAssigned,
    onCleared,
    onUpdated,
    openModal,
    onStatus,
    confirm,
    schedule = callback => setTimeout(callback, 0),
    logger = console,
  }) {
    let editingSong = null;
    let searchTimer = null;
    let readOnlyPicker = false;
    let pickerState = {
      open: false,
      partKey: null,
      selectedSong: null,
      previousSong: null,
      previousStatus: "idle",
      searchResults: [],
      searchStatus: "idle",
      suggestions: [],
      suggestionStatus: "idle",
    };

    const pickerController = global.SongPickerController.create({
      getStore,
      isEditor,
      getPreviousDate,
      getReadingCitations,
      getPsalmCitation,
      readingLabelFor,
      suggestionPartFor,
      onChange: state => {
        pickerState = state;
        renderPreviousSong();
        renderSearchResults();
        renderSuggestions();
      },
      logger,
    });
    const mutationController = global.SongMutationController.create({
      getStore,
      isEditor,
      isOnline,
      getDate,
      onStatus,
      onAssigned,
      onCleared,
      onUpdated,
      logger,
    });

    function partFor(key) {
      return parts.find(part => part.key === key);
    }

    function renderSearchResults() {
      const view = pickerView.renderSearchResults({
        songs: pickerState.searchResults,
        selectedSong: pickerState.selectedSong,
      });
      elements.results.innerHTML = view.html;
      elements.results.hidden = !view.hasResults;
      elements.resultsHeading.hidden = !view.hasResults;
      elements.empty.hidden = view.hasResults;
      elements.empty.textContent = pickerState.searchStatus === "error"
        ? "Could not load songs. Please try again."
        : "No matching songs.";
      elements.use.disabled = view.useDisabled;
    }

    function renderPreviousSong() {
      const selection = pickerView.currentSelection(pickerState.previousSong);
      elements.previous.hidden = pickerState.previousStatus !== "ready"
        || selection.hidden;
      elements.previousName.textContent = selection.name;
      elements.previousAuthor.textContent = selection.author;
    }

    function renderSuggestions() {
      const view = pickerView.renderSuggestions({
        songs: pickerState.suggestions,
        selectedSong: pickerState.selectedSong,
        interactive: !readOnlyPicker,
      });
      elements.suggestionResults.innerHTML = view.html;
      elements.suggestionStatus.hidden = view.hasSuggestions;
      elements.suggestionStatus.textContent = {
        loading: "Finding related songs…",
        empty: "Suggestions are not indexed for these readings yet.",
        error: "Suggestions are not available yet.",
      }[pickerState.suggestionStatus] || "";
    }

    function setMode(mode) {
      if (mode === "create") {
        openEditor(null);
        return;
      }
      elements.suggestedPanel.hidden = mode !== "suggested";
      elements.searchPanel.hidden = mode !== "search";
      elements.modes.querySelectorAll("[data-song-picker-mode]").forEach(button => {
        const selected = button.dataset.songPickerMode === mode;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      elements.dialog.querySelector(".reading-dialog-body").scrollTop = 0;
      if (mode === "search") {
        pickerController.search(elements.search.value);
        if (global.matchMedia("(min-width:701px)").matches) {
          schedule(() => elements.search.focus({ preventScroll: true }));
        }
      }
    }

    async function open(partKey, { suggestionsOnly = false } = {}) {
      const editor = isEditor();
      readOnlyPicker = !editor && suggestionsOnly;
      if ((!editor && !readOnlyPicker) || !getStore()) return;
      const part = partFor(partKey);
      const currentSong = getSongs()[partKey];
      const currentSelection = pickerView.currentSelection(currentSong);
      elements.eyebrow.textContent = readOnlyPicker ? "Song suggestions" : "Choose a song";
      elements.title.textContent = readOnlyPicker
        ? `Suggestions for ${part?.label || "this part"}`
        : `Choose ${part?.label || "song"}`;
      elements.modes.hidden = readOnlyPicker;
      elements.actions.hidden = readOnlyPicker;
      elements.currentActions.hidden = currentSelection.hidden;
      elements.currentName.textContent = currentSelection.name;
      elements.currentAuthor.textContent = currentSelection.author;
      elements.previous.hidden = true;
      elements.search.value = "";
      elements.empty.textContent = "No matching songs.";
      setMode("suggested");
      openModal(elements.dialog);
      await pickerController.open(partKey, { suggestionsOnly: readOnlyPicker });
    }

    function closePicker() {
      pickerController.close();
      if (elements.dialog.open) elements.dialog.close();
      readOnlyPicker = false;
    }

    function fillEditor(song) {
      songForm.write(song, {
        fallbackTitle: elements.search.value.trim(),
        defaultSuggestionParts: [suggestionPartFor(pickerState.partKey)],
      });
    }

    function openEditor(song) {
      if (!isEditor() || !pickerState.partKey) return;
      editingSong = song || null;
      fillEditor(editingSong);
      elements.editorEyebrow.textContent = editingSong ? "Shared song" : "New song";
      elements.editorTitle.textContent = editingSong ? "Edit song" : "Add a new song";
      elements.editorContext.textContent = editingSong
        ? "Update the shared song record."
        : "Only the title is required. Another song may use the same title.";
      elements.sharedWarning.hidden = !editingSong;
      elements.lyricsSummary.textContent = editingSong?.lyrics
        ? "Edit lyrics"
        : "Add lyrics now (optional)";
      elements.save.textContent = editingSong ? "Save song" : "Create and use song";
      elements.editorError.textContent = "";
      if (elements.dialog.open) closePicker();
      openModal(elements.editorDialog);
      schedule(() => elements.songTitle.focus());
    }

    function closeEditor() {
      if (elements.editorDialog.open) elements.editorDialog.close();
      editingSong = null;
    }

    function closeAll() {
      closePicker();
      closeEditor();
    }

    function start() {
      elements.musicList.addEventListener("click", event => {
        const button = event.target.closest("button[data-song-action]");
        if (button?.dataset.songAction === "choose" && isEditor()) {
          open(button.dataset.part);
        } else if (button?.dataset.songAction === "suggestions" && !isEditor()) {
          open(button.dataset.part, { suggestionsOnly: true });
        }
      });
      elements.search.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(
          () => pickerController.search(elements.search.value),
          180,
        );
      });
      elements.modes.addEventListener("click", event => {
        const button = event.target.closest("[data-song-picker-mode]");
        if (button) setMode(button.dataset.songPickerMode);
      });
      elements.results.addEventListener("click", event => {
        const button = event.target.closest("button[data-song-index]");
        if (button) pickerController.selectSearchResult(button.dataset.songIndex);
      });
      elements.suggestionResults.addEventListener("click", event => {
        const button = event.target.closest("button[data-song-suggestion-index]");
        if (button && isEditor()) {
          pickerController.selectSuggestion(button.dataset.songSuggestionIndex);
        }
      });
      elements.editCurrent.addEventListener("click", async () => {
        const currentSong = getSongs()[pickerState.partKey];
        if (!currentSong || !isEditor()) return;
        try {
          openEditor(await mutationController.load(currentSong.id));
        } catch (error) {}
      });
      elements.removeCurrent.addEventListener("click", async () => {
        const part = pickerState.partKey;
        const currentSong = getSongs()[part];
        if (!currentSong || !isEditor()) return;
        const label = partFor(part)?.label || "this part";
        if (!confirm(`Remove “${currentSong.title}” from ${label}? The shared song will remain available.`)) {
          return;
        }
        try {
          await mutationController.clear(part);
          closePicker();
        } catch (error) {}
      });
      elements.usePrevious.addEventListener("click", async () => {
        const song = pickerState.previousSong;
        const part = pickerState.partKey;
        if (!song || !part || !isEditor()) return;
        elements.usePrevious.disabled = true;
        try {
          await mutationController.assign(part, song);
          closePicker();
        } catch (error) {
          // Mutation status is reported by the shared controller.
        } finally {
          elements.usePrevious.disabled = false;
        }
      });
      elements.use.addEventListener("click", async () => {
        const selectedSong = pickerState.selectedSong;
        const part = pickerState.partKey;
        if (!selectedSong || !part || !isEditor()) return;
        try {
          await mutationController.assign(part, selectedSong);
          closePicker();
        } catch (error) {}
      });
      elements.editorForm.addEventListener("submit", async event => {
        event.preventDefault();
        const validation = songCatalog.validateDraft(songForm.read());
        if (!validation.valid) {
          elements.editorError.textContent = validation.error;
          elements.songTitle.focus();
          return;
        }
        elements.save.disabled = true;
        const previousLabel = elements.save.textContent;
        elements.save.textContent = "Saving…";
        try {
          await mutationController.save({
            existingSong: editingSong,
            part: pickerState.partKey,
            draft: validation.value,
          });
          closeEditor();
        } catch (error) {
          elements.editorError.textContent = error.message || "Could not save the song.";
        } finally {
          elements.save.disabled = false;
          elements.save.textContent = previousLabel;
        }
      });
      elements.close.addEventListener("click", closePicker);
      elements.dialog.addEventListener("click", event => {
        if (event.target === elements.dialog) closePicker();
      });
      elements.editorClose.addEventListener("click", closeEditor);
      elements.editorCancel.addEventListener("click", closeEditor);
      elements.editorDialog.addEventListener("click", event => {
        if (event.target === elements.editorDialog) closeEditor();
      });
    }

    return Object.freeze({ closeAll, open, start });
  }

  const api = Object.freeze({ create });
  global.SongWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
