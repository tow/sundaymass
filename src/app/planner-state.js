// Owns the selected Sunday and the effective live plan without touching the DOM.
(function (global) {
  "use strict";

  function summaryValues({
    sunday,
    celebration,
    celebrationOverride = false,
    formatLong,
    cycleName,
  }) {
    const baseMeta = celebrationOverride
      ? `${celebration.rank || "Celebration"} · normally ${formatLong(celebration.sourceDate)}`
      : `${sunday.s} · ${cycleName(sunday.c)}`;
    return {
      day: celebration.name,
      meta: `${formatLong(sunday.d)}  ·  ${baseMeta}`,
      date: sunday.d,
    };
  }

  function create({
    initialSunday,
    readingSlots,
    scheduledCelebration,
    formatLong,
    cycleName,
  }) {
    if (!initialSunday?.d) throw new Error("An initial Sunday is required");
    let selectedSunday = initialSunday;
    let selectedSongs = {};
    let selectedReadings = {};
    let selectedCelebration = null;

    function setSunday(value) {
      if (!value?.d || !value?.l) throw new Error("A resolved Sunday is required");
      selectedSunday = value;
    }

    function current() {
      return selectedSunday;
    }

    function songs() {
      return selectedSongs;
    }

    function readingOverrides() {
      return selectedReadings;
    }

    function celebrationOverride() {
      return selectedCelebration;
    }

    function baseCelebration() {
      return selectedCelebration || scheduledCelebration(current());
    }

    function computedCitation(slot) {
      return baseCelebration().readings?.[slot.key] || "";
    }

    function displayedCitation(slot) {
      return selectedReadings[slot.key]?.citation || computedCitation(slot);
    }

    function values() {
      const sunday = current();
      const celebration = baseCelebration();
      const citationFor = slot => displayedCitation(slot);
      return {
        ...summaryValues({
          sunday,
          celebration,
          celebrationOverride: Boolean(selectedCelebration),
          formatLong,
          cycleName,
        }),
        first: citationFor(readingSlots[0]),
        psalm: citationFor(readingSlots[1]),
        second: citationFor(readingSlots[2]),
        gospel: citationFor(readingSlots[3]),
      };
    }

    function reset() {
      selectedSongs = {};
      selectedReadings = {};
      selectedCelebration = null;
    }

    function applyPlan(plan = {}) {
      selectedSongs = plan.songs || {};
      selectedReadings = plan.readingOverrides || {};
      selectedCelebration = plan.celebrationOverride || null;
    }

    function useCelebration(value) {
      selectedCelebration = value;
      selectedReadings = {};
    }

    function restoreCelebration() {
      selectedCelebration = null;
      selectedReadings = {};
    }

    function setReadingOverride(slot, value) {
      if (value) selectedReadings[slot] = value;
      else delete selectedReadings[slot];
    }

    function clearReadingOverrides() {
      selectedReadings = {};
    }

    function assignSong(part, song) {
      selectedSongs[part] = song;
    }

    function clearSong(part) {
      delete selectedSongs[part];
    }

    function updateSong(song) {
      Object.keys(selectedSongs).forEach(part => {
        if (selectedSongs[part]?.id === song.id) selectedSongs[part] = song;
      });
    }

    return Object.freeze({
      applyPlan,
      assignSong,
      baseCelebration,
      celebrationOverride,
      clearReadingOverrides,
      clearSong,
      computedCitation,
      current,
      displayedCitation,
      readingOverrides,
      reset,
      restoreCelebration,
      setSunday,
      setReadingOverride,
      songs,
      updateSong,
      useCelebration,
      values,
    });
  }

  const api = Object.freeze({ create, summaryValues });
  global.PlannerState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
