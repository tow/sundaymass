const test = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const PptxGenJS = require("pptxgenjs");

const LyricsPresentation = require("../src/domain/lyrics-presentation.js");

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
    assert.ok(slide.split("\n").filter(Boolean).length <= 4);
  });
  const words = value => value.match(/\S+/g) || [];
  assert.deepEqual(words(slides.join("\n")), words(LyricsPresentation.normalizeLyrics(lyrics)));
});

test("long lyric sections are balanced without one-line continuation slides", () => {
  const fiveLines = LyricsPresentation.lyricSlides(
    ["One", "Two", "Three", "Four", "Five"].join("\n"),
    { maxLineLength: 100 },
  );
  assert.deepEqual(fiveLines.map(slide => slide.split("\n").length), [3, 2]);

  const nineLines = LyricsPresentation.lyricSlides(
    ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"].join("\n"),
    { maxLineLength: 100 },
  );
  assert.deepEqual(nineLines.map(slide => slide.split("\n").length), [3, 3, 3]);
});

test("six-line sections break between couplets instead of through them", () => {
  const slides = LyricsPresentation.lyricSlides([
    "Couplet one, line one",
    "Couplet one, line two",
    "Couplet two, line one",
    "Couplet two, line two",
    "Couplet three, line one",
    "Couplet three, line two",
  ].join("\n"), { maxLineLength: 100 });

  assert.deepEqual(slides.map(slide => slide.split("\n").length), [4, 2]);
  assert.match(slides[0], /Couplet two, line one\nCouplet two, line two$/);
  assert.match(slides[1], /^Couplet three, line one\nCouplet three, line two$/);
});

test("semantic continuation lines are kept on the same slide", () => {
  const slides = LyricsPresentation.lyricSlides([
    "Lord Jesus Christ",
    "Lord God, Son of the Father",
    "You take away the sins of the world,",
    "have mercy on us",
    "You take away the sins of the world,",
    "receive our prayer",
  ].join("\n"), { maxLineLength: 100 });

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

test("Psalm assignments retain only the congregational response", () => {
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
  assert.equal(
    LyricsPresentation.congregationLyrics("psalm", lyrics),
    "Response:\nThe hand of the Lord feeds us;\nhe answers all our needs.",
  );
  assert.equal(LyricsPresentation.congregationLyrics("entrance", lyrics), lyrics);
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
