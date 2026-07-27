const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/services/plan-store.js"),
  "utf8",
);

test("plan stores expose canonical song operations", () => {
  [
    "searchSongs",
    "getSong",
    "assignSong",
    "createAndAssignSong",
    "updateSong",
    "clearSong",
  ].forEach(method => assert.match(source, new RegExp(`async ${method}\\(`)));
});

test("Supabase plan loading joins current song metadata without lyric text", () => {
  const publicPlanQuery = source.slice(
    source.indexOf("const loadPlan"),
    source.indexOf("const rpcDraft"),
  );
  assert.match(publicPlanQuery, /plan_songs/);
  assert.match(publicPlanQuery, /youtube_url/);
  assert.match(publicPlanQuery, /copyright_owner/);
  assert.match(publicPlanQuery, /copyright_year/);
  assert.doesNotMatch(publicPlanQuery, /song_lyrics/);
  assert.match(source, /song_lyrics/);
  assert.match(source, /suggestion_parts/);
  assert.match(source, /p_suggestion_parts/);
  assert.match(source, /async suggestSongs\(citations, part\)/);
  assert.match(source, /action: "suggest", citations, part/);
});
