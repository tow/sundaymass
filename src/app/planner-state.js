// Owns the selected day and the effective live plan without touching the DOM.
(function (global) {
  "use strict";

  // A Sunday is placed by its lectionary cycle; any other day by its rank.
  function dayMeta(day, cycleName) {
    return `${day.s} · ${day.r && day.r !== "Sunday" ? day.r : cycleName(day.c)}`;
  }

  // A named Mass ("Filipino Mass") takes the title, and the celebration moves into the
  // details so it is still said.
  function summaryValues({
    day,
    celebration,
    celebrationOverride = false,
    occasionLabel = "",
    formatLong,
    cycleName,
  }) {
    const baseMeta = celebrationOverride
      ? `${celebration.rank || "Celebration"} · normally ${formatLong(celebration.sourceDate)}`
      : dayMeta(day, cycleName);
    return {
      day: occasionLabel || celebration.name,
      meta: `${formatLong(day.d)}  ·  ${occasionLabel ? `${celebration.name} · ` : ""}${baseMeta}`,
      date: day.d,
    };
  }

  function create({
    initialDay,
    readingSlots,
    scheduledCelebration,
    formatLong,
    cycleName,
  }) {
    if (!initialDay?.d) throw new Error("An initial day is required");
    let selectedDay = initialDay;
    let selectedSongs = {};
    let selectedReadings = {};
    let selectedCelebration = null;
    let selectedOccasionLabel = "";

    // Holy Saturday resolves with an empty lectionary key: a day with no Mass readings.
    function setDay(value) {
      if (!value?.d || typeof value.l !== "string") throw new Error("A resolved day is required");
      selectedDay = value;
    }

    function current() {
      return selectedDay;
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

    function occasionLabel() {
      return selectedOccasionLabel;
    }

    function setOccasionLabel(value) {
      selectedOccasionLabel = value || "";
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
      const day = current();
      const celebration = baseCelebration();
      const citationFor = slot => displayedCitation(slot);
      return {
        ...summaryValues({
          day,
          celebration,
          celebrationOverride: Boolean(selectedCelebration),
          occasionLabel: selectedOccasionLabel,
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
      selectedOccasionLabel = "";
    }

    function applyPlan(plan = {}) {
      selectedSongs = plan.songs || {};
      selectedReadings = plan.readingOverrides || {};
      selectedCelebration = plan.celebrationOverride || null;
      selectedOccasionLabel = plan.occasionLabel || "";
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
      occasionLabel,
      readingOverrides,
      reset,
      restoreCelebration,
      setDay,
      setOccasionLabel,
      setReadingOverride,
      songs,
      updateSong,
      useCelebration,
      values,
    });
  }

  const api = Object.freeze({ create, dayMeta, summaryValues });
  global.PlannerState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
