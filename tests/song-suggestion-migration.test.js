const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("a forward migration preserves an explicitly empty suggestion list", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../supabase/migrations/20260727233000_preserve_empty_song_suggestions.sql",
  );
  assert.ok(fs.existsSync(migrationPath), "the production fix must be a forward migration");
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /create or replace function public\.create_and_assign_song/i);
  assert.match(sql, /coalesce\(p_suggestion_parts,\s*array\[\]::text\[\]\)/i);
  assert.doesNotMatch(sql, /cardinality\(.*suggestion/i);
  assert.doesNotMatch(sql, /case when p_part = 'communion2'/i);
});

test("the planner UI, rather than the database, supplies the new-song default", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "../src/app/planner.js"), "utf8");
  assert.match(app, /defaultSuggestionParts:\[suggestionPartFor\(songPickerState\.partKey\)\]/);
});
