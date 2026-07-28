// Plans and builds a large-type PowerPoint deck from editor-only song lyrics.
(function (global) {
  "use strict";

  const COLOURS = Object.freeze({
    background: "002F45",
    backgroundDeep: "001E2B",
    accent: "E0B96A",
    text: "FFFFFF",
    muted: "B9CDD6",
  });
  const MAX_LINES = 8;
  const MAX_LINE_LENGTH = 48;

  function normalizeLyrics(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function wrapLine(value, maxLength = MAX_LINE_LENGTH) {
    const line = String(value || "").trim();
    if (!line || line.length <= maxLength) return [line];
    const words = line.split(/\s+/);
    const lines = [];
    let current = "";
    words.forEach(word => {
      if (!current) {
        current = word;
      } else if (`${current} ${word}`.length <= maxLength) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function lyricSlides(value, { maxLines = MAX_LINES, maxLineLength = MAX_LINE_LENGTH } = {}) {
    const lyrics = normalizeLyrics(value);
    if (!lyrics) return [];
    const stanzas = lyrics.split(/\n{2,}/).map(stanza =>
      stanza.split("\n").flatMap(line => wrapLine(line, maxLineLength)),
    );
    const slides = [];
    let lines = [];
    const flush = () => {
      while (lines[lines.length - 1] === "") lines.pop();
      if (lines.length) slides.push(lines.join("\n"));
      lines = [];
    };

    stanzas.forEach(stanza => {
      const pending = stanza.slice();
      while (pending.length) {
        const separator = lines.length ? 1 : 0;
        const capacity = maxLines - lines.length - separator;
        if (capacity <= 0) {
          flush();
          continue;
        }
        if (separator) lines.push("");
        lines.push(...pending.splice(0, capacity));
        if (pending.length) flush();
      }
    });
    flush();
    return slides;
  }

  function selectedAssignments(parts, songs, detailsById) {
    return parts.flatMap(part => {
      const selected = songs[part.key];
      if (!selected?.id) return [];
      const detail = detailsById.get(selected.id) || selected;
      return [{
        partKey: part.key,
        partLabel: part.label,
        songId: selected.id,
        title: detail.title || selected.title || selected.song || "Untitled song",
        lyrics: normalizeLyrics(detail.lyrics),
      }];
    });
  }

  function missingLyrics(assignments) {
    return assignments.filter(assignment => !assignment.lyrics);
  }

  function lyricFontSize(text) {
    const lines = String(text || "").split("\n");
    const visibleLines = lines.filter(Boolean);
    const longest = visibleLines.reduce((max, line) => Math.max(max, line.length), 0);
    if (visibleLines.length >= 8 || longest > 46) return 27;
    if (visibleLines.length >= 7 || longest > 40) return 30;
    if (visibleLines.length >= 5) return 33;
    return 37;
  }

  function addBackground(slide) {
    slide.background = { color: COLOURS.backgroundDeep };
    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: 0.16,
      h: 7.5,
      line: { color: COLOURS.accent, transparency: 100 },
      fill: { color: COLOURS.accent },
    });
  }

  function buildDeck(PptxGenJS, {
    date,
    celebration,
    meta,
    assignments,
  }) {
    if (typeof PptxGenJS !== "function") throw new Error("PowerPoint generator unavailable");
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "St James the Apostle 6pm Mass";
    pptx.company = "Datamediate Oy";
    pptx.subject = "Lyrics for the selected Sunday Mass";
    pptx.title = `${celebration} — ${date}`;
    pptx.lang = "en-GB";
    pptx.theme = {
      headFontFace: "Aptos Display",
      bodyFontFace: "Aptos",
      lang: "en-GB",
    };

    const cover = pptx.addSlide();
    addBackground(cover);
    cover.addText("ST JAMES THE APOSTLE · 6PM MASS", {
      x: 0.7, y: 0.7, w: 11.9, h: 0.35,
      fontFace: "Aptos", fontSize: 12, bold: true,
      charSpacing: 1.5, color: COLOURS.accent, margin: 0,
    });
    cover.addText(celebration || "Sunday Mass", {
      x: 0.7, y: 2.05, w: 11.4, h: 1.5,
      fontFace: "Aptos Display", fontSize: 38, bold: true,
      color: COLOURS.text, margin: 0, breakLine: false,
      valign: "mid", fit: "shrink",
    });
    cover.addShape("line", {
      x: 0.7, y: 3.85, w: 1.25, h: 0,
      line: { color: COLOURS.accent, width: 2 },
    });
    cover.addText(meta || date || "", {
      x: 0.7, y: 4.15, w: 11.4, h: 0.9,
      fontFace: "Aptos", fontSize: 18,
      color: COLOURS.muted, margin: 0, breakLine: false,
      fit: "shrink",
    });

    assignments.forEach(assignment => {
      const chunks = lyricSlides(assignment.lyrics);
      chunks.forEach((chunk, index) => {
        const slide = pptx.addSlide();
        addBackground(slide);
        slide.addText(assignment.partLabel.toUpperCase(), {
          x: 0.7, y: 0.42, w: 9.8, h: 0.28,
          fontFace: "Aptos", fontSize: 10, bold: true,
          charSpacing: 1.4, color: COLOURS.accent, margin: 0,
        });
        slide.addText(assignment.title, {
          x: 0.7, y: 0.8, w: 11.2, h: 0.55,
          fontFace: "Aptos Display", fontSize: 20, bold: true,
          color: COLOURS.muted, margin: 0, breakLine: false,
          fit: "shrink",
        });
        slide.addText(chunk, {
          x: 0.7, y: 1.55, w: 11.85, h: 4.95,
          fontFace: "Aptos", fontSize: lyricFontSize(chunk), bold: true,
          color: COLOURS.text, margin: 0,
          breakLine: false, valign: "mid", fit: "shrink",
          paraSpaceAfterPt: 8, lineSpacingMultiple: 1.05,
        });
        slide.addText(`${index + 1} / ${chunks.length}`, {
          x: 11.45, y: 6.88, w: 1.1, h: 0.22,
          fontFace: "Aptos", fontSize: 9,
          color: COLOURS.muted, margin: 0, align: "right",
        });
      });
    });

    return pptx;
  }

  function fileName(date) {
    return `st-james-lyrics-${String(date || "mass").replace(/[^0-9A-Za-z-]+/g, "-")}.pptx`;
  }

  const api = Object.freeze({
    buildDeck,
    fileName,
    lyricSlides,
    missingLyrics,
    normalizeLyrics,
    selectedAssignments,
    wrapLine,
  });
  global.LyricsPresentation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
