const test = require("node:test");
const assert = require("node:assert/strict");
const { jsPDF } = require("jspdf");

require("../src/domain/weekly-lyrics.js");
require("../src/domain/lyrics-presentation.js");
const LyricsBooklet = require("../src/domain/lyrics-booklet.js");

// jsPDF writes uncompressed content streams, so the serialized document can be
// searched for the latin1 text drawn on its pages.
function pdfSource(doc) {
  return Buffer.from(doc.output("arraybuffer")).toString("latin1");
}

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

test("logical booklet pages are fixed to an eight-page, two-sheet signature", () => {
  const pages = LyricsBooklet.logicalPages({
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday · Year A",
    assignments: [assignment()],
  });

  assert.equal(pages[0].kind, "lyrics");
  assert.equal(pages.some(page => page.kind === "contents"), false);
  assert.equal(pages.at(-1).kind, "back-cover");
  assert.equal(pages.length, 8);
  assert.deepEqual(pages.map(page => page.number), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("the masthead sits on page one only, above that page's lyrics", () => {
  const pages = LyricsBooklet.logicalPages({
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday · Year A",
    assignments: [assignment()],
  });

  assert.deepEqual(pages[0].masthead.titleLines, ["18th Sunday in Ordinary Time"]);
  assert.deepEqual(pages[0].masthead.metaLines, ["Sunday · Year A"]);
  assert.ok(pages[0].masthead.height < 30, "the masthead must stay compact");
  assert.equal(pages[0].blocks.length, 1);
  assert.equal(pages.slice(1).some(page => page.masthead), false);
});

test("a mastheaded page one still leaves room for eight pages of lyrics", () => {
  const assignments = Array.from({ length: 8 }, (__, index) => assignment({
    partLabel: `Part ${index + 1}`,
    title: `Song ${index + 1}`,
  }));
  const pages = LyricsBooklet.logicalPages({
    date: "2026-08-02",
    celebration: "Sunday Mass",
    meta: "Sunday · Year A",
    assignments,
  });

  assert.deepEqual(pages.map(page => page.kind), Array(8).fill("lyrics"));
  assert.deepEqual(
    pages.flatMap(page => page.blocks.map(block => block.assignment.title)),
    assignments.map(item => item.title),
  );
});

test("the booklet never grows beyond two sheets", () => {
  const pages = LyricsBooklet.logicalPages({
    date: "2026-08-02",
    celebration: "Sunday Mass",
    meta: "Sunday · Year A",
    assignments: [
      assignment({
        lyrics: Array.from({ length: 28 }, (_, index) => `Lyric line ${index + 1}`).join("\n"),
      }),
      assignment({ partLabel: "Communion", title: "Second Song" }),
    ],
  });

  assert.equal(pages.length, 8);
  assert.equal(LyricsBooklet.impose(pages).length, 4);
});

test("four-page imposition places back and front covers on the outer sheet", () => {
  const pages = [1, 2, 3, 4].map(number => ({ number }));
  const sheets = LyricsBooklet.impose(pages);

  assert.deepEqual(
    sheets.map(sheet => [sheet.side, sheet.left.number, sheet.right.number]),
    [["front", 4, 1], ["back", 2, 3]],
  );
});

test("eight-page imposition orders both duplex sheets for folding", () => {
  const pages = Array.from({ length: 8 }, (_, index) => ({ number: index + 1 }));
  const sheets = LyricsBooklet.impose(pages);

  assert.deepEqual(
    sheets.map(sheet => [sheet.side, sheet.left.number, sheet.right.number]),
    [
      ["front", 8, 1],
      ["back", 2, 7],
      ["front", 6, 3],
      ["back", 4, 5],
    ],
  );
});

test("the booklet PDF has one A4 landscape page per imposed sheet with every lyric", () => {
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

test("the booklet PDF labels the Psalm response and included cantor verses", () => {
  const lyrics = "Response:\nThe Hand of the Lord feeds us;\nhe answers all our needs.\n\n"
    + "Verse 1\nThe LORD is gracious and merciful,\nslow to anger.";
  const psalm = assignment({
    partKey: "psalm",
    partLabel: "Psalm",
    title: "The Hand of the Lord",
    lyrics,
    lyricBlocks: global.WeeklyLyrics.lyricBlocks("psalm", lyrics),
  });
  const doc = LyricsBooklet.buildPdf(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday · Year C",
    assignments: [psalm],
  });

  const source = pdfSource(doc);
  assert.ok(source.includes("The Hand of the Lord feeds us;"));
  assert.ok(source.includes("The LORD is gracious and merciful"));
  assert.ok(source.includes("ALL: RESPONSE"));
  assert.ok(source.includes("CANTOR: VERSE 1"));
  assert.ok(!source.includes("Response:"));
  assert.ok(!source.includes("Verse 1"));
});

test("the booklet PDF is strictly monochrome to save colour ink", () => {
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

test("the booklet PDF file name derives from the selected date", () => {
  assert.equal(LyricsBooklet.fileName("2026-08-02"), "st-james-booklet-2026-08-02.pdf");
  assert.equal(LyricsBooklet.fileName(""), "st-james-booklet-mass.pdf");
});

test("long lyrics continue on later logical pages without overflowing capacity", () => {
  const lyrics = Array.from({ length: 90 }, (_, index) =>
    `This is authored lyric line number ${index + 1} for the congregation`,
  ).join("\n");
  const result = LyricsBooklet.paginateLyrics([assignment({ lyrics })]);

  assert.ok(result.pages.length >= 3);
  result.pages.forEach(page => assert.ok(page.used <= 48));
  assert.equal(
    result.pages.flatMap(page => page.items)
      .filter(item => item.type === "song-header" && item.continued).length,
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
      ? Array.from(
        { length: 40 },
        (__, line) => `Unique song ${index + 1} long lyric line ${line + 1}`,
      ).join("\n")
      : `Refrain:\nUnique song ${index + 1} refrain\n\nVerse 1\nUnique song ${index + 1} verse`,
  }));
  const result = LyricsBooklet.paginateLyrics(assignments);

  assert.equal(result.pages.length, 8);
  assert.ok(result.fontSize > 8.5);
  assert.ok(result.pages.every(page => page.blocks.length > 0));
  result.pages.forEach(page => {
    assert.ok(page.used <= 48 * 8.5 / result.fontSize);
  });
  assert.deepEqual(
    result.pages.flatMap(page => page.blocks.map(block => block.assignment.title)),
    assignments.map(item => item.title),
  );
  assert.equal(
    result.pages.flatMap(page => page.items)
      .some(item => item.type === "song-header" && item.continued),
    false,
  );
  const modes = result.pages.flatMap(page => page.blocks.map(block => block.columns));
  assert.ok(modes.includes(1));
  assert.ok(modes.includes(2));
  result.pages.flatMap(page => page.blocks)
    .filter(block => block.columns === 2)
    .forEach(block => assert.ok(block.bodyColumns.every(column => column.length)));

  const logical = LyricsBooklet.logicalPages({
    date: "2026-08-02",
    celebration: "Sunday Mass",
    meta: "Sunday · Year A",
    assignments,
  });
  assert.deepEqual(logical.map(page => page.kind), Array(8).fill("lyrics"));

  const source = pdfSource(LyricsBooklet.buildPdf(jsPDF, {
    date: "2026-08-02",
    celebration: "Sunday Mass",
    meta: "Sunday · Year A",
    assignments,
  }));
  assignments.forEach((__, index) => {
    assert.ok(source.includes(`Song ${index + 1}`));
    assert.ok(source.includes(`Unique song ${index + 1}`));
  });
});

test("short songs remain single-column", () => {
  const result = LyricsBooklet.paginateLyrics([assignment()]);

  assert.equal(result.pages[0].layout, "adaptive");
  assert.equal(result.pages[0].blocks[0].columns, 1);
});

test("fourteen songs still fill every lyric page when an oversized song must continue", () => {
  const assignments = Array.from({ length: 14 }, (_, index) => assignment({
    partLabel: `Part ${index + 1}`,
    title: `Song ${index + 1}`,
    authors: "",
    copyrightOwner: "",
    copyrightYear: "",
    lyrics: index === 4
      ? Array.from(
        { length: 90 },
        (__, line) => `Oversized song lyric line ${line + 1} for the assembly`,
      ).join("\n")
      : `Refrain:\nShort refrain ${index + 1}\n\nVerse 1\nShort verse ${index + 1}`,
  }));
  const result = LyricsBooklet.paginateLyrics(assignments);

  assert.equal(result.pages.length, 8);
  assert.ok(result.pages.every(page => page.items.length > 0));
  assert.ok(result.pages.flatMap(page => page.items)
    .some(item => item.type === "song-header" && item.continued));
  assert.deepEqual(
    LyricsBooklet.logicalPages({ assignments }).map(page => page.kind),
    Array(8).fill("lyrics"),
  );
});

// Page one now carries both the masthead and lyrics, so its content is the most
// likely to run off the bottom of the folded A5 page.
function recordingPdf(marks) {
  let sheet = 0;
  let size = 10;
  const doc = {
    setProperties() {},
    addPage() { sheet += 1; },
    setFont() {},
    setTextColor() {},
    setDrawColor() {},
    setLineWidth() {},
    setFontSize(value) { size = value; },
    text(value, x, y) { marks.push({ sheet, value: String(value), x, y, size }); },
    line(x1, y1, x2, y2) { marks.push({ sheet, value: "", x: x1, y: Math.max(y1, y2), size: 0 }); },
    splitTextToSize(value) { return [String(value)]; },
    getTextWidth(value) { return String(value).length * size * 0.5 * 25.4 / 72; },
  };
  return function StubPdf() { return doc; };
}

test("page one keeps its masthead and lyrics inside the printable area", () => {
  const marks = [];
  LyricsBooklet.buildPdf(recordingPdf(marks), {
    date: "2026-08-02",
    celebration: "The Nativity of Our Lord Jesus Christ at Midnight",
    meta: "Sunday · Year A",
    assignments: Array.from({ length: 8 }, (__, index) => assignment({
      partLabel: `Part ${index + 1}`,
      title: `Song ${index + 1}`,
      lyrics: Array.from({ length: 24 }, (___, line) =>
        `Song ${index + 1} congregational lyric line ${line + 1}`).join("\n"),
    })),
  });

  // Logical page one is imposed on the right half of the first sheet.
  const pageOne = marks.filter(mark => mark.sheet === 0 && mark.x >= 148.5);
  assert.ok(pageOne.some(mark => mark.value.startsWith("ST JAMES")));
  assert.ok(pageOne.some(mark => mark.value.includes("congregational lyric line")));
  const bottom = Math.max(...pageOne
    .filter(mark => mark.value && !/^\d+$/.test(mark.value))
    .map(mark => mark.y + mark.size * 1.15 * 25.4 / 72));
  assert.ok(bottom <= 199, `page one content reaches ${bottom.toFixed(1)}mm of 199mm`);
});

test("the selected candidate uses its larger lyric font in the PDF", () => {
  const doc = LyricsBooklet.buildPdf(jsPDF, {
    date: "2026-08-02",
    celebration: "Sunday Mass",
    meta: "Sunday · Year A",
    assignments: [assignment()],
  });

  assert.match(pdfSource(doc), /11\.5 Tf/);
});
