const test = require("node:test");
const assert = require("node:assert/strict");

const SongRequests = require("../src/domain/song-requests.js");

test("a request needs an existing song or a free-text title", () => {
  const empty = SongRequests.validateDraft({});
  assert.equal(empty.valid, false);
  assert.match(empty.error, /Choose a song/);

  const note = SongRequests.validateDraft({ note: "Just a note" });
  assert.equal(note.valid, false);
});

test("an existing-song request keeps the reference and drops free-text fields", () => {
  const result = SongRequests.validateDraft({
    songId: " song-1 ",
    title: "Typed but ignored",
    youtubeUrl: "https://youtu.be/AAAAAAAAAAA",
    note: "  For the feast  ",
    sunday: "2026-08-09",
    part: "offertory",
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    songId: "song-1",
    title: "",
    youtubeVideoId: "",
    note: "For the feast",
    sunday: "2026-08-09",
    part: "offertory",
  });
});

test("a new-song request reduces the pasted link to a video ID", () => {
  const result = SongRequests.validateDraft({
    title: "New Hymn",
    youtubeUrl: "https://www.youtube.com/watch?v=AAAAAAAAAAA&t=42",
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.songId, null);
  assert.equal(result.value.title, "New Hymn");
  assert.equal(result.value.youtubeVideoId, "AAAAAAAAAAA");
  assert.equal(result.value.sunday, null);
  assert.equal(result.value.part, null);
});

test("invalid links, parts, and oversized text are rejected", () => {
  const badLink = SongRequests.validateDraft({
    title: "New Hymn",
    youtubeUrl: "https://example.com/not-youtube",
  });
  assert.equal(badLink.valid, false);
  assert.match(badLink.error, /YouTube/);

  const badPart = SongRequests.validateDraft({
    title: "New Hymn",
    part: "not-a-part",
  });
  assert.equal(badPart.valid, false);
  assert.match(badPart.error, /music part/i);

  const longTitle = SongRequests.validateDraft({ title: "x".repeat(201) });
  assert.equal(longTitle.valid, false);

  const longNote = SongRequests.validateDraft({
    title: "New Hymn",
    note: "x".repeat(2001),
  });
  assert.equal(longNote.valid, false);
  assert.match(longNote.error, /note/i);
});
