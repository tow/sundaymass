const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  destructiveOperations,
  migrationFilesForVersions,
  pendingMigrationVersions,
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

test("pending migrations are read from the Supabase CLI table and fail closed otherwise", () => {
  const listing = [
    "",
    "        LOCAL      │     REMOTE     │     TIME (UTC)      ",
    "  ─────────────────┼────────────────┼──────────────────────",
    "    20260726180000 │ 20260726180000 │ 2026-07-26 18:00:00 ",
    "    20260812160000 │ 20260812160000 │ 2026-08-12 16:00:00 ",
    "    20260910120000 │                │ 2026-09-10 12:00:00 ",
    "    20260915090000 │                │ 2026-09-15 09:00:00 ",
    "",
  ].join("\n");
  assert.deepEqual(pendingMigrationVersions(listing), ["20260910120000", "20260915090000"]);

  const applied = listing.replace(/(\d{14}) │ {16}/g, "$1 │ $1 ");
  assert.deepEqual(pendingMigrationVersions(applied), []);

  assert.throws(
    () => pendingMigrationVersions("Cannot find project ref. Have you run supabase link?"),
    /could not read any migration rows/,
  );
  assert.throws(() => pendingMigrationVersions(""), /could not read any migration rows/);
});

test("pending migrations are read from the JSON the CLI emits when redirected", () => {
  const listing = JSON.stringify({
    migrations: [
      { local: "20260726180000", remote: "20260726180000", time: "2026-07-26 18:00:00" },
      { local: "20260910120000", remote: "", time: "2026-09-10 12:00:00" },
      { local: "20260915090000", time: "2026-09-15 09:00:00" },
    ],
  });
  assert.deepEqual(pendingMigrationVersions(listing), ["20260910120000", "20260915090000"]);

  const applied = JSON.stringify({
    migrations: [
      { local: "20260726180000", remote: "20260726180000", time: "2026-07-26 18:00:00" },
      { local: "20260910120000", remote: "20260910120000", time: "2026-09-10 12:00:00" },
    ],
  });
  assert.deepEqual(pendingMigrationVersions(applied), []);

  assert.throws(
    () => pendingMigrationVersions(JSON.stringify({ migrations: [] })),
    /could not read any migration rows/,
  );
});

test("pending migrations are read from JSON interleaved with CLI progress output", () => {
  const listing = [
    "Initialising login role...",
    "Connecting to remote database...",
    JSON.stringify({
      migrations: [
        { local: "20260726180000", remote: "20260726180000", time: "2026-07-26 18:00:00" },
        { local: "20260910120000", remote: "", time: "2026-09-10 12:00:00" },
      ],
    }),
    "",
  ].join("\n");
  assert.deepEqual(pendingMigrationVersions(listing), ["20260910120000"]);

  assert.throws(
    () => pendingMigrationVersions("Initialising login role...\nConnecting to remote database...\n"),
    /could not read any migration rows/,
  );
});

test("pending migration versions resolve to their tracked files", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
  fs.writeFileSync(path.join(directory, "20260910120000_rename.sql"), "-- rollout: contract\n");
  fs.writeFileSync(path.join(directory, "20260915090000_add_note.sql"), "-- rollout: expand\n");

  assert.deepEqual(
    migrationFilesForVersions(["20260915090000", "20260910120000"], directory),
    [
      "supabase/migrations/20260915090000_add_note.sql",
      "supabase/migrations/20260910120000_rename.sql",
    ],
  );
  assert.throws(
    () => migrationFilesForVersions(["20261001000000"], directory),
    /pending migration 20261001000000 has no local file/,
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
    { status: 200, body: [{ id: "1", title: "Song", youtube_video_id: "AAAAAAAAAAA" }] },
    { status: 200, body: [{ id: "1", title: "Song", youtube_video_id: "AAAAAAAAAAA" }] },
    { status: 200, body: [{ id: "1", title: "Psalm", youtube_video_id: "BBBBBBBBBBB" }] },
    { status: 200, body: [{ plan_date: "2026-08-02", reading_overrides: {}, celebration_override: null }] },
    { status: 200, body: [] },
    // The editor RPC exists; its own guard rejects the anonymous probe.
    { status: 400, body: { code: "P0001", message: "Editor access required" } },
  ];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const response = responses.shift();
    return {
      ok: response.status < 400,
      status: response.status,
      text: async () => JSON.stringify(response.body),
    };
  };
  await smokeBackend({
    fetchImpl,
    url: "https://example.supabase.co",
    publishableKey: "public-key",
  });
  assert.equal(calls.length, 6);
  assert.match(calls[0].url, /youtube_video_id/);
  assert.match(calls[0].url, /responsorial_book/);
  assert.match(calls[0].url, /responsorial_number/);
  assert.match(calls[0].url, /responsorial_citations/);
  assert.match(calls[1].url, /suggest_songs_for_readings/);
  assert.match(calls[2].url, /suggest_psalms_for_reading/);
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    p_citation: "Psalm 85:9, 10, 11-12, 13-14",
    p_limit: 1,
  });
  assert.match(calls[3].url, /\/rest\/v1\/plans\?select=plan_date/);
  assert.match(calls[4].url, /\/rest\/v1\/plan_songs\?select=plan_date/);
  assert.match(calls[5].url, /\/rest\/v1\/rpc\/assign_plan_song$/);
  assert.deepEqual(Object.keys(JSON.parse(calls[5].options.body)), [
    "p_plan_date",
    "p_part",
    "p_song_id",
  ]);
  assert.doesNotMatch(calls[0].url, /lyrics/);
  assert.doesNotMatch(calls[3].url, /lyrics/);
});

test("backend smoke refuses a frontend whose plan schema production lacks", async () => {
  const ok = body => ({ status: 200, body });
  const songs = [{ id: "1", title: "Song", youtube_video_id: "AAAAAAAAAAA" }];
  const runWith = async responses => {
    const fetchImpl = async () => {
      const response = responses.shift();
      return {
        ok: response.status < 400,
        status: response.status,
        text: async () => JSON.stringify(response.body),
      };
    };
    return smokeBackend({ fetchImpl, url: "https://example.supabase.co", publishableKey: "k" });
  };

  await assert.rejects(
    runWith([ok(songs), ok(songs), ok(songs), {
      status: 400,
      body: { code: "42703", message: "column plans.plan_date does not exist" },
    }]),
    /public plan contract returned 400: .*plan_date does not exist/,
  );

  await assert.rejects(
    runWith([ok(songs), ok(songs), ok(songs), ok([]), ok([]), {
      status: 404,
      body: {
        code: "PGRST202",
        message: "Could not find the function public.assign_plan_song(p_part, p_plan_date, p_song_id) in the schema cache",
      },
    }]),
    /assign_plan_song\(p_plan_date, p_part, p_song_id\) is not in the production schema/,
  );
});
