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
  slides.forEach(slide => assert.ok(slide.split("\n").length <= 8));
  const words = value => value.match(/\S+/g) || [];
  assert.deepEqual(words(slides.join("\n")), words(LyricsPresentation.normalizeLyrics(lyrics)));
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
    ["song-a", { id: "song-a", title: "Song A", lyrics: "A lyric" }],
    ["song-b", { id: "song-b", title: "Song B", lyrics: "" }],
  ]);

  const assignments = LyricsPresentation.selectedAssignments(parts, songs, details);
  assert.deepEqual(assignments.map(item => item.partLabel), [
    "Entrance",
    "Offertory",
    "Communion",
  ]);
  assert.deepEqual(assignments.map(item => item.songId), ["song-a", "song-b", "song-a"]);
  assert.deepEqual(LyricsPresentation.missingLyrics(assignments).map(item => item.title), ["Song B"]);
});

test("the generated file is a valid widescreen PowerPoint with every lyric chunk", async () => {
  const assignments = [{
    partLabel: "Entrance",
    title: "Gathered in Hope",
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
  ["18th Sunday in Ordinary Time", "Gathered in Hope", "First line", "Third line"]
    .forEach(text => assert.match(allXml, new RegExp(text)));
});
