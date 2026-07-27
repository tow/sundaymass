const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const helperUrl = pathToFileURL(path.resolve(
  __dirname,
  "../supabase/functions/semantic-songs/song-content.mjs",
)).href;

test("embedding input includes only fields which affect semantic meaning", async () => {
  const { songEmbeddingContent } = await import(helperUrl);
  const original = {
    title: "One Bread, One Body",
    authors: "John Foley",
    source: "Gather",
    youtube_url: "https://youtube.example/old",
    copyright_owner: "Old publisher",
    copyright_year: "1978",
    suggestion_parts: ["communion"],
    song_lyrics: { lyrics: "One bread, one body" },
  };
  const metadataOnlyEdit = {
    ...original,
    youtube_url: "https://youtube.example/new",
    copyright_owner: "New publisher",
    copyright_year: "1978, 2026",
    suggestion_parts: [],
  };
  const meaningfulEdit = { ...original, title: "One Bread, One Body — revised" };

  assert.equal(songEmbeddingContent(metadataOnlyEdit), songEmbeddingContent(original));
  assert.notEqual(songEmbeddingContent(meaningfulEdit), songEmbeddingContent(original));
});

test("staleness is based on the current content hash rather than update timestamps", async () => {
  const { songEmbeddingContent, staleSongIds } = await import(helperUrl);
  const current = {
    id: "current",
    title: "Current",
    authors: "Author",
    source: "",
    updated_at: "2026-07-27T12:00:00Z",
    song_lyrics: [{ lyrics: "Lyrics", updated_at: "2026-07-27T12:00:00Z" }],
  };
  const changed = {
    id: "changed",
    title: "Changed",
    authors: "",
    source: "",
    song_lyrics: null,
  };
  const missing = {
    id: "missing",
    title: "Missing",
    authors: "",
    source: "",
    song_lyrics: null,
  };
  const hash = async value => "hash:" + value;
  current.song_embeddings = [{
    content_hash: await hash(songEmbeddingContent(current)),
    updated_at: "2020-01-01T00:00:00Z",
  }];
  changed.song_embeddings = [{ content_hash: "hash:old content" }];
  missing.song_embeddings = null;

  assert.deepEqual(
    await staleSongIds([current, changed, missing], hash),
    ["changed", "missing"],
  );
});
