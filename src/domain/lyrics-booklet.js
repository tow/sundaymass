// Builds an imposed A5 lyrics booklet PDF for duplex printing on landscape A4 paper.
//
// docs/booklet-layout.md is the normative specification for everything in this file:
// geometry, the stanza content model, measurement, column division, page packing, and
// type-size selection. Read it before changing layout behaviour, and amend it before
// changing a rule — where the two disagree, this file is wrong.
(function (global) {
  "use strict";

  const BOOKLET_PAGES = 8;
  const MM_PER_POINT = 25.4 / 72;
  const SHEET = Object.freeze({ w: 297, h: 210, half: 148.5 });
  const PAGE_PADDING = Object.freeze({ top: 10, side: 10, bottom: 11 });
  const TEXT_WIDTH = SHEET.half - 2 * PAGE_PADDING.side;
  const TEXT_HEIGHT = SHEET.h - PAGE_PADDING.top - PAGE_PADDING.bottom;
  const COLUMN_GUTTER = Object.freeze({ 1: 0, 2: 7, 3: 5 });
  const MAX_COLUMNS = 3;

  const LINE_HEIGHT = 1.15;
  const STANZA_GAP = 0.45;
  const SONG_GAP = 0.8;
  const CONTINUATION_INDENT = 1.2;
  // Largest first: the booklet is sung from at arm's length in poor light, so
  // spare space is spent on type size rather than left as margin.
  const FONT_CANDIDATES = Object.freeze([
    14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5,
  ]);
  const FALLBACK_SIZE = 8.5;
  // How many lines of saved height one wrapped phrase is worth (spec §5). The
  // page-fill weight is held far below it so that it only separates layouts the
  // wrap cost leaves tied.
  const WRAP_WEIGHT = 1;
  const PAGE_FILL_WEIGHT = 0.02;
  const BEAM_WIDTH = 400;

  const LABEL_PATTERN = /^(?:all|cantor|refrain|response|chorus|bridge|verse(?:\s+\d+)?|coda|repeat)(?::|\b)/i;

  // Deliberately monochrome — the booklet is photocopied in bulk, so it must
  // not spend colour ink (no cover flood-fill, greyscale accents only).
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

  function lineStep(sizePt, lineHeight = LINE_HEIGHT) {
    return sizePt * lineHeight * MM_PER_POINT;
  }

  function columnWidth(columns) {
    const gutter = COLUMN_GUTTER[columns] || 0;
    return (TEXT_WIDTH - gutter * (columns - 1)) / columns;
  }

  function labelSize(sizePt) {
    return Math.max(8, sizePt - 1.5);
  }

  // Spec §3: every width comes from the PDF engine, for the exact font, style and
  // size being drawn. Injected rather than imported so layout stays testable.
  function measurer(doc) {
    return {
      width(text, { font = "helvetica", style = "normal", size }) {
        doc.setFont(font, style);
        doc.setFontSize(size);
        return doc.getTextWidth(String(text || ""));
      },
    };
  }

  function requireMeasure(measure) {
    if (!measure || typeof measure.width !== "function") {
      throw new Error("Booklet layout needs a text measurer; see docs/booklet-layout.md §3");
    }
    return measure;
  }

  // Breaks one logical line to a column, hanging the continuation lines under an
  // indent. Layout keeps the result and the painter draws it unchanged (spec §3,
  // "measure once").
  function wrapText(measure, text, { font, style, size, width, indent = 0 }) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = "";
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      const available = lines.length ? width - indent : width;
      if (line && measure.width(candidate, { font, style, size }) > available) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines;
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

  function bookletLyrics(assignment) {
    if (global.LyricsPresentation?.congregationLyrics) {
      return global.LyricsPresentation.congregationLyrics(
        assignment?.partKey,
        assignment?.lyrics,
      );
    }
    return String(assignment?.lyrics || "").trim();
  }

  // Spec §2: lines keep whatever length the editor typed. Nothing is wrapped here,
  // and stanza boundaries survive into column division.
  function bookletStanzas(assignment) {
    const blocks = assignment?.lyricBlocks?.length
      ? assignment.lyricBlocks
      : [{ text: bookletLyrics(assignment), audienceLabel: "" }];
    return blocks.flatMap(block => String(block.text || "")
      .split(/\n{2,}/)
      .map(value => String(value || "").split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => ({ text: line, label: LABEL_PATTERN.test(line) })))
      .filter(lines => lines.length)
      .map((lines, index) => {
        if (!block.audienceLabel || index > 0) return lines;
        return [{ text: block.audienceLabel, label: true }, ...lines];
      }));
  }

  function layoutStanza(measure, stanza, { width, size }) {
    const indent = CONTINUATION_INDENT * size * MM_PER_POINT;
    const rows = [];
    stanza.forEach(line => {
      const font = line.label ? "helvetica" : "times";
      const style = line.label ? "bolditalic" : "normal";
      const rowSize = line.label ? labelSize(size) : size;
      const color = line.label ? COLORS.label : COLORS.ink;
      wrapText(measure, line.text, { font, style, size: rowSize, width, indent })
        .forEach((text, index) => rows.push({
          text, font, style, color,
          size: rowSize,
          indent: index ? indent : 0,
          step: lineStep(rowSize),
        }));
    });
    return {
      rows,
      height: rows.reduce((sum, row) => sum + row.step, 0),
      visualLines: rows.length,
      endsWithLabel: Boolean(stanza.length && stanza[stanza.length - 1].label),
    };
  }

  function layoutHeader(measure, assignment, size, continued = false) {
    const labelPt = Math.max(7, size - 3.5);
    const titlePt = size + 3;
    const attributionPt = Math.max(7, size - 3);
    const titleLines = wrapText(measure, assignment.title, {
      font: "times", style: "bold", size: titlePt, width: TEXT_WIDTH,
    });
    const attributionLines = wrapText(measure, attribution(assignment), {
      font: "helvetica", style: "normal", size: attributionPt, width: TEXT_WIDTH,
    });
    const height = lineStep(labelPt, 1.25)
      + 0.7
      + titleLines.length * lineStep(titlePt, 1.06)
      + (attributionLines.length ? 0.6 + attributionLines.length * lineStep(attributionPt, 1.15) : 0)
      + 1.2
      + 1.7;
    return {
      partLabel: assignment.partLabel,
      title: assignment.title,
      titleLines,
      attributionLines,
      attribution: attributionLines.join(" "),
      labelPt,
      titlePt,
      attributionPt,
      continued,
      height,
    };
  }

  // Spec §4.3: divide an ordered sequence into `parts` contiguous groups so that the
  // largest group sum is as small as possible. Ties keep the later cut, which fills
  // the earlier columns.
  function linearPartition(costs, parts) {
    const count = costs.length;
    if (parts < 1 || parts > count) return null;
    const prefix = [0];
    costs.forEach(cost => prefix.push(prefix[prefix.length - 1] + cost));
    const total = (from, to) => prefix[to] - prefix[from];
    const best = Array.from({ length: count + 1 }, () => new Array(parts + 1).fill(Infinity));
    const cut = Array.from({ length: count + 1 }, () => new Array(parts + 1).fill(0));
    for (let end = 1; end <= count; end += 1) best[end][1] = total(0, end);
    for (let part = 2; part <= parts; part += 1) {
      for (let end = part; end <= count; end += 1) {
        for (let split = part - 1; split < end; split += 1) {
          const value = Math.max(best[split][part - 1], total(split, end));
          if (value <= best[end][part]) {
            best[end][part] = value;
            cut[end][part] = split;
          }
        }
      }
    }
    if (!Number.isFinite(best[count][parts])) return null;
    const groups = [];
    let end = count;
    for (let part = parts; part >= 1; part -= 1) {
      const start = part === 1 ? 0 : cut[end][part];
      groups.unshift([start, end]);
      end = start;
    }
    return groups;
  }

  function columnHeight(column, gap) {
    return column.reduce((sum, stanza) => sum + stanza.height, 0)
      + Math.max(0, column.length - 1) * gap;
  }

  // Spec §4.3: only a stanza that is by itself taller than the column is divided, and
  // then only that stanza. The pieces stay adjacent, so the song still reads in order.
  function divideOversized(stanzas, available) {
    if (!(available > 0)) return stanzas;
    const divided = [];
    stanzas.forEach(stanza => {
      let rest = stanza;
      while (rest.height > available) {
        const parts = splitStanza(rest, available);
        if (!parts) break;
        divided.push(parts[0]);
        rest = parts[1];
      }
      divided.push(rest);
    });
    return divided;
  }

  function layoutBlock(measure, assignment, size, columns, stanzas) {
    const width = columnWidth(columns);
    const header = layoutHeader(measure, assignment, size);
    const laid = divideOversized(
      stanzas.map(stanza => layoutStanza(measure, stanza, { width, size })),
      TEXT_HEIGHT - header.height,
    );
    // Every column must receive content, which is what bounds the column count: a
    // body of two pieces cannot fill three columns (spec §4.2).
    if (columns > laid.length) return null;
    const gap = STANZA_GAP * lineStep(size);
    const groups = columns === 1
      ? [[0, laid.length]]
      : linearPartition(laid.map(stanza => stanza.height + gap), columns);
    if (!groups) return null;
    const bodyColumns = groups.map(([start, end]) => laid.slice(start, end));
    if (bodyColumns.some(column => !column.length)) return null;
    const bodyHeight = Math.max(...bodyColumns.map(column => columnHeight(column, gap)));
    return {
      assignment,
      columns,
      header,
      bodyColumns,
      gap,
      size,
      bodyHeight,
      height: header.height + bodyHeight,
      visualLines: laid.reduce((sum, stanza) => sum + stanza.visualLines, 0),
    };
  }

  function blockLayouts(measure, assignment, size) {
    const stanzas = bookletStanzas(assignment);
    if (!stanzas.length) return [];
    const layouts = [];
    for (let columns = 1; columns <= MAX_COLUMNS; columns += 1) {
      const layout = layoutBlock(measure, assignment, size, columns, stanzas);
      if (layout) layouts.push(layout);
    }
    return layouts;
  }

  function newPage(capacity, masthead) {
    return { kind: "lyrics", capacity, used: 0, blocks: [], items: [], masthead };
  }

  function appendCandidate(state, layout, startNewPage, capacities, mastheadHeight) {
    const pages = state.pages.map(page => ({
      ...page, blocks: page.blocks.slice(), items: page.items.slice(),
    }));
    let score = state.score + WRAP_WEIGHT * layout.visualLines;
    if (startNewPage || !pages.length) {
      if (pages.length) score += pageFillCost(pages[pages.length - 1], layout.size);
      pages.push(newPage(capacities(pages.length, mastheadHeight)));
    }
    const page = pages[pages.length - 1];
    const gap = page.blocks.length ? SONG_GAP * lineStep(layout.size) : 0;
    page.blocks.push(layout);
    page.items.push(layout.header);
    page.used += gap + layout.height;
    return { pages, score };
  }

  function pageFillCost(page, size) {
    const unused = Math.max(0, page.capacity - page.used) / lineStep(size);
    return PAGE_FILL_WEIGHT * unused * unused;
  }

  function chooseCandidate(measure, assignments, size, masthead, mastheadOwnPage = false) {
    const songs = assignments.filter(assignment => bookletStanzas(assignment).length);
    if (!songs.length) return null;
    const mastheadHeight = masthead ? masthead.height : 0;
    const capacities = (index, height) => TEXT_HEIGHT - (index === 0 ? height : 0);
    const reserved = mastheadOwnPage
      ? [{ ...newPage(TEXT_HEIGHT - mastheadHeight), used: TEXT_HEIGHT - mastheadHeight }]
      : [];
    const targetPages = Math.min(BOOKLET_PAGES, songs.length + reserved.length);
    let states = [{ pages: reserved, score: 0 }];

    for (const assignment of songs) {
      const layouts = blockLayouts(measure, assignment, size);
      if (!layouts.length) return null;
      const next = [];
      states.forEach(state => {
        layouts.forEach(layout => {
          const current = state.pages[state.pages.length - 1];
          if (current) {
            const gap = current.blocks.length ? SONG_GAP * lineStep(size) : 0;
            if (current.used + gap + layout.height <= current.capacity) {
              next.push(appendCandidate(state, layout, false, capacities, mastheadHeight));
            }
          }
          const capacity = capacities(state.pages.length, mastheadHeight);
          if ((!current || state.pages.length < targetPages) && layout.height <= capacity) {
            next.push(appendCandidate(state, layout, true, capacities, mastheadHeight));
          }
        });
      });
      if (!next.length) return null;

      const bestByShape = new Map();
      next.forEach(state => {
        const page = state.pages[state.pages.length - 1];
        const key = `${state.pages.length}:${Math.round(page.used * 2)}`;
        if (!bestByShape.has(key) || bestByShape.get(key).score > state.score) {
          bestByShape.set(key, state);
        }
      });
      states = [...bestByShape.values()]
        .sort((left, right) => left.score - right.score)
        .slice(0, BEAM_WIDTH);
    }

    const complete = states.filter(state => state.pages.length === targetPages);
    if (!complete.length) return null;
    complete.forEach(state => {
      state.score += pageFillCost(state.pages[state.pages.length - 1], size);
    });
    const chosen = complete.sort((left, right) => left.score - right.score)[0];
    return { pages: chosen.pages, contents: contentsOf(chosen.pages), fontSize: size, score: chosen.score };
  }

  function contentsOf(pages) {
    const contents = [];
    pages.forEach((page, index) => page.blocks.forEach(block => contents.push({
      partLabel: block.assignment.partLabel,
      title: block.assignment.title,
      page: index + 1,
    })));
    return contents;
  }

  // Spec §4.3: a stanza is divided only when it alone is taller than the space it
  // must fit. Prefer a couplet boundary, then an even split, and never leave one
  // line behind.
  function splitStanza(stanza, available) {
    const rows = stanza.rows;
    if (rows.length < 4) return null;
    let take = 0;
    let used = 0;
    while (take < rows.length && used + rows[take].step <= available) {
      used += rows[take].step;
      take += 1;
    }
    if (take < 2 || rows.length - take < 2) return null;
    if (take % 2 === 1 && rows.length - (take - 1) >= 2) take -= 1;
    const head = rows.slice(0, take);
    const tail = rows.slice(take);
    const build = part => ({
      rows: part,
      height: part.reduce((sum, row) => sum + row.step, 0),
      visualLines: part.length,
      endsWithLabel: false,
    });
    return [build(head), build(tail)];
  }

  // Spec §6: reached when no type size lays every song out whole. Single column at a
  // fixed size, continuing songs across pages under a "(continued)" header.
  function fallbackPaginate(measure, assignments, masthead) {
    const size = FALLBACK_SIZE;
    const width = columnWidth(1);
    const gap = STANZA_GAP * lineStep(size);
    const songGap = SONG_GAP * lineStep(size);
    const mastheadHeight = masthead ? masthead.height : 0;
    const pages = [];
    let page = null;

    const capacity = () => TEXT_HEIGHT - (pages.length === 1 ? mastheadHeight : 0);
    const startPage = () => {
      page = newPage(TEXT_HEIGHT);
      pages.push(page);
      page.capacity = capacity();
      return page;
    };
    const remaining = () => page.capacity - page.used;

    assignments.forEach(assignment => {
      const stanzas = bookletStanzas(assignment)
        .map(stanza => layoutStanza(measure, stanza, { width, size }));
      if (!stanzas.length) return;
      let header = layoutHeader(measure, assignment, size, false);
      let block = null;
      const openBlock = () => {
        if (!page || remaining() < header.height + lineStep(size) * 2) startPage();
        const leading = page.blocks.length ? songGap : 0;
        block = {
          assignment, columns: 1, header, bodyColumns: [[]], gap, size,
          bodyHeight: 0, height: header.height, visualLines: 0,
        };
        page.blocks.push(block);
        page.items.push(header);
        page.used += leading + header.height;
        return block;
      };
      const push = stanza => {
        const column = block.bodyColumns[0];
        const leading = column.length ? gap : 0;
        column.push(stanza);
        block.bodyHeight += leading + stanza.height;
        block.height += leading + stanza.height;
        block.visualLines += stanza.visualLines;
        page.used += leading + stanza.height;
      };

      openBlock();
      let queue = stanzas.slice();
      while (queue.length) {
        const stanza = queue[0];
        const leading = block.bodyColumns[0].length ? gap : 0;
        if (leading + stanza.height <= remaining()) {
          push(stanza);
          queue = queue.slice(1);
          continue;
        }
        const parts = splitStanza(stanza, remaining() - leading);
        if (parts) {
          push(parts[0]);
          queue = [parts[1], ...queue.slice(1)];
        }
        if (!queue.length) break;
        startPage();
        header = layoutHeader(measure, assignment, size, true);
        openBlock();
      }
    });

    if (!pages.length) startPage();
    return { pages, contents: contentsOf(pages), fontSize: size, score: 0 };
  }

  function paginateLyrics(assignments, options = {}) {
    const measure = requireMeasure(options.measure);
    const masthead = options.masthead || layoutMasthead(measure);
    for (const size of FONT_CANDIDATES) {
      // Lyrics beneath the masthead are worth a page of capacity, but never worth
      // shrinking the type, so a masthead-only first page is tried at the same size
      // before moving down the font ladder.
      const candidate = chooseCandidate(measure, assignments, size, masthead)
        || chooseCandidate(measure, assignments, size, masthead, true);
      if (candidate) return candidate;
    }
    return fallbackPaginate(measure, assignments, masthead);
  }

  function layoutMasthead(measure, { celebration, meta, date } = {}) {
    requireMeasure(measure);
    const titleLines = wrapText(measure, celebration || "Sunday Mass", {
      font: "times", style: "bold", size: MASTHEAD.titleSize, width: TEXT_WIDTH,
    });
    const metaLines = wrapText(measure, meta || date || "", {
      font: "helvetica", style: "normal", size: MASTHEAD.metaSize, width: TEXT_WIDTH,
    });
    const height = lineStep(MASTHEAD.eyebrowSize, 1.25) + 1.4
      + titleLines.length * lineStep(MASTHEAD.titleSize, 1.08)
      + (metaLines.length ? 1.2 + metaLines.length * lineStep(MASTHEAD.metaSize, 1.3) : 0)
      + 2.4 + 3;
    return Object.freeze({ titleLines, metaLines, height });
  }

  function logicalPages({ date, celebration, meta, assignments, measure }) {
    requireMeasure(measure);
    const masthead = layoutMasthead(measure, { date, celebration, meta });
    const { pages: lyricPages } = paginateLyrics(assignments, { measure, masthead });
    const pages = (lyricPages.length ? lyricPages : [newPage(TEXT_HEIGHT)])
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

  // Mirrors layoutHeader exactly; the two must stay in step (spec §3).
  function paintHeader(doc, header, left, width, y) {
    y = writeLines(doc, [String(header.partLabel || "").toUpperCase()], left, y, {
      style: "bold", size: header.labelPt, color: COLORS.label,
      charSpace: 0.5 * MM_PER_POINT, lineHeight: 1.25,
    });
    y += 0.7;
    const titleTop = y;
    y = writeLines(doc, header.titleLines, left, y, {
      font: "times", style: "bold", size: header.titlePt,
      color: COLORS.heading, lineHeight: 1.06,
    });
    if (header.continued && header.titleLines.length) {
      doc.setFont("times", "bold");
      doc.setFontSize(header.titlePt);
      const lastTop = titleTop + (header.titleLines.length - 1) * lineStep(header.titlePt, 1.06);
      writeLines(doc, ["(continued)"],
        left + doc.getTextWidth(header.titleLines[header.titleLines.length - 1]) + 1.5,
        lastTop + lineStep(header.titlePt - 7, 1), { size: 7, color: COLORS.muted });
    }
    if (header.attributionLines.length) {
      y += 0.6;
      y = writeLines(doc, header.attributionLines, left, y, {
        size: header.attributionPt, color: COLORS.muted, lineHeight: 1.15,
      });
    }
    y += 1.2;
    doc.setDrawColor(COLORS.rule);
    doc.setLineWidth(1 * MM_PER_POINT);
    doc.line(left, y, left + width, y);
    return y + 1.7;
  }

  function paintLyricsPage(doc, page, x0) {
    const left = x0 + PAGE_PADDING.side;
    let blockTop = page.masthead
      ? paintMasthead(doc, page.masthead, left, TEXT_WIDTH, PAGE_PADDING.top)
      : PAGE_PADDING.top;

    (page.blocks || []).forEach((block, index) => {
      if (index) blockTop += SONG_GAP * lineStep(block.size);
      const contentTop = paintHeader(doc, block.header, left, TEXT_WIDTH, blockTop);
      const width = columnWidth(block.columns);
      const gutter = COLUMN_GUTTER[block.columns] || 0;
      let bottom = contentTop;
      block.bodyColumns.forEach((column, columnIndex) => {
        const columnLeft = left + columnIndex * (width + gutter);
        let y = contentTop;
        column.forEach((stanza, stanzaIndex) => {
          stanza.rows.forEach(row => {
            writeLines(doc, [row.text], columnLeft + row.indent, y, {
              font: row.font, style: row.style, size: row.size,
              color: row.color, lineHeight: LINE_HEIGHT,
            });
            y += row.step;
          });
          if (stanzaIndex < column.length - 1) y += block.gap;
        });
        bottom = Math.max(bottom, y);
      });
      blockTop = bottom;
    });

    writeLines(doc, [String(page.number)], x0 + SHEET.half / 2,
      SHEET.h - 5 - lineStep(7.5, 1.25), {
        size: 7.5, color: COLORS.footer, align: "center",
      });
  }

  function paintPage(doc, page, x0) {
    if (page.kind === "back-cover") return paintBackCover(doc, page, x0);
    if (page.kind === "blank") return undefined;
    return paintLyricsPage(doc, page, x0);
  }

  function buildPdf(JsPDF, options) {
    if (typeof JsPDF !== "function") throw new Error("PDF generator unavailable");
    const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const sheets = impose(logicalPages({ ...options, measure: measurer(doc) }));
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
    columnWidth,
    fileName,
    impose,
    layoutMasthead,
    linearPartition,
    logicalPages,
    measurer,
    paginateLyrics,
    textHeight: TEXT_HEIGHT,
    textWidth: TEXT_WIDTH,
  });
  global.LyricsBooklet = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
