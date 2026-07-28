// Fetches private lyrics on demand and downloads a client-side PowerPoint deck.
(function (global) {
  "use strict";

  function defaultLoader(document) {
    return import(new URL("./vendor/pptxgenjs.js", document.baseURI).href)
      .then(module => module.default);
  }

  function create({
    button,
    status,
    document,
    parts,
    presentation,
    getStore,
    getSongs,
    getDate,
    getValues,
    isEditor,
    isOnline,
    loadPptx = () => defaultLoader(document),
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

    async function download() {
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
      const selected = parts
        .map(part => songs[part.key])
        .filter(song => song?.id);
      if (!selected.length) {
        setStatus("Choose at least one song first.", "error");
        return;
      }

      exporting = true;
      render();
      setStatus("Preparing lyrics…");
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

        setStatus("Building PowerPoint…");
        const PptxGenJS = await loadPptx();
        const values = getValues();
        const deck = presentation.buildDeck(PptxGenJS, {
          date: getDate(),
          celebration: values.day,
          meta: values.meta,
          assignments,
        });
        await deck.writeFile({
          fileName: presentation.fileName(getDate()),
          compression: true,
        });
        setStatus("PowerPoint downloaded.", "success");
      } catch (error) {
        logger.error("Could not create lyrics PowerPoint", error);
        setStatus("Could not create PowerPoint. Try again.", "error");
      } finally {
        exporting = false;
        render();
      }
    }

    function start() {
      if (started) return;
      button.addEventListener("click", download);
      started = true;
      render();
    }

    function stop() {
      if (!started) return;
      button.removeEventListener("click", download);
      started = false;
    }

    return Object.freeze({ download, render, start, stop });
  }

  const api = Object.freeze({ create });
  global.LyricsPptxController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
