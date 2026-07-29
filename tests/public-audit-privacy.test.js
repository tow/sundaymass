const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    "../supabase/migrations/20260729150000_hide_public_audit_fields.sql",
  ),
  "utf8",
);

test("browser roles receive explicit public columns without audit user UUIDs", () => {
  for (const table of ["plans", "songs", "plan_songs"]) {
    assert.match(
      migration,
      new RegExp(`revoke select on public\\.${table} from anon, authenticated`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`grant select \\([\\s\\S]*?\\) on public\\.${table} to anon, authenticated`, "i"),
    );
  }

  const grants = [...migration.matchAll(
    /grant select \(([\s\S]*?)\) on public\.(?:plans|songs|plan_songs) to anon, authenticated/gi,
  )].map(match => match[1]).join("\n");
  assert.doesNotMatch(grants, /created_by|updated_by/i);
});
