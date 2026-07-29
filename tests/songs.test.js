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
    youtubeVideoId: "",
    authors: "",
    copyrightOwner: "",
    copyrightYear: "",
    source: "",
    responsorialBook: "",
    responsorialNumber: null,
    responsorialCitations: [],
    lyrics: "",
    inRepertoire: true,
    suggestionParts: [],
  });
  assert.equal(catalog.hasLyrics(result.value), false);
  assert.equal(catalog.hasLyrics({ lyrics: "  [Verse 1]\nWords  " }), true);
});

test("responsorial songs require structured book and number and retain exact citations", () => {
  assert.match(catalog.validateDraft({
    title: "A Psalm",
    suggestionParts: ["psalm"],
  }).error, /book and number/);
  assert.equal(catalog.validateDraft({
    title: "A Psalm",
    suggestionParts: ["psalm"],
    responsorialBook: "Psalm",
    responsorialNumber: 85,
  }).valid, true);
  const result = catalog.validateDraft({
    title: "A Psalm",
    suggestionParts: ["psalm"],
    responsorialBook: "Psalm",
    responsorialNumber: "85",
    responsorialCitations: "Psalm 85:9–14\nPsalm 85:8–13",
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.responsorialNumber, 85);
  assert.deepEqual(result.value.responsorialCitations, [
    "Psalm 85:9–14",
    "Psalm 85:8–13",
  ]);
});

test("YouTube links are validated and normalized to a video ID", () => {
  const result = catalog.validateDraft({
    title: "Practice song",
    youtubeUrl: " https://youtu.be/D6_KModMCtg?si=tracking ",
  });

  assert.equal(result.valid, true);
  assert.equal(result.value.youtubeVideoId, "D6_KModMCtg");
  assert.equal(
    result.value.youtubeUrl,
    "https://www.youtube.com/watch?v=D6_KModMCtg",
  );
  assert.equal(catalog.validateDraft({
    title: "Not a video",
    youtubeUrl: "https://youtube.com/results?search_query=hymn",
  }).valid, false);
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
  assert.equal(catalog.suggestionPartFor("communion"), "communion");
  assert.equal(catalog.suggestionPartFor("communion2"), "communion");
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
