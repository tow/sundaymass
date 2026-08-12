const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260812160000_song_category_review_queue.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

test("uncertain category labels become attributed proposals", () => {
  assert.match(sql, /add column suggestion_proposed_parts text\[\]/i);
  assert.match(sql, /add column suggestion_proposal_confidence text/i);
  assert.match(sql, /add column suggestion_proposal_reason text/i);
  assert.match(sql, /suggestion_review_status in \('reviewed', 'evidence-backed', 'needs-review'\)/i);
  assert.match(sql, /previous forced fallback needs human review/i);
});

test("active categories require direct evidence", () => {
  assert.match(sql, /from public\.plan_songs/i);
  assert.match(sql, /responsorial_book/i);
  assert.match(sql, /unmistakable title evidence/i);
  assert.match(sql, /suggestion_parts = proposals\.accepted_parts/i);
});

test("editors can resolve a review queue item explicitly", () => {
  assert.match(sql, /create function public\.review_song_suggestion_parts/i);
  assert.match(sql, /Editor access required/i);
  assert.match(sql, /suggestion_review_status = 'reviewed'/i);
  assert.match(sql, /revoke execute[\s\S]*from public, anon/i);
});
