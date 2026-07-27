// Owns standard-lectionary celebration selection and persistence.
(function (global) {
  "use strict";

  function create({
    getStore,
    isEditor,
    getDate,
    getCurrentSunday,
    getCandidates,
    pickerView,
    confirmRestore,
    onChange,
    onStatus,
    onSaved,
    onRestored,
    logger = console,
  }) {
    let value = initialState();

    function emptyResults() {
      return { heading: "", candidates: [], html: "" };
    }

    function emptyPreview() {
      return { hidden: true, useDisabled: true, html: "" };
    }

    function initialState() {
      return {
        open: false,
        query: "",
        selectedCelebration: null,
        results: emptyResults(),
        preview: emptyPreview(),
        saving: false,
      };
    }

    function snapshot() {
      return Object.freeze({
        ...value,
        results: Object.freeze({
          ...value.results,
          candidates: Object.freeze(value.results.candidates.slice()),
        }),
        preview: Object.freeze({ ...value.preview }),
      });
    }

    function emit() {
      onChange(snapshot());
    }

    function state() {
      return snapshot();
    }

    function refreshViews() {
      value.results = pickerView.search({
        candidates: getCandidates(),
        currentSunday: getCurrentSunday(),
        query: value.query,
        selectedId: value.selectedCelebration?.id || "",
      });
      value.preview = pickerView.renderPreview(value.selectedCelebration);
    }

    function open() {
      if (!isEditor() || !getStore()) return false;
      value = { ...initialState(), open: true };
      refreshViews();
      emit();
      return true;
    }

    function close() {
      value = initialState();
      emit();
    }

    function search(query) {
      if (!value.open) return false;
      value.query = String(query || "");
      value.selectedCelebration = null;
      refreshViews();
      emit();
      return true;
    }

    function cloneCandidate(candidate) {
      if (!candidate) return null;
      return {
        ...candidate,
        readings: { ...(candidate.readings || {}) },
        readingOptions: Object.fromEntries(
          Object.entries(candidate.readingOptions || {})
            .map(([slot, options]) => [slot, options.slice()]),
        ),
        commonNames: (candidate.commonNames || []).slice(),
      };
    }

    function select(index) {
      value.selectedCelebration = cloneCandidate(
        value.results.candidates[Number(index)] || null,
      );
      refreshViews();
      emit();
      return value.selectedCelebration;
    }

    function setReading(slot, citation) {
      if (!value.selectedCelebration || !isEditor()) return false;
      value.selectedCelebration = {
        ...value.selectedCelebration,
        readings: {
          ...value.selectedCelebration.readings,
          [slot]: citation,
        },
      };
      refreshViews();
      emit();
      return true;
    }

    function payloadFor(selection) {
      return Object.freeze({
        id: selection.id,
        name: selection.name,
        sourceDate: selection.sourceDate,
        rank: selection.rank,
        season: selection.season,
        cycle: selection.cycle,
        lectionary: selection.lectionary || "",
        source: selection.source || "Standard lectionary",
        readings: Object.freeze({ ...selection.readings }),
        checkedAgainstOrdo: true,
      });
    }

    async function save() {
      const store = getStore();
      if (!value.selectedCelebration || !isEditor() || !store || value.saving) {
        return false;
      }
      const payload = payloadFor(value.selectedCelebration);
      value.saving = true;
      emit();
      onStatus("Saving…", "");
      try {
        await store.saveCelebrationOverride(getDate(), payload);
        onSaved(payload);
        onStatus("Saved", "saved");
        close();
        return true;
      } catch (error) {
        logger.error(error);
        value.saving = false;
        onStatus("Save failed", "error");
        emit();
        return false;
      }
    }

    async function restore() {
      const store = getStore();
      if (!isEditor() || !store) return false;
      if (!confirmRestore(
        "Restore the computed Sunday celebration and all of its readings?",
      )) return false;
      onStatus("Saving…", "");
      try {
        await store.clearCelebrationOverride(getDate());
        onRestored();
        onStatus("Saved", "saved");
        return true;
      } catch (error) {
        logger.error(error);
        onStatus("Save failed", "error");
        return false;
      }
    }

    return Object.freeze({
      close,
      open,
      restore,
      save,
      search,
      select,
      setReading,
      state,
    });
  }

  const api = Object.freeze({ create });
  global.CelebrationController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
