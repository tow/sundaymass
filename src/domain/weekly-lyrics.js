// Pure weekly-lyric and responsorial-Psalm parsing rules.
(function (global) {
  "use strict";

  const RESPONSE_PATTERN = /^(?:response|refrain|antiphon)\s*:/i;
  const VERSE_PATTERN = /^(?:verse\s*)?(\d+)(?:[.):]|\s|$)/i;

  function normalize(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function stanzaLabel(stanza, index) {
    const firstLine = stanza.split("\n")[0].trim();
    if (RESPONSE_PATTERN.test(firstLine)) {
      return { id: "response", label: "Response", role: "all", recognized: true };
    }
    const verse = firstLine.match(VERSE_PATTERN);
    if (verse) {
      return {
        id: `verse-${verse[1]}`,
        label: `Verse ${verse[1]}`,
        role: "cantor",
        recognized: true,
      };
    }
    return index === 0
      ? { id: "response", label: "Response", role: "all", recognized: false }
      : {
          id: `verse-${index}`,
          label: `Verse ${index}`,
          role: "cantor",
          recognized: false,
        };
  }

  function splitNumberedVerses(stanza) {
    const sections = [];
    let lines = [];
    normalize(stanza).split("\n").forEach(line => {
      if (lines.length && VERSE_PATTERN.test(line.trim())) {
        sections.push(lines.join("\n"));
        lines = [];
      }
      lines.push(line);
    });
    if (lines.length) sections.push(lines.join("\n"));
    return sections;
  }

  function psalmSections(value) {
    const lyrics = normalize(value);
    if (!lyrics) return [];
    return lyrics.split(/\n{2,}/)
      .flatMap(splitNumberedVerses)
      .map(normalize)
      .filter(Boolean)
      .map((text, index) => ({ ...stanzaLabel(text, index), text }));
  }

  function isStructuredPsalm(value) {
    const sections = psalmSections(value);
    return sections.length >= 2
      && sections[0].role === "all"
      && sections.slice(1).every(section =>
        section.role === "cantor" && section.recognized);
  }

  function includedPsalmIds(value) {
    return new Set(psalmSections(value).map(section => section.id));
  }

  function serializePsalmSections(sections) {
    return normalize((Array.isArray(sections) ? sections : [])
      .filter(section => section && section.included !== false)
      .map(section => normalize(section.text))
      .filter(Boolean)
      .join("\n\n"));
  }

  function lyricBlocks(partKey, value) {
    const lyrics = normalize(value);
    if (!lyrics) return [];
    if (partKey !== "psalm") {
      return [{ id: "lyrics", label: "", role: "all", text: lyrics }];
    }
    if (!isStructuredPsalm(lyrics)) {
      return [{
        id: "lyrics",
        label: "",
        role: "all",
        text: lyrics,
        audienceLabel: "",
      }];
    }
    const sections = psalmSections(lyrics);
    return sections.map(section => ({
      ...section,
      audienceLabel: section.role === "all" ? "ALL" : "CANTOR",
    }));
  }

  function effectiveLyrics(canonicalLyrics, override) {
    const weekly = normalize(override && override.lyrics);
    return weekly || normalize(canonicalLyrics);
  }

  function parseResponsorialCitation(value) {
    const citation = normalize(value).replace(/[–—]/g, "-");
    const match = citation.match(/^((?:[1-3]\s+)?[A-Za-z][A-Za-z ]*?)\s+(\d+)(?::|$)/);
    if (!match) return null;
    return {
      book: match[1].trim(),
      number: Number(match[2]),
      citation,
    };
  }

  const api = Object.freeze({
    effectiveLyrics,
    includedPsalmIds,
    isStructuredPsalm,
    lyricBlocks,
    normalize,
    parseResponsorialCitation,
    psalmSections,
    serializePsalmSections,
  });
  global.WeeklyLyrics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
