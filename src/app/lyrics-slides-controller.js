// Fetches private lyrics on demand and opens a print-to-PDF widescreen slideshow.
(function (global) {
  "use strict";

  function create({
    button,
    status,
    parts,
    presentation,
    printController,
    getStore,
    getSongs,
    getDate,
    getValues,
    isEditor,
    isOnline,
    logger = console,
  }) {
    let started = false;
    let exporting = false;

    function setStatus(message, state = "") {
      status.textContent = message;
      status.dataset.state = state;
    }

    function render() {
      button.hidden = !isEditor();
      button.disabled = exporting;
    }

    async function print() {
      if (exporting) return;
      if (!isEditor()) {
        setStatus("Editor access required.", "error");
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

      const songs = getSongs();
      const selected = parts.map(part => songs[part.key]).filter(song => song?.id);
      if (!selected.length) {
        setStatus("Choose at least one song first.", "error");
        return;
      }

      exporting = true;
      render();
      setStatus("Preparing slides…");
      try {
        const uniqueIds = [...new Set(selected.map(song => song.id))];
        const details = await Promise.all(uniqueIds.map(id => store.getSong(id)));
        const detailsById = new Map(details.map(song => [song.id, song]));
        const assignments = presentation.selectedAssignments(parts, songs, detailsById);
        const missing = presentation.missingLyrics(assignments);
        if (missing.length) {
          const titles = [...new Set(missing.map(song => song.title))];
          setStatus(`Add lyrics for: ${titles.join(", ")}.`, "error");
          return;
        }

        const values = getValues();
        const markup = presentation.renderSlides({
          date: getDate(),
          celebration: values.day,
          meta: values.meta,
          assignments,
        });
        setStatus("Choose \"Save as PDF\" in the print dialog.");
        printController.printCustom(markup, "lyrics-slides");
        setStatus("Slides sent to print.", "success");
      } catch (error) {
        logger.error("Could not create lyrics slides", error);
        setStatus("Could not create slides. Try again.", "error");
      } finally {
        exporting = false;
        render();
      }
    }

    function start() {
      if (started) return;
      button.addEventListener("click", print);
      started = true;
      render();
    }

    function stop() {
      if (!started) return;
      button.removeEventListener("click", print);
      started = false;
    }

    return Object.freeze({ print, render, start, stop });
  }

  const api = Object.freeze({ create });
  global.LyricsSlidesController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
