// Builds a temporary, ordered YouTube queue from the songs assigned to a Mass.
(function (global) {
  "use strict";

  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const text = value => typeof value === "string" ? value.trim() : "";
  const songPresentation = global.SongPresentation
    || (typeof require === "function" ? require("./song-presentation.js") : null);
  const youtubeVideoId = value => songPresentation.youtubeVideoId(value);

  function build({ parts, songs }) {
    let assignedCount = 0;
    const items = [];
    (parts || []).forEach(part => {
      const song = songs?.[part.key];
      const title = text(song?.title) || text(song?.song);
      if (!title) return;
      assignedCount += 1;
      const videoId = youtubeVideoId(song.youtubeVideoId || song.youtubeUrl);
      if (!videoId) return;
      items.push(Object.freeze({
        part: part.key,
        label: part.label,
        title,
        videoId,
      }));
    });
    return Object.freeze({
      items: Object.freeze(items),
      assignedCount,
      playableCount: items.length,
      missingCount: assignedCount - items.length,
    });
  }

  function embedUrl(items, startIndex = 0, { origin = "" } = {}) {
    const item = (items || [])[startIndex];
    if (!item || !VIDEO_ID.test(item.videoId || "")) return "";
    const url = new URL(
      `https://www.youtube-nocookie.com/embed/${item.videoId}`,
    );
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("rel", "0");
    url.searchParams.set("enablejsapi", "1");
    if (/^https?:\/\//.test(origin)) url.searchParams.set("origin", origin);
    return url.href;
  }

  const api = Object.freeze({ youtubeVideoId, build, embedUrl });
  global.PracticeQueue = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
