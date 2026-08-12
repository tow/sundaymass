const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260812120000_per_reading_suggestions_and_repertoire.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

test("semantic ranking is partitioned independently by reading", () => {
  assert.match(sql, /reading_citation text/i);
  assert.match(sql, /partition by requested\.citation, song\.in_repertoire/i);
  assert.match(sql, /partition by classified\.citation/i);
  assert.doesNotMatch(sql, /0\.75 \* max/i);
});

test("Mass assignments promote and preserve repertoire membership", () => {
  assert.match(sql, /after insert or update of song_id on public\.plan_songs/i);
  assert.match(sql, /before update of in_repertoire on public\.songs/i);
  assert.match(sql, /where not song\.in_repertoire[\s\S]*public\.plan_songs/i);
});

test("the catalogue backfill leaves no unclassified historic songs", () => {
  assert.match(sql, /where cardinality\(song\.suggestion_parts\) = 0/i);
  assert.match(sql, /else array\['offertory', 'communion'\]::text\[\]/i);
  assert.match(sql, /array\['psalm'\][\s\S]*responsorial_book[\s\S]*responsorial_number/i);
});
