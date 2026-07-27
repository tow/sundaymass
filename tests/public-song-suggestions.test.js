const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260728120000_public_song_suggestions.sql",
);

test("public suggestions expose only bounded safe song metadata", () => {
  assert.ok(fs.existsSync(migrationPath), "public suggestions must use a forward migration");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const signature = sql.slice(
    sql.indexOf("returns table"),
    sql.indexOf("language plpgsql"),
  );

  assert.match(sql, /security definer/i);
  assert.match(sql, /with ordinality/i);
  assert.match(sql, /limit 8/i);
  assert.match(sql, /length\(btrim\(citation\)\) between 1 and 300/i);
  assert.match(sql, /limit greatest\(1, least\(coalesce\(p_limit, 3\), 3\)\)/i);
  assert.match(
    sql,
    /grant execute on function public\.suggest_songs_for_readings\(text\[\], text, integer\)\s+to anon, authenticated/i,
  );
  assert.doesNotMatch(sql, /Editor access required/i);
  assert.doesNotMatch(signature, /\blyrics\b|\bembedding\b/i);
});
