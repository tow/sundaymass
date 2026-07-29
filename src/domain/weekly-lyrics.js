// Pure weekly-lyric and responsorial-Psalm parsing rules.
(function (global) {
  "use strict";

  const RESPONSE_PATTERN = /^(?:response|refrain|antiphon)(?:\s*(?::|[.—-])\s*|\s*$)/i;
  const SHORT_RESPONSE_PATTERN = /^(?:r|℟)\s*[.:—-]\s*/i;
  const ALL_PATTERN = /^all\s*:\s*/i;
  const VERSE_PATTERN = /^(?:verse\s*)?(\d+)(?:[.):]|\s|$)\s*/i;
  const CANTOR_PATTERN = /^cantor(?:\s+(\d+))?\s*:\s*/i;

  function normalize(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function lineMarker(line) {
    const value = String(line || "").trim();
    const response = value.match(RESPONSE_PATTERN)
      || value.match(SHORT_RESPONSE_PATTERN)
      || value.match(ALL_PATTERN);
    if (response) return { role: "all", length: response[0].length };
    const verse = value.match(VERSE_PATTERN);
    if (verse) {
      return {
        role: "cantor",
        number: Number(verse[1]),
        length: verse[0].length,
      };
    }
    const cantor = value.match(CANTOR_PATTERN);
    if (cantor) {
      return {
        role: "cantor",
        number: cantor[1] ? Number(cantor[1]) : null,
        length: cantor[0].length,
      };
    }
    return null;
  }

  function sectionDetails(stanza) {
    const lines = normalize(stanza).split("\n");
    const marker = lineMarker(lines[0]);
    if (!marker) return { marker: null, text: normalize(stanza) };
    const first = lines[0].trim().slice(marker.length).trim();
    return {
      marker,
      text: normalize([first, ...lines.slice(1)].filter(Boolean).join("\n")),
    };
  }

  function splitMarkedSections(stanza) {
    const sections = [];
    let lines = [];
    normalize(stanza).split("\n").forEach(line => {
      if (lines.length && lineMarker(line)) {
        sections.push(lines.join("\n"));
        lines = [];
      }
      lines.push(line);
    });
    if (lines.length) sections.push(lines.join("\n"));
    return sections;
  }

  function rawPsalmSections(value) {
    const sections = normalize(value).split(/\n{2,}/)
      .flatMap(splitMarkedSections)
      .map(sectionDetails)
      .filter(section => section.text || section.marker);
    const merged = [];
    sections.forEach(section => {
      const previous = merged.at(-1);
      if (!section.marker && previous?.marker && !previous.text) {
        previous.text = section.text;
      } else {
        merged.push(section);
      }
    });
    return merged;
  }

  function psalmSections(value) {
    const lyrics = normalize(value);
    if (!lyrics) return [];
    let raw = rawPsalmSections(lyrics);

    // When stanza boundaries are absent, the first line is the response and
    // the remaining text is retained as a cantor verse. Storage stays free-form;
    // this normalization is only a Psalm presentation concern.
    if (raw.length === 1 && !raw[0].marker) {
      const lines = raw[0].text.split("\n").filter(Boolean);
      if (lines.length > 1) {
        raw = [
          { marker: { role: "all" }, text: lines[0] },
          { marker: { role: "cantor", number: 1 }, text: lines.slice(1).join("\n") },
        ];
      }
    }

    const explicitResponse = raw.findIndex(section => section.marker?.role === "all");
    const responseIndex = explicitResponse >= 0 ? explicitResponse : 0;
    const response = raw[responseIndex];
    const sections = response?.text
      ? [{
          id: "response",
          label: "Response",
          role: "all",
          recognized: Boolean(response.marker),
          text: response.text,
        }]
      : [];
    const usedNumbers = new Set();
    let nextNumber = 1;
    raw.forEach((section, index) => {
      if (index === responseIndex || section.marker?.role === "all" || !section.text) return;
      let number = section.marker?.number;
      if (!number || usedNumbers.has(number)) {
        while (usedNumbers.has(nextNumber)) nextNumber += 1;
        number = nextNumber;
      }
      usedNumbers.add(number);
      nextNumber = Math.max(nextNumber, number + 1);
      sections.push({
        id: `verse-${number}`,
        label: `Verse ${number}`,
        role: "cantor",
        recognized: Boolean(section.marker),
        text: section.text,
      });
    });
    return sections;
  }

  function isStructuredPsalm(value) {
    const sections = psalmSections(value);
    return sections.length >= 2
      && sections[0].role === "all"
      && sections.slice(1).every(section => section.role === "cantor");
  }

  function includedPsalmIds(value) {
    return new Set(psalmSections(value).map(section => section.id));
  }

  function serializePsalmSections(sections) {
    return normalize((Array.isArray(sections) ? sections : [])
      .filter(section => section && section.included !== false)
      .map(section => {
        const text = normalize(section.text);
        if (!text) return "";
        const label = section.role === "all"
          ? "Response"
          : section.label || "Verse";
        return `${label}:\n${text}`;
      })
      .filter(Boolean)
      .join("\n\n"));
  }

  function lyricBlocks(partKey, value) {
    const lyrics = normalize(value);
    if (!lyrics) return [];
    if (partKey !== "psalm") {
      return [{ id: "lyrics", label: "", role: "all", text: lyrics }];
    }
    const sections = psalmSections(lyrics);
    return sections.map(section => ({
      ...section,
      audienceLabel: section.role === "all"
        ? "ALL: RESPONSE"
        : `CANTOR: ${section.label.toUpperCase()}`,
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
