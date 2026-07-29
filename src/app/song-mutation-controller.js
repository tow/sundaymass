// Owns editor-only song loading, Mass assignment, persistence, and explicit-save indexing.
(function (global) {
  "use strict";

  function create({
    getStore,
    isEditor,
    isOnline,
    getDate,
    onStatus,
    onAssigned,
    onCleared,
    onUpdated,
    logger = console,
  }) {
    function requireAccess() {
      if (!isOnline()) {
        onStatus("Offline — editing unavailable", "error");
        throw new Error("Editing requires an internet connection");
      }
      if (!isEditor()) throw new Error("Editor access required");
      const store = getStore();
      if (!store) throw new Error("Song store unavailable");
      return store;
    }

    async function runMutation(work, onSuccess, stillCurrent = () => true) {
      const store = requireAccess();
      onStatus("Saving…", "");
      try {
        const result = await work(store);
        if (stillCurrent()) {
          onSuccess(result);
          onStatus("Saved", "saved");
        } else {
          onStatus("Saved for previous Sunday", "saved");
        }
        return result;
      } catch (error) {
        logger.error(error);
        onStatus(
          isOnline() ? "Save failed" : "Offline — editing unavailable",
          "error",
        );
        throw error;
      }
    }

    async function load(songId) {
      const store = requireAccess();
      onStatus("Loading song…", "");
      try {
        const song = await store.getSong(songId);
        onStatus("Up to date", "saved");
        return song;
      } catch (error) {
        logger.error(error);
        onStatus("Could not load song", "error");
        throw error;
      }
    }

    async function assign(part, song) {
      if (!part || !song?.id) throw new Error("Choose a song and Mass part");
      const date = getDate();
      return runMutation(
        store => store.assignSong(date, part, song.id),
        () => onAssigned(part, song),
        () => getDate() === date,
      ).then(() => song);
    }

    async function clear(part) {
      if (!part) throw new Error("Choose a Mass part");
      const date = getDate();
      await runMutation(
        store => store.clearSong(date, part),
        () => onCleared(part),
        () => getDate() === date,
      );
      return true;
    }

    function scheduleEmbedding(store, songId) {
      Promise.resolve()
        .then(() => store.syncSongEmbedding(songId))
        .catch(error => logger.warn("Song indexing failed", error));
    }

    async function save({ existingSong, part, draft }) {
      if (!part) throw new Error("Choose a Mass part");
      const store = requireAccess();
      const date = getDate();
      const song = await runMutation(
        activeStore => existingSong
          ? activeStore.updateSong(existingSong.id, draft)
          : activeStore.createAndAssignSong(date, part, draft),
        value => {
          if (existingSong) onUpdated(value);
          else onAssigned(part, value);
        },
        () => existingSong || getDate() === date,
      );
      scheduleEmbedding(store, song.id);
      return song;
    }

    return Object.freeze({ assign, clear, load, save });
  }

  const api = Object.freeze({ create });
  global.SongMutationController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
