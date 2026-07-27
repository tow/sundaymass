const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("semantic schema uses private 384-dimensional pgvector storage", () => {
  const sql = read("supabase/migrations/20260727210000_semantic_repertoire.sql");

  assert.match(sql, /create extension if not exists vector with schema extensions/i);
  assert.match(sql, /create table public\.song_embeddings/i);
  assert.match(sql, /create table public\.reading_embeddings/i);
  assert.match(sql, /extensions\.vector\(384\)/i);
  assert.match(sql, /alter table public\.song_embeddings enable row level security/i);
  assert.match(sql, /alter table public\.reading_embeddings enable row level security/i);
  assert.match(sql, /revoke all on public\.song_embeddings from public, anon, authenticated/i);
  assert.match(sql, /revoke all on public\.reading_embeddings from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+public\.(song|reading)_embeddings\s+to\s+(anon|authenticated)/i);
});

test("suggestion RPC returns public song metadata without lyrics or vectors", () => {
  const sql = read("supabase/migrations/20260727210000_semantic_repertoire.sql");
  const suggestion = sql.slice(
    sql.indexOf("create function public.suggest_songs_for_readings"),
    sql.indexOf("revoke execute on function public.suggest_songs_for_readings"),
  );
  const returnSignature = suggestion.slice(
    suggestion.indexOf("returns table"),
    suggestion.indexOf("language plpgsql"),
  );

  assert.match(suggestion, /Editor access required/i);
  assert.match(suggestion, /p_citations text\[\]/i);
  assert.match(suggestion, /similarity/i);
  assert.match(suggestion, /song_embeddings/i);
  assert.match(suggestion, /reading_embeddings/i);
  assert.doesNotMatch(suggestion, /\blyrics\b/i);
  assert.doesNotMatch(returnSignature, /\bembedding\b/i);
});

test("Supabase Edge Function uses its native model and verifies editor access", () => {
  const source = read("supabase/functions/semantic-songs/index.ts");
  const helpers = read("supabase/functions/semantic-songs/request.mjs");

  assert.match(source, /new Supabase\.ai\.Session\(["']gte-small["']\)/);
  assert.match(source, /embeddingChunks/);
  assert.match(helpers, /function embeddingChunks\(/);
  assert.match(source, /new Array\(384\)/);
  assert.match(source, /mean_pool:\s*true/);
  assert.match(source, /normalize:\s*true/);
  assert.match(source, /\.from\(["']editors["']\)/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /bearerToken === serviceKey/);
  assert.match(helpers, /sync-songs/);
  assert.match(helpers, /sync-readings/);
  assert.match(source, /staleSongIds/);
  assert.match(source, /suggest/);
  assert.doesNotMatch(source, /OPENAI|openai/i);
});

test("the planner requests suggestions only from effective reading citations", () => {
  const html = read("src/planner.html");
  const app = read("src/app/planner.js");
  const workflow = read("src/app/song-workflow.js");
  const picker = read("src/app/song-picker-controller.js");
  const store = read("src/services/plan-store.js");

  assert.match(html, /id="songSuggestions"/);
  assert.match(html, /Suggestions from this Mass’s readings/);
  assert.match(app, /getReadingCitations:\(\)=>READING_SLOTS\.map\(slot=>displayedCitation\(slot\)\)\.filter\(Boolean\)/);
  assert.match(workflow, /getReadingCitations,/);
  assert.match(picker, /store\.suggestSongs\(\s*getReadingCitations\(\),\s*suggestionPartFor\(partKey\)/);
  assert.match(store, /async suggestSongs\(/);
  assert.match(store, /\.functions\.invoke\("semantic-songs"/);
});

test("the song picker keeps a mobile-sized suggestion set visible before search", () => {
  const workflow = read("src/app/song-workflow.js");
  const picker = read("src/app/song-picker-controller.js");
  const edgeFunction = read("supabase/functions/semantic-songs/index.ts");

  assert.match(picker, /maxSuggestions = 3/);
  assert.match(picker, /suggestions\.slice\(0, maxSuggestions\)/);
  assert.match(workflow, /elements\.dialog\.querySelector\("\.reading-dialog-body"\)\.scrollTop = 0/);
  assert.match(workflow, /matchMedia\("\(min-width:701px\)"\)\.matches/);
  assert.match(workflow, /elements\.search\.focus\(\{ preventScroll: true \}\)/);
  assert.match(edgeFunction, /p_limit: 3/);
});

test("semantic suggestions are filtered by the requested Mass part before ranking", () => {
  const app = read("src/app/planner.js");
  const picker = read("src/app/song-picker-controller.js");
  const edgeFunction = read("supabase/functions/semantic-songs/index.ts");
  const sql = read("supabase/migrations/20260727230000_song_suggestion_parts.sql");

  assert.match(app, /suggestionPartFor,/);
  assert.match(picker, /suggestionPartFor\(partKey\)/);
  assert.match(edgeFunction, /p_part: part/);
  assert.match(sql, /p_part text/);
  assert.match(sql, /p_part = any\(s\.suggestion_parts\)/);
  assert.match(sql, /p_part not in \(/);
});
