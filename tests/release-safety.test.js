const test = require("node:test");
const assert = require("node:assert/strict");
const {
  destructiveOperations,
  rolloutPhase,
  validateMigration,
} = require("../scripts/check-migration-rollout.js");
const {
  privateFieldPaths,
  smokeBackend,
} = require("../scripts/production-backend-smoke.js");

test("migration rollout headers distinguish compatible and contract releases", () => {
  assert.equal(rolloutPhase("-- rollout: expand\nalter table songs add column note text;"), "expand");
  assert.equal(rolloutPhase("-- rollout: contract\ndrop table old_songs;"), "contract");
  assert.equal(rolloutPhase("select 1;"), "");
});

test("migration rollout check detects operations that can break old clients", () => {
  const sql = `
    alter table songs drop column youtube_url;
    drop function public.old_rpc(text);
    revoke select on public.songs from anon;
  `;
  assert.deepEqual(
    destructiveOperations(sql),
    ["DROP COLUMN", "DROP FUNCTION", "REVOKE"],
  );
  assert.deepEqual(
    validateMigration("change.sql", `-- rollout: expand\n${sql}`),
    [
      "change.sql: destructive operations (DROP COLUMN, DROP FUNCTION, REVOKE) "
      + "require `-- rollout: contract`",
    ],
  );
  assert.match(
    validateMigration("change.sql", `-- rollout: contract\n${sql}`, {
      rejectContract: true,
    })[0],
    /manual production release/,
  );
});

test("public contract inspection finds nested lyric fields", () => {
  assert.deepEqual(
    privateFieldPaths({ songs: [{ id: "1", song_lyrics: [{ lyrics: "private" }] }] }),
    ["songs[0].song_lyrics", "songs[0].song_lyrics[0].lyrics"],
  );
});

test("backend smoke verifies current fields without exposing lyric data", async () => {
  const responses = [
    [{ id: "1", title: "Song", youtube_video_id: "AAAAAAAAAAA" }],
    [{ id: "1", title: "Song", youtube_video_id: "AAAAAAAAAAA" }],
  ];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responses.shift()),
    };
  };
  await smokeBackend({
    fetchImpl,
    url: "https://example.supabase.co",
    publishableKey: "public-key",
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /youtube_video_id/);
  assert.match(calls[1].url, /suggest_songs_for_readings/);
  assert.doesNotMatch(calls[0].url, /lyrics/);
});
