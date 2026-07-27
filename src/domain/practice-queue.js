// Builds a temporary, ordered YouTube queue from the songs assigned to a Mass.
(function (global) {
  "use strict";

  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const text = value => typeof value === "string" ? value.trim() : "";

  function youtubeVideoId(value) {
    if (!text(value)) return "";
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return "";
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      let candidate = "";

      if (host === "youtu.be") {
        const segments = url.pathname.split("/").filter(Boolean);
        if (segments.length !== 1) return "";
        candidate = segments[0];
      } else if (
        host === "youtube.com"
        || host.endsWith(".youtube.com")
        || host === "youtube-nocookie.com"
        || host.endsWith(".youtube-nocookie.com")
      ) {
        if (url.pathname === "/watch") {
          candidate = url.searchParams.get("v") || "";
        } else {
          const segments = url.pathname.split("/").filter(Boolean);
          if (
            segments.length === 2
            && ["embed", "shorts", "live"].includes(segments[0])
          ) {
            candidate = segments[1];
          }
        }
      }

      return VIDEO_ID.test(candidate) ? candidate : "";
    } catch {
      return "";
    }
  }

  function build({ parts, songs }) {
    let assignedCount = 0;
    const items = [];
    (parts || []).forEach(part => {
      const song = songs?.[part.key];
      const title = text(song?.title) || text(song?.song);
      if (!title) return;
      assignedCount += 1;
      const videoId = youtubeVideoId(song.youtubeUrl);
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

  function embedUrl(items, startIndex = 0) {
    const remaining = (items || []).slice(startIndex);
    if (!remaining.length || !VIDEO_ID.test(remaining[0]?.videoId || "")) return "";
    const url = new URL(
      `https://www.youtube-nocookie.com/embed/${remaining[0].videoId}`,
    );
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("rel", "0");
    const following = remaining.slice(1)
      .map(item => item.videoId)
      .filter(videoId => VIDEO_ID.test(videoId));
    if (following.length) url.searchParams.set("playlist", following.join(","));
    return url.href;
  }

  const api = Object.freeze({ youtubeVideoId, build, embedUrl });
  global.PracticeQueue = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
