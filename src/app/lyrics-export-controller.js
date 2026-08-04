// Shared guard/fetch pipeline for the lyrics export controllers (PowerPoint, booklet, slides).
// Each caller supplies only what differs: how assignments become an output.
(function (global) {
  "use strict";

  function create({
    button,
    status,
    parts,
    presentation,
    getStore,
    getSongs,
    getDate,
    getValues,
    canReadLyrics,
    isOnline,
    preparingMessage,
    errorMessage,
    errorLogLabel,
    logger = console,
    build,
  }) {
    let started = false;
    let exporting = false;

    function setStatus(message, state = "") {
      status.textContent = message;
      status.dataset.state = state;
    }

    function render() {
      button.hidden = !canReadLyrics();
      button.disabled = exporting;
    }

    async function run() {
      if (exporting) return;
      if (!canReadLyrics()) {
        setStatus("Choir member access required.", "error");
        return;
      }
      if (!isOnline()) {
        setStatus("Connect to the internet to fetch private lyrics.", "error");
        return;
      }
      const store = getStore();
      if (!store) {
        setStatus("Still connecting. Try again in a moment.", "error");
        return;
      }

      const date = getDate();
      const values = { ...getValues() };
      const songs = Object.fromEntries(
        Object.entries(getSongs()).map(([part, song]) => [
          part,
          song ? { ...song } : song,
        ]),
      );
      const selected = parts.map(part => songs[part.key]).filter(song => song?.id);
      if (!selected.length) {
        setStatus("Choose at least one song first.", "error");
        return;
      }

      exporting = true;
      render();
      setStatus(preparingMessage);
      try {
        const uniqueIds = [...new Set(selected.map(song => song.id))];
        const details = await Promise.all(uniqueIds.map(id => store.getSong(id)));
        const detailsById = new Map(details.map(song => [song.id, song]));
        const weeklyLyrics = typeof store.getWeeklyLyrics === "function"
          ? await store.getWeeklyLyrics(date)
          : {};
        const prepared = presentation.prepareAssignments(
          parts,
          songs,
          detailsById,
          weeklyLyrics,
        );
        if (prepared.missingTitles.length) {
          setStatus(`Add lyrics for: ${prepared.missingTitles.join(", ")}.`, "error");
          return;
        }

        await build({
          assignments: prepared.assignments,
          values,
          date,
          setStatus,
        });
      } catch (error) {
        logger.error(errorLogLabel, error);
        setStatus(errorMessage, "error");
      } finally {
        exporting = false;
        render();
      }
    }

    function start() {
      if (started) return;
      button.addEventListener("click", run);
      started = true;
      render();
    }

    function stop() {
      if (!started) return;
      button.removeEventListener("click", run);
      started = false;
    }

    return Object.freeze({ run, render, start, stop });
  }

  const api = Object.freeze({ create });
  global.LyricsExportController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
