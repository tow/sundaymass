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

test("the print slideshow reuses lyricSlides pagination, one slide per chunk", () => {
  const assignment = {
    partLabel: "Entrance",
    title: "Gathered in Hope",
    lyrics: ["One", "Two", "Three", "Four", "Five"].join("\n"),
  };
  const markup = LyricsPresentation.renderSlides({
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday, 2 August 2026 · Year A",
    assignments: [assignment],
  });
  const chunkCount = LyricsPresentation.lyricSlides(assignment.lyrics).length;

  assert.equal((markup.match(/class="pdf-slide pdf-slide-cover"/g) || []).length, 1);
  assert.equal((markup.match(/class="pdf-slide pdf-slide-lyrics"/g) || []).length, chunkCount);
});

test("the print slideshow matches the PowerPoint deck's slide count and content", async () => {
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
  const markup = LyricsPresentation.renderSlides(options);
  const deck = LyricsPresentation.buildDeck(PptxGenJS, options);
  const buffer = await deck.write({ outputType: "nodebuffer" });
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));

  assert.equal((markup.match(/pdf-slide-lyrics/g) || []).length, slideFiles.length - 1);
  [
    "18th Sunday in Ordinary Time",
    "Gathered in Hope",
    "Test Author",
    "© 2026 Test Publisher",
    "First line",
    "Third line",
  ].forEach(text => assert.match(markup, new RegExp(text)));
});

test("the print slideshow escapes lyric and title HTML", () => {
  const markup = LyricsPresentation.renderSlides({
    date: "2026-08-02",
    celebration: "<script>alert(1)</script>",
    meta: "",
    assignments: [{
      partLabel: "Entrance",
      title: "Rock & <Roll>",
      lyrics: "A line with <b>tags</b> & ampersands",
    }],
  });
  assert.doesNotMatch(markup, /<script>|<b>tags<\/b>/);
  assert.match(markup, /Rock &amp; &lt;Roll&gt;/);
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("the print slideshow keeps each assignment's own label, title, and order", () => {
  const markup = LyricsPresentation.renderSlides({
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [
      { partLabel: "Entrance", title: "First Song", lyrics: "Opening line" },
      { partLabel: "Communion", title: "Second Song", lyrics: "Closing line" },
    ],
  });
  const entranceIndex = markup.indexOf("Opening line");
  const communionIndex = markup.indexOf("Closing line");
  assert.ok(entranceIndex > 0 && communionIndex > entranceIndex);
  assert.match(markup, /ENTRANCE[\s\S]*First Song[\s\S]*Opening line/);
  assert.match(markup, /COMMUNION[\s\S]*Second Song[\s\S]*Closing line/);
});

test("the print slideshow omits the attribution line when there is none", () => {
  const markup = LyricsPresentation.renderSlides({
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [{ partLabel: "Entrance", title: "Traditional Hymn", lyrics: "A line" }],
  });
  assert.doesNotMatch(markup, /pdf-slide-attribution/);
});

test("the print slideshow numbers each lyric slide's position within its song", () => {
  const assignment = {
    partLabel: "Entrance",
    title: "Gathered in Hope",
    lyrics: ["One", "Two", "Three", "Four", "Five"].join("\n"),
  };
  const markup = LyricsPresentation.renderSlides({
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [assignment],
  });
  const chunkCount = LyricsPresentation.lyricSlides(assignment.lyrics).length;
  const counters = [...markup.matchAll(/pdf-slide-counter">([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(counters, Array.from({ length: chunkCount }, (_, index) => `${index + 1} / ${chunkCount}`));
});

test("the cover title shrinks for long celebration names instead of overflowing", () => {
  const short = LyricsPresentation.renderSlides({
    date: "2026-08-02",
    celebration: "18th Sunday in Ordinary Time",
    meta: "",
    assignments: [],
  });
  assert.match(short, /pdf-slide-cover-title" style="font-size:38pt"/);

  const long = LyricsPresentation.renderSlides({
    date: "2026-08-02",
    celebration: "St. Andrew Kim Taegon, priest and martyr, St. Paul Chong Hasang, "
      + "catechist and martyr, and their companions, martyrs",
    meta: "",
    assignments: [],
  });
  assert.match(long, /pdf-slide-cover-title" style="font-size:20pt"/);
});
