const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.resolve(
  __dirname,
  "../supabase/migrations/20260727234000_enforce_reading_override_editor.sql",
), "utf8");

test("reading override RPCs explicitly reject non-editors on the current plan schema", () => {
  assert.match(sql, /create or replace function public\.save_reading_override/i);
  assert.match(sql, /create or replace function public\.clear_reading_override/i);
  assert.equal((sql.match(/Editor access required/g) || []).length, 2);
  assert.equal((sql.match(/select 1 from public\.editors/g) || []).length, 2);
  assert.doesNotMatch(sql, /\bchoices\b/);
});
