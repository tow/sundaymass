// Shared validation and attribution formatting for public and editor song views.
(function (global) {
  "use strict";

  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const text = value => typeof value === "string" ? value.trim() : "";

  function isPublicDomain(song) {
    return /\bpublic domain\b/i.test(text(song?.copyrightOwner));
  }

  function youtubeVideoId(value) {
    const input = text(value);
    if (!input) return "";
    if (VIDEO_ID.test(input)) return input;
    try {
      const url = new URL(input);
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

  function youtubeWatchUrl(value) {
    const videoId = youtubeVideoId(value);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
  }

  function safeYoutubeUrl(value) {
    return youtubeWatchUrl(value);
  }

  function copyrightComplete(song) {
    const title = text(song?.song) || text(song?.title);
    if (!title) return true;
    return !!(
      text(song?.authors)
      && text(song?.copyrightOwner)
      && (text(song?.copyrightYear) || isPublicDomain(song))
    );
  }

  function copyrightLine(song) {
    const copyright = [
      text(song?.copyrightYear),
      text(song?.copyrightOwner),
    ].filter(Boolean).join(" ");
    if (!copyright || isPublicDomain(song)) return copyright;
    return `© ${copyright}`;
  }

  function publicPlanAttribution(song) {
    return [
      text(song?.authors) && `Authors: ${text(song.authors)}`,
      copyrightLine(song),
      text(song?.source) && `Source: ${text(song.source)}`,
    ].filter(Boolean).join(" · ");
  }

  function editorPlanAttribution(song) {
    return [
      text(song?.authors),
      copyrightLine(song),
      text(song?.source),
    ].filter(Boolean).join(" · ");
  }

  function planAuthor(song) {
    return text(song?.authors);
  }

  function repertoireDetails(song) {
    return [
      text(song?.authors),
      copyrightLine(song),
      text(song?.source) && `Source: ${text(song.source)}`,
    ].filter(Boolean);
  }

  const api = Object.freeze({
    youtubeVideoId,
    youtubeWatchUrl,
    safeYoutubeUrl,
    copyrightComplete,
    copyrightLine,
    publicPlanAttribution,
    editorPlanAttribution,
    planAuthor,
    repertoireDetails,
  });
  global.SongPresentation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
