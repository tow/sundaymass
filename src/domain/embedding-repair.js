(function (global) {
  "use strict";

  async function repairStaleSongsOnce(status, syncSongs, readStatus, batchSize = 5) {
    const staleIds = Array.isArray(status?.staleSongIds) ? status.staleSongIds : [];
    if (!staleIds.length) return status;
    const size = Math.max(1, batchSize);
    for (let index = 0; index < staleIds.length; index += size) {
      await syncSongs(staleIds.slice(index, index + size));
    }
    return readStatus();
  }

  const api = { repairStaleSongsOnce };
  global.EmbeddingRepair = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
