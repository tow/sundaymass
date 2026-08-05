const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.resolve(
  __dirname,
  "../supabase/migrations/20260805120000_song_requests.sql",
), "utf8");

test("song requests are choir-created, editor-resolved, and never anonymous", () => {
  assert.match(sql, /create table public\.song_requests/i);
  assert.match(sql, /status in \('pending', 'accepted', 'declined'\)/i);
  assert.match(sql, /song_id is not null or length\(btrim\(title\)\) > 0/i);
  assert.match(sql, /alter table public\.song_requests enable row level security/i);
  assert.match(sql, /Choir members and editors can read song requests/i);
  assert.match(sql, /Choir members and editors can create song requests/i);
  assert.match(sql, /Editors can resolve song requests/i);
  assert.match(sql, /revoke all on public\.song_requests from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]+song_requests[^;]+\banon\b/is);
});

test("browser roles never read request audit user UUIDs", () => {
  const columnGrant = sql.match(/grant select \(([^)]+)\) on public\.song_requests/i);
  assert.ok(columnGrant, "song_requests needs an explicit column select grant");
  assert.doesNotMatch(columnGrant[1], /created_by|resolved_by/);
});

test("request RPCs repeat their membership checks and bound their input", () => {
  assert.match(sql, /create function public\.create_song_request/i);
  assert.match(sql, /Choir member access required/);
  assert.match(sql, /create function public\.resolve_song_request/i);
  assert.match(sql, /Editor access required/);
  assert.match(sql, /Invalid request status/);
  assert.match(sql, /and status = 'pending'/i);
  assert.match(sql, /Invalid YouTube video ID/);
  assert.match(sql, /Invalid music part/);
  assert.match(sql, /revoke execute on function public\.create_song_request[\s\S]+?from public, anon/i);
  assert.match(sql, /revoke execute on function public\.resolve_song_request[^;]+from public, anon/i);
});
