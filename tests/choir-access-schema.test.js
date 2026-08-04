const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.resolve(
  __dirname,
  "../supabase/migrations/20260804120000_choir_member_lyric_access.sql",
), "utf8");

test("choir membership grants authenticated lyric reads without write access", () => {
  assert.match(sql, /create table public\.choir_members/i);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/i);
  assert.match(sql, /alter table public\.choir_members enable row level security/i);
  assert.match(sql, /user_id = auth\.uid\(\)/i);
  assert.match(sql, /Choir members and editors can read song lyrics/i);
  assert.match(sql, /Choir members and editors can read weekly song lyrics/i);
  assert.match(sql, /exists \(select 1 from public\.choir_members/i);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]+choir_members/i);
  assert.doesNotMatch(sql, /grant select[^;]+song_lyrics[^;]+anon/is);
  assert.doesNotMatch(sql, /create policy[^;]+choir[^;]+for (?:insert|update|delete)/is);
});
