const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.resolve(
  __dirname,
  "../supabase/migrations/20260729120000_weekly_lyrics_responsorials.sql",
), "utf8");

test("weekly lyric overrides are private, slot-scoped, and tied to the assigned song", () => {
  assert.match(sql, /create table public\.plan_song_lyrics/i);
  assert.match(sql, /primary key \(sunday, part\)/i);
  assert.match(sql, /references public\.plan_songs\(sunday, part\)/i);
  assert.match(sql, /assignment\.song_id = plan_song_lyrics\.song_id/i);
  assert.match(sql, /alter table public\.plan_song_lyrics enable row level security/i);
  assert.doesNotMatch(sql, /grant select[^;]+plan_song_lyrics[^;]+anon/is);
  assert.match(sql, /discard_weekly_lyrics_before_song_change/i);
  assert.match(sql, /clear_plan_song_lyrics\([^)]*p_song_id uuid/is);
  assert.match(sql, /delete from public\.plan_song_lyrics[^;]+song_id = p_song_id/is);
});

test("every Psalm-slot song is backfilled and constrained to a structured number", () => {
  assert.match(sql, /add column responsorial_book/i);
  assert.match(sql, /add column responsorial_number integer/i);
  assert.match(sql, /add column responsorial_citations text\[\]/i);
  assert.match(sql, /greatest\([^;]+scripture\[4\]/is);
  assert.ok(sql.includes(String.raw`(\(([0-9]+)\))?`));
  assert.ok(!sql.includes(String.raw`(\\(([0-9]+)\\))?`));
  assert.ok(sql.includes(String.raw`pp\..*$`));
  assert.ok(!sql.includes(String.raw`pp\\..*$`));
  assert.match(sql, /songs_responsorial_metadata_complete/i);
  assert.match(sql, /validate constraint songs_responsorial_metadata_complete/i);
});

test("Psalm suggestions match book and number and never invoke vector similarity", () => {
  const suggestion = sql.slice(sql.indexOf("create function public.suggest_psalms_for_reading"));
  assert.match(suggestion, /lower\(song\.responsorial_book\) = lower\(requested_book\)/i);
  assert.match(suggestion, /song\.responsorial_number = requested_number/i);
  assert.match(suggestion, /unnest\(song\.responsorial_citations\)/i);
  assert.doesNotMatch(suggestion, /embedding|vector|semantic/i);
  assert.doesNotMatch(suggestion, /\blyrics\b/i);
});
