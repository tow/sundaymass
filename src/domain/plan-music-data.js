// Pure conversion between database rows and browser plan/song values.
(function (global) {
  "use strict";

  function string(value) {
    return typeof value === "string" ? value : "";
  }

  function youtubeWatchUrl(value) {
    const videoId = string(value);
    return /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube.com/watch?v=${videoId}`
      : "";
  }

  function lyricValue(row) {
    const relation = row && row.song_lyrics;
    if (Array.isArray(relation)) return string(relation[0] && relation[0].lyrics);
    return string(relation && relation.lyrics);
  }

  function songFromRow(row) {
    const source = row && typeof row === "object" ? row : {};
    const lyrics = lyricValue(source);
    const youtubeVideoId = string(source.youtube_video_id);
    return {
      id: string(source.id),
      title: string(source.title),
      youtubeVideoId,
      youtubeUrl: youtubeWatchUrl(youtubeVideoId),
      authors: string(source.authors),
      copyrightOwner: string(source.copyright_owner),
      copyrightYear: string(source.copyright_year),
      source: string(source.source),
      responsorialBook: string(source.responsorial_book),
      responsorialNumber: Number.isInteger(source.responsorial_number)
        ? source.responsorial_number
        : null,
      responsorialCitations: Array.isArray(source.responsorial_citations)
        ? source.responsorial_citations.filter(value => typeof value === "string")
        : [],
      matchingCitation: string(source.reading_citation),
      suggestionReason: string(source.suggestion_reason),
      inRepertoire: source.in_repertoire !== false,
      lyrics,
      hasLyrics: Boolean(lyrics.trim()),
      suggestionParts: Array.isArray(source.suggestion_parts)
        ? source.suggestion_parts.filter(value => typeof value === "string")
        : [],
    };
  }

  function emptyPlan() {
    return { songs: {}, readingOverrides: {}, celebrationOverride: null };
  }

  function planFromRow(row) {
    const plan = emptyPlan();
    if (!row || typeof row !== "object" || Array.isArray(row)) return plan;
    plan.readingOverrides = row.reading_overrides && typeof row.reading_overrides === "object"
      ? row.reading_overrides
      : {};
    plan.celebrationOverride = row.celebration_override
      && typeof row.celebration_override === "object"
      ? row.celebration_override
      : null;
    (Array.isArray(row.plan_songs) ? row.plan_songs : []).forEach(assignment => {
      if (!assignment || typeof assignment.part !== "string" || !assignment.song) return;
      plan.songs[assignment.part] = songFromRow(assignment.song);
    });
    return plan;
  }

  global.PlanMusicData = { emptyPlan, songFromRow, planFromRow };
})(typeof window === "undefined" ? globalThis : window);
