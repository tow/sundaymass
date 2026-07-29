const test = require("node:test");
const assert = require("node:assert/strict");
const { jsPDF } = require("jspdf");

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

  assert.equal(pages[0].kind, "cover");
  assert.equal(pages.some(page => page.kind === "contents"), false);
  assert.equal(pages.at(-1).kind, "back-cover");
  assert.equal(pages.length, 8);
  assert.deepEqual(pages.map(page => page.number), [1, 2, 3, 4, 5, 6, 7, 8]);
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
    "CONGREGATIONAL SONG BOOKLET",
  ].forEach(text => assert.ok(source.includes(text), `PDF should contain "${text}"`));
});

test("the booklet PDF keeps only the Psalm response", () => {
  const psalm = assignment({
    partKey: "psalm",
    partLabel: "Psalm",
    title: "The Hand of the Lord",
    lyrics: "Response:\nThe Hand of the Lord feeds us;\nhe answers all our needs.\n\n"
      + "Verse 1\nThe LORD is gracious and merciful,\nslow to anger.",
  });
  const doc = LyricsBooklet.buildPdf(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday · Year C",
    assignments: [psalm],
  });

  const source = pdfSource(doc);
  assert.ok(source.includes("The Hand of the Lord feeds us;"));
  assert.equal(source.includes("The LORD is gracious and merciful"), false);
  assert.equal(source.includes("Verse 1"), false);
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
