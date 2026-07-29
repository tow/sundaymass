// Builds an imposed A5 lyrics booklet PDF for duplex printing on landscape A4 paper.
(function (global) {
  "use strict";

  const BOOKLET_PAGES = 8;
  const PAGE_CAPACITY = 48;
  const LINE_LENGTH = 68;
  const LABEL_PATTERN = /^(?:refrain|response|chorus|bridge|verse(?:\s+\d+)?|coda|repeat)(?::|\b)/i;

  const MM_PER_POINT = 25.4 / 72;
  const SHEET = Object.freeze({ w: 297, h: 210, half: 148.5 });
  const PAGE_PADDING = Object.freeze({ top: 10, side: 10, bottom: 11 });
  const COLORS = Object.freeze({
    ink: "#111111",
    navy: "#002f45",
    gold: "#e0b96a",
    bronze: "#80632d",
    slate: "#667078",
    paleBlue: "#d6e1e6",
    footer: "#777777",
    divider: "#d5d5d5",
    foldMark: "#999999",
  });

  function fallbackWrap(value, maxLength = LINE_LENGTH) {
    const words = String(value || "").trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && candidate.length > maxLength) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function wrap(value) {
    const wrapLine = global.LyricsPresentation?.wrapLine || fallbackWrap;
    return wrapLine(value, LINE_LENGTH);
  }

  function attribution(assignment) {
    if (global.LyricsPresentation?.attributionLine) {
      return global.LyricsPresentation.attributionLine(assignment);
    }
    const author = String(assignment.authors || "").trim();
    const owner = String(assignment.copyrightOwner || "").trim();
    const year = String(assignment.copyrightYear || "").trim();
    const copyright = owner
      ? `©${year ? ` ${year}` : ""} ${owner}`
      : year ? `© ${year}` : "";
    return [author, copyright].filter(Boolean).join(" · ");
  }

  function stanzaUnits(value) {
    return String(value || "").split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => ({
        raw: line,
        label: LABEL_PATTERN.test(line),
        lines: wrap(line),
      }));
  }

  function bookletLyrics(assignment) {
    if (global.LyricsPresentation?.congregationLyrics) {
      return global.LyricsPresentation.congregationLyrics(
        assignment?.partKey,
        assignment?.lyrics,
      );
    }
    const lyrics = String(assignment?.lyrics || "").trim();
    if (assignment?.partKey !== "psalm" || !lyrics) return lyrics;
    const firstStanza = lyrics.split(/\n{2,}/)[0];
    const lines = firstStanza.split("\n");
    const firstVerse = lines.findIndex((line, index) =>
      index > 0 && /^\s*(?:verse\s*)?1(?:[.):]|\s)/i.test(line),
    );
    return (firstVerse > 0 ? lines.slice(0, firstVerse) : lines).join("\n").trim();
  }

  function newLyricsPage() {
    return { kind: "lyrics", used: 0, items: [] };
  }

  function paginateLyrics(assignments) {
    const pages = [];
    const contents = [];
    let page = null;

    const startPage = () => {
      page = newLyricsPage();
      pages.push(page);
      return page;
    };
    const remaining = () => PAGE_CAPACITY - page.used;
    const addHeader = (assignment, continued = false) => {
      const cost = continued ? 2.1 : 3.1;
      page.items.push({
        type: "song-header",
        partLabel: assignment.partLabel,
        title: assignment.title,
        attribution: attribution(assignment),
        continued,
      });
      page.used += cost;
    };
    const addStanza = units => {
      page.items.push({ type: "stanza", units });
      page.used += units.reduce((sum, unit) => sum + unit.lines.length, 0) + 0.75;
    };

    assignments.forEach(assignment => {
      const stanzas = bookletLyrics(assignment)
        .split(/\n{2,}/)
        .map(stanzaUnits)
        .filter(units => units.length);
      if (!stanzas.length) return;

      const firstLines = stanzas[0].reduce((sum, unit) => sum + unit.lines.length, 0);
      const required = 3.1 + Math.min(firstLines + 0.75, 4);
      if (!page || remaining() < required) startPage();
      contents.push({
        partLabel: assignment.partLabel,
        title: assignment.title,
        page: pages.length + 1,
      });
      addHeader(assignment);

      stanzas.forEach(stanza => {
        let units = stanza.slice();
        while (units.length) {
          const cost = units.reduce((sum, unit) => sum + unit.lines.length, 0) + 0.75;
          if (cost <= remaining()) {
            addStanza(units);
            units = [];
            continue;
          }

          const available = Math.floor(remaining() - 0.75);
          let take = 0;
          let used = 0;
          while (take < units.length && used + units[take].lines.length <= available) {
            used += units[take].lines.length;
            take += 1;
          }
          if (units.length - take === 1 && take > 1) take -= 1;
          if (take > 0) {
            addStanza(units.slice(0, take));
            units = units.slice(take);
          }
          if (units.length) {
            startPage();
            addHeader(assignment, true);
          }
        }
      });
    });

    return { pages, contents };
  }

  function logicalPages({ date, celebration, meta, assignments }) {
    const { pages: lyricPages } = paginateLyrics(assignments);
    const pages = [
      { kind: "cover", date, celebration, meta },
      ...lyricPages,
    ];
    if (pages.length > BOOKLET_PAGES) {
      throw new Error(
        `Booklet needs ${pages.length} logical pages; the maximum is ${BOOKLET_PAGES}`,
      );
    }
    const padding = BOOKLET_PAGES - pages.length;
    if (padding) {
      for (let index = 1; index < padding; index += 1) pages.push({ kind: "blank" });
      pages.push({ kind: "back-cover", date });
    }
    return pages.map((page, index) => ({ ...page, number: index + 1 }));
  }

  function impose(pages) {
    if (pages.length % 4 !== 0) throw new Error("Booklet page count must be divisible by four");
    const sheets = [];
    for (let index = 0; index < pages.length / 4; index += 1) {
      sheets.push({
        side: "front",
        left: pages[pages.length - 1 - (index * 2)],
        right: pages[index * 2],
      });
      sheets.push({
        side: "back",
        left: pages[1 + (index * 2)],
        right: pages[pages.length - 2 - (index * 2)],
      });
    }
    return sheets;
  }

  function lineStep(sizePt, lineHeight) {
    return sizePt * lineHeight * MM_PER_POINT;
  }

  // Draws pre-split lines top-aligned at (x, y) and returns the y below them.
  function writeLines(doc, lines, x, y, {
    font = "helvetica",
    style = "normal",
    size,
    color,
    lineHeight = 1.25,
    align = "left",
    charSpace = 0,
  }) {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const step = lineStep(size, lineHeight);
    lines.forEach((line, index) => {
      if (!line) return;
      doc.text(line, x, y + index * step, {
        baseline: "top",
        align,
        ...(charSpace ? { charSpace } : {}),
      });
    });
    return y + lines.length * step;
  }

  function splitToWidth(doc, text, { font, style, size, maxWidth }) {
    doc.setFont(font, style);
    doc.setFontSize(size);
    return doc.splitTextToSize(String(text || ""), maxWidth);
  }

  function paintCover(doc, page, x0) {
    doc.setFillColor(COLORS.navy);
    doc.rect(x0, 0, SHEET.half, SHEET.h, "F");
    const left = x0 + 14;
    const width = SHEET.half - 28;
    const titleLines = splitToWidth(doc, page.celebration || "Sunday Mass", {
      font: "times", style: "bold", size: 25, maxWidth: width,
    });
    const metaLines = splitToWidth(doc, page.meta || page.date || "", {
      font: "helvetica", style: "normal", size: 11, maxWidth: width,
    });
    const total = lineStep(8, 1.25) + 10
      + titleLines.length * lineStep(25, 1.08) + 4
      + 4 + metaLines.length * lineStep(11, 1.35) + 10
      + lineStep(9, 1.25);
    let y = (SHEET.h - total) / 2;
    y = writeLines(doc, ["ST JAMES THE APOSTLE · 6PM MASS"], left, y, {
      style: "bold", size: 8, color: COLORS.gold, charSpace: 1.1 * MM_PER_POINT,
    });
    y += 10;
    y = writeLines(doc, titleLines, left, y, {
      font: "times", style: "bold", size: 25, color: "#ffffff", lineHeight: 1.08,
    });
    y += 4;
    doc.setDrawColor(COLORS.gold);
    doc.setLineWidth(1.5 * MM_PER_POINT);
    doc.line(left, y, left + 22, y);
    y += 4;
    y = writeLines(doc, metaLines, left, y, {
      size: 11, color: COLORS.paleBlue, lineHeight: 1.35,
    });
    y += 10;
    writeLines(doc, ["CONGREGATIONAL SONG BOOKLET"], left, y, {
      style: "bold", size: 9, color: COLORS.gold, charSpace: 0.7 * MM_PER_POINT,
    });
  }

  function paintBackCover(doc, page, x0) {
    doc.setFillColor(COLORS.navy);
    doc.rect(x0, 0, SHEET.half, SHEET.h, "F");
    const center = x0 + SHEET.half / 2;
    const total = lineStep(9, 1.25) + 3.2 + lineStep(9, 1.25);
    let y = (SHEET.h - total) / 2;
    y = writeLines(doc, ["ST JAMES THE APOSTLE · 6PM MASS"], center, y, {
      style: "bold", size: 9, color: COLORS.gold,
      align: "center", charSpace: 0.8 * MM_PER_POINT,
    });
    y += 3.2;
    writeLines(doc, [String(page.date || "")], center, y, {
      size: 9, color: COLORS.paleBlue, align: "center",
    });
  }

  function paintSongHeader(doc, item, left, width, y) {
    y = writeLines(doc, [String(item.partLabel || "").toUpperCase()], left, y, {
      style: "bold", size: 6.5, color: COLORS.bronze, charSpace: 0.65 * MM_PER_POINT,
    });
    y += 0.7;
    const titleLines = splitToWidth(doc, item.title, {
      font: "times", style: "bold", size: 12, maxWidth: width,
    });
    const titleTop = y;
    y = writeLines(doc, titleLines, left, y, {
      font: "times", style: "bold", size: 12, color: COLORS.navy, lineHeight: 1.06,
    });
    if (item.continued) {
      doc.setFont("times", "bold");
      doc.setFontSize(12);
      const lastLineTop = titleTop + (titleLines.length - 1) * lineStep(12, 1.06);
      writeLines(doc, ["(continued)"], left + doc.getTextWidth(titleLines.at(-1)) + 1.5,
        lastLineTop + lineStep(12 - 7, 1), { size: 7, color: COLORS.slate });
    }
    if (item.attribution) {
      y += 0.6;
      y = writeLines(doc, [item.attribution], left, y, {
        size: 6.5, color: COLORS.slate, lineHeight: 1.15,
      });
    }
    y += item.continued ? 0.8 : 1.2;
    doc.setDrawColor(COLORS.gold);
    doc.setLineWidth(1 * MM_PER_POINT);
    doc.line(left, y, left + width, y);
    return y + (item.continued ? 1.5 : 1.7);
  }

  function paintLyricsPage(doc, page, x0) {
    const left = x0 + PAGE_PADDING.side;
    const width = SHEET.half - 2 * PAGE_PADDING.side;
    let y = PAGE_PADDING.top;
    page.items.forEach((item, index) => {
      if (item.type === "song-header") {
        if (index) y += 2.7;
        y = paintSongHeader(doc, item, left, width, y);
        return;
      }
      item.units.forEach(unit => {
        unit.lines.forEach((line, wrapIndex) => {
          const indent = wrapIndex ? 1.2 * 8.5 * MM_PER_POINT : 0;
          writeLines(doc, [line], left + indent, y, unit.label
            ? { style: "bolditalic", size: 7.5, color: COLORS.bronze, lineHeight: 1.15 }
            : { font: "times", size: 8.5, color: COLORS.ink, lineHeight: 1.15 });
          y += lineStep(unit.label ? 7.5 : 8.5, 1.15);
        });
      });
      y += 1.5;
    });
    writeLines(doc, [String(page.number)], x0 + SHEET.half / 2,
      SHEET.h - 5 - lineStep(7.5, 1.25), {
        size: 7.5, color: COLORS.footer, align: "center",
      });
  }

  function paintPage(doc, page, x0) {
    if (page.kind === "cover") return paintCover(doc, page, x0);
    if (page.kind === "back-cover") return paintBackCover(doc, page, x0);
    if (page.kind === "blank") return undefined;
    return paintLyricsPage(doc, page, x0);
  }

  function buildPdf(JsPDF, options) {
    if (typeof JsPDF !== "function") throw new Error("PDF generator unavailable");
    const sheets = impose(logicalPages(options));
    const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setProperties({
      title: `${options.celebration || "Sunday Mass"} — congregational song booklet`,
      subject: "Congregational song booklet for the selected Sunday Mass",
      author: "St James the Apostle 6pm Mass",
      creator: "Datamediate Oy",
    });
    sheets.forEach((sheet, index) => {
      if (index) doc.addPage("a4", "landscape");
      paintPage(doc, sheet.left, 0);
      paintPage(doc, sheet.right, SHEET.half);
      doc.setDrawColor(COLORS.divider);
      doc.setLineWidth(0.25 * MM_PER_POINT);
      doc.line(SHEET.half, 0, SHEET.half, SHEET.h);
      doc.setDrawColor(COLORS.foldMark);
      doc.setLineWidth(0.4 * MM_PER_POINT);
      doc.line(148, 0, 148, 2.5);
      doc.line(148, SHEET.h - 2.5, 148, SHEET.h);
    });
    return doc;
  }

  function fileName(date) {
    return `st-james-booklet-${String(date || "mass").replace(/[^0-9A-Za-z-]+/g, "-")}.pdf`;
  }

  const api = Object.freeze({
    bookletLyrics,
    buildPdf,
    fileName,
    impose,
    logicalPages,
    paginateLyrics,
  });
  global.LyricsBooklet = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
