const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/domain/songs.js");

const catalog = global.SongCatalog;

test("song titles are required but deliberately not unique", () => {
  assert.equal(catalog.validateDraft({ title: "   " }).valid, false);
  assert.equal(catalog.validateDraft({ title: "  Amazing Grace  " }).value.title, "Amazing Grace");

  const songs = [
    { id: "setting-a", title: "Amazing Grace", authors: "Author A" },
    { id: "setting-b", title: "Amazing Grace", authors: "Author B" },
  ];
  const matches = catalog.search(songs, "amazing grace");
  assert.deepEqual(matches.map(song => song.id), ["setting-a", "setting-b"]);
});

test("lyrics and all metadata except title are optional", () => {
  const result = catalog.validateDraft({ title: "Song without lyrics" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    title: "Song without lyrics",
    youtubeUrl: "",
    authors: "",
    copyrightOwner: "",
    copyrightYear: "",
    source: "",
    lyrics: "",
    suggestionParts: [],
  });
  assert.equal(catalog.hasLyrics(result.value), false);
  assert.equal(catalog.hasLyrics({ lyrics: "  [Verse 1]\nWords  " }), true);
});

test("suggestion parts are normalized but never constrain catalogue search", () => {
  const value = catalog.validateDraft({
    title: "Mass setting",
    suggestionParts: ["memorial", "memorial", "not-a-part"],
  }).value;
  assert.deepEqual(value.suggestionParts, ["memorial"]);
  assert.deepEqual(catalog.search([
    { id: "setting", title: "Mass setting", suggestionParts: ["memorial"] },
  ], "").map(song => song.id), ["setting"]);
});

test("simple phase-one search is title-only, stable, and alphabetical", () => {
  const songs = [
    { id: "z", title: "Table of Plenty", authors: "Matching Author" },
    { id: "a", title: "Be Not Afraid", authors: "Table of Plenty" },
    { id: "b", title: "Table Grace", authors: "" },
  ];
  assert.deepEqual(catalog.search(songs, "table").map(song => song.id), ["b", "z"]);
  assert.deepEqual(catalog.search(songs, "").map(song => song.id), ["a", "b", "z"]);
});

test("the catalogue never filters song eligibility by Mass part", () => {
  const songs = [
    { id: "mass-setting", title: "Kyrie setting", typicalParts: ["kyrie"] },
    { id: "general-hymn", title: "A general hymn", typicalParts: ["communion"] },
  ];

  assert.deepEqual(
    SongCatalog.search(songs, "").map(song => song.id),
    ["general-hymn", "mass-setting"],
  );
});

test("the create action is independent of exact-title matches", () => {
  assert.equal(catalog.creationActionLabel(""), "Add a new song");
  assert.equal(
    catalog.creationActionLabel("  Amazing Grace  "),
    "Create a new song titled “Amazing Grace”",
  );
  const exactMatches = catalog.search([
    { id: "a", title: "Amazing Grace" },
    { id: "b", title: "Amazing Grace" },
  ], "Amazing Grace");
  assert.equal(exactMatches.length, 2);
  assert.equal(catalog.creationActionLabel("Amazing Grace"), "Create a new song titled “Amazing Grace”");
});
