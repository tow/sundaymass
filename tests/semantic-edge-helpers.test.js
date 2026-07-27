const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const helperUrl = pathToFileURL(path.resolve(
  __dirname,
  "../supabase/functions/semantic-songs/request.mjs",
)).href;

test("embedding input is bounded and sampled into at most four chunks", async () => {
  const { embeddingChunks } = await import(helperUrl);
  const text = Array.from(
    { length: 1000 },
    (_, index) => `Paragraph ${index} contains words for semantic indexing.`,
  ).join("\n");

  const chunks = embeddingChunks(text);

  assert.ok(chunks.length > 0 && chunks.length <= 4);
  chunks.forEach(chunk => {
    assert.ok(chunk.length <= 1600);
    assert.equal(chunk, chunk.trim());
  });
  assert.match(chunks[0], /^Paragraph 0 /);
  assert.ok(chunks.join("").length <= 6400);
});

test("semantic request parsing caps and sanitizes suggestion input", async () => {
  const { parseSemanticRequest } = await import(helperUrl);
  const parsed = parseSemanticRequest({
    action: "suggest",
    citations: [
      "  Isaiah 1:1  ",
      "",
      42,
      ...Array.from({ length: 12 }, (_, index) => `Psalm ${index + 1}:1`),
    ],
    part: "communion",
  });

  assert.equal(parsed.action, "suggest");
  assert.equal(parsed.part, "communion");
  assert.equal(parsed.citations.length, 8);
  assert.equal(parsed.citations[0], "Isaiah 1:1");
  assert.ok(parsed.citations.every(citation => typeof citation === "string" && citation.length));
  assert.deepEqual(
    parseSemanticRequest({ action: "suggest", citations: ["John 1:1"], part: "not-a-part" }),
    { action: "suggest", citations: ["John 1:1"], part: "" },
  );
});

test("semantic request parsing keeps only usable bounded sync data", async () => {
  const { parseSemanticRequest } = await import(helperUrl);
  const songRequest = parseSemanticRequest({
    action: "sync-songs",
    songIds: [" song-1 ", "", null, ...Array.from({ length: 30 }, (_, index) => `song-${index + 2}`)],
  });
  const readingRequest = parseSemanticRequest({
    action: "sync-readings",
    readings: [
      { citation: " John 1:1 ", text: " In the beginning " },
      { citation: "", text: "Missing citation" },
      { citation: "Psalm 1:1", text: "" },
      { citation: "x".repeat(301), text: "Too-long citation" },
    ],
  });

  assert.equal(songRequest.songIds.length, 20);
  assert.equal(songRequest.songIds[0], "song-1");
  assert.deepEqual(readingRequest, {
    action: "sync-readings",
    readings: [{ citation: "John 1:1", text: "In the beginning" }],
  });
  assert.deepEqual(parseSemanticRequest({ action: "status" }), { action: "status" });
  assert.deepEqual(parseSemanticRequest({ action: "nonsense" }), { action: "unknown" });
});
