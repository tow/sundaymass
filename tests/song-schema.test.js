const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260727020000_song_entities.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");
const suggestionSql = fs.readFileSync(
  path.resolve(__dirname, "../supabase/migrations/20260727230000_song_suggestion_parts.sql"),
  "utf8",
);

test("song schema keeps titles non-unique and lyrics behind a separate RLS boundary", () => {
  assert.match(sql, /create table public\.songs/i);
  assert.match(sql, /create table public\.song_lyrics/i);
  assert.match(sql, /create table public\.plan_songs/i);
  assert.doesNotMatch(sql, /unique\s*\([^)]*title/i);
  assert.match(sql, /alter table public\.song_lyrics enable row level security/i);
  assert.match(sql, /Song lyrics are editor only/i);
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+public\.song_lyrics\s+to\s+anon/i);
  assert.match(sql, /revoke all on public\.song_lyrics from anon, public/i);
});

test("songs have no hard Mass-part classification or eligibility restriction", () => {
  const songsDefinition = sql.slice(
    sql.indexOf("create table public.songs"),
    sql.indexOf("create index songs_title_search_idx"),
  );
  assert.doesNotMatch(songsDefinition, /\b(part|slot|category|eligible|usage)\b/i);

  const assignmentDefinition = sql.slice(
    sql.indexOf("create table public.plan_songs"),
    sql.indexOf("create index plan_songs_song_id_idx"),
  );
  assert.match(assignmentDefinition, /song_id uuid not null references public\.songs/i);
  assert.doesNotMatch(assignmentDefinition, /foreign key\s*\([^)]*part[^)]*song_id/i);
});

test("songs have editable soft suggestion parts without restricting manual assignment", () => {
  assert.match(suggestionSql, /add column suggestion_parts text\[\]/i);
  assert.match(suggestionSql, /default array\[\]::text\[\]/i);
  assert.match(suggestionSql, /suggestion_parts <@ array\[/i);
  assert.match(suggestionSql, /from public\.plan_songs/i);
  assert.match(suggestionSql, /'Memorial Acclamation \(unidentified setting\)'/i);
  assert.match(suggestionSql, /p_part = any\(s\.suggestion_parts\)/i);
  assert.match(suggestionSql, /unused songs remain unclassified/i);
  assert.doesNotMatch(suggestionSql, /create or replace function public\.assign_plan_song/i);
});

test("migration converts every non-empty JSON choice before removing the legacy model", () => {
  assert.match(sql, /jsonb_each/i);
  assert.match(sql, /Song migration mismatch/i);
  assert.match(sql, /alter table public\.plans drop column choices/i);
  assert.match(sql, /drop function if exists public\.save_music_choice/i);
});

test("song mutations are editor-only and creation plus assignment is atomic", () => {
  assert.match(sql, /create function public\.create_and_assign_song/i);
  assert.match(sql, /create function public\.assign_plan_song/i);
  assert.match(sql, /create function public\.clear_plan_song/i);
  assert.match(sql, /create function public\.update_song/i);
  assert.match(sql, /Editor access required/i);
  assert.match(sql, /p_title/i);
  assert.match(sql, /p_lyrics/i);
});
