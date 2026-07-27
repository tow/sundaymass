// Owns song-picker query, selection, and stale-response state without rendering it.
(function (global) {
  "use strict";

  function create({
    getStore,
    isEditor,
    getReadingCitations,
    suggestionPartFor,
    onChange,
    logger = console,
    maxSuggestions = 3,
  }) {
    let generation = 0;
    let searchRequest = 0;
    let value = initialState();

    function initialState(partKey = null) {
      return {
        open: false,
        partKey,
        selectedSong: null,
        searchResults: [],
        searchStatus: "idle",
        suggestions: [],
        suggestionStatus: "idle",
      };
    }

    function snapshot() {
      return Object.freeze({
        ...value,
        searchResults: Object.freeze(value.searchResults.slice()),
        suggestions: Object.freeze(value.suggestions.slice()),
      });
    }

    function emit() {
      onChange(snapshot());
    }

    function state() {
      return snapshot();
    }

    async function open(partKey) {
      const store = getStore();
      if (!isEditor() || !store) return false;
      const requestGeneration = ++generation;
      searchRequest += 1;
      value = {
        ...initialState(partKey),
        open: true,
        suggestionStatus: "loading",
      };
      emit();

      try {
        const suggestions = await store.suggestSongs(
          getReadingCitations(),
          suggestionPartFor(partKey),
        );
        if (generation !== requestGeneration || !value.open) return true;
        value.suggestions = suggestions.slice(0, maxSuggestions);
        value.suggestionStatus = value.suggestions.length ? "ready" : "empty";
      } catch (error) {
        if (generation !== requestGeneration || !value.open) return true;
        logger.warn("Could not load suggestions", error);
        value.suggestions = [];
        value.suggestionStatus = "error";
      }
      emit();
      return true;
    }

    function close() {
      generation += 1;
      searchRequest += 1;
      value = initialState(value.partKey);
      emit();
    }

    async function search(query) {
      const store = getStore();
      if (!value.open || !isEditor() || !store) return false;
      const request = ++searchRequest;
      const requestGeneration = generation;
      value.searchStatus = "loading";
      emit();

      try {
        const matches = await store.searchSongs(query);
        if (
          generation !== requestGeneration
          || request !== searchRequest
          || !value.open
        ) return true;
        value.searchResults = matches;
        value.selectedSong = null;
        value.searchStatus = matches.length ? "ready" : "empty";
      } catch (error) {
        if (
          generation !== requestGeneration
          || request !== searchRequest
          || !value.open
        ) return true;
        logger.error(error);
        value.searchResults = [];
        value.selectedSong = null;
        value.searchStatus = "error";
      }
      emit();
      return true;
    }

    function select(collection, index) {
      value.selectedSong = collection[Number(index)] || null;
      emit();
      return value.selectedSong;
    }

    function selectSearchResult(index) {
      return select(value.searchResults, index);
    }

    function selectSuggestion(index) {
      return select(value.suggestions, index);
    }

    return Object.freeze({
      close,
      open,
      search,
      selectSearchResult,
      selectSuggestion,
      state,
    });
  }

  const api = Object.freeze({ create });
  global.SongPickerController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
