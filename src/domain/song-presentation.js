// Shared validation and attribution formatting for public and editor song views.
(function (global) {
  "use strict";

  const text = value => typeof value === "string" ? value.trim() : "";

  function isPublicDomain(song) {
    return /\bpublic domain\b/i.test(text(song?.copyrightOwner));
  }

  function safeYoutubeUrl(value) {
    if (!text(value)) return "";
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      return url.protocol === "https:"
        && (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be")
        ? url.href
        : "";
    } catch {
      return "";
    }
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

  function repertoireDetails(song) {
    return [
      text(song?.authors),
      copyrightLine(song),
      text(song?.source) && `Source: ${text(song.source)}`,
    ].filter(Boolean);
  }

  const api = Object.freeze({
    safeYoutubeUrl,
    copyrightComplete,
    copyrightLine,
    publicPlanAttribution,
    editorPlanAttribution,
    repertoireDetails,
  });
  global.SongPresentation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
