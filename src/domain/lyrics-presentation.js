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
  const MAX_LINES = 4;
  const MAX_LINE_LENGTH = 45;

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
    const prefixLengths = [0];
    words.forEach(word => prefixLengths.push(prefixLengths.at(-1) + word.length));
    const segmentLength = (start, end) =>
      prefixLengths[end] - prefixLengths[start] + Math.max(0, end - start - 1);
    const totalLength = segmentLength(0, words.length);

    function bestForCount(lineCount) {
      const targetLength = totalLength / lineCount;
      const memo = new Map();

      function bestFrom(start, remaining) {
        const key = `${start}:${remaining}`;
        if (memo.has(key)) return memo.get(key);
        if (remaining === 1) {
          const length = segmentLength(start, words.length);
          if (start >= words.length || (length > maxLength && words.length - start > 1)) {
            memo.set(key, null);
            return null;
          }
          const result = {
            lines: [words.slice(start).join(" ")],
            score: ((length - targetLength) ** 2)
              + (words.length - start === 1 && words.length > lineCount ? 1000 : 0),
          };
          memo.set(key, result);
          return result;
        }

        let best = null;
        const latestEnd = words.length - remaining + 1;
        for (let end = start + 1; end <= latestEnd; end += 1) {
          const length = segmentLength(start, end);
          if (length > maxLength && end - start > 1) break;
          const rest = bestFrom(end, remaining - 1);
          if (!rest) continue;
          const lastWord = words[end - 1];
          const firstWord = words[start];
          const score = rest.score
            + ((length - targetLength) ** 2)
            + (end - start === 1 && words.length > lineCount ? 1000 : 0)
            + (start > 0 && /^(?:a|an|and|at|for|in|of|on|or|the|to|with)$/i.test(firstWord) ? 4 : 0)
            - (/[,:;.!?]$/.test(lastWord) ? 3 : 0);
          const candidate = {
            lines: [words.slice(start, end).join(" "), ...rest.lines],
            score,
          };
          if (!best || candidate.score < best.score) best = candidate;
        }
        memo.set(key, best);
        return best;
      }

      return bestFrom(0, lineCount);
    }

    for (let lineCount = 2; lineCount <= words.length; lineCount += 1) {
      const result = bestForCount(lineCount);
      if (result) return result.lines;
    }
    return [line];
  }

  function isProjectionLabel(value) {
    return /^(?:(?:refrain|response|chorus|bridge|verse(?:\s+\d+)?):|2x|x2|\(repeat\)|repeat)$/i
      .test(String(value || "").trim());
  }

  function boundaryPenalty(left, right, boundaryIndex, unitCount) {
    let penalty = 0;
    if (/[,;:]$/.test(left.raw) || /^[a-z]/.test(right.raw)) penalty += 100;
    if (!/[.!?]$/.test(left.raw)) penalty += 5;
    if (unitCount >= 6 && unitCount % 2 === 0 && boundaryIndex % 2 === 1) penalty += 30;
    return penalty;
  }

  function paginateUnits(units, maxLines) {
    const totalVisible = units.reduce((sum, unit) => sum + unit.lines.length, 0);
    const memo = new Map();

    function better(candidate, current) {
      if (!current || candidate.score !== current.score) {
        return !current || candidate.score < current.score;
      }
      const candidateSizes = candidate.pages.map(page => page.length);
      const currentSizes = current.pages.map(page => page.length);
      for (let index = 0; index < candidateSizes.length; index += 1) {
        if (candidateSizes[index] !== currentSizes[index]) {
          return candidateSizes[index] > currentSizes[index];
        }
      }
      return false;
    }

    function bestFrom(start) {
      if (start === units.length) return { pages: [], score: 0 };
      if (memo.has(start)) return memo.get(start);
      let best = null;
      let visible = 0;
      const lines = [];
      for (let end = start; end < units.length; end += 1) {
        visible += units[end].lines.length;
        if (visible > maxLines) break;
        lines.push(...units[end].lines);
        const rest = bestFrom(end + 1);
        if (!rest) continue;
        const pagePenalty = 10000
          + ((maxLines - visible) ** 2)
          + (visible === 1 && totalVisible > 1 ? 1000 : 0);
        const splitPenalty = end < units.length - 1
          ? boundaryPenalty(units[end], units[end + 1], end + 1, units.length)
          : 0;
        const candidate = {
          pages: [lines.slice(), ...rest.pages],
          score: pagePenalty + splitPenalty + rest.score,
        };
        if (better(candidate, best)) best = candidate;
      }
      memo.set(start, best);
      return best;
    }

    return bestFrom(0)?.pages || [];
  }

  function lyricSlides(value, { maxLines = MAX_LINES, maxLineLength = MAX_LINE_LENGTH } = {}) {
    const lyrics = normalizeLyrics(value);
    if (!lyrics) return [];
    const stanzas = lyrics.split(/\n{2,}/)
      .map(stanza => stanza.split("\n")
        .filter(line => !isProjectionLabel(line))
        .map(line => ({
          raw: line.trim(),
          lines: wrapLine(line, maxLineLength),
        }))
        .flatMap(unit => {
          if (unit.lines.length <= maxLines) return [unit];
          const chunks = [];
          for (let offset = 0; offset < unit.lines.length; offset += maxLines) {
            chunks.push({ raw: unit.raw, lines: unit.lines.slice(offset, offset + maxLines) });
          }
          return chunks;
        }))
      .filter(units => units.length);
    const slides = [];
    let pendingSlide = [];
    const flush = () => {
      if (pendingSlide.length) slides.push(pendingSlide.join("\n"));
      pendingSlide = [];
    };

    stanzas.forEach(units => {
      const pages = paginateUnits(units, maxLines);
      if (pages.length > 1) {
        flush();
        pages.forEach(page => slides.push(page.join("\n")));
        return;
      }

      const stanza = pages[0] || [];
      const visibleCount = pendingSlide.filter(Boolean).length;
      if (visibleCount + stanza.length > maxLines) flush();
      if (pendingSlide.length) pendingSlide.push("");
      pendingSlide.push(...stanza);
    });
    flush();
    return slides;
  }

  function congregationLyrics(partKey, value) {
    const lyrics = normalizeLyrics(value);
    if (partKey !== "psalm" || !lyrics) return lyrics;
    const firstStanza = lyrics.split(/\n{2,}/)[0];
    const lines = firstStanza.split("\n");
    const firstVerse = lines.findIndex((line, index) =>
      index > 0 && /^\s*(?:verse\s*)?1(?:[.):]|\s)/i.test(line),
    );
    return (firstVerse > 0 ? lines.slice(0, firstVerse) : lines).join("\n").trim();
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
        authors: detail.authors || selected.authors || "",
        copyrightOwner: detail.copyrightOwner || selected.copyrightOwner || "",
        copyrightYear: detail.copyrightYear || selected.copyrightYear || "",
        lyrics: congregationLyrics(part.key, detail.lyrics),
      }];
    });
  }

  function missingLyrics(assignments) {
    return assignments.filter(assignment => !assignment.lyrics);
  }

  function attributionLine(assignment) {
    const authors = String(assignment?.authors || "").trim();
    const owner = String(assignment?.copyrightOwner || "").trim();
    const year = String(assignment?.copyrightYear || "").trim();
    let copyright = "";
    if (/^public domain$/i.test(owner)) {
      copyright = "Public domain";
    } else if (owner || year) {
      copyright = `©${year ? ` ${year}` : ""}${owner ? ` ${owner.replace(/^©\s*/, "")}` : ""}`;
    }
    return [authors, copyright].filter(Boolean).join(" · ");
  }

  function lyricFontSize(text) {
    const lines = String(text || "").split("\n");
    const visibleLines = lines.filter(Boolean);
    const longest = visibleLines.reduce((max, line) => Math.max(max, line.length), 0);
    if (visibleLines.length >= 4 || longest > 38) return 40;
    if (visibleLines.length === 3 || longest > 34) return 44;
    if (visibleLines.length === 2 || longest > 30) return 48;
    return 52;
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
      const attribution = attributionLine(assignment);
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
          x: 0.7, y: 1.45, w: 11.85, h: 5.2,
          fontFace: "Aptos", fontSize: lyricFontSize(chunk), bold: true,
          color: COLOURS.text, margin: 0,
          breakLine: false, align: "center", valign: "mid", fit: "shrink",
          paraSpaceAfterPt: 0, lineSpacingMultiple: 1.08,
        });
        if (attribution) {
          slide.addText(attribution, {
            x: 0.7, y: 6.88, w: 10.35, h: 0.22,
            fontFace: "Aptos", fontSize: 9,
            color: COLOURS.muted, margin: 0,
            breakLine: false, fit: "shrink",
          });
        }
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

  const escapeHtml = value => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  function renderSlideLines(chunk) {
    return chunk.split("\n").map(line => `<div>${escapeHtml(line) || "&nbsp;"}</div>`).join("");
  }

  function renderCoverSlide({ date, celebration, meta }) {
    return `<article class="pdf-slide pdf-slide-cover">`
      + `<div class="pdf-slide-bar"></div>`
      + `<div class="pdf-slide-kicker">ST JAMES THE APOSTLE · 6PM MASS</div>`
      + `<h1 class="pdf-slide-cover-title">${escapeHtml(celebration || "Sunday Mass")}</h1>`
      + `<div class="pdf-slide-rule"></div>`
      + `<p class="pdf-slide-cover-meta">${escapeHtml(meta || date || "")}</p>`
      + `</article>`;
  }

  function renderLyricSlide({ assignment, chunk, index, total, attribution }) {
    return `<article class="pdf-slide pdf-slide-lyrics">`
      + `<div class="pdf-slide-bar"></div>`
      + `<div class="pdf-slide-label">${escapeHtml(assignment.partLabel.toUpperCase())}</div>`
      + `<div class="pdf-slide-song-title">${escapeHtml(assignment.title)}</div>`
      + `<div class="pdf-slide-lyric" style="font-size:${lyricFontSize(chunk)}pt">`
      + `${renderSlideLines(chunk)}</div>`
      + (attribution ? `<div class="pdf-slide-attribution">${escapeHtml(attribution)}</div>` : "")
      + `<div class="pdf-slide-counter">${index + 1} / ${total}</div>`
      + `</article>`;
  }

  function renderSlides({ date, celebration, meta, assignments }) {
    const slides = [renderCoverSlide({ date, celebration, meta })];
    assignments.forEach(assignment => {
      const chunks = lyricSlides(assignment.lyrics);
      const attribution = attributionLine(assignment);
      chunks.forEach((chunk, index) => {
        slides.push(renderLyricSlide({ assignment, chunk, index, total: chunks.length, attribution }));
      });
    });
    return `<section class="pdf-slides" data-slide-count="${slides.length}">${slides.join("")}</section>`;
  }

  const api = Object.freeze({
    attributionLine,
    buildDeck,
    congregationLyrics,
    escapeHtml,
    fileName,
    lyricSlides,
    missingLyrics,
    normalizeLyrics,
    renderSlides,
    selectedAssignments,
    wrapLine,
  });
  global.LyricsPresentation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
