const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/domain/weekly-lyrics.js");
require("../src/domain/lyrics-presentation.js");
const LyricsBooklet = require("../src/domain/lyrics-booklet.js");

// The PDF engine is only needed for the tests that inspect a serialized document;
// layout is exercised through the injected measurer (docs/booklet-layout.md §3).
let jsPDF = null;
try { ({ jsPDF } = require("jspdf")); } catch { jsPDF = null; }
const needsPdf = { skip: jsPDF ? false : "jspdf is not installed" };

const MM_PER_POINT = 25.4 / 72;
const PRINTABLE_BOTTOM = 199;

// Times-Roman advance widths, so the stub wraps text where a real document would.
const GLYPH = {
  " ": 250, a: 444, b: 500, c: 444, d: 500, e: 444, f: 333, g: 500, h: 500, i: 278,
  j: 278, k: 500, l: 278, m: 778, n: 500, o: 500, p: 500, q: 500, r: 333, s: 389,
  t: 278, u: 500, v: 500, w: 722, x: 500, y: 500, z: 444, A: 722, B: 667, C: 667,
  D: 722, E: 611, F: 556, G: 722, H: 722, I: 333, J: 389, K: 722, L: 611, M: 889,
  N: 722, O: 722, P: 556, Q: 722, R: 667, S: 556, T: 611, U: 722, V: 722, W: 944,
  X: 722, Y: 722, Z: 611, ",": 250, ".": 250, "'": 333, "!": 333, "?": 444,
  ";": 278, ":": 278, "-": 333,
};

function stubDocument(marks) {
  let size = 10;
  let sheet = 0;
  return {
    setProperties() {}, setFont() {}, setTextColor() {}, setDrawColor() {},
    setLineWidth() {},
    setFontSize(value) { size = value; },
    addPage() { sheet += 1; },
    text(value, x, y) { marks?.push({ sheet, x, y, size, value: String(value) }); },
    line() {},
    getNumberOfPages() { return sheet + 1; },
    getTextWidth(value) {
      return [...String(value)].reduce((sum, glyph) => sum + (GLYPH[glyph] ?? 500), 0)
        / 1000 * size * MM_PER_POINT;
    },
  };
}

const stubMeasure = () => LyricsBooklet.measurer(stubDocument());
const stubPdf = marks => {
  const doc = stubDocument(marks);
  return function StubPdf() { return doc; };
};

function assignment(overrides = {}) {
  return {
    partLabel: "Entrance",
    title: "Table & Plenty",
    authors: "Test Author",
    copyrightOwner: "Test Publisher",
    copyrightYear: "2026",
    lyrics: "Refrain:\nCome to the feast\nprepared for all\n\nVerse 1\nA line of lyric\nAnother line",
    ...overrides,
  };
}

function verses({ count, lines, text }) {
  return Array.from({ length: count }, (_, verse) => `Verse ${verse + 1}:\n`
    + Array.from({ length: lines }, (_, line) => text(verse, line)).join("\n")).join("\n\n");
}

function pages(overrides = {}) {
  return LyricsBooklet.logicalPages({
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday · Year A",
    assignments: [assignment()],
    measure: stubMeasure(),
    ...overrides,
  });
}

const allBlocks = result => result.pages.flatMap(page => page.blocks || []);

function pdfSource(doc) {
  return Buffer.from(doc.output("arraybuffer")).toString("latin1");
}

test("logical booklet pages are fixed to an eight-page, two-sheet signature", () => {
  const result = pages();

  assert.equal(result[0].kind, "lyrics");
  assert.equal(result.some(page => page.kind === "contents"), false);
  assert.equal(result.at(-1).kind, "back-cover");
  assert.equal(result.length, 8);
  assert.deepEqual(result.map(page => page.number), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("the masthead sits on page one only, above that page's lyrics", () => {
  const result = pages();

  assert.deepEqual(result[0].masthead.titleLines, ["18th Sunday in Ordinary Time"]);
  assert.deepEqual(result[0].masthead.metaLines, ["Sunday · Year A"]);
  assert.ok(result[0].masthead.height < 30, "the masthead must stay compact");
  assert.equal(result[0].blocks.length, 1);
  assert.equal(result.slice(1).some(page => page.masthead), false);
});

test("a mastheaded page one still leaves room for eight pages of lyrics", () => {
  const assignments = Array.from({ length: 8 }, (__, index) => assignment({
    partLabel: `Part ${index + 1}`,
    title: `Song ${index + 1}`,
  }));
  const result = pages({ celebration: "Sunday Mass", assignments });

  assert.deepEqual(result.map(page => page.kind), Array(8).fill("lyrics"));
  assert.deepEqual(
    result.flatMap(page => page.blocks.map(block => block.assignment.title)),
    assignments.map(item => item.title),
  );
});

test("the booklet never grows beyond two sheets", () => {
  const result = pages({
    celebration: "Sunday Mass",
    assignments: [
      assignment({
        lyrics: Array.from({ length: 28 }, (_, index) => `Lyric line ${index + 1}`).join("\n"),
      }),
      assignment({ partLabel: "Communion", title: "Second Song" }),
    ],
  });

  assert.equal(result.length, 8);
  assert.equal(LyricsBooklet.impose(result).length, 4);
});

test("four-page imposition places back and front covers on the outer sheet", () => {
  const sheets = LyricsBooklet.impose([1, 2, 3, 4].map(number => ({ number })));

  assert.deepEqual(
    sheets.map(sheet => [sheet.side, sheet.left.number, sheet.right.number]),
    [["front", 4, 1], ["back", 2, 3]],
  );
});

test("eight-page imposition orders both duplex sheets for folding", () => {
  const sheets = LyricsBooklet.impose(
    Array.from({ length: 8 }, (_, index) => ({ number: index + 1 })),
  );

  assert.deepEqual(
    sheets.map(sheet => [sheet.side, sheet.left.number, sheet.right.number]),
    [["front", 8, 1], ["back", 2, 7], ["front", 6, 3], ["back", 4, 5]],
  );
});

test("the booklet PDF file name derives from the selected date", () => {
  assert.equal(LyricsBooklet.fileName("2026-08-02"), "st-james-booklet-2026-08-02.pdf");
  assert.equal(LyricsBooklet.fileName(""), "st-james-booklet-mass.pdf");
});

test("layout refuses to run without a measurer", () => {
  assert.throws(() => LyricsBooklet.paginateLyrics([assignment()]), /measurer/);
  assert.throws(() => LyricsBooklet.logicalPages({ assignments: [assignment()] }), /measurer/);
});

// Spec §4.3 — the property this module exists to guarantee.
test("stanzas are never divided between columns", () => {
  const song = assignment({
    title: "Uneven Hymn",
    // 5/3/6/4/5 lines: the balanced division falls inside the third verse.
    lyrics: [[1, 5], [2, 3], [3, 6], [4, 4], [5, 5]]
      .map(([verse, lines]) => `Verse ${verse}:\n` + Array.from(
        { length: lines }, (_, line) => `Line ${line + 1} of verse ${verse} here now`,
      ).join("\n")).join("\n\n"),
  });
  const result = LyricsBooklet.paginateLyrics(
    [song, assignment({ title: "Filler A" }), assignment({ title: "Filler B" })],
    { measure: stubMeasure() },
  );

  const divided = allBlocks(result).find(block => block.columns > 1);
  assert.ok(divided, "the long song should be set in more than one column");
  divided.bodyColumns.forEach(column => column.forEach(stanza => {
    const verses = new Set(stanza.rows
      .map(row => /verse (\d+)/.exec(row.text)?.[1])
      .filter(Boolean));
    assert.ok(verses.size <= 1, `a column holds part of verses ${[...verses].join(" and ")}`);
  }));
});

test("no column ends with a label and every column receives content", () => {
  const assignments = Array.from({ length: 3 }, (_, index) => assignment({
    partLabel: `Part ${index + 1}`,
    title: `Litany ${index + 1}`,
    lyrics: verses({ count: 18, lines: 3, text: (verse, line) => `Kyrie ${verse}${line}` }),
  }));
  const result = LyricsBooklet.paginateLyrics(assignments, { measure: stubMeasure() });

  allBlocks(result).forEach(block => {
    assert.ok(block.columns <= 3);
    block.bodyColumns.forEach(column => {
      assert.ok(column.length > 0, "every column must receive content");
      assert.equal(column.at(-1).endsWithLabel, false, "a column must not end with a label");
    });
  });
});

test("column count is bounded by the pieces there are to fill columns with", () => {
  const twoStanzas = assignment({
    title: "Two Stanzas",
    lyrics: verses({ count: 2, lines: 12, text: (verse, line) => `Kyrie ${verse}${line}` }),
  });
  const result = LyricsBooklet.paginateLyrics([twoStanzas], { measure: stubMeasure() });

  allBlocks(result).forEach(block => {
    assert.ok(block.columns <= 2, "two stanzas cannot fill three columns");
    block.bodyColumns.forEach(column => assert.ok(column.length > 0));
  });
});

// Spec §4.3 — the one case where a stanza may be divided.
test("a stanza taller than any column is divided, and only that stanza", () => {
  const giant = assignment({
    title: "Giant Stanza",
    lyrics: Array.from({ length: 60 }, (_, line) => `Kyrie eleison line ${line + 1}`).join("\n"),
  });
  const result = LyricsBooklet.paginateLyrics([giant], { measure: stubMeasure() });
  const block = allBlocks(result)[0];

  assert.ok(block.columns > 1, "the divided stanza spreads across columns");
  assert.ok(result.fontSize >= 12,
    `dividing it should keep large type, not fall back to 8.5pt (got ${result.fontSize})`);
  assert.equal(
    result.pages.flatMap(page => page.items).some(item => item.continued),
    false,
    "it should fit one page rather than continuing onto the next",
  );

  // The pieces stay in order across the columns, so the song still reads through.
  const numbers = block.bodyColumns.flat()
    .flatMap(piece => piece.rows.map(row => Number(/line (\d+)/.exec(row.text)[1])));
  assert.deepEqual(numbers, Array.from({ length: 60 }, (_, index) => index + 1));
});

test("a stanza that fits its column is never divided to balance the columns", () => {
  const uneven = assignment({
    title: "Uneven",
    lyrics: verses({ count: 5, lines: 7, text: (verse, line) => `Kyrie ${verse} line ${line}` }),
  });
  const result = LyricsBooklet.paginateLyrics([uneven], { measure: stubMeasure() });

  allBlocks(result).forEach(block => block.bodyColumns.forEach(column =>
    column.forEach(stanza => {
      const labels = stanza.rows.filter(row => /^Verse/.test(row.text));
      assert.ok(labels.length <= 1, "a piece never spans two stanzas");
      assert.equal(stanza.rows.length, 8, "every stanza keeps its label and seven lines");
    })));
});

// Spec §4.3 — the exact partition, checked against brute force.
test("column division minimises the tallest column", () => {
  const cases = [
    [[5, 5, 5, 1], 3], [[10, 1, 1, 1, 1], 3], [[4, 4, 3, 3], 3],
    [[5, 3, 6, 4, 5], 2], [[1, 2, 3, 4, 5, 6], 2], [[7], 1], [[2, 9, 2, 9], 2],
  ];
  cases.forEach(([costs, parts]) => {
    const groups = LyricsBooklet.linearPartition(costs, parts);
    const tallest = Math.max(...groups.map(([from, to]) =>
      costs.slice(from, to).reduce((sum, cost) => sum + cost, 0)));

    let bestPossible = Infinity;
    const walk = (index, part, current, worst) => {
      if (part === parts) {
        const last = costs.slice(index).reduce((sum, cost) => sum + cost, 0);
        if (index < costs.length) bestPossible = Math.min(bestPossible, Math.max(worst, last));
        return;
      }
      for (let end = index + 1; end < costs.length; end += 1) {
        const sum = costs.slice(index, end).reduce((total, cost) => total + cost, 0);
        walk(end, part + 1, current, Math.max(worst, sum));
      }
    };
    walk(0, 1, [], 0);

    assert.equal(tallest, bestPossible, `costs ${costs} into ${parts}`);
    assert.equal(groups.length, parts);
    groups.forEach(([from, to]) => assert.ok(to > from, "every group is non-empty"));
  });
});

// Spec §5 — wrapping is priced, never forbidden.
test("a line too long for the full page width is wrapped rather than rejected", () => {
  const monster = assignment({
    title: "Monster Line",
    lyrics: `Verse 1:\n${"word ".repeat(60).trim()}\nA short line\n\nVerse 2:\nShort\nLines here`,
  });
  const result = LyricsBooklet.paginateLyrics([monster], { measure: stubMeasure() });
  const block = allBlocks(result)[0];

  assert.ok(block, "the song is laid out");
  const longest = block.bodyColumns.flat()[0];
  assert.ok(longest.rows.length > 2, "the over-long line wraps onto several visual lines");
  assert.ok(block.visualLines > 4);
});

// Spec §4.2 — short-lined songs reach for extra columns, long-lined ones do not.
test("column count follows line length rather than song length", () => {
  const measure = stubMeasure();
  const shortLined = LyricsBooklet.paginateLyrics([assignment({
    title: "Short Lined",
    lyrics: verses({ count: 10, lines: 4, text: (verse, line) => `Lord have mercy ${verse}${line}` }),
  })], { measure });
  const longLined = LyricsBooklet.paginateLyrics([assignment({
    title: "Long Lined",
    lyrics: verses({
      count: 10,
      lines: 4,
      text: (verse, line) => `Praise to the Lord the Almighty the King of all creation ${verse}${line}`,
    }),
  })], { measure });

  assert.ok(allBlocks(shortLined)[0].columns >= 2, "short lines can afford a second column");
  assert.equal(shortLined.fontSize, 14, "short lines keep the largest type");
  assert.ok(longLined.fontSize < shortLined.fontSize,
    "long lines buy height by shrinking rather than by wrapping");
});

test("short songs remain single-column", () => {
  const result = LyricsBooklet.paginateLyrics([assignment()], { measure: stubMeasure() });

  assert.equal(result.pages[0].blocks[0].columns, 1);
});

// Spec §1 — capacity comes from the geometry, not a constant.
test("a page uses the full printable height rather than a fixed line budget", () => {
  const result = LyricsBooklet.paginateLyrics([assignment({
    title: "Huge",
    lyrics: verses({
      count: 30,
      lines: 4,
      text: (verse, line) => `An extremely long congregational lyric line ${line + 1} of ${verse + 1}`,
    }),
  })], { measure: stubMeasure() });

  assert.equal(LyricsBooklet.textHeight, 189);
  // The retired budget of 48 lines at 8.5 pt reached only 165.5mm of the 189mm
  // available, so a filled page proves capacity now comes from the geometry.
  const deepest = Math.max(...result.pages.map(page => page.used));
  assert.ok(deepest > 165.5, `only ${deepest.toFixed(1)}mm of the page was used`);
  result.pages.forEach(page => assert.ok(page.used <= page.capacity + 0.001));
});

test("column widths follow the specified gutters", () => {
  assert.equal(LyricsBooklet.textWidth, 128.5);
  assert.equal(LyricsBooklet.columnWidth(1), 128.5);
  assert.equal(LyricsBooklet.columnWidth(2), 60.75);
  assert.equal(LyricsBooklet.columnWidth(3), 39.5);
});

test("long lyrics continue on later logical pages without overflowing capacity", () => {
  const result = LyricsBooklet.paginateLyrics([assignment({
    lyrics: verses({
      count: 24,
      lines: 4,
      text: (verse, line) => `This is authored lyric line ${line + 1} of verse ${verse + 1}`,
    }),
  })], { measure: stubMeasure() });

  assert.ok(result.pages.length >= 3);
  result.pages.forEach(page => assert.ok(page.used <= page.capacity + 0.001));
  assert.equal(
    result.pages.flatMap(page => page.items).filter(item => item.continued).length,
    result.pages.length - 1,
  );
});

test("candidate scoring keeps fourteen varied songs whole across every lyric page", () => {
  const assignments = Array.from({ length: 14 }, (_, index) => assignment({
    partLabel: `Part ${index + 1}`,
    title: `Song ${index + 1}`,
    authors: "",
    copyrightOwner: "",
    copyrightYear: "",
    lyrics: index === 4
      ? verses({ count: 8, lines: 4, text: (verse, line) => `Unique song 5 line ${verse}${line}` })
      : `Refrain:\nUnique song ${index + 1} refrain\n\nVerse 1\nUnique song ${index + 1} verse`,
  }));
  const result = LyricsBooklet.paginateLyrics(assignments, { measure: stubMeasure() });

  assert.equal(result.pages.length, 8);
  assert.ok(result.fontSize > 8.5);
  assert.ok(result.pages.every(page => page.blocks.length > 0));
  result.pages.forEach(page => assert.ok(page.used <= page.capacity + 0.001));
  assert.deepEqual(
    allBlocks(result).map(block => block.assignment.title),
    assignments.map(item => item.title),
  );
  assert.equal(result.pages.flatMap(page => page.items).some(item => item.continued), false);
});

test("an oversized song continues across pages under a continued header", () => {
  const assignments = Array.from({ length: 6 }, (_, index) => assignment({
    partLabel: `Part ${index + 1}`,
    title: `Song ${index + 1}`,
    lyrics: index === 2
      ? verses({
        count: 40,
        lines: 4,
        text: (verse, line) => `Oversized lyric line ${line + 1} of verse ${verse + 1} for the assembly`,
      })
      : `Refrain:\nShort refrain ${index + 1}\n\nVerse 1\nShort verse ${index + 1}`,
  }));
  const result = LyricsBooklet.paginateLyrics(assignments, { measure: stubMeasure() });

  assert.ok(result.pages.flatMap(page => page.items).some(item => item.continued));
  result.pages.forEach(page => assert.ok(page.used <= page.capacity + 0.001));
  allBlocks(result).forEach(block => block.bodyColumns.forEach(column =>
    assert.ok(column.length > 0)));
});

// Spec §3 — the height layout reserves is the height the painter consumes.
test("painted content never runs past the reservation or the printable area", () => {
  const shapes = {
    mixed: Array.from({ length: 8 }, (_, index) => assignment({
      partLabel: `Part ${index + 1}`,
      title: `Song ${index + 1}`,
      lyrics: verses({
        count: (index % 3) + 2,
        lines: 4,
        text: (verse, line) => `Song ${index + 1} verse ${verse + 1} lyric line ${line + 1}`,
      }),
    })),
    huge: [assignment({
      title: "Huge",
      lyrics: verses({
        count: 30,
        lines: 4,
        text: (verse, line) => `An extremely long congregational lyric line ${line + 1} of ${verse + 1}`,
      }),
    })],
    tiny: Array.from({ length: 3 }, (_, index) => assignment({
      partLabel: `Part ${index + 1}`,
      title: `Ostinato ${index + 1}`,
      lyrics: verses({ count: 18, lines: 3, text: (verse, line) => `Kyrie ${verse}${line}` }),
    })),
  };
  // Imposition order: sheet 0 carries pages 8 and 1, sheet 1 pages 2 and 7, and so on.
  const slots = {
    "0:left": 8, "0:right": 1, "1:left": 2, "1:right": 7,
    "2:left": 6, "2:right": 3, "3:left": 4, "3:right": 5,
  };

  Object.entries(shapes).forEach(([name, assignments]) => {
    const options = {
      date: "2026-08-02",
      celebration: "18th Sunday in Ordinary Time",
      meta: "Sunday · Year A",
      assignments,
    };
    const marks = [];
    LyricsBooklet.buildPdf(stubPdf(marks), options);
    const logical = LyricsBooklet.logicalPages({ ...options, measure: stubMeasure() });

    const painted = new Map();
    marks.forEach(mark => {
      if (!mark.value || /^\d+$/.test(mark.value)) return;
      const slot = slots[`${mark.sheet}:${mark.x >= 148.5 ? "right" : "left"}`];
      const bottom = mark.y + mark.size * 1.15 * MM_PER_POINT;
      painted.set(slot, Math.max(painted.get(slot) || 0, bottom));
    });

    logical.filter(page => page.kind === "lyrics").forEach(page => {
      const reserved = 10 + (page.masthead ? page.masthead.height : 0) + page.used;
      const drawn = painted.get(page.number) || 0;
      assert.ok(drawn <= reserved + 0.01,
        `${name} page ${page.number}: painted ${drawn.toFixed(2)} > reserved ${reserved.toFixed(2)}`);
      assert.ok(drawn <= PRINTABLE_BOTTOM,
        `${name} page ${page.number}: painted ${drawn.toFixed(2)} past ${PRINTABLE_BOTTOM}`);
    });
  });
});

test("the booklet PDF has one A4 landscape page per imposed sheet with every lyric", needsPdf, () => {
  const doc = LyricsBooklet.buildPdf(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday < Ordinary Time",
    meta: "Sunday · Year A",
    assignments: [assignment()],
  });

  assert.equal(doc.getNumberOfPages(), 4);
  const source = pdfSource(doc);
  const boxes = [...source.matchAll(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
  assert.equal(boxes.length, 4);
  boxes.forEach(([, width, height]) => {
    assert.ok(Math.abs(Number(width) - 841.89) < 1, `unexpected sheet width ${width}`);
    assert.ok(Math.abs(Number(height) - 595.28) < 1, `unexpected sheet height ${height}`);
  });
  [
    "18th Sunday < Ordinary Time",
    "Table & Plenty",
    "Test Author · © 2026 Test Publisher",
    "Come to the feast",
    "Refrain:",
    "ST JAMES THE APOSTLE",
  ].forEach(text => assert.ok(source.includes(text), `PDF should contain "${text}"`));
});

test("the booklet PDF labels the Psalm response and included cantor verses", needsPdf, () => {
  const lyrics = "Response:\nThe Hand of the Lord feeds us;\nhe answers all our needs.\n\n"
    + "Verse 1\nThe LORD is gracious and merciful,\nslow to anger.";
  const psalm = assignment({
    partKey: "psalm",
    partLabel: "Psalm",
    title: "The Hand of the Lord",
    lyrics,
    lyricBlocks: global.WeeklyLyrics.lyricBlocks("psalm", lyrics),
  });
  const source = pdfSource(LyricsBooklet.buildPdf(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday · Year C",
    assignments: [psalm],
  }));

  assert.ok(source.includes("The Hand of the Lord feeds us;"));
  assert.ok(source.includes("The LORD is gracious and merciful"));
  assert.ok(source.includes("ALL: RESPONSE"));
  assert.ok(source.includes("CANTOR: VERSE 1"));
  assert.ok(!source.includes("Response:"));
  assert.ok(!source.includes("Verse 1"));
});

test("the booklet PDF is strictly monochrome to save colour ink", needsPdf, () => {
  const doc = LyricsBooklet.buildPdf(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday · Year A",
    assignments: [assignment()],
  });
  // jsPDF only emits the RGB operators (rg/RG) when a colour has unequal
  // channels; greyscale values collapse to the g/G operators.
  const colourOps = pdfSource(doc).match(/[\d.]+ [\d.]+ [\d.]+ (rg|RG)/g) || [];
  assert.deepEqual(colourOps, []);
});

test("the selected candidate uses its larger lyric font in the PDF", needsPdf, () => {
  const doc = LyricsBooklet.buildPdf(jsPDF, {
    date: "2026-08-02",
    celebration: "Sunday Mass",
    meta: "Sunday · Year A",
    assignments: [assignment()],
  });

  assert.match(pdfSource(doc), /14 Tf/);
});
