const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260727235000_candidate_song_library.sql",
);

test("candidate songs are a forward-compatible state on canonical songs", () => {
  assert.ok(fs.existsSync(migrationPath), "candidate-library schema must be a forward migration");
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /add column in_repertoire boolean not null default true/i);
  assert.match(sql, /p_in_repertoire boolean default true/i);
  assert.match(sql, /in_repertoire,\s*created_at/i);
  assert.match(sql, /in_repertoire = coalesce\(p_in_repertoire,\s*true\)/i);
});

test("semantic suggestions reserve space for one extended-library candidate", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const suggestion = sql.slice(
    sql.indexOf("create function public.suggest_songs_for_readings"),
    sql.indexOf("revoke execute on function public.suggest_songs_for_readings"),
  );

  assert.match(suggestion, /in_repertoire boolean/i);
  assert.match(suggestion, /partition by s\.in_repertoire/i);
  assert.match(suggestion, /in_repertoire and class_rank <= 2/i);
  assert.match(suggestion, /not classified\.in_repertoire and class_rank <= 1/i);
  assert.doesNotMatch(suggestion, /\blyrics\b/i);
});
