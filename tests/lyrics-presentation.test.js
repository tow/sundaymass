const test = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const PptxGenJS = require("pptxgenjs");
const { jsPDF } = require("jspdf");

require("../src/domain/weekly-lyrics.js");
const LyricsPresentation = require("../src/domain/lyrics-presentation.js");

// jsPDF writes uncompressed content streams, so the serialized document can be
// searched for the latin1 text drawn on its pages.
function pdfSource(doc) {
  return Buffer.from(doc.output("arraybuffer")).toString("latin1");
}

function pageStream(doc, pageNumber) {
  return doc.internal.pages[pageNumber].join("\n");
}

test("lyrics are split deterministically without dropping words", () => {
  const lyrics = [
    "First short line",
    "A deliberately long lyric line that needs wrapping but must keep every individual word intact",
    "",
    "Second stanza line one",
    "Second stanza line two",
    "Second stanza line three",
    "Second stanza line four",
    "Second stanza line five",
    "Second stanza line six",
    "Second stanza line seven",
    "Second stanza line eight",
  ].join("\r\n");

  const slides = LyricsPresentation.lyricSlides(lyrics);
  assert.ok(slides.length >= 2);
  slides.forEach(slide => {
    assert.ok(slide.split("\n").filter(Boolean).length <= 8);
  });
  // The eight-line second stanza stays together on one slide.
  assert.ok(slides.some(slide =>
    slide.startsWith("Second stanza line one") && slide.endsWith("Second stanza line eight")));
  const words = value => value.match(/\S+/g) || [];
  assert.deepEqual(words(slides.join("\n")), words(LyricsPresentation.normalizeLyrics(lyrics)));
});

test("whole verses of up to eight lines stay together on one stretched slide", () => {
  [5, 6, 7, 8].forEach(count => {
    const verse = Array.from({ length: count }, (_, index) => `Line number ${index + 1}`);
    const slides = LyricsPresentation.lyricSlides(verse.join("\n"), { maxLineLength: 100 });
    assert.deepEqual(slides, [verse.join("\n")], `${count}-line verse should fill one slide`);
  });
});

test("verses beyond eight lines split into balanced slides without one-line continuations", () => {
  const nineLines = LyricsPresentation.lyricSlides(
    ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"].join("\n"),
    { maxLineLength: 100 },
  );
  assert.deepEqual(nineLines.map(slide => slide.split("\n").length), [5, 4]);

  const sixteenLines = LyricsPresentation.lyricSlides(
    Array.from({ length: 16 }, (_, index) => `Line number ${index + 1}`).join("\n"),
    { maxLineLength: 100 },
  );
  assert.deepEqual(sixteenLines.map(slide => slide.split("\n").length), [8, 8]);
});

test("split verses break between couplets instead of through them", () => {
  const slides = LyricsPresentation.lyricSlides([
    "Couplet one, line one",
    "Couplet one, line two",
    "Couplet two, line one",
    "Couplet two, line two",
    "Couplet three, line one",
    "Couplet three, line two",
    "Couplet four, line one",
    "Couplet four, line two",
    "Couplet five, line one",
    "Couplet five, line two",
  ].join("\n"), { maxLineLength: 100 });

  assert.deepEqual(slides.map(slide => slide.split("\n").length), [6, 4]);
  assert.match(slides[0], /Couplet three, line one\nCouplet three, line two$/);
  assert.match(slides[1], /^Couplet four, line one\nCouplet four, line two/);
});

test("semantic continuation lines are kept on the same slide", () => {
  const slides = LyricsPresentation.lyricSlides([
    "Lord Jesus Christ",
    "Lord God, Son of the Father",
    "You take away the sins of the world,",
    "have mercy on us",
    "You take away the sins of the world,",
    "receive our prayer",
  ].join("\n"), { maxLineLength: 100, keepStanzaLines: 4 });

  assert.deepEqual(slides.map(slide => slide.split("\n").length), [4, 2]);
  assert.match(slides[0], /You take away the sins of the world,\nhave mercy on us$/);
});

test("wrapped lines are balanced and never strand a final word", () => {
  assert.deepEqual(
    LyricsPresentation.wrapLine("Blessed and broken shared with all in need", 40),
    ["Blessed and broken", "shared with all in need"],
  );
  assert.deepEqual(
    LyricsPresentation.wrapLine("Lamb of God, You take away the sins of the world;"),
    ["Lamb of God, You take away", "the sins of the world;"],
  );
});

test("all fragments of one authored line stay on the same slide", () => {
  const longLine = "Lamb of God, You take away the sins of the world;";
  const wrapped = LyricsPresentation.wrapLine(longLine);
  const slides = LyricsPresentation.lyricSlides([
    "Opening line",
    longLine,
    "Have mercy on us",
    "Closing line",
  ].join("\n"));
  const containingSlide = slides.find(slide => slide.includes(wrapped[0]));

  assert.ok(containingSlide);
  assert.ok(wrapped.every(line => containingSlide.split("\n").includes(line)));
});

test("short lyric sections share a slide up to four visible lines", () => {
  const slides = LyricsPresentation.lyricSlides(
    ["Refrain line one", "Refrain line two", "", "Verse line one", "Verse line two"].join("\n"),
    { maxLineLength: 100 },
  );
  assert.equal(slides.length, 1);
  assert.equal(slides[0].split("\n").filter(Boolean).length, 4);
  assert.match(slides[0], /Refrain line two\n\nVerse line one/);
});

test("projection labels do not consume one of the four lyric lines", () => {
  const slides = LyricsPresentation.lyricSlides([
    "Response:",
    "Line one",
    "Line two",
    "Line three",
    "Line four",
  ].join("\n"));
  assert.deepEqual(slides, ["Line one\nLine two\nLine three\nLine four"]);
});

test("standalone repeat directions do not create congregation slides", () => {
  const slides = LyricsPresentation.lyricSlides([
    "Line one",
    "Line two",
    "Line three",
    "Line four",
    "2x",
  ].join("\n"));
  assert.deepEqual(slides, ["Line one\nLine two\nLine three\nLine four"]);
});

test("selected assignments retain Mass order and repeated songs", () => {
  const parts = [
    { key: "entrance", label: "Entrance" },
    { key: "offertory", label: "Offertory" },
    { key: "communion", label: "Communion" },
  ];
  const songs = {
    entrance: { id: "song-a", title: "Song A" },
    offertory: { id: "song-b", title: "Song B" },
    communion: { id: "song-a", title: "Song A" },
  };
  const details = new Map([
    ["song-a", {
      id: "song-a",
      title: "Song A",
      authors: "Test Author",
      copyrightOwner: "Test Publisher",
      copyrightYear: "2026",
      lyrics: "A lyric",
    }],
    ["song-b", { id: "song-b", title: "Song B", lyrics: "" }],
  ]);

  const assignments = LyricsPresentation.selectedAssignments(parts, songs, details);
  assert.deepEqual(assignments.map(item => item.partLabel), [
    "Entrance",
    "Offertory",
    "Communion",
  ]);
  assert.deepEqual(assignments.map(item => item.songId), ["song-a", "song-b", "song-a"]);
  assert.equal(assignments[0].authors, "Test Author");
  assert.equal(assignments[0].copyrightOwner, "Test Publisher");
  assert.equal(assignments[0].copyrightYear, "2026");
  assert.deepEqual(LyricsPresentation.missingLyrics(assignments).map(item => item.title), ["Song B"]);
});

test("PowerPoint attribution includes authors and normalized copyright", () => {
  assert.equal(LyricsPresentation.attributionLine({
    authors: "Test Author",
    copyrightOwner: "Test Publisher",
    copyrightYear: "2026",
  }), "Test Author · © 2026 Test Publisher");
  assert.equal(LyricsPresentation.attributionLine({
    authors: "Traditional",
    copyrightOwner: "Public domain",
  }), "Traditional · Public domain");
});

test("Psalm assignments retain response and cantor verses as separate blocks", () => {
  const lyrics = [
    "Response:",
    "The hand of the Lord feeds us;",
    "he answers all our needs.",
    "",
    "1. The LORD is gracious and merciful,",
    "slow to anger and of great kindness.",
    "",
    "2. The eyes of all look hopefully to you.",
  ].join("\n");
  assert.equal(LyricsPresentation.congregationLyrics("psalm", lyrics), lyrics);
  assert.equal(LyricsPresentation.congregationLyrics("entrance", lyrics), lyrics);
  assert.deepEqual(LyricsPresentation.lyricBlocks("psalm", lyrics)
    .map(block => [block.audienceLabel, block.text]), [
    ["ALL: RESPONSE", "The hand of the Lord feeds us;\nhe answers all our needs."],
    ["CANTOR: VERSE 1", "The LORD is gracious and merciful,\nslow to anger and of great kindness."],
    ["CANTOR: VERSE 2", "The eyes of all look hopefully to you."],
  ]);
});

test("exports reject a Psalm record that contains only its response", () => {
  const assignments = LyricsPresentation.selectedAssignments(
    [{ key: "psalm", label: "Psalm" }],
    { psalm: { id: "incomplete-psalm", title: "Incomplete Psalm" } },
    new Map([[
      "incomplete-psalm",
      {
        id: "incomplete-psalm",
        title: "Incomplete Psalm",
        lyrics: "The Lord is kind and merciful.",
      },
    ]]),
  );

  assert.deepEqual(
    LyricsPresentation.missingLyrics(assignments).map(item => item.title),
    ["Incomplete Psalm"],
  );
});

test("a weekly Psalm edit controls exactly which verses reach projection", () => {
  const parts = [{ key: "psalm", label: "Psalm" }];
  const songs = { psalm: { id: "psalm-85", title: "Lord, Let Us See Your Kindness" } };
  const canonical = "Response:\nLord, let us see your kindness.\n\n"
    + "1. Kindness and truth shall meet.\n\n"
    + "2. The Lord himself will give his benefits.";
  const edited = "Response:\nLord, let us see your kindness.\n\n"
    + "2. The Lord himself will give his benefits.";
  const assignments = LyricsPresentation.selectedAssignments(
    parts,
    songs,
    new Map([["psalm-85", { ...songs.psalm, lyrics: canonical }]]),
    { psalm: { songId: "psalm-85", lyrics: edited } },
  );
  const chunks = LyricsPresentation.projectionChunks(assignments[0]);

  assert.deepEqual(chunks.map(chunk => chunk.audienceLabel), [
    "ALL: RESPONSE",
    "CANTOR: VERSE 2",
  ]);
  assert.doesNotMatch(chunks.map(chunk => chunk.text).join("\n"), /Kindness and truth/);
  assert.match(chunks.map(chunk => chunk.text).join("\n"), /give his benefits/);
});

test("the generated file is a valid widescreen PowerPoint with every lyric chunk", async () => {
  const assignments = [{
    partLabel: "Entrance",
    title: "Gathered in Hope",
    authors: "Test Author",
    copyrightOwner: "Test Publisher",
    copyrightYear: "2026",
    lyrics: "First line\nSecond line\n\nThird line",
  }];
  const deck = LyricsPresentation.buildDeck(PptxGenJS, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday, 2 August 2026 · Year A",
    assignments,
  });
  const buffer = await deck.write({ outputType: "nodebuffer" });
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));

  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.equal(slideFiles.length, 1 + LyricsPresentation.lyricSlides(assignments[0].lyrics).length);
  const slideXml = await Promise.all(slideFiles.map(name => zip.file(name).async("string")));
  const allXml = slideXml.join("\n");
  [
    "18th Sunday in Ordinary Time",
    "Gathered in Hope",
    "Test Author",
    "© 2026 Test Publisher",
    "First line",
    "Third line",
  ]
    .forEach(text => assert.match(allXml, new RegExp(text)));
  slideXml.slice(1).forEach(xml => {
    assert.match(xml, /Test Author/);
    assert.match(xml, /© 2026 Test Publisher/);
  });
});

test("the PDF deck reuses lyricSlides pagination, one page per chunk after the cover", () => {
  const assignment = {
    partLabel: "Entrance",
    title: "Gathered in Hope",
    lyrics: ["One", "Two", "Three", "Four", "Five"].join("\n"),
  };
  const doc = LyricsPresentation.buildPdfDoc(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday, 2 August 2026 · Year A",
    assignments: [assignment],
  });
  const chunkCount = LyricsPresentation.lyricSlides(assignment.lyrics).length;

  assert.equal(doc.getNumberOfPages(), chunkCount + 1);
});

test("Psalm PDF slides identify the congregational response and cantor verses", () => {
  const doc = LyricsPresentation.buildPdfDoc(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [{
      partKey: "psalm",
      partLabel: "Psalm",
      title: "The Hand of the Lord",
      lyrics: "Response:\nThe hand of the Lord feeds us.\n\n"
        + "Verse 1:\nThe Lord is gracious and merciful.",
    }],
  });
  const source = pdfSource(doc);

  assert.ok(source.includes("PSALM · ALL: RESPONSE"));
  assert.ok(source.includes("PSALM · CANTOR: VERSE 1"));
  assert.equal(LyricsPresentation.projectionLabelFontSize("ALL: RESPONSE"), 16);
});

test("the PDF deck matches the PowerPoint deck's slide count and content", async () => {
  const assignments = [{
    partLabel: "Entrance",
    title: "Gathered in Hope",
    authors: "Test Author",
    copyrightOwner: "Test Publisher",
    copyrightYear: "2026",
    lyrics: "First line\nSecond line\n\nThird line",
  }];
  const options = {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday, 2 August 2026 · Year A",
    assignments,
  };
  const doc = LyricsPresentation.buildPdfDoc(jsPDF, options);
  const deck = LyricsPresentation.buildDeck(PptxGenJS, options);
  const buffer = await deck.write({ outputType: "nodebuffer" });
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));

  assert.equal(doc.getNumberOfPages(), slideFiles.length);
  const source = pdfSource(doc);
  [
    "18th Sunday in Ordinary Time",
    "Gathered in Hope",
    "Test Author",
    "© 2026 Test Publisher",
    "First line",
    "Third line",
  ].forEach(text => assert.ok(source.includes(text), `PDF should contain "${text}"`));
});

test("every PDF page uses the widescreen slide size", () => {
  const doc = LyricsPresentation.buildPdfDoc(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [{ partLabel: "Entrance", title: "Gathered in Hope", lyrics: "A line" }],
  });
  const boxes = [...pdfSource(doc).matchAll(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
  assert.equal(boxes.length, doc.getNumberOfPages());
  boxes.forEach(([, width, height]) => {
    assert.ok(Math.abs(Number(width) - 960) < 1, `unexpected page width ${width}`);
    assert.ok(Math.abs(Number(height) - 540) < 1, `unexpected page height ${height}`);
  });
});

test("the PDF deck keeps each assignment's own label, title, and order", () => {
  const doc = LyricsPresentation.buildPdfDoc(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [
      { partLabel: "Entrance", title: "First Song", lyrics: "Opening line" },
      { partLabel: "Communion", title: "Second Song", lyrics: "Closing line" },
    ],
  });
  assert.equal(doc.getNumberOfPages(), 3);
  assert.match(pageStream(doc, 2), /ENTRANCE[\s\S]*First Song[\s\S]*Opening line/);
  assert.match(pageStream(doc, 3), /COMMUNION[\s\S]*Second Song[\s\S]*Closing line/);
});

test("the PDF deck omits the attribution line when there is none", () => {
  const doc = LyricsPresentation.buildPdfDoc(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [{ partLabel: "Entrance", title: "Traditional Hymn", lyrics: "A line" }],
  });
  // Only the page counter draws at 9pt when there is no attribution.
  const smallText = pageStream(doc, 2).match(/9 Tf/g) || [];
  assert.equal(smallText.length, 1);
  assert.match(pageStream(doc, 2), /\(1 \/ 1\) Tj/);
});

test("the PDF deck numbers each lyric slide's position within its song", () => {
  const assignment = {
    partLabel: "Entrance",
    title: "Gathered in Hope",
    lyrics: ["One", "Two", "Three", "Four", "Five"].join("\n"),
  };
  const doc = LyricsPresentation.buildPdfDoc(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [assignment],
  });
  const chunkCount = LyricsPresentation.lyricSlides(assignment.lyrics).length;
  Array.from({ length: chunkCount }, (_, index) => index).forEach(index => {
    assert.match(
      pageStream(doc, index + 2),
      new RegExp(`\\(${index + 1} / ${chunkCount}\\) Tj`),
    );
  });
});

test("the PDF cover title shrinks for long celebration names instead of overflowing", () => {
  // The cover title is the only times-bold (/F10) text on the cover page.
  const titleFontSize = doc => Number(pageStream(doc, 1).match(/\/F10 ([\d.]+) Tf/)[1]);
  const short = LyricsPresentation.buildPdfDoc(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [],
  });
  assert.equal(titleFontSize(short), 38);

  const long = LyricsPresentation.buildPdfDoc(jsPDF, {
    date: "2026-08-02",
    celebration: "St. Andrew Kim Taegon, priest and martyr, St. Paul Chong Hasang, "
      + "catechist and martyr, and their companions, martyrs",
    meta: "",
    assignments: [],
  });
  assert.ok(titleFontSize(long) <= 20, `expected at most 20pt, got ${titleFontSize(long)}`);
});

test("over-wide lyric lines shrink to fit the slide instead of overflowing", () => {
  const wideLine = "W".repeat(60);
  const doc = LyricsPresentation.buildPdfDoc(jsPDF, {
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [{ partLabel: "Entrance", title: "Wide Song", lyrics: wideLine }],
  });
  const startSize = LyricsPresentation.lyricFontSize(wideLine);
  const [, size, x] = pageStream(doc, 2)
    .match(/\/F\d+ ([\d.]+) Tf\n[^\n]*\n[^\n]*\n[^\n]*\n([\d.]+) [\d.]+ Td\n\(W+\) Tj/);
  assert.ok(Number(size) < startSize, `expected under ${startSize}pt, got ${size}`);
  const lyricBox = LyricsPresentation.SLIDE_LAYOUT.lyric;
  assert.ok(Number(x) >= lyricBox.x * 72 - 0.01, `line starts at ${x}, left of the lyric box`);
});

test("the PowerPoint deck and the PDF deck position the label box from the same geometry", async () => {
  const assignments = [{ partLabel: "Entrance", title: "Gathered in Hope", lyrics: "A line" }];
  const options = { date: "2026-08-02", celebration: "Test", meta: "", assignments };
  const doc = LyricsPresentation.buildPdfDoc(jsPDF, options);
  const deck = LyricsPresentation.buildDeck(PptxGenJS, options);
  const buffer = await deck.write({ outputType: "nodebuffer" });
  const zip = await JSZip.loadAsync(buffer);
  const slideXml = await zip.file("ppt/slides/slide2.xml").async("string");

  const EMU_PER_INCH = 914400;
  const [, offX, offY, extCx, extCy] = slideXml.match(
    /name="Text 1"[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/,
  );
  const { x, y, w, h } = LyricsPresentation.SLIDE_LAYOUT.label;
  const expectedBox = { x, y, w, h };
  const pptxBox = {
    x: Number(offX) / EMU_PER_INCH,
    y: Number(offY) / EMU_PER_INCH,
    w: Number(extCx) / EMU_PER_INCH,
    h: Number(extCy) / EMU_PER_INCH,
  };
  assert.deepEqual(pptxBox, expectedBox);

  // PDF user space is bottom-up: the label's pen position must sit inside the
  // SLIDE_LAYOUT.label box converted to points from the 540pt-tall page.
  const [, pdfX, pdfY] = pageStream(doc, 2).match(/([\d.]+) ([\d.]+) Td\n\(ENTRANCE\) Tj/);
  assert.ok(Math.abs(Number(pdfX) - x * 72) < 0.01, `label x ${pdfX} != ${x * 72}`);
  assert.ok(
    Number(pdfY) <= 540 - y * 72 && Number(pdfY) >= 540 - (y + h) * 72,
    `label baseline ${pdfY} outside the label box`,
  );
});

test("lyricFontSize shrinks at each visible-line-count tier", () => {
  const shortLine = "x".repeat(10);
  assert.equal(LyricsPresentation.lyricFontSize(shortLine), 52);
  assert.equal(LyricsPresentation.lyricFontSize([shortLine, shortLine].join("\n")), 48);
  assert.equal(LyricsPresentation.lyricFontSize([shortLine, shortLine, shortLine].join("\n")), 44);
  assert.equal(
    LyricsPresentation.lyricFontSize([shortLine, shortLine, shortLine, shortLine].join("\n")),
    40,
  );
  const stack = count => Array.from({ length: count }, () => shortLine).join("\n");
  assert.equal(LyricsPresentation.lyricFontSize(stack(5)), 36);
  assert.equal(LyricsPresentation.lyricFontSize(stack(6)), 36);
  assert.equal(LyricsPresentation.lyricFontSize(stack(7)), 32);
  assert.equal(LyricsPresentation.lyricFontSize(stack(8)), 32);
});

test("lyricFontSize shrinks at each character-length tier on a single line", () => {
  assert.equal(LyricsPresentation.lyricFontSize("x".repeat(30)), 52);
  assert.equal(LyricsPresentation.lyricFontSize("x".repeat(31)), 48);
  assert.equal(LyricsPresentation.lyricFontSize("x".repeat(34)), 48);
  assert.equal(LyricsPresentation.lyricFontSize("x".repeat(35)), 44);
  assert.equal(LyricsPresentation.lyricFontSize("x".repeat(38)), 44);
  assert.equal(LyricsPresentation.lyricFontSize("x".repeat(39)), 40);
});

test("coverTitleFontSize shrinks at each celebration-name-length tier", () => {
  assert.equal(LyricsPresentation.coverTitleFontSize("x".repeat(45)), 38);
  assert.equal(LyricsPresentation.coverTitleFontSize("x".repeat(46)), 32);
  assert.equal(LyricsPresentation.coverTitleFontSize("x".repeat(60)), 32);
  assert.equal(LyricsPresentation.coverTitleFontSize("x".repeat(61)), 26);
  assert.equal(LyricsPresentation.coverTitleFontSize("x".repeat(90)), 26);
  assert.equal(LyricsPresentation.coverTitleFontSize("x".repeat(91)), 20);
});

test("wrapLine avoids starting a middle line with a stopword when otherwise tied", () => {
  // Seven equal-length filler words wrapped at width 15 forces a 3-line split
  // where (3,2,2) and (2,3,2) word-counts score identically on line-length
  // balance alone, so only the stopword-start penalty breaks the tie.
  const withStopword = LyricsPresentation.wrapLine("Rock Rise and Song Hope Rest Wave", 15);
  assert.deepEqual(withStopword, ["Rock Rise and", "Song Hope", "Rest Wave"]);

  const withNeutralWord = LyricsPresentation.wrapLine("Rock Rise Owl Song Hope Rest Wave", 15);
  assert.deepEqual(withNeutralWord, ["Rock Rise", "Owl Song Hope", "Rest Wave"]);
});

test("pagination prefers splitting right after a line that ends a sentence", () => {
  // Five lines with maxLines:3 have two equally-balanced two-page splits,
  // (3,2) and (2,3), with no comma-continuation or parity tiebreak in play
  // (odd unit count). Only the sentence-ending bonus should decide between them.
  const periodOnSecondLine = LyricsPresentation.lyricSlides(
    ["Line one", "Line two.", "Line three", "Line four", "Line five"].join("\n"),
    { maxLines: 3, maxLineLength: 100, keepStanzaLines: 3 },
  );
  assert.deepEqual(periodOnSecondLine, [
    "Line one\nLine two.",
    "Line three\nLine four\nLine five",
  ]);

  const noSentenceBoundary = LyricsPresentation.lyricSlides(
    ["Line one", "Line two", "Line three", "Line four", "Line five"].join("\n"),
    { maxLines: 3, maxLineLength: 100, keepStanzaLines: 3 },
  );
  assert.deepEqual(noSentenceBoundary, [
    "Line one\nLine two\nLine three",
    "Line four\nLine five",
  ]);
});

test("a one-line closing stanza joins the stretched verse before it instead of stranding", () => {
  const slides = LyricsPresentation.lyricSlides(
    ["One", "Two", "Three", "Four", "Five", "", "Six"].join("\n"),
    { maxLineLength: 100 },
  );
  assert.deepEqual(slides, [
    "One\nTwo\nThree\nFour\nFive\n\nSix",
  ]);
});

test("a split stanza's trailing page shares a slide with a one-line next stanza instead of stranding it", () => {
  const slides = LyricsPresentation.lyricSlides(
    ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "", "Ten"].join("\n"),
    { maxLineLength: 100 },
  );
  assert.deepEqual(slides, [
    "One\nTwo\nThree\nFour\nFive",
    "Six\nSeven\nEight\nNine\n\nTen",
  ]);
});

test("stanzas that cannot share a slide each get their own", () => {
  const slides = LyricsPresentation.lyricSlides(
    ["One", "Two", "Three", "Four", "Five", "", "Six", "Seven", "Eight"].join("\n"),
    { maxLineLength: 100 },
  );
  assert.deepEqual(slides, [
    "One\nTwo\nThree\nFour\nFive",
    "Six\nSeven\nEight",
  ]);
});
