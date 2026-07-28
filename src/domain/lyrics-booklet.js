// Builds an imposed A5 lyrics booklet for duplex printing on landscape A4 paper.
(function (global) {
  "use strict";

  const BOOKLET_PAGES = 8;
  const PAGE_CAPACITY = 48;
  const LINE_LENGTH = 68;
  const LABEL_PATTERN = /^(?:refrain|response|chorus|bridge|verse(?:\s+\d+)?|coda|repeat)(?::|\b)/i;

  const escapeHtml = value => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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

  function renderPage(page) {
    const footer = page.kind === "blank" || page.kind === "cover" || page.kind === "back-cover"
      ? ""
      : `<footer>${page.number}</footer>`;
    if (page.kind === "cover") {
      return `<article class="booklet-page booklet-cover">`
        + `<div class="booklet-kicker">St James the Apostle · 6pm Mass</div>`
        + `<h1>${escapeHtml(page.celebration || "Sunday Mass")}</h1>`
        + `<div class="booklet-rule"></div>`
        + `<p>${escapeHtml(page.meta || page.date || "")}</p>`
        + `<strong>Congregational song booklet</strong></article>`;
    }
    if (page.kind === "contents") {
      return `<article class="booklet-page booklet-contents"><h1>Music for the Mass</h1>`
        + `<div class="booklet-contents-list">${page.entries.map(entry =>
          `<div><span><small>${escapeHtml(entry.partLabel)}</small>`
          + `${escapeHtml(entry.title)}</span><strong>${entry.page}</strong></div>`,
        ).join("")}</div>${footer}</article>`;
    }
    if (page.kind === "back-cover") {
      return `<article class="booklet-page booklet-back-cover">`
        + `<div>St James the Apostle · 6pm Mass</div>`
        + `<p>${escapeHtml(page.date || "")}</p></article>`;
    }
    if (page.kind === "blank") return `<article class="booklet-page booklet-blank"></article>`;

    const items = page.items.map(item => {
      if (item.type === "song-header") {
        return `<section class="booklet-song-head${item.continued ? " is-continuation" : ""}">`
          + `<p>${escapeHtml(item.partLabel)}</p>`
          + `<h2>${escapeHtml(item.title)}${item.continued ? " <small>(continued)</small>" : ""}</h2>`
          + `${item.attribution ? `<div>${escapeHtml(item.attribution)}</div>` : ""}</section>`;
      }
      return `<div class="booklet-stanza">${item.units.map(unit =>
        unit.lines.map((line, index) =>
          `<div class="booklet-line${unit.label ? " is-label" : ""}`
          + `${index ? " is-wrap" : ""}">${escapeHtml(line)}</div>`,
        ).join(""),
      ).join("")}</div>`;
    }).join("");
    return `<article class="booklet-page booklet-lyrics-page">${items}${footer}</article>`;
  }

  function renderBooklet(options) {
    const pages = logicalPages(options);
    return `<section class="print-booklet" data-logical-pages="${pages.length}">`
      + impose(pages).map((sheet, index) =>
        `<section class="booklet-sheet" data-sheet="${Math.floor(index / 2) + 1}" data-side="${sheet.side}">`
        + `<div class="booklet-fold-mark booklet-fold-top"></div>`
        + `<div class="booklet-half booklet-left">${renderPage(sheet.left)}</div>`
        + `<div class="booklet-half booklet-right">${renderPage(sheet.right)}</div>`
        + `<div class="booklet-fold-mark booklet-fold-bottom"></div></section>`,
      ).join("")
      + `</section>`;
  }

  const api = Object.freeze({
    bookletLyrics,
    impose,
    logicalPages,
    paginateLyrics,
    renderBooklet,
  });
  global.LyricsBooklet = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
