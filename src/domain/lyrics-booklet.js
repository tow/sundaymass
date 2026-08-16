// Builds an imposed A5 lyrics booklet PDF for duplex printing on landscape A4 paper.
//
// docs/booklet-layout.md is the normative specification for everything in this file:
// geometry, the stanza content model, measurement, column division, page packing, and
// type-size selection. Read it before changing layout behaviour, and amend it before
// changing a rule — where the two disagree, this file is wrong. Section 10 of that
// document lists the known deviations of the current implementation, including the
// column division rule (§5) that splits stanzas in order to equalise column heights.
(function (global) {
  "use strict";

  const BOOKLET_PAGES = 8;
  // Deviates from spec §1.1 and §3: capacity should be derived from the usable text
  // height, and line breaking should measure text rather than count characters. Both
  // constants run conservative, which costs type size on every page.
  const PAGE_CAPACITY = 48;
  const LINE_LENGTH = 68;
  const NARROW_LINE_LENGTH = 38;
  // Largest first: the booklet is sung from at arm's length in poor light, so
  // spare space is spent on type size rather than left as margin.
  const FONT_CANDIDATES = Object.freeze([
    14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5,
  ]);
  const STANZA_GAP = 0.45;
  const SONG_GAP = 0.8;
  const LABEL_PATTERN = /^(?:all|cantor|refrain|response|chorus|bridge|verse(?:\s+\d+)?|coda|repeat)(?::|\b)/i;

  const MM_PER_POINT = 25.4 / 72;
  const SHEET = Object.freeze({ w: 297, h: 210, half: 148.5 });
  const PAGE_PADDING = Object.freeze({ top: 10, side: 10, bottom: 11 });
  // Deliberately monochrome — the booklet is photocopied in bulk, so it must
  // not spend colour ink (no cover flood-fill, greyscale accents only).
  // Page one carries a compact masthead and then runs straight into lyrics, so
  // every logical page can hold songs.
  const MASTHEAD = Object.freeze({
    eyebrow: "ST JAMES THE APOSTLE · 6PM MASS",
    eyebrowSize: 7,
    titleSize: 15,
    metaSize: 8.5,
  });
  const COLORS = Object.freeze({
    ink: "#111111",
    heading: "#111111",
    label: "#444444",
    muted: "#555555",
    rule: "#8c8c8c",
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

  function wrap(value, maxLength = LINE_LENGTH) {
    const wrapLine = global.LyricsPresentation?.wrapLine || fallbackWrap;
    return wrapLine(value, maxLength);
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

  function stanzaUnits(value, maxLength = LINE_LENGTH) {
    return String(value || "").split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => ({
        raw: line,
        label: LABEL_PATTERN.test(line),
        lines: wrap(line, maxLength),
      }));
  }

  function bookletLyrics(assignment) {
    if (global.LyricsPresentation?.congregationLyrics) {
      return global.LyricsPresentation.congregationLyrics(
        assignment?.partKey,
        assignment?.lyrics,
      );
    }
    return String(assignment?.lyrics || "").trim();
  }

  function bookletStanzas(assignment, maxLength = LINE_LENGTH) {
    const blocks = assignment?.lyricBlocks?.length
      ? assignment.lyricBlocks
      : [{ text: bookletLyrics(assignment), audienceLabel: "" }];
    return blocks.flatMap(block => String(block.text || "")
      .split(/\n{2,}/)
      .map(value => stanzaUnits(value, maxLength))
      .filter(units => units.length)
      .map((units, index) => {
        if (!block.audienceLabel || index > 0) return units;
        return [{
          raw: block.audienceLabel,
          label: true,
          lines: [block.audienceLabel],
        }, ...units];
      }));
  }

  // Wrapped by character budget rather than measured width so that the space
  // reserved during pagination matches what the painter later draws.
  function layoutMasthead({ celebration, meta, date } = {}) {
    const titleLines = wrap(
      celebration || "Sunday Mass",
      Math.floor(58 * 12 / MASTHEAD.titleSize),
    );
    const metaLines = wrap(meta || date || "", Math.floor(92 * 7 / MASTHEAD.metaSize))
      .filter(Boolean);
    const height = lineStep(MASTHEAD.eyebrowSize, 1.25) + 1.4
      + titleLines.length * lineStep(MASTHEAD.titleSize, 1.08)
      + (metaLines.length ? 1.2 + metaLines.length * lineStep(MASTHEAD.metaSize, 1.3) : 0)
      + 2.4 + 3;
    return Object.freeze({ titleLines, metaLines, height });
  }

  function newLyricsPage() {
    return { kind: "lyrics", used: 0, items: [] };
  }

  function paginateLyricsLegacy(assignments, pageCapacity = PAGE_CAPACITY, mastheadCost = 0) {
    const pages = [];
    const contents = [];
    let page = null;

    const startPage = () => {
      page = newLyricsPage();
      if (!pages.length) page.used = mastheadCost;
      pages.push(page);
      return page;
    };
    const remaining = () => pageCapacity - page.used;
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
      const stanzas = bookletStanzas(assignment);
      if (!stanzas.length) return;

      const firstLines = stanzas[0].reduce((sum, unit) => sum + unit.lines.length, 0);
      const required = 3.1 + Math.min(firstLines + 0.75, 4);
      if (!page || remaining() < required) startPage();
      contents.push({
        partLabel: assignment.partLabel,
        title: assignment.title,
        page: pages.length,
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

  function flowTokens(stanzas) {
    return stanzas.flatMap(stanza => stanza.map((unit, index) => ({
      unit,
      gapAfter: index === stanza.length - 1 ? STANZA_GAP : 0,
      cost: unit.lines.length + (index === stanza.length - 1 ? STANZA_GAP : 0),
    })));
  }

  function tokensHeight(tokens) {
    return tokens.reduce((sum, token) => sum + token.cost, 0);
  }

  // Deviates from spec §5: divides at any line boundary and rewards equal columns, so
  // stanzas are cut mid-verse. The specified rule divides only between stanzas and
  // minimises the taller column alone.
  function splitTokens(tokens) {
    if (tokens.length < 2) return [tokens, []];
    let best = null;
    for (let index = 1; index < tokens.length; index += 1) {
      if (tokens[index - 1].unit.label) continue;
      const left = tokens.slice(0, index);
      const right = tokens.slice(index);
      const heights = [tokensHeight(left), tokensHeight(right)];
      const score = Math.max(...heights) * 10 + Math.abs(heights[0] - heights[1]);
      if (!best || score < best.score) best = { left, right, score };
    }
    return best ? [best.left, best.right] : [tokens, []];
  }

  function layoutHeader(assignment, fontSize) {
    const titleSize = fontSize + 3;
    const labelSize = Math.max(7, fontSize - 3.5);
    const attributionSize = Math.max(7, fontSize - 3);
    const titleLength = Math.max(36, Math.floor(58 * 12 / titleSize));
    const attributionLength = Math.max(60, Math.floor(92 * 7 / attributionSize));
    const titleLines = wrap(assignment.title, titleLength);
    const attributionLines = wrap(attribution(assignment), attributionLength);
    const height = (
      labelSize * 1.25
      + titleLines.length * titleSize * 1.06
      + attributionLines.length * attributionSize * 1.15
    ) / (fontSize * 1.15) + 1;
    return {
      type: "song-header",
      partLabel: assignment.partLabel,
      title: assignment.title,
      attribution: attributionLines.join(" "),
      attributionLines,
      titleLines,
      continued: false,
      height,
    };
  }

  function songLayout(assignment, fontSize, columns) {
    const baseLength = columns === 1 ? LINE_LENGTH : NARROW_LINE_LENGTH;
    const maxLength = Math.max(24, Math.floor(baseLength * 8.5 / fontSize));
    const stanzas = bookletStanzas(assignment, maxLength);
    const tokens = flowTokens(stanzas);
    const bodyColumns = columns === 1 ? [tokens] : splitTokens(tokens);
    const bodyHeight = Math.max(...bodyColumns.map(tokensHeight));
    const header = layoutHeader(assignment, fontSize);
    return {
      assignment,
      columns,
      bodyColumns,
      bodyHeight,
      fontSize,
      header,
      height: header.height + bodyHeight,
    };
  }

  function columnPenalty(layout, singleColumnLayout) {
    if (layout.columns === 1) return 0;
    const savings = singleColumnLayout.height - layout.height;
    const shortSongPenalty = Math.max(0, 14 - singleColumnLayout.bodyHeight) * 2;
    const weakSavingsPenalty = Math.max(0, 3 - savings) * 4;
    return 3 + shortSongPenalty + weakSavingsPenalty;
  }

  function appendCandidate(state, layout, startNewPage, capacity, penalty, mastheadCost) {
    const pages = state.pages.map(page => ({ ...page, blocks: page.blocks.slice() }));
    let score = state.score + penalty;
    if (startNewPage || !pages.length) {
      if (pages.length) {
        const leftover = capacity - pages.at(-1).used;
        score += leftover * leftover * 0.035;
      }
      pages.push({
        kind: "lyrics",
        layout: "adaptive",
        used: pages.length ? 0 : mastheadCost,
        blocks: [],
        items: [],
      });
    }
    const page = pages.at(-1);
    const gap = page.blocks.length ? SONG_GAP : 0;
    page.blocks.push(layout);
    page.items.push(layout.header);
    page.used += gap + layout.height;
    return { pages, score };
  }

  function chooseCandidate(assignments, fontSize, masthead, mastheadOnlyFirstPage = false) {
    const songs = assignments.filter(assignment => bookletStanzas(assignment).length);
    if (!songs.length) return { pages: [], contents: [] };
    const capacity = PAGE_CAPACITY * 8.5 / fontSize;
    const mastheadCost = masthead.height / lineStep(fontSize, 1.15);
    // Giving the masthead a page of its own costs a page of lyrics but frees the
    // first song from having to fit beneath it, which can buy a larger font for
    // the whole booklet.
    const reserved = mastheadOnlyFirstPage
      ? [{ kind: "lyrics", layout: "adaptive", used: capacity, blocks: [], items: [] }]
      : [];
    const targetPages = Math.min(BOOKLET_PAGES, songs.length + reserved.length);
    let states = [{ pages: reserved, score: 0 }];

    songs.forEach(assignment => {
      const single = songLayout(assignment, fontSize, 1);
      const double = songLayout(assignment, fontSize, 2);
      const layouts = double.bodyColumns[1].length ? [single, double] : [single];
      const next = [];
      states.forEach(state => {
        layouts.forEach(layout => {
          if (layout.height > capacity) return;
          const penalty = columnPenalty(layout, single);
          const current = state.pages.at(-1);
          const gap = current?.blocks.length ? SONG_GAP : 0;
          if (current && current.used + gap + layout.height <= capacity) {
            next.push(appendCandidate(state, layout, false, capacity, penalty, mastheadCost));
          }
          const opening = state.pages.length ? 0 : mastheadCost;
          if ((!current || state.pages.length < targetPages)
            && opening + layout.height <= capacity) {
            next.push(appendCandidate(state, layout, true, capacity, penalty, mastheadCost));
          }
        });
      });

      const bestByShape = new Map();
      next.forEach(state => {
        const key = `${state.pages.length}:${Math.round(state.pages.at(-1).used * 2)}`;
        if (!bestByShape.has(key) || bestByShape.get(key).score > state.score) {
          bestByShape.set(key, state);
        }
      });
      states = [...bestByShape.values()]
        .sort((left, right) => left.score - right.score)
        .slice(0, 400);
    });

    const complete = states.filter(state => state.pages.length === targetPages);
    if (!complete.length) return null;
    complete.forEach(state => {
      const leftover = capacity - state.pages.at(-1).used;
      state.score += leftover * leftover * 0.035;
    });
    const chosen = complete.sort((left, right) => left.score - right.score)[0];
    const contents = [];
    chosen.pages.forEach((page, pageIndex) => {
      page.blocks.forEach(block => contents.push({
        partLabel: block.assignment.partLabel,
        title: block.assignment.title,
        page: pageIndex + 1,
      }));
    });
    return { pages: chosen.pages, contents, fontSize, score: chosen.score };
  }

  function paginateLyrics(assignments, masthead = layoutMasthead()) {
    for (const fontSize of FONT_CANDIDATES) {
      // Lyrics beneath the masthead are worth a page, but never worth shrinking
      // the type, so a masthead-only first page is tried at the same size before
      // moving down the font ladder.
      const candidate = chooseCandidate(assignments, fontSize, masthead)
        || chooseCandidate(assignments, fontSize, masthead, true);
      if (candidate) return candidate;
    }
    const mastheadCost = masthead.height / lineStep(8.5, 1.15);
    const legacy = paginateLyricsLegacy(assignments, PAGE_CAPACITY, mastheadCost);
    const songCount = assignments.filter(assignment => bookletStanzas(assignment).length).length;
    const targetPages = Math.min(BOOKLET_PAGES, songCount);
    if (songCount < BOOKLET_PAGES || legacy.pages.length >= targetPages) return legacy;

    // If one unusually long song forced the whole-song candidates to fail, the
    // old paginator can otherwise leave blank pages. Tighten its capacity until
    // it fills every lyric page; this only adds page breaks and never risks
    // overflow because the rendered page capacity remains the original 48 units.
    for (let capacity = PAGE_CAPACITY - 0.5; capacity >= 12; capacity -= 0.5) {
      const candidate = paginateLyricsLegacy(assignments, capacity, mastheadCost);
      if (candidate.pages.length === targetPages) return candidate;
      if (candidate.pages.length > targetPages) break;
    }
    return legacy;
  }

  function logicalPages({ date, celebration, meta, assignments }) {
    const masthead = layoutMasthead({ date, celebration, meta });
    const { pages: lyricPages } = paginateLyrics(assignments, masthead);
    const pages = (lyricPages.length ? lyricPages : [newLyricsPage()])
      .map((page, index) => (index ? page : { ...page, masthead }));
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

  function paintMasthead(doc, masthead, left, width, top) {
    let y = writeLines(doc, [MASTHEAD.eyebrow], left, top, {
      style: "bold", size: MASTHEAD.eyebrowSize, color: COLORS.label,
      charSpace: 0.9 * MM_PER_POINT,
    });
    y += 1.4;
    y = writeLines(doc, masthead.titleLines, left, y, {
      font: "times", style: "bold", size: MASTHEAD.titleSize,
      color: COLORS.heading, lineHeight: 1.08,
    });
    if (masthead.metaLines.length) {
      y += 1.2;
      y = writeLines(doc, masthead.metaLines, left, y, {
        size: MASTHEAD.metaSize, color: COLORS.muted, lineHeight: 1.3,
      });
    }
    y += 2.4;
    doc.setDrawColor(COLORS.rule);
    doc.setLineWidth(1.2 * MM_PER_POINT);
    doc.line(left, y, left + width, y);
    return top + masthead.height;
  }

  function paintBackCover(doc, page, x0) {
    const center = x0 + SHEET.half / 2;
    const total = lineStep(9, 1.25) + 3.2 + lineStep(9, 1.25);
    let y = (SHEET.h - total) / 2;
    y = writeLines(doc, ["ST JAMES THE APOSTLE · 6PM MASS"], center, y, {
      style: "bold", size: 9, color: COLORS.label,
      align: "center", charSpace: 0.8 * MM_PER_POINT,
    });
    y += 3.2;
    writeLines(doc, [String(page.date || "")], center, y, {
      size: 9, color: COLORS.muted, align: "center",
    });
  }

  function paintSongHeader(doc, item, left, width, y) {
    y = writeLines(doc, [String(item.partLabel || "").toUpperCase()], left, y, {
      style: "bold", size: 6.5, color: COLORS.label, charSpace: 0.65 * MM_PER_POINT,
    });
    y += 0.7;
    const titleLines = splitToWidth(doc, item.title, {
      font: "times", style: "bold", size: 12, maxWidth: width,
    });
    const titleTop = y;
    y = writeLines(doc, titleLines, left, y, {
      font: "times", style: "bold", size: 12, color: COLORS.heading, lineHeight: 1.06,
    });
    if (item.continued) {
      doc.setFont("times", "bold");
      doc.setFontSize(12);
      const lastLineTop = titleTop + (titleLines.length - 1) * lineStep(12, 1.06);
      writeLines(doc, ["(continued)"], left + doc.getTextWidth(titleLines.at(-1)) + 1.5,
        lastLineTop + lineStep(12 - 7, 1), { size: 7, color: COLORS.muted });
    }
    if (item.attribution) {
      y += 0.6;
      y = writeLines(doc, [item.attribution], left, y, {
        size: 6.5, color: COLORS.muted, lineHeight: 1.15,
      });
    }
    y += item.continued ? 0.8 : 1.2;
    doc.setDrawColor(COLORS.rule);
    doc.setLineWidth(1 * MM_PER_POINT);
    doc.line(left, y, left + width, y);
    return y + (item.continued ? 1.5 : 1.7);
  }

  function paintAdaptiveHeader(doc, block, left, width, y) {
    const { fontSize, header } = block;
    const labelSize = Math.max(7, fontSize - 3.5);
    const titleSize = fontSize + 3;
    const attributionSize = Math.max(7, fontSize - 3);
    y = writeLines(doc, [String(header.partLabel || "").toUpperCase()], left, y, {
      style: "bold", size: labelSize, color: COLORS.label,
      charSpace: 0.5 * MM_PER_POINT,
    });
    y += 0.7;
    y = writeLines(doc, header.titleLines, left, y, {
      font: "times", style: "bold", size: titleSize,
      color: COLORS.heading, lineHeight: 1.06,
    });
    if (header.attributionLines.length) {
      y += 0.6;
      y = writeLines(doc, header.attributionLines, left, y, {
        size: attributionSize, color: COLORS.muted, lineHeight: 1.15,
      });
    }
    y += 1.2;
    doc.setDrawColor(COLORS.rule);
    doc.setLineWidth(1 * MM_PER_POINT);
    doc.line(left, y, left + width, y);
    return y + 1.7;
  }

  function paintAdaptiveLyricsPage(doc, page, x0) {
    const left = x0 + PAGE_PADDING.side;
    const width = SHEET.half - 2 * PAGE_PADDING.side;
    const columnGap = 7;
    let blockTop = page.masthead
      ? paintMasthead(doc, page.masthead, left, width, PAGE_PADDING.top)
      : PAGE_PADDING.top;

    page.blocks.forEach((block, blockIndex) => {
      if (blockIndex) blockTop += lineStep(block.fontSize, 1.15) * SONG_GAP;
      const contentTop = paintAdaptiveHeader(doc, block, left, width, blockTop);
      const columnWidth = block.columns === 1 ? width : (width - columnGap) / 2;
      let blockBottom = contentTop;
      block.bodyColumns.forEach((tokens, column) => {
        const columnLeft = left + column * (columnWidth + columnGap);
        let y = contentTop;
        tokens.forEach(token => {
          token.unit.lines.forEach((line, wrapIndex) => {
            const labelSize = Math.max(8, block.fontSize - 1.5);
            const size = token.unit.label ? labelSize : block.fontSize;
            const indent = wrapIndex ? 1.2 * block.fontSize * MM_PER_POINT : 0;
            writeLines(doc, [line], columnLeft + indent, y, token.unit.label
              ? { style: "bolditalic", size, color: COLORS.label, lineHeight: 1.15 }
              : { font: "times", size, color: COLORS.ink, lineHeight: 1.15 });
            y += lineStep(size, 1.15);
          });
          y += lineStep(block.fontSize, 1.15) * token.gapAfter;
        });
        blockBottom = Math.max(blockBottom, y);
      });
      blockTop = blockBottom;
    });

    writeLines(doc, [String(page.number)], x0 + SHEET.half / 2,
      SHEET.h - 5 - lineStep(7.5, 1.25), {
        size: 7.5, color: COLORS.footer, align: "center",
      });
  }

  function paintLyricsPage(doc, page, x0) {
    const left = x0 + PAGE_PADDING.side;
    const width = SHEET.half - 2 * PAGE_PADDING.side;
    let y = page.masthead
      ? paintMasthead(doc, page.masthead, left, width, PAGE_PADDING.top)
      : PAGE_PADDING.top;
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
            ? { style: "bolditalic", size: 7.5, color: COLORS.label, lineHeight: 1.15 }
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
    if (page.kind === "back-cover") return paintBackCover(doc, page, x0);
    if (page.kind === "blank") return undefined;
    if (page.layout === "adaptive") return paintAdaptiveLyricsPage(doc, page, x0);
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
    bookletStanzas,
    buildPdf,
    fileName,
    impose,
    logicalPages,
    paginateLyrics,
  });
  global.LyricsBooklet = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
